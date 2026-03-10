const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const MOCK_NEWS = [
  {
    title: 'OpenAI GPT-5 Achieves Record Scores on Major AI Benchmarks',
    titleJa: 'OpenAI GPT-5、主要AIベンチマークで過去最高スコアを達成',
    summaryJa: 'GPT-5は言語理解・数学的推論・コード生成など主要ベンチマークで人間の専門家レベルを超えるスコアを記録。前モデルGPT-4oから大幅な性能向上を確認。',
    keyPoints: [
      '言語理解・数学推論・コード生成の全分野でGPT-4oを大幅に上回るスコアを記録',
      'マルチモーダル対応が強化され、画像・音声・動画の複合理解が可能に',
      'APIは既存のGPT-4oエンドポイントと互換性を維持し移行コストを最小化',
    ],
    category: 'モデル進化',
    impact: '高',
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
    summaryJa: 'AlphaCode 3は競技プログラミングや大規模コードリファクタリングなど複雑なタスクでシニアエンジニアを上回る性能を発揮。自然言語による仕様からの実装も可能に。',
    keyPoints: [
      '競技プログラミングの上位1%相当の問題を解決できる精度を達成',
      '自然言語の仕様書から本番レベルのコードを自動生成する機能を搭載',
      'GitHubとの連携により既存リポジトリのコンテキストを理解してコード補完が可能',
    ],
    category: 'コード生成',
    impact: '高',
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
    summaryJa: '拡張思考モードを搭載したClaude 4は複雑な数学問題や論理パズルで顕著な改善を示し、段階的な思考プロセスを可視化することでユーザーの信頼性向上にも貢献。',
    keyPoints: [
      '拡張思考モードにより複雑な数学・論理問題での正解率が前バージョン比30%向上',
      '思考ステップを可視化することでハルシネーション（誤情報生成）を大幅に削減',
      '長文コンテキスト（200K tokens）での一貫した推論精度を維持',
    ],
    category: '推論強化',
    impact: '中',
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
    text: 'Yann LeCun argues that LLMs cannot achieve human-level intelligence because they lack world models',
    author: 'thrw_ml_fan',
    source: 'Hacker News',
    url: 'https://news.ycombinator.com/',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    likes: 621,
    comments: 312,
  },
  {
    text: 'I built a local RAG pipeline using Ollama + LlamaIndex running entirely offline – benchmarks vs GPT-4',
    author: 'local_llm_builder',
    source: 'Hacker News',
    url: 'https://news.ycombinator.com/',
    date: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    likes: 487,
    comments: 193,
  },
  {
    text: 'OpenAI updated system prompt restrictions – comparison with Claude and Gemini',
    author: 'ai_policy_watcher',
    source: 'Hacker News',
    url: 'https://news.ycombinator.com/',
    date: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    likes: 834,
    comments: 401,
  },
];

async function translate(text) {
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

async function fetchArticleDescription(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const desc =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';
  return desc.replace(/\s+/g, ' ').trim().slice(0, 400);
}

async function fetchNews() {
  // 直近8時間に絞ることで毎時ニュースが更新されるようにする
  const since = Math.floor(Date.now() / 1000) - 8 * 3600;
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=AI+LLM+machine+learning&tags=story&hitsPerPage=50&numericFilters=created_at_i%3E${since},points%3E10`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HN API returned ${res.status}`);
  const data = await res.json();

  const aiKeywords = /\b(ai|artificial intelligence|llm|machine learning|deep learning|openai|anthropic|gemini|gpt|claude|chatgpt|neural|diffusion|generative|midjourney|stable diffusion|hugging face|transformer)\b/i;

  const hits = data.hits
    .filter(h => h.title && (aiKeywords.test(h.title) || aiKeywords.test(h.story_text || '')))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  if (hits.length === 0) throw new Error('No AI stories found in last 72h');

  return hits.map(h => ({
    title: h.title,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points: h.points || 0,
    comments: h.num_comments || 0,
    author: h.author,
    createdAt: h.created_at,
    domain: (() => { try { return h.url ? new URL(h.url).hostname.replace(/^www\./, '') : 'news.ycombinator.com'; } catch { return 'news.ycombinator.com'; } })(),
    _storyText: h.story_text || '',
  }));
}

// URLをキーに既存の翻訳キャッシュを読み込む
function loadTranslationCache(outputPath) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const cache = {};
    for (const item of existing.news?.items || []) {
      if (item.url) cache[item.url] = { titleJa: item.titleJa, summaryJa: item.summaryJa, keyPoints: item.keyPoints, impact: item.impact, category: item.category };
    }
    return cache;
  } catch {
    return {};
  }
}

