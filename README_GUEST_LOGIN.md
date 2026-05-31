# ゲストログイン対応版

この版では、Cloudflare AccessのメールOTPが使えない場合でも、サイト上でゲストログインしてCloudflare KVに進行状況を保存できます。

## 使い方

1. サイトを開く
2. メニューの「サイトログイン」を押す
3. 「ゲストで開始」を押す
4. 表示される「ゲストID」と「復元コード」をメモする
5. 別端末では「既存ゲストでログイン」にゲストIDと復元コードを入力する

## 保存方式

- ゲストログインあり: 端末保存 + Cloudflare KV保存
- Cloudflare Accessログインあり: Accessメール単位でも保存可能
- どちらもなし: 端末保存のみ

## Cloudflare Accessについて

このログインは「進行状況保存用」です。サイト自体を公開してよい場合は、Cloudflare Accessをオフにして使えます。

Cloudflare Accessでサイト全体を保護したままだと、ユーザーはサイト上のゲストログイン画面へ到達する前にCloudflareのメールログインを求められます。ゲスト利用を優先するなら、Accessアプリを削除するか、公開用ドメインではAccessをかけない設定にしてください。

## KV Binding

`wrangler.toml` に以下を追加してください。

```toml
[[kv_namespaces]]
binding = "ME2_PROGRESS"
id = "YOUR_KV_NAMESPACE_ID"
```

## 重要

復元コードは再表示できますが、別端末で同じ進行状況を読み込むために必要です。忘れると同じゲストデータを復元できません。
