# コミットメッセージ入力欄の常時表示

## 変更内容

各問題のコミットメッセージを入力する欄を、PR操作部の折りたたみ外へ移動しました。

## 新しい仕様

- `各問題のコミットメッセージ / 編集箇所` は常に表示
- PR操作部を閉じていても入力可能
- `この問題に反映` を押した時点の入力内容が、その問題のコミットメッセージに使われる
- `送信予定コミット` の一覧はPR操作部内に表示
- PR操作部を展開した時の一括PRリストの順番は、現在の追加順を維持

## 操作例

```text
編集箇所に「問題文・解説を修正」と入力
→ この問題に反映
→ その問題のコミットメッセージに反映
```

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json README_COMMIT_INPUT_VISIBLE.md
git commit -m "Keep commit message input visible"
git push
```

## バージョン

- v2.3.5
