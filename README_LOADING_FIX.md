# 読み込み失敗：GitHub設定を確認 の修正

この版では、問題JSONの読み込み順を次のように変更しました。

1. `/api/github?path=...` でGitHub Proxy取得
2. 失敗した場合、同梱ファイル `Date/Ques/...` から自動読み込み
3. `APP_CONFIG.github` を設定している場合だけ GitHub Raw も試行

そのため、`wrangler.toml` の `GITHUB_OWNER` / `GITHUB_REPO` が未設定でも、GitHubに同梱された `Date` フォルダがCloudflare Pagesへデプロイされていれば問題を表示できます。

## すぐ確認するURL

- `https://あなたのサイト/Date/Ques/exams_index.json`
- `https://あなたのサイト/api/github?path=Date/Ques/exams_index.json`

どちらかがJSONを返せば、アプリは読み込めます。

## GitHubからリアルタイム取得したい場合

`wrangler.toml` の `[vars]` を設定してください。

```toml
[vars]
GITHUB_OWNER = "GitHubユーザー名"
GITHUB_REPO = "リポジトリ名"
GITHUB_BRANCH = "main"
GITHUB_ROOT = ""
```

private repo の場合はCloudflare Secretに `GITHUB_TOKEN` を設定してください。
