const newsCards   = document.getElementById('news-cards');
const trendsCards = document.getElementById('trends-cards');
const refreshBtn  = document.getElementById('refresh-btn');
const lastUpdated = document.getElementById('last-updated');
const heroDate    = document.getElementById('hero-date');

// ── Skeletons ──────────────────────────────────────────────────────────────

function skeletonNews() {
  return `
    <div class="skeleton skeleton-news">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line full" style="height:18px;margin-top:4px"></div>
      <div class="skeleton-line medium" style="height:18px"></div>
      <div class="skeleton-line full" style="margin-top:8px"></div>
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
      <div class="skeleton-line meta" style="width:45%;margin-top:10px"></div>
    </div>`;
}

function showSkeletons() {
  newsCards.innerHTML   = [1, 2, 3].map(skeletonNews).join('');
  trendsCards.innerHTML = [1, 2, 3].map(skeletonTweet).join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(isoString) {
  const diff    = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function formatNum(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000)  return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mockBadge() {
  return `<div class="mock-badge">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    デモデータ（本番環境ではリアルタイム取得）
  </div>`;
}

function errorCard(message) {
  return `<div class="error-card"><span class="error-icon">⚠</span><span>${escapeHtml(message)}</span></div>`;
}

// ── Render: News ───────────────────────────────────────────────────────────

const RANK_LABELS  = ['NO.1 バズ', 'NO.2', 'NO.3'];
const RANK_CLASSES = ['rank-1', 'rank-2', 'rank-3'];

const LINK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function renderNews(items, isMock) {
  if (!items || items.length === 0) {
    newsCards.innerHTML = errorCard('ニュースが見つかりませんでした');
    return;
  }

  newsCards.innerHTML = (isMock ? mockBadge() : '') + items.map((item, i) => {
    const rankClass = RANK_CLASSES[i] ?? '';
    const rankLabel = RANK_LABELS[i] ?? `NO.${i + 1}`;
    const rank     = `<span class="rank-badge ${rankClass}">🔥 ${rankLabel}</span>`;
    const category = item.category
      ? `<span class="category-tag">${escapeHtml(item.category)}</span>` : '';
    const impact   = item.impact ?? (item.points >= 1000 ? '高' : item.points >= 500 ? '中' : '低');
    const impactClass = impact === '高' ? 'impact-high' : impact === '中' ? 'impact-mid' : 'impact-low';

    const keyPointsHtml = item.keyPoints?.length
      ? `<div class="key-points">
          <div class="key-points-label">KEY POINTS</div>
          <ul>${item.keyPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        </div>`
      : '';

    return `
    <a class="news-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="card-header">
        <div class="card-header-left">${rank}${category}</div>
        <span class="buzz-count">🔥 ${formatNum(item.points)} pt</span>
      </div>
      <h2 class="card-title">${escapeHtml(item.titleJa || item.title)}</h2>
      ${item.summaryJa ? `<p class="card-summary">${escapeHtml(item.summaryJa)}</p>` : ''}
      ${keyPointsHtml}
      <div class="card-footer">
        <span class="card-source">${LINK_ICON} 出典: ${escapeHtml(item.domain || 'Hacker News')}</span>
        <span class="impact-badge ${impactClass}">業界インパクト：${escapeHtml(impact)}</span>
      </div>
    </a>`;
  }).join('');
}

// ── Render: Reddit posts ────────────────────────────────────────────────────

const REDDIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>`;

function renderTweets(items, isMock) {
  if (!items || items.length === 0) {
    trendsCards.innerHTML = errorCard('Reddit の投稿が見つかりませんでした');
    return;
  }
  trendsCards.innerHTML = (isMock ? mockBadge() : '') + items.map(item => `
    <a class="tweet-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="tweet-header">
        <div class="tweet-header-left">
          ${item.subreddit ? `<span class="subreddit-badge">${escapeHtml(item.subreddit)}</span>` : ''}
          <span class="tweet-author">${escapeHtml(item.author)}</span>
        </div>
        <span class="tweet-x-icon">${REDDIT_ICON}</span>
      </div>
      <div class="tweet-text">${escapeHtml(item.text)}</div>
      <div class="tweet-meta">
        ${item.likes    !== undefined ? `<span class="tweet-stat">↑ ${formatNum(item.likes)}</span>` : ''}
        ${item.comments !== undefined ? `<span class="tweet-stat">💬 ${formatNum(item.comments)}</span>` : ''}
        <span class="tweet-stat">${relativeTime(item.date)}</span>
      </div>
    </a>`).join('');
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchData(bustCache = false) {
  const url = bustCache ? `data.json?_=${Date.now()}` : 'data.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error('data.json not found');
  return res.json();
}

// ── Load ───────────────────────────────────────────────────────────────────

async function load(refresh = false) {
  setLoading(true);
  showSkeletons();

  try {
    const data = await fetchData(refresh);

    if (data.news) {
      renderNews(data.news.items, data.news.mock === true);
    } else {
      newsCards.innerHTML = errorCard('AIニュースの取得に失敗しました。');
    }

    const tweets = data.tweets || data.trends;
    if (tweets) {
      renderTweets(tweets.items, tweets.mock === true);
    } else {
      trendsCards.innerHTML = errorCard('Xのツイート取得に失敗しました。');
    }
  } catch (err) {
    newsCards.innerHTML   = errorCard('データの取得に失敗しました。しばらくしてから更新してください。');
    trendsCards.innerHTML = '';
  }

  // ヘッダーに日付を表示
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  heroDate.textContent = `${dateStr} — 最も話題になったAIトピックを厳選`;

  lastUpdated.textContent = `最終更新: ${now.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

  setLoading(false);
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshBtn.classList.toggle('loading', isLoading);
}

// ── Events ─────────────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', () => load(true));
document.addEventListener('DOMContentLoaded', () => load(false));