async function translateNewsItems(items, cache) {
  console.log('Translating', items.length, 'items...');
  for (const item of items) {
    const cached = cache[item.url];
    if (cached?.titleJa) {
      // 同じURLの翻訳が既にある場合はキャッシュを使用
      item.titleJa  = cached.titleJa;
      item.summaryJa = cached.summaryJa || '';
      item.keyPoints = cached.keyPoints || [];
      item.impact    = cached.impact || '低';
      item.category  = cached.category || '';
      console.log(`Cached translation reused: "${item.title}"`);
      delete item._storyText;
      continue;
    }

    // 記事の説明文を取得（story_text優先、次にog:description）
    let description = '';
    if (item._storyText) {
      const $ = cheerio.load(item._storyText);
      description = $.text().replace(/\s+/g, ' ').trim().slice(0, 400);
    } else {
      try {
        description = await fetchArticleDescription(item.url);
      } catch (err) {
        console.warn(`Description fetch failed for ${item.url}:`, err.message);
      }
    }
    delete item._storyText;

    // タイトルを翻訳
    try {
      item.titleJa = await translate(item.title);
      console.log(`Title translated: "${item.title}" -> "${item.titleJa}"`);
    } catch (err) {
      console.warn(`Title translation failed:`, err.message);
      item.titleJa = item.title;
    }

    // 説明文を翻訳
    if (description) {
      try {
        item.summaryJa = await translate(description);
        console.log(`Summary translated for: "${item.title}"`);
      } catch (err) {
        console.warn(`Summary translation failed:`, err.message);
        item.summaryJa = '';
      }
    } else {
      item.summaryJa = '';
    }

    // summaryJa を文単位に分割して keyPoints を生成
    if (item.summaryJa) {
      item.keyPoints = item.summaryJa
        .split(/。/)
        .map(s => s.trim())
        .filter(s => s.length > 10)
        .slice(0, 3)
        .map(s => s + '。');
    } else {
      item.keyPoints = [];
    }

    // ポイント数からインパクトを判定
    item.impact = item.points >= 1000 ? '高' : item.points >= 500 ? '中' : '低';
    item.category = '';
  }
  return items;
}

const HN_TREND_QUERIES = ['LLM', 'AI agent', 'Claude', 'GPT', 'machine learning'];

async function fetchHNPosts() {
  const allPosts = [];

  for (const q of HN_TREND_QUERIES) {
    try {
      const since = Math.floor(Date.now() / 1000) - 8 * 3600;
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=5&numericFilters=created_at_i%3E${since},points%3E10`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { console.warn(`HN trend "${q}" returned ${res.status}`); continue; }
      const data = await res.json();
      const posts = (data.hits || [])
        .filter(h => h.title && h.points)
        .slice(0, 2)
        .map(h => ({
          text: h.title,
          author: h.author || 'anonymous',
          source: 'Hacker News',
          url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          date: h.created_at || new Date().toISOString(),
          likes: h.points,
          comments: h.num_comments || 0,
        }));
      allPosts.push(...posts);
      console.log(`HN trend "${q}": ${posts.length} posts`);
    } catch (err) {
      console.warn(`HN trend "${q}" failed:`, err.message);
    }
  }

  if (allPosts.length === 0) throw new Error('No HN posts found');

  // Deduplicate by URL, sort by points
  const seen = new Set();
  return allPosts
    .filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true; })
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3);
}

async function main() {
  const outputPath = path.join(__dirname, '..', 'public', 'data.json');
  let newsItems = MOCK_NEWS;
  let tweetItems = MOCK_TWEETS;
  let newsMock = true;
  let tweetsMock = true;

  try {
    const rawItems = await fetchNews();
    console.log('News fetched successfully:', rawItems.length, 'items');
    if (rawItems.length === 0) {
      console.warn('No AI-related stories found, using mock');
    } else {
      const cache = loadTranslationCache(outputPath);
      newsItems = await translateNewsItems(rawItems, cache);
      newsMock = false;
    }
  } catch (err) {
    console.warn('News fetch/translate failed, using mock:', err.message);
    console.warn('Stack:', err.stack);
  }

  try {
    tweetItems = await fetchHNPosts();
    tweetsMock = false;
    console.log('HN trend posts fetched successfully:', tweetItems.length, 'items');
  } catch (err) {
    console.warn('HN trend fetch failed, using mock:', err.message);
    console.warn('Stack:', err.stack);
  }

  const data = {
    news: { items: newsItems, fetchedAt: new Date().toISOString(), mock: newsMock },
    tweets: { items: tweetItems, fetchedAt: new Date().toISOString(), mock: tweetsMock },
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log('data.json written to', outputPath);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
