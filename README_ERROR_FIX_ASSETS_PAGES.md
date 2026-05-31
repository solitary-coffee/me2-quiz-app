# Cloudflare Pages の wrangler.toml 修正

今回のエラー原因：

```text
Expected "assets.run_worker_first" to be of type boolean but got ["/api/*"].
The name 'ASSETS' is reserved in Pages projects.
```

`wrangler.toml` に Workers Static Assets 用の `[assets]` が入っていました。
Cloudflare Pages では `[assets]` は不要です。`functions/api/*.js` は Pages Functions として自動的に `/api/*` で動きます。

## 修正内容

- `wrangler.toml` を Cloudflare Pages 専用に変更
- `[assets]` を削除
- `main = "./src/worker.js"` を削除
- Workers用設定は `wrangler.worker.toml` に分離
- Workers用 assets binding は予約名を避けて `WORKER_ASSETS` に変更
- `run_worker_first` は配列ではなく `true` に変更

## Cloudflare Pages の設定

```text
Build command: npm run build
Build output directory: .
Root directory: /
```

Deploy command が必須の場合：

```bash
npm run deploy:pages
```

または：

```bash
npx wrangler pages deploy . --project-name me2-json-quiz --branch=main
```

`me2-json-quiz` は自分のPagesプロジェクト名に変更してください。

## 入れないコマンド

```bash
npx wrangler deploy
wrangler deploy
npm run deploy:worker
```

これはWorkers用です。
