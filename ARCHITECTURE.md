# AI-News architecture

## Goal

The site must let the **最新取得** button fetch fresh AI news immediately, instead of only reloading a previously generated JSON file.

## Components

```text
GitHub Pages
  https://horiken7.github.io/AI-News/
  └─ index.html
     ├─ 最新取得: calls Cloudflare Worker live RSS API
     └─ 表示更新: reloads local news.json

Cloudflare Worker
  https://ai-news.ken060720.workers.dev/
  └─ cloudflare-worker/worker.js
     ├─ Fetches RSS feeds live
     ├─ Filters Japanese AI-related items
     ├─ Returns JSON
     └─ Uses a short cache to avoid hammering RSS sources

GitHub Actions
  .github/workflows/update-news.yml
  └─ Generates news.json every hour as a fallback/static cache

GitHub Actions
  .github/workflows/deploy-worker.yml
  └─ Deploys cloudflare-worker/worker.js to Cloudflare Worker using Wrangler
```

## Source of truth

GitHub is the source of truth.

- Frontend: `index.html`
- Live API Worker: `cloudflare-worker/worker.js`
- Worker config: `cloudflare-worker/wrangler.toml`
- Static fallback generator: `scripts/update_news.py`
- Worker deploy workflow: `.github/workflows/deploy-worker.yml`

Cloudflare Dashboard should be treated as the runtime/hosting environment, not as the main code editor.

## Button behavior

### 最新取得

```text
User clicks 最新取得
↓
index.html fetches https://ai-news.ken060720.workers.dev/?fresh=1
↓
Cloudflare Worker fetches RSS feeds live
↓
Worker returns JSON
↓
Page renders the fresh result
```

### 表示更新

```text
User clicks 表示更新
↓
index.html fetches news.json from GitHub Pages
↓
Page renders the already generated fallback JSON
```

## Required GitHub Secrets

For `.github/workflows/deploy-worker.yml`, add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Never commit Cloudflare API tokens into the repository.

## Verification

After deploying the Worker, open:

```text
https://ai-news.ken060720.workers.dev/?fresh=1
```

Success looks like JSON containing:

```json
"mode": "cloudflare-worker-live-rss"
```

Then open:

```text
https://horiken7.github.io/AI-News/
```

Click **最新取得**. The status should show Worker-based live fetch.
