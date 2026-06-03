# 双方向同期のみ版

## 変更内容

データ同期の操作を「双方向同期」だけに整理しました。

## 削除・非表示にした操作

- ローカル→DBアップロード単独ボタン
- DB→ローカルダウンロード単独ボタン

## 残した操作

- 双方向同期
- DB保存状態を確認

## 双方向同期の内容

1. この端末の途中保存・履歴をDBへ保存
2. DB内の途中保存・履歴をこの端末へ反映
3. 履歴は重複を避けながら統合

## 更新ファイル

- `index.html`
- `CHANGELOG.md`
- `VERSION.json`

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json
git commit -m "Simplify data sync to bidirectional only"
git push
```

## バージョン

- v1.10.0
