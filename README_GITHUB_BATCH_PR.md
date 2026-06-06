# GitHub 一括PR機能

## 追加内容

開発モードで編集した複数問題を、一括で同じ1つのPull Requestへ送信できるようにしました。

## 主な仕様

- 回数が違う問題も同じPRにまとめられます。
- 午前・午後が違う問題も同じPRにまとめられます。
- 既に問題編集PRが開いている場合、新しいPRを作らず同じPRブランチへ追加コミットします。
- JSONは既存PRブランチ上の最新JSONを取得して、対象問題だけを差し替えます。
- 画像は `Date/img/` に追加・差し替えします。
- コミットメッセージは原則 `第〇回 午前・午後 第〇問：編集箇所` 形式になります。

## 競合対策

`Date/Ques` のJSONはファイル全体をそのまま上書きせず、GitHub上のPRブランチにある最新JSONを取得してから、対象の問題だけを差し替えます。  
これにより、同じPR内で複数問題を追加しても、前回の修正を上書きしにくくしています。

## Cloudflare 環境変数

```text
GITHUB_OWNER=solitary-coffee
GITHUB_REPO=me2-quiz-app
GITHUB_BRANCH=main
GITHUB_ROOT=
GITHUB_PR_BRANCH_PREFIX=me2/dev-batch
```

Secret:

```text
GITHUB_TOKEN
```

## 必要なGitHub Token権限

Fine-grained personal access token:

```text
Repository access:
Only selected repositories
→ solitary-coffee/me2-quiz-app

Repository permissions:
Contents: Read and write
Pull requests: Read and write
```

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json functions/api/github-pr.js README_GITHUB_BATCH_PR.md
git commit -m "Add batch GitHub PR workflow"
git push
```

## バージョン

- v2.3.0
