# DBアップロード / 共有機能 追加版

## 変更内容

- ローカルJSON保存・JSON読み込みボタンを、DBアップロード / 共有機能へ置き換え
- 端末内に残っている途中保存・履歴をCloudflare KVへアップロード可能
- 共有コード / 共有URLを作成可能
- 共有コードから進行データを取り込み、現在のログインIDのDBへアップロード可能
- 共有API `functions/api/share.js` を追加

## 追加・更新ファイル

- `index.html`
- `functions/api/share.js`

## 反映方法

```bash
git add index.html functions/api/share.js
git commit -m "Add DB upload and progress sharing"
git push
```

## Cloudflare側で必要なもの

`wrangler.toml` に `ME2_PROGRESS` のKV Bindingが必要です。

```toml
[[kv_namespaces]]
binding = "ME2_PROGRESS"
id = "あなたのKV Namespace ID"
```

## 使い方

1. サイト内でログイン / 登録する
2. 「DBアップロード / 共有」を開く
3. 「端末データをDBへアップロード」を押す
4. 共有したい場合は「共有リンクを作成」を押す
5. 共有相手はURLまたは共有コードを入力して取り込む
