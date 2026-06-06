# OGP / Twitter Card 対応

## 追加内容

Twitter / X、Discord、LINEなどにサイトURLを貼った際に、サイト説明文が表示されやすいようにメタタグを追加しました。

## 追加した主なタグ

```html
<meta name="description" ...>
<meta property="og:title" ...>
<meta property="og:description" ...>
<meta property="og:image" content="/assets/ogp.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" ...>
<meta name="twitter:description" ...>
<meta name="twitter:image" content="/assets/ogp.png">
```

## 追加ファイル

```text
assets/ogp.png
```

## 注意

SNS側のリンクプレビューはキャッシュされることがあります。  
反映後すぐに表示が変わらない場合は、時間を置くか、各SNSのカード確認ツールで再取得してください。

`og:image` と `twitter:image` は `/assets/ogp.png` の絶対パス表記にしています。  
Cloudflare Pagesでサイト直下にデプロイしている場合、そのまま利用できます。

## 反映方法

```bash
git add index.html assets/ogp.png CHANGELOG.md VERSION.json README_OGP_TWITTER_CARD.md
git commit -m "Add OGP and Twitter card metadata"
git push
```

## バージョン

- v2.4.4
