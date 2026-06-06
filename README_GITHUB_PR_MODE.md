# 開発モード GitHub PR作成機能

## 追加内容

開発モードから、編集中の問題JSONと追加・差し替え画像をGitHubへ送信し、Pull Requestを作成できます。

## 追加ファイル

- `functions/api/github-pr.js`

## 更新ファイル

- `index.html`
- `CHANGELOG.md`
- `VERSION.json`
- `wrangler.toml`

## Cloudflare Pages 必要設定

Cloudflare Pages の対象プロジェクトで、以下を設定してください。

### Secret

- `GITHUB_TOKEN`

これはGitHubのfine-grained personal access tokenです。絶対にブラウザ側やGitHub公開ファイルへ直書きしないでください。

### Environment variable

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `GITHUB_ROOT` 任意
- `GITHUB_COMMITTER_NAME` 任意
- `GITHUB_COMMITTER_EMAIL` 任意

既存の開発者ログインを使うため、以下も必要です。

- `ME2_DEV_ID`
- `ME2_DEV_PASSWORD` または `ME2_DEV_PASSWORD_HASH`
- `ME2_PROGRESS` KV binding

## GitHubトークン権限

fine-grained personal access tokenを作成し、対象リポジトリだけに権限を絞ってください。

Repository permissions:

- Contents: Read and write
- Pull requests: Read and write

## 使い方

1. 開発者ログイン
2. 開発モードで問題を編集
3. 必要なら画像を追加
4. PRタイトル・説明を確認
5. `GitHub PR作成` を押す

## 注意

- PR送信できるパスは `Date/Ques/` と `Date/img/` のみです。
- 画像は「画像を追加」でdata URL化された場合にPRへ含めます。
- 通常の問題閲覧・演習は引き続きサイト内の `Date` フォルダから読み込みます。
- GitHubトークンはCloudflare Functions側だけで使用されます。

## 反映コマンド

```bash
git add index.html CHANGELOG.md VERSION.json wrangler.toml functions/api/github-pr.js
git commit -m "Add developer GitHub PR creation"
git push
```

## バージョン

- v2.2.0
