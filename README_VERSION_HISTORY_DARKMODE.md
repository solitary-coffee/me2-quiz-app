# バージョン履歴表示・ダークモード表記統一版

## 修正内容

- トップ画面に現在のバージョンと変更点を表示
- 「過去のバージョンはこちら」から過去バージョンと変更点を表示
- バージョン履歴は `APP_VERSION_HISTORY` で編集可能
- `VERSION.json` に現在バージョンと履歴を記載
- `CHANGELOG.md` を整理
- ダークモード表記へ統一
- 切替ボタンは `🌙 ダーク` / `☀️ ライト` 表記に変更

## バージョン

- v1.8.2
- 更新日：2026-06-02

## 更新ファイル

- `index.html`
- `VERSION.json`
- `CHANGELOG.md`

## 反映方法

```bash
git add index.html VERSION.json CHANGELOG.md
git commit -m "Add version history and rename night mode to dark mode"
git push
```
