# ME2 学習サイト・メンテナンスモード

**対象リポジトリ:** `me2-quiz-app`、確認対象ドメイン `me2.dpi-bot.com`、サイトキー `me2`。

Cloudflare Pages本番のEnvironment bindingsで、全サイト共通のWorkers KV Namespaceを `DPI_MAINTENANCE_KV` として設定します。既存 `ME2_PROGRESS` や `IP_BLOCK_DB`、GITHUB_TOKEN等は保持します。実際のCloudflare Pages Projectとドメインをマージ前に照合してください。

共有KV `maintenance:global` → `{"enabled":true}` で全サイト、`{"enabled":false}` で復旧。個別キー `maintenance:site:me2`。Pages Functions `_middleware.js` が既存IPブロックを実行した後、公開ページへ503を返します。 `/api` と `/api/*` は従来の認証・進捗保存等を維持します。

`_routes.json` はすべての静的資産もFunctionsに通すため、課金/レイテンシ増加とPages Functionsリクエスト制限に注意してください。Git連携/WranglerのどちらがBindingを管理しているか必ず確認し、OFF状態で先行デプロイしてからONテストを実施してください。古いPages Preview/branch URLやPWA/ブラウザキャッシュは別のアクセス制限が必要な場合があります。

**注意:** `me.dpi-bot.com` は `me2.dpi-bot.com` と別ホストです。両者が同じPagesプロジェクトを指しているかCloudflare側の情報で確認するまで同一扱いしないでください。
