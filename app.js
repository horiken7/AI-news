const newsCards = document.getElementById('news-cards');
const xTrendCards = document.getElementById('x-trend-cards');
const refreshBtn = document.getElementById('refresh-btn');
const lastUpdated = document.getElementById('last-updated');
const heroDate = document.getElementById('hero-date');
const heroLastUpdated = document.getElementById('hero-last-updated');

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

function showSkeletons() {
  newsCards.innerHTML = [1, 2, 3, 4, 5].map(skeletonNews).join('');
  xTrendCards.innerHTML = [1, 2, 3, 4, 5].map(skeletonTrend).join('');
}

function skeletonTrend() {
  return `
    <div class="skeleton skeleton-trend">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line medium"></div>
    </div>`;
}

function relativeTime(isoString) {
  const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function formatNum(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
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

function errorCard(message) {
  return `<div class="error-card"><span class="error-icon">!</span><span>${escapeHtml(message)}</span></div>`;
}

function formatJstDate(instant = new Date()) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(instant);
}

function formatJstDateTime(isoString, includeSeconds = false) {
  const instant = new Date(isoString);
  if (Number.isNaN(instant.getTime())) return '';

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).format(instant);
}

const RANK_LABELS = ['NO.1 バズ', 'NO.2', 'NO.3', 'NO.4', 'NO.5'];
const RANK_CLASSES = ['rank-1', 'rank-2', 'rank-3', 'rank-4', 'rank-5'];

const LINK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function renderNews(items) {
  if (!Array.isArray(items) || items.length === 0) {
    newsCards.innerHTML = errorCard('ニュースが見つかりませんでした。');
    return;
  }

  newsCards.innerHTML = items.map((item, index) => {
    const rankClass = RANK_CLASSES[index] ?? '';
    const rankLabel = RANK_LABELS[index] ?? `NO.${index + 1}`;
    const rank = `<span class="rank-badge ${rankClass}">HOT ${rankLabel}</span>`;
    const category = item.category
      ? `<span class="category-tag">${escapeHtml(item.category)}</span>`
      : '';
    const impact = item.impact ?? (item.points >= 1000 ? '高' : item.points >= 500 ? '中' : '低');
    const impactClass = impact === '高' ? 'impact-high' : impact === '中' ? 'impact-mid' : 'impact-low';
    const keyPointsHtml = item.keyPoints?.length
      ? `<div class="key-points">
          <div class="key-points-label">KEY POINTS</div>
          <ul>${item.keyPoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
        </div>`
      : '';
    const articleDate = item.createdAt
      ? new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo',
          month: 'numeric',
          day: 'numeric',
        }).format(new Date(item.createdAt))
      : '';
    const dateDisplay = articleDate && item.createdAt
      ? `${articleDate}・${relativeTime(item.createdAt)}`
      : articleDate;

    return `
      <a class="news-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        <div class="card-header">
          <div class="card-header-left">${rank}${category}</div>
          <span class="buzz-count">HOT ${formatNum(Number(item.points) || 0)} pt</span>
        </div>
        <h2 class="card-title">${escapeHtml(item.titleJa || item.title)}</h2>
        ${item.summaryJa ? `<p class="card-summary">${escapeHtml(item.summaryJa)}</p>` : ''}
        ${keyPointsHtml}
        <div class="card-footer">
          <span class="card-source">${LINK_ICON} 出典: ${escapeHtml(item.domain || 'Hacker News')}</span>
          ${dateDisplay ? `<span class="card-date">${escapeHtml(dateDisplay)}</span>` : ''}
          <span class="impact-badge ${impactClass}">業界インパクト：${escapeHtml(impact)}</span>
        </div>
      </a>`;
  }).join('');
}

function renderXTrends(xTrends) {
  const items = xTrends?.items;
  if (!Array.isArray(items) || items.length === 0) {
    xTrendCards.innerHTML = errorCard('現在、公開トレンド内にAI関連トピックは確認できませんでした。');
    return;
  }

  const status = items.length < 5
    ? `<p class="trend-status">現在確認できたAI関連トピックは${items.length}件です。</p>`
    : '';

  xTrendCards.innerHTML = status + items.map((item, index) => `
    <article class="x-trend-card">
      <div class="x-trend-header">
        <span class="x-trend-rank">${index + 1}</span>
        <span class="x-trend-body">
          <strong>${escapeHtml(item.topic)}</strong>
          <span>${escapeHtml(item.locationLabel)}のXトレンド・最高${item.bestRank}位</span>
        </span>
      </div>
      <h3 class="x-article-title">${escapeHtml(item.articleTitleJa)}</h3>
      <p class="x-article-summary">${escapeHtml(item.summaryJa)}</p>
      <div class="x-trend-footer">
        <span>${escapeHtml(item.articleSource)}・${escapeHtml(relativeTime(item.articlePublishedAt))}</span>
        <span class="x-trend-actions">
          <a href="${escapeHtml(item.articleUrl)}" target="_blank" rel="noopener noreferrer">記事を読む</a>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Xで見る</a>
        </span>
      </div>
    </article>
  `).join('');
}

async function fetchData() {
  const url = `data.json?_=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`data.json returned ${response.status}`);
  }

  const data = await response.json();
  if (!data.news || !Array.isArray(data.news.items) || !data.news.fetchedAt || !data.xTrends) {
    throw new Error('data.json has an invalid format');
  }
  return data;
}

function showDataTimestamp(fetchedAt) {
  const detailed = formatJstDateTime(fetchedAt, true);
  const compact = formatJstDateTime(fetchedAt);
  heroLastUpdated.textContent = detailed ? `データ最終更新: ${detailed} (JST)` : '';
  lastUpdated.textContent = compact ? `データ最終更新: ${compact} (JST)` : '更新日時を取得できませんでした';
}

async function load() {
  setLoading(true);
  showSkeletons();
  heroDate.textContent = `${formatJstDate()} - 最も話題になったAIトピックを厳選`;

  try {
    const data = await fetchData();
    renderNews(data.news.items);
    renderXTrends(data.xTrends);
    showDataTimestamp(data.news.fetchedAt);
  } catch (error) {
    console.error(error);
    newsCards.innerHTML = errorCard('データの取得に失敗しました。しばらくしてから更新してください。');
    xTrendCards.innerHTML = errorCard('Xトレンドデータを取得できませんでした。');
    heroLastUpdated.textContent = 'データ最終更新: 取得できませんでした';
    lastUpdated.textContent = 'データを取得できませんでした';
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  refreshBtn.disabled = isLoading;
  refreshBtn.classList.toggle('loading', isLoading);
}

refreshBtn.addEventListener('click', load);
document.addEventListener('DOMContentLoaded', load);
