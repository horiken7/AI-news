const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

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
    title: "Anthropic's Claude 4 Demonstrates Strong Reasoning with Extended Thinking Mode",
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

async function fetchNews() {
  const res = await fetch(
    'https://hn.algolia.com/api/v1/search?query=artificial+intelligence+AI+LLM&tags=story&hitsPerPage=30',
    { headers: { 'User-Agent': USER_AGENT } }
  );
  if (!res.ok) throw new Error(`HN API returned ${res.status}`);
  const data = await res.json();

  const aiKeywords = /\b(ai|artificial intelligence|llm|machine learning|deep learning|openai|anthropic|gemini|gpt|claude|chatgpt|neural|diffusion|generative|midjourney|stable diffusion|hugging face|transformer)\b/i;

  return data.hits
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
      domain: h.url ? new URL(h.url).hostname.replace(/^www\./, '') : 'news.ycombinator.com',
    }));
}

async function scrapeTrends(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`trends24.in returned ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $('.trend-card').first().find('ol li a').each((i, el) => {
    if (items.length >= 3) return false;
    const topic = $(el).text().trim();
    if (topic) {
      items.push({
        rank: items.length + 1,
        topic,
        url: `https://x.com/search?q=${encodeURIComponent(topic)}&src=trend_click`,
      });
    }
  });

  if (items.length === 0) throw new Error('No trends found in HTML');
  return items;
}

async function main() {
  let newsItems = MOCK_NEWS;
  let trendItems = MOCK_TRENDS;
  let newsMock = true;
  let trendsMock = true;

  try {
    newsItems = await fetchNews();
    newsMock = false;
    console.log('News fetched successfully:', newsItems.length, 'items');
  } catch (err) {
    console.warn('News fetch failed, using mock:', err.message);
  }

  try {
    trendItems = await scrapeTrends('https://trends24.in/japan/');
    trendsMock = false;
    console.log('Japan trends fetched successfully:', trendItems.length, 'items');
  } catch (err) {
    console.warn('Japan trends failed:', err.message);
    try {
      trendItems = await scrapeTrends('https://trends24.in/');
      trendsMock = false;
      console.log('Worldwide trends fetched successfully:', trendItems.length, 'items');
    } catch (err2) {
      console.warn('Trends fetch failed, using mock:', err2.message);
    }
  }

  const data = {
    news: { items: newsItems, fetchedAt: new Date().toISOString(), mock: newsMock },
    trends: { items: trendItems, fetchedAt: new Date().toISOString(), mock: trendsMock },
  };

  const outputPath = path.join(__dirname, '..', 'public', 'data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log('data.json written to', outputPath);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
