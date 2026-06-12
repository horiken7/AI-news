const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data.json');
const PUBLISHED_DATA_URL = 'https://horiken7.github.io/AI-news/data.json';
const USER_AGENT = 'AI-news updater/2.0 (+https://github.com/horiken7/AI-news)';
const QUERY_TERMS = ['AI', 'LLM', 'OpenAI', 'Anthropic', 'Claude', 'GPT', 'machine learning'];
const AI_KEYWORDS = /\b(ai|artificial intelligence|llm|machine learning|deep learning|openai|anthropic|gemini|gpt|claude|chatgpt|neural|diffusion|generative|midjourney|stable diffusion|hugging face|transformer|agentic|inference)\b/i;
const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;
const TREND_LOCATIONS = [
  { url: 'https://trends24.in/japan/', label: '日本', priority: 0 },
  { url: 'https://trends24.in/united-states/', label: '米国', priority: 1 },
  { url: 'https://trends24.in/united-kingdom/', label: '英国', priority: 2 },
  { url: 'https://trends24.in/canada/', label: 'カナダ', priority: 3 },
  { url: 'https://trends24.in/australia/', label: '豪州', priority: 4 },
];
const AI_TREND_TERMS = [
  'ai', 'llm', 'openai', 'chatgpt', 'gpt', 'claude', 'anthropic', 'gemini',
  'deepmind', 'copilot', 'midjourney', 'stable diffusion', 'sora', 'grok',
  'perplexity', 'hugging face', 'machine learning', 'artificial intelligence',
  'generative ai', '生成ai', '人工知能', 'チャットgpt', 'クロード',
  'ジェミニ', 'ディープマインド', 'コパイロット',
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
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

async function fetchJson(url, timeoutMs = 10000) {
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function fetchNewsForWindow(hours) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const requests = QUERY_TERMS.map(term => {
    const params = new URLSearchParams({
      query: term,
      tags: 'story',
      hitsPerPage: '50',
      numericFilters: `created_at_i>${since}`,
    });
    return fetchJson(`https://hn.algolia.com/api/v1/search_by_date?${params}`);
  });

  const responses = await Promise.all(requests);
  const uniqueHits = new Map();

  for (const response of responses) {
    for (const hit of response.hits || []) {
      if (!hit.objectID || !hit.title || hit.created_at_i < since) continue;
      if (!AI_KEYWORDS.test(`${hit.title} ${hit.story_text || ''}`)) continue;
      uniqueHits.set(hit.objectID, hit);
    }
  }

  return [...uniqueHits.values()]
    .sort((left, right) => {
      const pointDifference = (right.points || 0) - (left.points || 0);
      return pointDifference || (right.created_at_i || 0) - (left.created_at_i || 0);
    })
    .slice(0, 5)
    .map(hit => ({
      title: hit.title,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      points: hit.points || 0,
      comments: hit.num_comments || 0,
      author: hit.author || '',
      createdAt: hit.created_at,
      domain: extractDomain(hit.url),
      storyText: stripHtml(hit.story_text || '').slice(0, 400),
    }));
}

async function fetchNews() {
  for (const hours of [24, 72, 168]) {
    const items = await fetchNewsForWindow(hours);
    console.log(`Found ${items.length} AI stories in the last ${hours} hours`);
    if (items.length === 5) return items;
  }
  throw new Error('Could not find five recent AI stories');
}

function extractDomain(url) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : 'news.ycombinator.com';
  } catch {
    return 'news.ycombinator.com';
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

function extractMetaDescription(html) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:description|description)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i);
    if (content?.[1]) return stripHtml(content[1]).slice(0, 400);
  }
  return '';
}

async function fetchArticleDescription(url) {
  if (!/^https?:\/\//i.test(url) || url.includes('news.ycombinator.com/item')) return '';

  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  }, 8000);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return '';
  return extractMetaDescription(await response.text());
}

