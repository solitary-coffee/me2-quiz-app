# 開発者ログイン 405エラー修正版

## 原因

`開発者ログインに失敗しました：405` は、主に以下で起こります。

- `functions/api/dev-auth.js` がGitHubへ反映されていない
- Cloudflare Pages Functionsが `/api/dev-auth` のPOSTを受け取れていない
- 前回のパッチ適用時に `dev-auth.js` が更新対象に入っていなかった

## 修正内容

- `functions/api/dev-auth.js` を今回の更新パッチに同梱
- `onRequestPost` だけでなく `onRequest` でもPOST/GETを処理
- `/api/ai-explain` も `onRequest` に対応
- バージョンを `v1.9.4` に更新

## 更新ファイル

- `index.html`
- `functions/api/dev-auth.js`
- `functions/api/ai-explain.js`
- `VERSION.json`
- `CHANGELOG.md`

## 反映方法

```bash
git add index.html functions/api/dev-auth.js functions/api/ai-explain.js VERSION.json CHANGELOG.md
git commit -m "Fix developer login 405 error"
git push
```

## Cloudflare側で必要な設定

Settings → Environment variables

```text
ME2_DEV_ID=任意の開発者ID
ME2_DEV_PASSWORD=8文字以上の開発者パスワード
```

Settings → Functions → KV namespace bindings

```text
ME2_PROGRESS
```

Cloudflare Pagesのデプロイ後、ブラウザのキャッシュを更新してから再確認してください。
