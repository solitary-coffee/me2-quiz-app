# トップ画面 クラシック整理版

## 変更内容

前回のトップ画面がスマート寄りになりすぎていたため、整理前のカード型スタイルに寄せて再調整しました。

## 修正内容

- トップ画面を整理前に近い構成へ戻しつつ整理
- 問題データを再読み込みボタンを削除
- ランダム履歴ボタンをトップから削除
- ランダム履歴はランダム出題カード内から見られるように変更
- サイト情報・更新履歴・連絡先は折りたたみ表示に整理

## 更新ファイル

- `index.html`
- `CHANGELOG.md`
- `VERSION.json`

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json
git commit -m "Adjust top screen to classic layout"
git push
```

## バージョン

- v1.10.2
