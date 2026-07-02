# 旧JIS・旧規格 注意表示

## 追加内容

問題JSONに `standardWarning` を設定すると、出題画面と解説画面に注意表示を出せるようにしました。

```json
"standardWarning": {
  "legacyJis": true,
  "message": "この問題は旧JIS規格・旧表記に基づいています。現行のJIS規格や法令・ガイドラインとは内容や表記が異なる場合があります。",
  "sourceStandard": "JIS T 0601-1 旧版",
  "reviewRequired": true
}
```

## 管理者画面

開発モードの **問題・解答・画像の設定** 内に、次の管理項目を追加しています。

- `ユーザー画面に旧JIS・旧規格の注意を表示`
- `現行規格との照合が必要`
- `関連する旧JIS規格・旧表記（任意）`

`この問題に反映` を押すと現在の問題JSONへ反映され、JSON保存・JSONコピー・GitHub PR作成にも含まれます。

## 注意

試験回が古いことだけを理由にフラグを付けないでください。旧JIS規格・旧安全規格・旧単位・旧表記が、正答または解説の判断に実際に関係する場合だけ設定します。

## 反映方法

```bash
git add index.html Date/Ques/part_json_template.json CHANGELOG.md VERSION.json README_LEGACY_JIS_WARNING.md
git commit -m "Add legacy JIS warning support"
git push
```

## バージョン

- v2.5.3
