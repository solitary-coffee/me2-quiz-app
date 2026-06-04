# 開発モード レイアウト・画像操作・プレビュー改善版

## 変更内容

- 編集対象枠の下に、問題文・範囲・正答・画像設定を移動
- 要点解説・選択肢・各解説は右側へ配置
- 編集対象枠に「画像を追加」「画像DL」を追加
- 画像DLで現在の問題画像を保存可能
- 画像を追加で編集済み画像を読み込み、画像パス欄へ反映
- プレビューを編集欄の下へ移動
- 出題プレビューと解説プレビューを両方表示
- 文面チェックの問題全体ステータスを、指摘内の最高ステータスに統一
- 各問題に「重要4 注意1 確認0 軽微2」のような内訳を表示

## 更新ファイル

- `index.html`
- `CHANGELOG.md`
- `VERSION.json`

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json
git commit -m "Improve developer layout image tools and previews"
git push
```

## バージョン

- v1.10.8
