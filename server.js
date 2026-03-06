const express = require('express');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache
const cache = {
  news: { data: null, fetchedAt: 0 },
  trends: { data: null, fetchedAt: 0 },
};
const NEWS_CACHE_TTL = 5 * 60 * 1000;   // 5 minutes
const TRENDS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ── Mock data (used as fallback when external APIs are unavailable) ──────────

const MOCK_NEWS = [
  {
    title: 'OpenAI GPT-5 Achieves Record Scores on Major AI Benchmarks',
    url: 'https://news.ycombinator.com/item?id=39999001',
    points: 1847,
    comments: 423,
    author: 'techreporter',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    domain: 'openai.com',
  },
  {
    title: 'Google DeepMind Releases AlphaCode 3, Outperforming Senior Engineers on Complex Tasks',
    url: 'https://news.ycombinator.com/item?id=39999002',
    points: 1234,
    comments: 287,
    author: 'airesearch',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    domain: 'deepmind.google',
  },
  {
    title: 'Anthropic\'s Claude 4 Demonstrates Strong Reasoning with Extended Thinking Mode',
    url: 'https://news.ycombinator.com/item?id=39999003',
    points: 987,
    comments: 198,
    author: 'mlnews',
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    domain: 'anthropic.com',
  },
];

const MOCK_TRENDS = [
  { rank: 1, topic: '#AI', url: 'https://x.com/search?q=%23AI&src=trend_click' },
  { rank: 2, topic: 'ChatGPT', url: 'https://x.com/search?q=ChatGPT&src=trend_click' },
  { rank: 3, topic: '#生成AI', url: 'https://x.com/search?q=%23%E7%94%9F%E6%88%90AI&src=trend_click' },
];

// ── GET /api/news — HN Algolia API proxy ────────────────────────────────────

app.get('/api/news', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  if (!forceRefresh && cache.news.data && now - cache.news.fetchedAt < NEWS_CACHE_TTL) {
    return res.json(cache.news.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      'https://hn.algolia.com/api/v1/search?query=artificial+intelligence+AI+LLM&tags=story&hitsPerPage=30',
      { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } }
    );
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HN API returned ${response.status}`);
    const data = await response.json();

    const aiKeywords = /\b(ai|artificial intelligence|llm|machine learning|deep learning|openai|anthropic|gemini|gpt|claude|chatgpt|neural|diffusion|generative|midjourney|stable diffusion|hugging face|transformer)\b/i;

    const items = data.hits
      .filter(h => h.title && (aiKeywords.test(h.title) || aiKeywords.test(h.story_text || '')))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map(h => ({
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points || 0,
        comments: h.num_comments || 0,
        author: h.author,
        createdAt: h.created_at,
        domain: h.url ? extractDomain(h.url) : 'news.ycombinator.com',
      }));

    const result = { items, fetchedAt: new Date().toISOString() };
    cache.news = { data: result, fetchedAt: now };
    res.json(result);
  } catch (err) {
    console.warn('News fetch failed, using mock data:', err.message);
    const result = { items: MOCK_NEWS, fetchedAt: new Date().toISOString(), mock: true };
    cache.news = { data: result, fetchedAt: now };
    res.json(result);
  }
});

// ── GET /api/trends — X trending topics ────────────────────────────────────

app.get('/api/trends', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  if (!forceRefresh && cache.trends.data && now - cache.trends.fetchedAt < TRENDS_CACHE_TTL) {
    return res.json(cache.trends.data);
  }

  try {
    const items = await scrapeTrends('https://trends24.in/japan/');
    const result = { items, fetchedAt: new Date().toISOString() };
    cache.trends = { data: result, fetchedAt: now };
    res.json(result);
  } catch (err) {
    console.warn('Japan trends failed, trying worldwide:', err.message);
    try {
      const items = await scrapeTrends('https://trends24.in/');
      const result = { items, fetchedAt: new Date().toISOString() };
      cache.trends = { data: result, fetchedAt: now };
      res.json(result);
    } catch (err2) {
      console.warn('Trends fetch failed, using mock data:', err2.message);
      const result = { items: MOCK_TRENDS, fetchedAt: new Date().toISOString(), mock: true };
      cache.trends = { data: result, fetchedAt: now };
      res.json(result);
    }
  }
});

async function scrapeTrends(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    },
  });
  clearTimeout(timeout);

  if (!response.ok) throw new Error(`trends24.in returned ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);

  const items = [];
  // trends24.in structure: .trend-card contains ol > li > a
  $('.trend-card').first().find('ol li a').each((i, el) => {
    if (items.length >= 3) return false;
    const topic = $(el).text().trim();
    if (topic) {
      const encodedTopic = encodeURIComponent(topic);
      items.push({
        rank: items.length + 1,
        topic,
        url: `https://x.com/search?q=${encodedTopic}&src=trend_click`,
      });
    }
  });

  if (items.length === 0) throw new Error('No trends found in HTML');
  return items;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
