# `Missing entry-point to Worker script or to assets directory` の修正

## 原因

Cloudflare Pages プロジェクトで、Cloudflare の Build command またはデプロイコマンドに `wrangler deploy` が入っているためです。

- `wrangler deploy` は Cloudflare Workers 用です。
- Cloudflare Pages では `wrangler pages deploy` を使います。
- GitHub連携のCloudflare Pagesでは、通常はデプロイコマンド自体をBuild commandに入れません。

## 最優先で直す場所

Cloudflare Dashboard → Workers & Pages → 対象Pagesプロジェクト → Settings → Builds & deployments で、Build command を以下のどちらかにしてください。

```text
npm run build
```

または空欄。

次のような値は入れないでください。

```text
npx wrangler deploy
npm run deploy:worker
wrangler deploy
```

## Build output directory

```text
.
```

## 手動でPagesへアップロードする場合

```bash
npm install
npm run deploy:pages
```

内部では以下を実行します。

```bash
wrangler pages deploy . --project-name me2-json-quiz
```

## どうしても `wrangler deploy` が実行される環境の場合

今回の修正版では、ルートの `wrangler.toml` に以下を入れてあります。

```toml
main = "./src/worker.js"

[assets]
directory = "."
binding = "ASSETS"
```

そのため、誤って `wrangler deploy` が実行されても `Missing entry-point` では止まりにくくなっています。
ただし、Pagesとして公開したい場合は `wrangler pages deploy` を使ってください。

## 推奨構成

Cloudflare Pages GitHub連携：

```text
Build command: npm run build または空欄
Build output directory: .
Root directory: /
```

Cloudflare Accessでログイン制御し、KV Binding名は `ME2_PROGRESS` にしてください。
