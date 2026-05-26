const newsCards   = document.getElementById('news-cards');
const refreshBtn  = document.getElementById('refresh-btn');
const lastUpdated     = document.getElementById('last-updated');
const heroDate        = document.getElementById('hero-date');
const heroLastUpdated = document.getElementById('hero-last-updated');

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

function showSkeletons() {
  newsCards.innerHTML = [1, 2, 3, 4, 5].map(skeletonNews).join('');
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

const RANK_LABELS  = ['NO.1 バズ', 'NO.2', 'NO.3', 'NO.4', 'NO.5'];
const RANK_CLASSES = ['rank-1', 'rank-2', 'rank-3', 'rank-4', 'rank-5'];

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

    const dateObj   = item.createdAt ? new Date(item.createdAt) : null;
    const dateLabel = dateObj
      ? `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`
      : '';
    const timeLabel = item.createdAt ? relativeTime(item.createdAt) : '';
    const dateDisplay = dateLabel && timeLabel
      ? `${dateLabel} · ${timeLabel}`
      : (dateLabel || timeLabel);

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
        ${dateDisplay ? `<span class="card-date">🗓 ${escapeHtml(dateDisplay)}</span>` : ''}
        <span class="impact-badge ${impactClass}">業界インパクト：${escapeHtml(impact)}</span>
      </div>
    </a>`;
  }).join('');
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
  } catch (err) {
    newsCards.innerHTML = errorCard('データの取得に失敗しました。しばらくしてから更新してください。');
  }

  // ヘッダーに日付を表示
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  heroDate.textContent = `${dateStr} — 最も話題になったAIトピックを厳選`;

  const pad = n => String(n).padStart(2, '0');
  const jstStr = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} (JST)`;
  heroLastUpdated.textContent = `最終更新: ${jstStr}`;

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
