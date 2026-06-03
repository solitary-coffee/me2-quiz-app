# 問題閲覧枠 スタイル修正版

## 修正内容

- 問題閲覧枠の表示崩れを修正
- 以前の `viewer-card` CSS と、ランダム出題風CSSの競合を解消
- 閲覧モードバッジの位置を自然に調整
- 試験回・午前午後・操作の横並びバランスを調整
- 問題確認・あとで見返すボタンの文字折れを軽減

## 更新ファイル

- `index.html`
- `CHANGELOG.md`
- `VERSION.json`

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json
git commit -m "Fix viewer panel style"
git push
```

## バージョン

- v1.10.5
