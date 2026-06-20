# Deploy Cloudflare Worker for AI-News

This document explains how to enable the **最新取得** button.

The Worker code is already in GitHub:

```text
cloudflare-worker/worker.js
```

The deploy workflow is already in GitHub:

```text
.github/workflows/deploy-worker.yml
```

## Required one-time setup

Add these two GitHub repository secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

## 1. Get Cloudflare Account ID

Cloudflare Dashboard:

```text
Workers & Pages
→ ai-news
→ Settings / Details area
→ Account ID
```

Copy the Account ID.

## 2. Create Cloudflare API Token

Cloudflare Dashboard:

```text
My Profile or Manage Account
→ API Tokens
→ Create Token
```

Use a token with permission to edit/deploy Workers.

Recommended scope:

```text
Account: Cloudflare Workers: Edit
Account Resources: Include / your account only
```

Copy the token immediately. Cloudflare only shows the token secret once.

## 3. Add GitHub Secrets

GitHub repository:

```text
horiken7/AI-News
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

Add:

```text
Name: CLOUDFLARE_ACCOUNT_ID
Value: your Cloudflare account ID
```

Add:

```text
Name: CLOUDFLARE_API_TOKEN
Value: your Cloudflare API token
```

## 4. Run deploy workflow

GitHub repository:

```text
Actions
→ Deploy Cloudflare Worker
→ Run workflow
```

If it succeeds, the Worker should be available at:

```text
https://ai-news.ken060720.workers.dev/?fresh=1
```

## 5. Verify the AI-News site

Open:

```text
https://horiken7.github.io/AI-News/
```

Click:

```text
最新取得
```

Success state:

```text
状態：取得完了 / Worker最新取得
```

## Notes

- Do not edit Worker code in Cloudflare Dashboard as the main workflow.
- GitHub is the source of truth.
- Cloudflare is the runtime.
- If Worker deploy fails, check the GitHub Actions log first.
