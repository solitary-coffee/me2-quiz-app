# me.dpi-bot.com IP遮断設定

このプロジェクトはCloudflare PagesのルートMiddlewareで、`dpi-bot.com/site/ip-admin/`から登録されたIP遮断ルールを参照します。

## 前提

`dpi_main_web`側で次のマイグレーションが本番D1へ適用済みである必要があります。

```bash
npx wrangler d1 migrations apply dpi-newsletter --remote
```

## Pagesへ共有D1を追加

Cloudflare Dashboardで、`me.dpi-bot.com`が接続されているPagesプロジェクトを開きます。

1. `Settings` → `Bindings`を開く。
2. D1 database bindingを追加する。
3. Variable nameを`IP_BLOCK_DB`にする。
4. D1 databaseは`dpi-newsletter`を選択する。
5. Productionへ設定し、プレビュー環境も遮断する場合はPreviewにも同じBindingを設定する。
6. Pagesを再デプロイする。

リポジトリや通常の環境変数へD1のIDを直書きする必要はありません。

## 動作

- HTML・画像・問題JSON・APIを含むすべてのPagesリクエストを判定します。
- ブラウザにはHTTP 403のDPI-Bot専用画面を返します。
- `/api/*`にはHTTP 403のJSONを返します。
- D1ルールは各Pages Functionインスタンスで30秒キャッシュします。
- D1が一時的に読めない場合はサイトを停止せず、`BLOCKED_IPS` Secretのルールだけで継続します。
- 追加・削除・監査履歴は`dpi-bot.com/site/ip-admin/`へ一本化します。

## 任意の緊急ルール

このPagesプロジェクトだけで緊急遮断する場合は、PagesのSecret `BLOCKED_IPS`を設定できます。

```text
203.0.113.10|緊急遮断しています。
198.51.100.0/24|継続的な自動アクセスを制限しています。
```

通常運用では管理画面と共有D1を使用してください。Secretの内容は管理画面には表示されません。
