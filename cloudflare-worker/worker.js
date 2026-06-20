const FEEDS = [
  ['ITmedia NEWS', 'https://rss.itmedia.co.jp/rss/2.0/itmedia_news.xml'],
  ['ITmedia AI+', 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml'],
  ['ASCII.jp', 'https://ascii.jp/rss.xml'],
  ['PC Watch', 'https://pc.watch.impress.co.jp/data/rss/1.0/pcw/feed.rdf'],
  ['GIGAZINE', 'https://gigazine.net/news/rss_2.0/'],
  ['CNET Japan', 'https://japan.cnet.com/rss/index.rdf'],
  ['ZDNET Japan', 'https://japan.zdnet.com/rss/index.rdf'],
  ['Publickey', 'https://www.publickey1.jp/atom.xml'],
  ['AINOW', 'https://ainow.ai/feed/'],
  ['Ledge.ai', 'https://ledge.ai/feed/'],
  ['AI-SCHOLAR', 'https://ai-scholar.tech/feed/']
];

const AI_RE = /AI|人工知能|生成AI|生成系AI|ChatGPT|OpenAI|GPT|Claude|Anthropic|Gemini|Copilot|LLM|大規模言語モデル|基盤モデル|マルチモーダル|画像生成|動画生成|音声生成|AIエージェント|RAG|プロンプト|推論|DeepSeek|Llama|Mistral|Perplexity|Sora|NVIDIA|GPU|半導体|NPU|データセンター|ロボット|自動運転|AI規制|著作権|安全性|AGI/i;
const JP_RE = /[ぁ-んァ-ヶ一-龠々ー]/;
const BAD_IMG_RE = /logo|icon|avatar|sprite|blank|pixel|favicon|profile|author|sns|button|banner|ad_|ads|tracking|1x1/i;
const SCORE_WORDS = ['発表','公開','リリース','提供開始','新モデル','新機能','大型','提携','買収','投資','資金調達','規制','訴訟','著作権','安全性','性能','ベンチマーク','推論','マルチモーダル','エージェント','自動化','gpu','nvidia','半導体','データセンター','openai','chatgpt','claude','anthropic','gemini','deepseek','llm','copilot','sora','動画生成'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const forceFresh = url.searchParams.get('fresh') === '1';
    const cache = caches.default;
    const cacheKey = new Request(url.origin + '/ai-news-cache-v3-safe-parser-page-images');

    if (!forceFresh) {
      const cached = await cache.match(cacheKey);
      if (cached) return withCors(cached);
    }

    try {
      const data = await buildNews();
      const res = new Response(JSON.stringify(data, null, 2), {
        headers: {
          ...CORS,
          'Cache-Control': 'public, max-age=300'
        }
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (e) {
      return new Response(JSON.stringify({
        generatedAt: new Date().toISOString(),
        error: String(e && e.message ? e.message : e),
        articles: [],
        feedOk: 0,
        feedNg: FEEDS.length,
        candidates: 0
      }, null, 2), { status: 500, headers: CORS });
    }
  }
};

function withCors(res) {
  const h = new Headers(res.headers);
  Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
}

async function buildNews() {
  const settled = await Promise.allSettled(FEEDS.map(([src, url]) => fetchFeed(src, url)));
  let feedOk = 0;
  let feedNg = 0;
  let articles = [];
  const status = [];

  settled.forEach((r, i) => {
    const src = FEEDS[i][0];
    if (r.status === 'fulfilled') {
      feedOk += 1;
      articles.push(...r.value);
      status.push({ source: src, ok: true, items: r.value.length });
    } else {
      feedNg += 1;
      status.push({ source: src, ok: false, error: String(r.reason).slice(0, 160) });
    }
  });

  const seen = new Set();
  const unique = articles
    .map(scoreArticle)
    .filter(a => {
      const key = String(a.link || a.title).replace(/[?#].*$/, '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0) || String(b.date || '').localeCompare(String(a.date || '')));

  const top = unique.slice(0, 20);
  const enriched = await enrichArticleImages(top);

  return {
    generatedAt: new Date().toISOString(),
    generatedLabel: new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(new Date()),
    mode: 'cloudflare-worker-live-rss-safe-parser-page-images',
    feedOk,
    feedNg,
    candidates: articles.length,
    status,
    articles: enriched
  };
}

async function fetchFeed(src, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), 12000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 AI-News-KEN/1.0' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
    const xml = await res.text();
    return parseFeed(src, xml);
  } finally {
    clearTimeout(timer);
  }
}

function parseFeed(src, xml) {
  const blocks = collectBlocks(xml, 'item').concat(collectBlocks(xml, 'entry'));
  const out = [];
  for (const block of blocks.slice(0, 30)) {
    const title = cleanText(tagText(block, 'title'));
    const link = firstLink(block);
    const rawDesc = tagText(block, 'description') || tagText(block, 'summary') || tagText(block, 'content:encoded') || tagText(block, 'content') || '';
    const descText = cleanText(rawDesc);
    const dateRaw = tagText(block, 'pubDate') || tagText(block, 'published') || tagText(block, 'updated') || tagText(block, 'dc:date') || '';
    const d = parseDate(dateRaw);

    if (!title || !link || badUrl(link)) continue;
    if (!JP_RE.test(title)) continue;
    if (!AI_RE.test(`${title} ${descText}`)) continue;

    const desc = JP_RE.test(descText)
      ? descText.slice(0, 180)
      : '発信元RSSに日本語の概要が含まれていないため、詳細は記事本文で確認してください。AI関連の重要トピックとして抽出しています。';

    const article = {
      title,
      link,
      date: d ? d.toISOString() : '',
      dateLabel: d ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d) : '日時不明',
      desc,
      img: imageFromItem(block, link, rawDesc),
      imgSource: 'rss',
      src
    };
    if (!article.img) article.imgSource = '';
    article.cat = category(`${title} ${descText}`);
    out.push(article);
  }
  return out;
}

async function enrichArticleImages(list) {
  const target = list.slice(0, 8);
  const rest = list.slice(8);
  const settled = await Promise.allSettled(target.map(async article => {
    if (article.img) return article;
    const img = await imageFromPage(article.link);
    if (!img) return article;
    return {
      ...article,
      img,
      imgSource: 'article-og-image',
      score: (article.score || 0) + 8
    };
  }));
  return settled.map((r, i) => r.status === 'fulfilled' ? r.value : target[i]).concat(rest);
}

async function imageFromPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), 5000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 AI-News-KEN/1.0' },
      signal: controller.signal
    });
    if (!res.ok) return '';
    const html = await res.text();
    return imageFromHtml(html, url);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function imageFromHtml(html, base) {
  const h = String(html || '').slice(0, 250000);
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["'][^>]*>/i
  ];
  for (const re of patterns) {
    const m = h.match(re);
    if (!m) continue;
    const img = cleanImg(m[1], base);
    if (img) return img;
  }

  const imgTags = [...h.matchAll(/<img[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi)].map(m => m[1]);
  for (const raw of imgTags) {
    const img = cleanImg(raw, base);
    if (img) return img;
  }
  return '';
}

function collectBlocks(xml, tag) {
  const re = new RegExp('<' + tag + '[^>]*>[^]*?</' + tag + '>', 'gi');
  return xml.match(re) || [];
}

function tagText(block, tag) {
  const re = new RegExp('<' + tag + '[^>]*>([^]*?)</' + tag + '>', 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function firstLink(block) {
  const atomHref = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (atomHref) return decodeHtml(atomHref[1]);
  const linkText = tagText(block, 'link');
  if (linkText) return cleanText(linkText);
  const guid = tagText(block, 'guid');
  return cleanText(guid);
}

function cleanText(s) {
  return decodeHtml(String(s || ''))
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function imageFromItem(block, base, rawDesc) {
  const candidates = [];
  const media = [...block.matchAll(/<(?:media:)?(?:content|thumbnail)[^>]+url=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  const enclosures = [...block.matchAll(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  const imgTags = [...String(rawDesc || '').matchAll(/<img[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi)].map(m => m[1]);
  candidates.push(...media, ...enclosures, ...imgTags);
  for (const c of candidates) {
    const img = cleanImg(c, base);
    if (img) return img;
  }
  return '';
}

function cleanImg(u, base) {
  if (!u) return '';
  try {
    const abs = new URL(decodeHtml(u), base).href;
    if (badUrl(abs) || BAD_IMG_RE.test(abs)) return '';
    return abs;
  } catch {
    return '';
  }
}

function badUrl(u) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host.includes('news.google.') || host.includes('googleusercontent') || host.includes('gstatic') || host.includes('doubleclick');
  } catch {
    return true;
  }
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(cleanText(s));
  return isNaN(d.getTime()) ? null : d;
}

function category(text) {
  if (/NVIDIA|GPU|H100|H200|B200|CUDA|半導体|TSMC|NPU|データセンター/i.test(text)) return '半導体/GPU';
  if (/規制|著作権|訴訟|安全性|プライバシー|ガバナンス|倫理/i.test(text)) return '規制/安全';
  if (/エージェント|Copilot|自動化|ワークフロー|業務AI|SaaS/i.test(text)) return 'AIエージェント/業務';
  if (/ChatGPT|OpenAI|GPT|Claude|Anthropic|Gemini|Llama|DeepSeek|Mistral|大規模言語モデル|LLM|基盤モデル/i.test(text)) return 'LLM/モデル';
  if (/画像生成|動画生成|音声生成|生成AI|マルチモーダル|Sora|Veo/i.test(text)) return '生成AI/マルチモーダル';
  if (/ロボット|自動運転|医療AI|製造|設計|品質|実装/i.test(text)) return 'AI実装';
  return 'AI全般';
}

function scoreArticle(a) {
  const text = `${a.title} ${a.desc}`.toLowerCase();
  let score = SCORE_WORDS.reduce((sum, w) => sum + (text.includes(w.toLowerCase()) ? 8 : 0), 0);
  if (a.date) {
    const hours = (Date.now() - new Date(a.date).getTime()) / 36e5;
    if (hours < 24) score += 18;
    else if (hours < 72) score += 10;
    else if (hours < 168) score += 4;
  }
  if (a.img) score += 8;
  return { ...a, score };
}
