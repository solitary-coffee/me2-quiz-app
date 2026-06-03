# 履歴ごとの間違いだけ再演習 追加版

## 追加内容

各履歴に「この回の間違いだけ解く」ボタンを追加しました。

対応範囲：

- 通常履歴
- ランダム演習履歴

各履歴で間違えた問題だけを抽出して、新しい演習として開始できます。  
再演習の結果は、通常どおり別履歴として保存されます。

## 更新ファイル

- `index.html`
- `VERSION.json`
- `CHANGELOG.md`

## 反映方法

```bash
git add index.html VERSION.json CHANGELOG.md
git commit -m "Add wrong-only retry from each history"
git push
```

## バージョン

- v1.9.5
