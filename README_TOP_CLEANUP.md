# トップ画面整理版

## 変更内容

トップ画面がごちゃごちゃしていたため、表示を整理しました。

## 整理した内容

- 大きな説明欄をヒーロー表示へ変更
- ログイン / DB同期 / あとで見返す / ランダム履歴をクイック操作に整理
- 読み込み状態・進行保存状態を小さく表示
- サイト情報・連絡先・注意事項・更新履歴を折りたたみ表示へ移動
- ランダム出題を折りたたみ表示へ変更
- 試験回選択を下部に見やすく配置

## 更新ファイル

- `index.html`
- `CHANGELOG.md`
- `VERSION.json`

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json
git commit -m "Clean up top screen layout"
git push
```

## バージョン

- v1.10.1
