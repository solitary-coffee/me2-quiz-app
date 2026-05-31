# 読み込み中のまま止まる問題の修正

## 原因
旧版では、起動時に `/api/me`、`/api/github`、`/api/progress` を順番に待っていました。
Cloudflare Functions が未反映、KV未設定、APIレスポンス待ちなどが起きると、メニュー表示前に止まって見えることがありました。

## 修正内容
- 問題データは標準で `Date/Ques/*.json` から直接読み込みます。
- `/api/github` は標準では使わず、必要な場合だけ `APP_CONFIG.sourceMode` を `auto` または `cloudflare_proxy` に変更します。
- `/api/me`、`/api/progress`、`/api/github` にタイムアウトを追加しました。
- 進行状況のクラウド確認はメニュー表示後に行うため、KV未設定でも画面が止まりません。
- 「問題データを再読み込み」ボタンを追加しました。

## GitHubに反映するファイル
最低限、以下を上書きしてください。

```text
index.html
```

できればZIP内の全ファイルを上書きしてください。

## 反映後の確認
1. GitHubにpush
2. Cloudflare Pagesで再デプロイ
3. ブラウザのキャッシュを削除またはシークレットウィンドウで確認
4. 読み込み状態が「読み込み成功（同梱ファイル）」になればOK

## Cloudflare Pages設定
```text
Build command: npm run build
Build output directory: .
Root directory: /
```

## KV保存について
KV未設定でも問題演習は動きます。その場合、進行保存は端末保存のみになります。
KVを使う場合は `wrangler.toml` に以下を追加してください。

```toml
[[kv_namespaces]]
binding = "ME2_PROGRESS"
id = "あなたのKV Namespace ID"
```
