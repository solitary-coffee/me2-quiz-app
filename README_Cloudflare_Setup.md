# ME2種 JSON演習アプリ Cloudflare/GitHub版

## 構造

```text
index.html
Date/
  img/
    46/
      am_p5.jpg
      ...
  Ques/
    exams_index.json
    46_am.json
    46_pm.json
    part_json_template.json
User_deta/
  README.txt
  progress_sample.json
functions/
  api/
    me.js
    github.js
    progress.js
wrangler.toml
_headers
```

## できること

- Cloudflare Accessでログイン保護
- `Date/Ques/*.json` と `Date/img/*` をGitHubから取得
- private GitHub repoの場合は `/api/github` がCloudflare側で代理取得
- 端末内保存 + Cloudflare KVへの進行状況保存
- 午前/午後・回数ごとの進行保存
- 間違った問題一覧、間違いだけ復習、CSV/JSON保存

## GitHub側

1. このフォルダの中身をGitHubリポジトリへpushします。
2. `Date/Ques/exams_index.json` に試験回を追加します。
3. 各回の問題JSONは `Date/Ques/47_am.json` / `Date/Ques/47_pm.json` のように追加します。
4. 図表画像は `Date/img/47/` に置き、JSONの `image` に `Date/img/47/am_p3.jpg` のように書きます。

## Cloudflare Pages側

### 1. PagesをGitHubと接続

Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git → GitHub repoを選択。

推奨設定:

```text
Project name: me2-json-quiz
Production branch: main
Build command: 空欄
Build output directory: /
Root directory: /  （サブフォルダに置く場合はそのフォルダ）
```

### 2. 環境変数を設定

Pages project → Settings → Environment variables に追加:

```text
GITHUB_OWNER = あなたのGitHubユーザー名またはOrganization名
GITHUB_REPO = リポジトリ名
GITHUB_BRANCH = main
GITHUB_ROOT = 空欄 または アプリを置いたサブフォルダ名
```

private repoにする場合は、GitHub fine-grained personal access tokenを作り、Cloudflare側のSecretとして `GITHUB_TOKEN` を登録します。public repoの場合は不要です。

### 3. KVを作成してバインド

KV namespaceを作成し、Pages project → Settings → Bindings → KV namespace bindings で以下を追加:

```text
Variable name: ME2_PROGRESS
KV namespace: 作成したnamespace
```

`wrangler.toml` を使う場合は `id` / `preview_id` を実際のIDに置き換えます。

### 4. Cloudflare Accessでログイン保護

Zero Trust → Access → Applications → Add an application → Self-hosted を選択。

```text
Application name: ME2 Quiz
Application domain: me2.example.com など
Path: /*
Session duration: 任意（例: 24 hours）
Policy action: Allow
Include: Emails / Email domain / One-time PIN など
```

一人で使う場合は Include を自分のメールだけにするのが簡単です。

## index.htmlの取得方式

`index.html` 内の `APP_CONFIG.sourceMode` で切り替えできます。

```js
sourceMode: 'cloudflare_proxy'
```

- `cloudflare_proxy`: `/api/github` 経由。private repo向け。おすすめ。
- `github_raw`: `raw.githubusercontent.com` から直接取得。public repo向け。
- `local`: 同じCloudflare Pages上の `Date/` から取得。ローカル確認向け。

## 注意

- ブラウザはセキュリティ上、`User_deta` フォルダへ自動で直接書き込めません。
- クラウド保存はCloudflare KVを使います。
- 端末をまたぐ場合も、Cloudflare Accessの同じメールでログインすればKV側に保存した進行状況を扱えます。


---

## 2026-05-31 修正：`wrangler deploy` の assets エラーについて

Cloudflare Pagesで使う場合、Build commandに `npx wrangler deploy` や `npm run deploy` を入れないでください。
PagesのGitHub連携では、以下を推奨します。

```text
Build command: npm run build または空欄
Build output directory: .
```

CLIで手動デプロイする場合は、Workers用の `wrangler deploy` ではなくPages用のコマンドを使います。

```bash
npm run deploy
```

Workers Static Assetsとしてデプロイしたい場合のみ、同梱の `wrangler.worker.toml` を使います。

```bash
npm run deploy:worker
```
