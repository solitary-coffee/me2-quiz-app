# PRマージ後の最新データ取得

## 追加内容

PRをマージした後、サイト内の問題データを最新状態へ再取得するための機能を追加しました。

## 新しい操作

開発モード内のボタン：

```text
マージ後の最新データ取得
```

このボタンを押すと、以下を実行します。

- ブラウザ内の問題データキャッシュをクリア
- `Date/Ques` の問題JSONを再取得
- `Date/img` の画像表示にもキャッシュ回避用のパラメータを付与
- 現在表示中の問題をサイト内データから再読み込み
- 一括PRリスト内の編集データと最新JSONを比較
- 既にマージ済みと判断できる編集データを一括PRリストから削除

## 注意

PRをGitHubでマージしただけでは、Cloudflare Pages側のサイトファイルが即時に更新されない場合があります。  
Cloudflare Pagesの再デプロイが完了してから `マージ後の最新データ取得` を押してください。

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json README_MERGE_REFRESH.md
git commit -m "Refresh site data after PR merge"
git push
```

## バージョン

- v2.4.0
