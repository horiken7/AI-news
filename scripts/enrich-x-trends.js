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

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
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

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '関連記事';
  }
}

function extractMetaDescription(html) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:description|description|twitter:description)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i);
    if (content?.[1]) return stripHtml(content[1]).slice(0, 450);
  }
  return '';
}

async function fetchArticleDescription(url) {
  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  }, 10000);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return '';
  return extractMetaDescription(await response.text());
}

function buildSearchQueries(topic) {
  const simplified = topic
    .replace(/[-_]/g, ' ')
    .replace(/\b(trade|trending|trend)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...new Set([topic, simplified].filter(Boolean))];
}

async function searchRelatedNews(topic) {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  for (const query of buildSearchQueries(topic)) {
    const params = new URLSearchParams({
      query,
      tags: 'story',
      hitsPerPage: '20',
      numericFilters: `created_at_i>${since}`,
    });
    const data = await fetchJson(`https://hn.algolia.com/api/v1/search?${params}`);

    for (const hit of data.hits || []) {
      if (!hit.title || !/^https?:\/\//i.test(hit.url || '')) continue;

      let description = stripHtml(hit.story_text || '');
      if (!description) {
        try {
          description = await fetchArticleDescription(hit.url);
        } catch (error) {
          console.warn(`Article description unavailable for ${hit.url}: ${error.message}`);
        }
      }
      if (!description) continue;

      return {
        title: hit.title,
        description,
        url: hit.url,
        publishedAt: hit.created_at,
        source: extractDomain(hit.url),
      };
    }
  }

  throw new Error(`No recent related article found for trend: ${topic}`);
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
    previous.translationVersion === 3 &&
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
    translationVersion: 3,
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
    source: 'Trends24 / Hacker News Algolia',
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
