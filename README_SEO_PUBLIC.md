# 公開向けSEO/OGP設定メモ

## 変更済み
- `index.html` に meta description / robots / OGP / Twitter Card / JSON-LD を追加
- 外部閲覧者向けの説明、注意書き、問い合わせ先を追加
- 問い合わせ先: `jr226toritetu@gmail.com`
- `robots.txt` を追加
- `sitemap.xml.sample` を追加

## 公開時にやること
1. `sitemap.xml.sample` の `YOUR_DOMAIN_HERE` を実際のドメインに変更し、ファイル名を `sitemap.xml` に変更
2. `robots.txt` の `Sitemap:` 行も実際のURLに変更してコメント解除
3. Google Search Console にサイトを登録
4. Search Console から `sitemap.xml` を送信

## 注意
OGPはSNSなどで共有されたときの表示改善用です。Google検索への掲載を保証するものではありません。
