# 開発モード レイアウト整理

## 変更内容

開発モードの配置を整理しました。

## 新しい配置

### 上部

```text
解説生成定義を確認・編集
↓
編集対象
```

`編集対象` は単独パネルとして、試験回・午前/午後・問題番号をプルダウンで選択する形式にしました。

### 左側パネル

```text
問題・解答・画像の設定
  └ この問題に反映
  └ AIで解説再生成
  └ JSON保存
  └ JSONコピー

各問題のコミットメッセージ / 編集箇所

GitHub 一括PR作成
```

`マージ後の最新データ取得` ボタンは、GitHub一括PR作成の折りたたみ内に移動しました。

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json README.md README_DEV_LAYOUT_REORDER.md
git commit -m "Reorder developer mode layout"
git push
```

## バージョン

- v2.4.1
