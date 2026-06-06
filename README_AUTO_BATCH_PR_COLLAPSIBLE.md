# 一括PR 自動追加・折りたたみ対応

## 変更内容

- `この問題に反映` を押した時点で、一括PRリストへ自動追加・更新するように変更
- 同じ問題を再編集して再度 `この問題に反映` を押した場合、一括PRリスト内の内容を上書き更新
- PR操作部を折りたたみ式に変更
- 不用意なPR作成操作を防ぐため、PR作成ボタンは折りたたみ内に配置

## 操作の流れ

```text
1問目を編集
→ この問題に反映
→ 自動で一括PRリストへ追加

2問目を編集
→ この問題に反映
→ 自動で一括PRリストへ追加

PR操作部を開く
→ 一括PRを作成 / 既存PRへ更新
```

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json README_AUTO_BATCH_PR_COLLAPSIBLE.md
git commit -m "Auto add reflected question to batch PR"
git push
```

## バージョン

- v2.3.1