async function translate(text) {
  const params = new URLSearchParams({
    q: String(text).slice(0, 450),
    langpair: 'en|ja',
  });
  const data = await fetchJson(`https://api.mymemory.translated.net/get?${params}`, 12000);
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
    throw new Error(data.responseDetails || 'Translation failed');
  }
  return decodeHtml(data.responseData.translatedText).trim();
}

function readLocalCache() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function readPublishedCache() {
  try {
    return await fetchJson(`${PUBLISHED_DATA_URL}?_=${Date.now()}`, 10000);
  } catch (error) {
    console.warn(`Published translation cache unavailable: ${error.message}`);
    return null;
  }
}

async function loadTranslationCache() {
  const cache = new Map();
  const sources = [readLocalCache(), await readPublishedCache()];

  for (const source of sources) {
    for (const item of source?.news?.items || []) {
      if (item.url && item.titleJa && item.summaryJa) cache.set(item.url, item);
    }
  }
  return cache;
}

function decodeTrendText(text) {
  return stripHtml(text).replace(/\s+/g, ' ').trim();
}

function isAiTrend(topic) {
  const normalized = topic.toLowerCase();
  if (/^ai-\d+$/i.test(normalized)) return false;

  return AI_TREND_TERMS.some(term => {
    if (/[\u3040-\u30ff\u3400-\u9fff]/.test(term)) return normalized.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(normalized);
  });
}

