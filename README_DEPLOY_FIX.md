# デプロイエラー修正版

## エラー原因

`wrangler deploy` は Cloudflare Workers 用のコマンドです。
静的ファイルを一緒にアップロードする場合は `[assets] directory = "..."` が必要です。
今回のアプリは Cloudflare Pages + Pages Functions 向けなので、Pages では `wrangler deploy` ではなく `wrangler pages deploy`、またはCloudflare PagesのGitHub連携を使います。

## 推奨：Cloudflare Pagesでデプロイ

Cloudflare Pages の設定：

```text
Build command: npm run build  または空欄
Build output directory: .
Root directory: /
```

`npm run deploy` や `npx wrangler deploy` を Build command に入れないでください。

必要な設定：

```text
Environment variables:
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH = main
GITHUB_ROOT = 空欄またはサブフォルダ
GITHUB_TOKEN = private repoの場合のみSecretで設定

Bindings:
KV namespace binding name = ME2_PROGRESS
```

## CLIでPagesへ手動デプロイする場合

```bash
npm install
npm run deploy
```

これは内部で以下を実行します。

```bash
wrangler pages deploy . --project-name me2-json-quiz
```

## Workersで `wrangler deploy` したい場合

Workers Static Assets用の設定ファイルも同梱しています。

```bash
npm run deploy:worker
```

これは以下を実行します。

```bash
wrangler deploy --config wrangler.worker.toml
```

ただし、Pages Functionsではなく `src/worker.js` がAPIを担当します。
KV保存を使う場合は `wrangler.worker.toml` の `[[kv_namespaces]]` を設定してください。
