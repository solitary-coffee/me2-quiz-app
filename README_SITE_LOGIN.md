# サイト内ログイン版

## 変更内容

- `prompt()` や `alert()` を使うログインを廃止しました。
- サイト内のフォームから「新規登録」「ログイン」ができます。
- ユーザーは自分で好きなログインIDを登録できます。
- ログインIDは `a-z`, `0-9`, `_`, `-` の3〜32文字です。
- 進行状況はログインID単位でCloudflare KVに保存されます。

## 必要なCloudflare設定

`wrangler.toml` にKV Bindingを設定してください。

```toml
[[kv_namespaces]]
binding = "ME2_PROGRESS"
id = "YOUR_KV_NAMESPACE_ID"
```

任意で、パスワードハッシュ用のpepperを環境変数に入れられます。

```toml
[vars]
ME2_AUTH_PEPPER = "任意の長いランダム文字列"
```

Cloudflareの環境変数/Secretに設定してもOKです。