function parseTrendTopics(html, location) {
  const matches = [...html.matchAll(
    /<a[^>]+href="https:\/\/twitter\.com\/search\?q=([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  )];
  const topics = new Map();

  matches.forEach((match, index) => {
    const topic = decodeTrendText(match[2]);
    if (!topic || !isAiTrend(topic)) return;

    const key = topic.toLocaleLowerCase('en-US');
    const rank = (index % 50) + 1;
    const existing = topics.get(key);
    if (existing) {
      existing.appearances += 1;
      existing.bestRank = Math.min(existing.bestRank, rank);
      return;
    }

    topics.set(key, {
      topic,
      locationLabel: location.label,
      locationPriority: location.priority,
      bestRank: rank,
      appearances: 1,
      url: `https://x.com/search?q=${encodeURIComponent(topic)}&src=typed_query&f=live`,
    });
  });

  return [...topics.values()];
}

async function fetchXTrendCandidates() {
  const settled = await Promise.allSettled(TREND_LOCATIONS.map(async location => {
    const response = await fetchWithTimeout(location.url, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    }, 12000);
    if (!response.ok) throw new Error(`${location.url} returned ${response.status}`);
    return parseTrendTopics(await response.text(), location);
  }));

  const merged = new Map();
  settled.forEach((result, locationIndex) => {
    if (result.status === 'rejected') {
      console.warn(`Trend location failed: ${TREND_LOCATIONS[locationIndex].label}: ${result.reason.message}`);
      return;
    }

    for (const item of result.value) {
      const key = item.topic.toLocaleLowerCase('en-US');
      const existing = merged.get(key);
      if (!existing || item.locationPriority < existing.locationPriority) {
        merged.set(key, item);
      } else {
        existing.appearances = Math.max(existing.appearances, item.appearances);
        existing.bestRank = Math.min(existing.bestRank, item.bestRank);
      }
    }
  });

  return [...merged.values()]
    .sort((left, right) =>
      left.locationPriority - right.locationPriority ||
      right.appearances - left.appearances ||
      left.bestRank - right.bestRank
    )
    .slice(0, 5)
    .map(({ locationPriority, ...item }) => item);
}

async function buildXTrends(previousData) {
  const currentItems = await fetchXTrendCandidates();
  const previousItems = previousData?.xTrends?.items;

  if (currentItems.length < 5 && Array.isArray(previousItems) && previousItems.length === 5) {
    console.warn(`Only ${currentItems.length} AI trends found; keeping the previous five-item set`);
    return {
      ...previousData.xTrends,
      retainedAt: new Date().toISOString(),
    };
  }

  return {
    items: currentItems,
    fetchedAt: new Date().toISOString(),
    source: 'Trends24',
    partial: currentItems.length < 5,
  };
}

function inferCategory(title) {
  const normalized = title.toLowerCase();
  if (/model|gpt|claude|gemini|llama|llm/.test(normalized)) return 'AIモデル';
  if (/code|developer|program/.test(normalized)) return '開発ツール';
  if (/robot|device|hardware|chip/.test(normalized)) return 'ハードウェア';
  if (/research|study|paper/.test(normalized)) return '研究';
  return 'AIニュース';
}

function buildKeyPoints(summaryJa) {
  const points = summaryJa
    .split(/[。！？]/)
    .map(part => part.trim())
    .filter(part => part.length >= 10)
    .slice(0, 3)
    .map(part => `${part}。`);
  return points.length > 0 ? points : [summaryJa];
}

async function localizeItem(item, cache) {
  const cached = cache.get(item.url);
  if (cached && JAPANESE_TEXT.test(cached.titleJa) && JAPANESE_TEXT.test(cached.summaryJa)) {
    console.log(`Reusing translation: ${item.title}`);
    return {
      ...item,
      titleJa: cached.titleJa,
      summaryJa: cached.summaryJa,
      keyPoints: cached.keyPoints || buildKeyPoints(cached.summaryJa),
      category: cached.category || inferCategory(item.title),
      impact: cached.impact || '低',
    };
  }

  let titleJa;
  try {
    const translatedTitle = await translate(item.title);
    titleJa = JAPANESE_TEXT.test(translatedTitle)
      ? translatedTitle
      : `AIニュース: ${translatedTitle}`;
  } catch (error) {
    console.warn(`Title translation failed for "${item.title}": ${error.message}`);
    titleJa = `AIニュース: ${item.title}`;
  }

  let description = item.storyText;
  if (!description) {
    try {
      description = await fetchArticleDescription(item.url);
    } catch (error) {
      console.warn(`Description fetch failed for ${item.url}: ${error.message}`);
    }
  }

  let summaryJa;
  if (description) {
    try {
      const translatedSummary = await translate(description);
      summaryJa = JAPANESE_TEXT.test(translatedSummary)
        ? translatedSummary
        : `「${titleJa}」に関する記事です。詳細は出典をご確認ください。`;
    } catch (error) {
      console.warn(`Summary translation failed for "${item.title}": ${error.message}`);
      summaryJa = `「${titleJa}」に関する記事です。詳細は出典をご確認ください。`;
    }
  } else {
    summaryJa = `「${titleJa}」に関する記事です。詳細は出典をご確認ください。`;
  }

  return {
    ...item,
    titleJa,
    summaryJa,
    keyPoints: buildKeyPoints(summaryJa),
    category: inferCategory(item.title),
    impact: item.points >= 500 ? '高' : item.points >= 100 ? '中' : '低',
  };
}

function validateItems(items) {
  if (items.length !== 5) throw new Error(`Expected five items, received ${items.length}`);
  for (const item of items) {
    if (!item.url || !item.titleJa || !item.summaryJa) {
      throw new Error(`Incomplete item: ${item.title || 'unknown'}`);
    }
    if (!JAPANESE_TEXT.test(item.titleJa) || !JAPANESE_TEXT.test(item.summaryJa)) {
      throw new Error(`Japanese content missing: ${item.title}`);
    }
  }
}

async function main() {
  const rawItems = await fetchNews();
  const publishedData = await readPublishedCache();
  const cache = await loadTranslationCache();
  const localizedItems = [];

  for (const item of rawItems) {
    const { storyText, ...localized } = await localizeItem(item, cache);
    localizedItems.push(localized);
  }

  validateItems(localizedItems);
  const xTrends = await buildXTrends(publishedData);
  const data = {
    news: {
      items: localizedItems,
      fetchedAt: new Date().toISOString(),
      mock: false,
    },
    xTrends,
  };

  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, OUTPUT_PATH);
  console.log(`Wrote ${localizedItems.length} current stories to ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(`Data update failed; the currently published data will be kept: ${error.stack || error.message}`);
  process.exit(1);
});
