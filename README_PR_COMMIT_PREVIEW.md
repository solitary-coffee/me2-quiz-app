# 折りたたみ時のコミットメッセージ表示

## 変更内容

PR操作部を折りたたんだ状態でも、送信予定のコミットメッセージだけは見えるようにしました。

## 仕様

- 折りたたみ状態でも `送信予定コミット` を表示
- 表示内容は一括PRリストに入っている問題のコミットメッセージ
- 展開したときの一括PRリストの順番は、現在の追加順を維持
- 一括PRリストが空の場合は `まだありません` と表示

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json README_PR_COMMIT_PREVIEW.md
git commit -m "Show PR commit messages when collapsed"
git push
```

## バージョン

- v2.3.4
