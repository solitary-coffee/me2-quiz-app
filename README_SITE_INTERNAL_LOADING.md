# サイト内データ読み込み版

## 変更内容

問題データ・画像データのGitHub読み込みを廃止しました。

## 新しい読み込み方式

- 問題JSON：`Date/Ques`
- 画像：`Date/img`
- すべてサイト内のファイルとして読み込みます。

## 廃止した読み込み

- GitHub Raw
- Cloudflare GitHub Proxy
- `/api/github` 経由の読み込み

## 必須配置

```text
index.html
Date/
  Ques/
    exams_index.json
    40_am.json
    ...
  img/
    ...
```

## Cloudflare Pagesでの注意

`Date` フォルダを必ずデプロイ対象に含めてください。  
GitHubから読み込まないため、サイトに含まれていないJSONや画像は表示されません。

## 更新ファイル

- `index.html`
- `CHANGELOG.md`
- `VERSION.json`
- `functions/api/github.js`

## 反映方法

```bash
git add index.html CHANGELOG.md VERSION.json functions/api/github.js Date
git commit -m "Load question data from site files only"
git push
```

## バージョン

- v1.10.9
