# AI News Trends — CLAUDE.md

## プロジェクト概要

日本語向けのAI/MLニュースダッシュボード。Hacker News APIからAI関連記事をフェッチし、GitHubPagesで公開するWebアプリ。

## 技術スタック

- **バックエンド**: Node.js + Express.js
- **フロントエンド**: Vanilla JS（ESモジュール）、HTML5、CSS3
- **スクレイピング**: Cheerio
- **データソース**: Hacker News Algolia API、trends24.in
- **デプロイ**: GitHub Pages + GitHub Actions（毎時自動更新）

## ディレクトリ構成

```
AI-news/
├── server.js              # Expressサーバー（APIエンドポイント）
├── scripts/
│   └── fetch-data.js      # ニュースデータ取得スクリプト
├── public/
│   ├── index.html         # フロントエンドHTML
│   ├── app.js             # フロントエンドJS
│   ├── style.css          # スタイル（ダークテーマ）
│   └── data.json          # プリフェッチ済みデータ（GitHub Pages用）
└── .github/workflows/
    └── deploy.yml         # 自動デプロイ（毎時cron）
```

## 開発コマンド

```bash
npm install                     # 依存関係インストール
npm start                       # 本番サーバー起動（localhost:3000）
npm run dev                     # 開発モード（ファイル監視あり）
node scripts/fetch-data.js      # データ手動取得
```

## APIエンドポイント

| エンドポイント | 説明 |
|---|---|
| `GET /api/news` | AIニュース一覧（上位3件） |
| `GET /api/trends` | トレンドトピック（上位3件） |
| `?refresh=true` | キャッシュ無効化して強制再取得 |

キャッシュ時間: ニュース5分、トレンド10分

## ブランチ運用

- `main`: 本番ブランチ（GitHub Pages反映）
- `claude/`: Claude Codeによる開発ブランチ

## デプロイフロー

1. GitHub Actionsが毎時トリガー（またはmainへのpush）
2. `node scripts/fetch-data.js` でデータ取得
3. `public/data.json` を更新してGitHub Pagesにデプロイ

## 注意事項

- フロントエンドは静的ファイルのみ（GitHub Pages）。サーバーサイドAPIはローカル開発用
- 外部API障害時はモックデータにフォールバック
- UIは日本語ファースト。ダークテーマ固定
