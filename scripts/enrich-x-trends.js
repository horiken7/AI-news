const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'public', 'data.json');
const USER_AGENT = 'AI-news updater/2.0 (+https://github.com/horiken7/AI-news)';
const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeHtml(text) {
  return String(text)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(text) {
  return decodeHtml(String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractXmlTag(xml, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = String(xml).match(pattern);
  return match ? decodeHtml(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) : '';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '関連記事';
  }
}

function parseBingNewsItems(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const itemXml = match[1];
    const bingUrl = extractXmlTag(itemXml, 'link');
    const pubDate = extractXmlTag(itemXml, 'pubDate');
    const publishedAt = Date.parse(pubDate);
    let articleUrl = bingUrl;

    try {
      articleUrl = new URL(bingUrl).searchParams.get('url') || bingUrl;
    } catch {
      // Keep the RSS link when the original article URL cannot be extracted.
    }

    return {
      title: stripHtml(extractXmlTag(itemXml, 'title')),
      description: stripHtml(extractXmlTag(itemXml, 'description')),
      url: articleUrl,
      publishedAt: Number.isFinite(publishedAt) ? new Date(publishedAt).toISOString() : '',
      source: extractDomain(articleUrl),
    };
  }).filter(item =>
    item.title &&
    item.description &&
    /^https?:\/\//i.test(item.url) &&
    Number.isFinite(Date.parse(item.publishedAt))
  );
}

async function searchRelatedNews(topic) {
  for (const query of [`"${topic}"`, `${topic} AI`]) {
    const params = new URLSearchParams({
      q: query,
      format: 'rss',
      mkt: 'en-US',
      setlang: 'en-US',
      qft: 'interval="7"',
    });
    const response = await fetchWithTimeout(
      `https://www.bing.com/news/search?${params}`,
      { headers: { Accept: 'application/rss+xml,application/xml,text/xml' } }
    );
    if (!response.ok) throw new Error(`Bing News returned ${response.status}`);

    const items = parseBingNewsItems(await response.text());
    if (items.length > 0) return items[0];
  }

  throw new Error(`No recent related article found for trend: ${topic}`);
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function translate(text) {
  if (JAPANESE_TEXT.test(text)) return text;

  const sourceText = String(text).slice(0, 450);
  const googleParams = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'ja',
    dt: 't',
    q: sourceText,
  });

  try {
    const data = await fetchJson(`https://translate.googleapis.com/translate_a/single?${googleParams}`);
    const translated = data?.[0]?.map(part => part?.[0] || '').join('').trim();
    if (JAPANESE_TEXT.test(translated || '')) return translated;
  } catch (error) {
    console.warn(`Google translation failed; using fallback: ${error.message}`);
  }

  const fallbackParams = new URLSearchParams({
    q: sourceText,
    langpair: 'en|ja',
  });
  const data = await fetchJson(`https://api.mymemory.translated.net/get?${fallbackParams}`);
  const translated = decodeHtml(data.responseData?.translatedText || '').trim();
  if (!JAPANESE_TEXT.test(translated)) throw new Error('Japanese translation is unavailable');
  return translated;
}

async function enrichTrend(item, previousItems) {
  const article = await searchRelatedNews(item.topic);
  const cached = previousItems.find(previous =>
    previous.topic === item.topic &&
    previous.articleUrl === article.url &&
    previous.translationVersion === 2 &&
    JAPANESE_TEXT.test(previous.articleTitleJa || '') &&
    JAPANESE_TEXT.test(previous.summaryJa || '')
  );

  return {
    ...item,
    articleTitle: article.title,
    articleTitleJa: cached?.articleTitleJa || await translate(article.title),
    articleUrl: article.url,
    articleSource: article.source,
    articlePublishedAt: article.publishedAt,
    summaryJa: cached?.summaryJa || await translate(article.description),
    translationVersion: 2,
  };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const items = data.xTrends?.items;
  if (!Array.isArray(items)) throw new Error('X trend data is missing');

  const enrichedItems = [];
  for (const item of items) {
    enrichedItems.push(await enrichTrend(item, items));
  }

  data.xTrends = {
    ...data.xTrends,
    items: enrichedItems,
    articleFetchedAt: new Date().toISOString(),
    source: 'Trends24 / Bing News RSS',
  };

  const temporaryPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, DATA_PATH);
  console.log(`Added Japanese article summaries to ${enrichedItems.length} X trends`);
}

main().catch(error => {
  console.error(`X trend enrichment failed; published data will be kept: ${error.stack || error.message}`);
  process.exit(1);
});
