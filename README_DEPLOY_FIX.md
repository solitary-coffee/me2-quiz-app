# デプロイエラー修正版

## 今回のエラー

```text
[WARNING] It seems that you have run `wrangler deploy` on a Pages project
[ERROR] Missing entry-point to Worker script or to assets directory
```

## 原因

Cloudflare Pages用のプロジェクトで、Workers用の `wrangler deploy` が実行されています。
Pagesでは `wrangler pages deploy` を使います。
GitHub連携のCloudflare Pagesでは、Build commandには `wrangler deploy` を入れません。

## Cloudflare Pages の正しい設定

```text
Build command: npm run build  または 空欄
Build output directory: .
Root directory: /
```

入れてはいけない例：

```text
npx wrangler deploy
wrangler deploy
npm run deploy:worker
```

## CLIでPagesへ手動デプロイ

```bash
npm install
npm run deploy:pages
```

## Workersでデプロイしたい場合

```bash
npm run deploy:worker
```

今回の修正版では、誤って `wrangler deploy` が実行されても止まりにくいよう、ルートの `wrangler.toml` に `main` と `[assets]` を追加済みです。
ただし、基本はPagesデプロイを推奨します。
