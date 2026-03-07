const newsCards = document.getElementById('news-cards');
const trendsCards = document.getElementById('trends-cards');
const refreshBtn = document.getElementById('refresh-btn');
const lastUpdated = document.getElementById('last-updated');

// ── Skeletons ──────────────────────────────────────────────────────────────

function skeletonNews() {
  return `
    <div class="skeleton skeleton-news">
      <div class="skeleton-line full"></div>
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line meta"></div>
    </div>`;
}

function skeletonTweet() {
  return `
    <div class="skeleton skeleton-tweet">
      <div class="skeleton-line short" style="width:35%;margin-bottom:10px"></div>
      <div class="skeleton-line full"></div>
      <div class="skeleton-line medium"></div>
      <div class="skeleton-line meta" style="width:50%;margin-top:10px"></div>
    </div>`;
}

function showSkeletons() {
  newsCards.innerHTML = [1, 2, 3].map(skeletonNews).join('');
  trendsCards.innerHTML = [1, 2, 3].map(skeletonTweet).join('');
}

// ── Render helpers ─────────────────────────────────────────────────────────

function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

function mockBadge() {
  return `<div style="display:inline-flex;align-items:center;gap:5px;font-size:0.7rem;color:var(--text-dim);background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:4px;padding:3px 8px;margin-bottom:10px;">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    デモデータ（本番環境ではリアルタイム取得）
  </div>`;
}

function formatNum(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function renderNews(items, isMock) {
  if (!items || items.length === 0) {
    newsCards.innerHTML = errorCard('ニュースが見つかりませんでした');
    return;
  }
  newsCards.innerHTML = (isMock ? mockBadge() : '') + items.map(item => `
    <a class="news-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="news-card-title">${escapeHtml(item.titleJa || item.title)}</div>
      <div class="news-card-meta">
        ${item.domain ? `<span class="meta-domain">${escapeHtml(item.domain)}</span>` : ''}
        <span class="meta-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          ${item.points}
        </span>
        <span class="meta-item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${item.comments}
        </span>
        <span class="meta-item">${relativeTime(item.createdAt)}</span>
      </div>
    </a>`).join('');
}

function renderTweets(items, isMock) {
  if (!items || items.length === 0) {
    trendsCards.innerHTML = errorCard('ツイートが見つかりませんでした');
    return;
  }
  const xIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
  trendsCards.innerHTML = (isMock ? mockBadge() : '') + items.map(item => `
    <a class="tweet-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="tweet-header">
        <span class="tweet-author">${escapeHtml(item.author)}</span>
        <span class="tweet-x-icon">${xIcon}</span>
      </div>
      <div class="tweet-text">${escapeHtml(item.text)}</div>
      <div class="tweet-meta">
        ${item.likes !== undefined ? `<span class="tweet-stat">♥ ${formatNum(item.likes)}</span>` : ''}
        ${item.retweets !== undefined ? `<span class="tweet-stat">↻ ${formatNum(item.retweets)}</span>` : ''}
        <span class="tweet-stat">${relativeTime(item.date)}</span>
      </div>
    </a>`).join('');
}

function errorCard(message) {
  return `
    <div class="error-card">
      <span class="error-icon">⚠</span>
      <span>${escapeHtml(message)}</span>
    </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ── Fetch ──────────────────────────────────────────────────────────────────

const AI_KEYWORDS = /\b(ai|artificial intelligence|llm|machine learning|deep learning|openai|anthropic|gemini|gpt|claude|chatgpt|neural|diffusion|generative|midjourney|stable diffusion|hugging face|transformer)\b/i;

async function fetchNews() {
  const res = await fetch(
    'https://hn.algolia.com/api/v1/search?query=artificial+intelligence+AI+LLM&tags=story&hitsPerPage=30'
  );
  if (!res.ok) throw new Error(`HN API returned ${res.status}`);
  const data = await res.json();

  const items = data.hits
    .filter(h => h.title && (AI_KEYWORDS.test(h.title) || AI_KEYWORDS.test(h.story_text || '')))
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

  return { items, fetchedAt: new Date().toISOString() };
}

async function fetchTweetsData(bustCache = false) {
  const url = bustCache ? `data.json?_=${Date.now()}` : 'data.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error('data.json not found');
  const data = await res.json();
  return data.tweets || data.trends;
}

// ── Load ───────────────────────────────────────────────────────────────────

async function load(refresh = false) {
  setLoading(true);
  showSkeletons();

  const [newsResult, tweetsResult] = await Promise.allSettled([
    fetchNews(),
    fetchTweetsData(refresh),
  ]);

  if (newsResult.status === 'fulfilled') {
    renderNews(newsResult.value.items, false);
  } else {
    newsCards.innerHTML = errorCard('AIニュースの取得に失敗しました。しばらくしてから更新してください。');
  }

  if (tweetsResult.status === 'fulfilled') {
    renderTweets(tweetsResult.value.items, tweetsResult.value.mock === true);
  } else {
    trendsCards.innerHTML = errorCard('Xのツイート取得に失敗しました。しばらくしてから更新してください。');
  }

  const now = new Date().toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  lastUpdated.textContent = `最終更新: ${now}`;

  setLoading(false);
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshBtn.classList.toggle('loading', isLoading);
}

// ── Events ─────────────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', () => load(true));

document.addEventListener('DOMContentLoaded', () => load(false));
