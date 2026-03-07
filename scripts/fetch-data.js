const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const MOCK_NEWS = [
  {
    title: 'OpenAI GPT-5 Achieves Record Scores on Major AI Benchmarks',
    titleJa: 'OpenAI GPT-5、主要AIベンチマークで過去最高スコアを達成',
    url: 'https://news.ycombinator.com/item?id=39999001',
    points: 1847,
    comments: 423,
    author: 'techreporter',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    domain: 'openai.com',
  },
  {
    title: 'Google DeepMind Releases AlphaCode 3, Outperforming Senior Engineers on Complex Tasks',
    titleJa: 'Google DeepMind、AlphaCode 3を公開 ― 複雑なタスクでシニアエンジニアを凌駕',
    url: 'https://news.ycombinator.com/item?id=39999002',
    points: 1234,
    comments: 287,
    author: 'airesearch',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    domain: 'deepmind.google',
  },
  {
    title: "Anthropic's Claude 4 Demonstrates Strong Reasoning with Extended Thinking Mode",
    titleJa: 'AnthropicのClaude 4、拡張思考モードで高度な推論能力を実証',
    url: 'https://news.ycombinator.com/item?id=39999003',
    points: 987,
    comments: 198,
    author: 'mlnews',
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    domain: 'anthropic.com',
  },
];

const MOCK_TWEETS = [
  {
    text: 'GPT-4oの新機能すごすぎる...画像を見せただけで完璧なコードを生成してくれた🤯 これもう普通のエンジニアいらないんじゃないか',
    author: '@ai_enthusiast_jp',
    url: 'https://x.com/search?q=GPT-4o',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    likes: 15200,
    retweets: 4800,
  },
  {
    text: 'Claudeで論文要約してみたら、元の論文より分かりやすい解説が10秒で出てきた。研究者の働き方が根本から変わりそう',
    author: '@researcher_ai',
    url: 'https://x.com/search?q=Claude+AI',
    date: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    likes: 8900,
    retweets: 2100,
  },
  {
    text: '生成AIで作った動画、もう本物と区別つかなくなってきた。フェイクニュースや誤情報の問題、本当に深刻になってきてる',
    author: '@media_watch_jp',
    url: 'https://x.com/search?q=%E7%94%9F%E6%88%90AI',
    date: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    likes: 23400,
    retweets: 8700,
  },
];

async function translateTitle(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ja`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Translation API returned ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(`Translation failed: ${data.responseDetails}`);
  return data.responseData.translatedText;
}

async function fetchNews() {
  const res = await fetch(
    'https://hn.algolia.com/api/v1/search?query=artificial+intelligence+AI+LLM&tags=story&hitsPerPage=30',
    { headers: { 'User-Agent': USER_AGENT } }
  );
  if (!res.ok) throw new Error(`HN API returned ${res.status}`);
  const data = await res.json();

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
      domain: h.url ? new URL(h.url).hostname.replace(/^www\./, '') : 'news.ycombinator.com',
    }));

  // 各タイトルを日本語に翻訳
  for (const item of items) {
    try {
      item.titleJa = await translateTitle(item.title);
      console.log(`Translated: "${item.title}" -> "${item.titleJa}"`);
    } catch (err) {
      console.warn(`Translation failed for "${item.title}":`, err.message);
      item.titleJa = item.title;
    }
  }

  return items;
}

const NITTER_INSTANCES = [
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://nitter.net',
  'https://nitter.space',
];

async function fetchTweets() {
  const query = encodeURIComponent('AI OR ChatGPT OR LLM OR 生成AI');

  for (const instance of NITTER_INSTANCES) {
    try {
      const res = await fetch(`${instance}/search/rss?q=${query}&f=tweets`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      const items = [];
      $('item').each((i, el) => {
        if (items.length >= 3) return false;
        const titleText = $(el).find('title').text().trim();
        const link = $(el).find('guid').text().trim() || $(el).find('link').text().trim();
        const pubDate = $(el).find('pubDate').text().trim();

        // Nitter RSSのtitle形式: "@username: ツイート本文"
        const colonIdx = titleText.indexOf(': ');
        const author = colonIdx > -1 ? titleText.substring(0, colonIdx) : 'unknown';
        const text = colonIdx > -1 ? titleText.substring(colonIdx + 2) : titleText;
        if (!text) return;

        // nitter URLをx.com URLに変換
        const twitterUrl = link.replace(/https?:\/\/[^/]+\//, 'https://x.com/');

        items.push({
          text,
          author,
          url: twitterUrl || `https://x.com/search?q=AI`,
          date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        });
      });

      if (items.length > 0) {
        console.log(`Tweets fetched from ${instance}:`, items.length);
        return items;
      }
    } catch {
      continue;
    }
  }

  throw new Error('All Nitter instances failed');
}

async function main() {
  let newsItems = MOCK_NEWS;
  let tweetItems = MOCK_TWEETS;
  let newsMock = true;
  let tweetsMock = true;

  try {
    newsItems = await fetchNews();
    newsMock = false;
    console.log('News fetched successfully:', newsItems.length, 'items');
  } catch (err) {
    console.warn('News fetch failed, using mock:', err.message);
  }

  try {
    tweetItems = await fetchTweets();
    tweetsMock = false;
    console.log('Tweets fetched successfully:', tweetItems.length, 'items');
  } catch (err) {
    console.warn('Tweets fetch failed, using mock:', err.message);
  }

  const data = {
    news: { items: newsItems, fetchedAt: new Date().toISOString(), mock: newsMock },
    tweets: { items: tweetItems, fetchedAt: new Date().toISOString(), mock: tweetsMock },
  };

  const outputPath = path.join(__dirname, '..', 'public', 'data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log('data.json written to', outputPath);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
