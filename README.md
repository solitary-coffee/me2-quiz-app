# ME2 Quiz App

臨床工学技士国家試験・第2種ME技術実力検定試験などの過去問演習を行うためのWebアプリです。  
スマートフォン・iPad・PCのブラウザで利用でき、問題演習、解説確認、進行状況保存、開発モードでの問題編集、GitHub Pull Request作成に対応しています。

---

## 主な機能

- 午前・午後に分けた問題演習
- 5択ボタン形式での解答
- 正答率・経過時間の表示
- 各選択肢の解説表示
- 間違えた問題の復習
- ランダム演習
- ブックマーク
- 解答履歴の保存
- サイト内データ読み込み
- ダークモード
- 開発モードでの問題JSON編集
- AIによる解説再生成
- ローカル簡易生成
- 問題文・解説の文面チェック
- GitHub Pull Request作成
- 複数問題をまとめた一括PR
- 既存の問題編集PRへの追加コミット

---

## ディレクトリ構成

```text
me2-quiz-app/
├─ index.html
├─ CHANGELOG.md
├─ VERSION.json
├─ wrangler.toml
├─ README.md
├─ Date/
│  ├─ Ques/
│  │  ├─ exams_index.json
│  │  ├─ 40_am.json
│  │  ├─ 40_pm.json
│  │  └─ ...
│  └─ img/
│     ├─ 40/
│     ├─ 41/
│     └─ ...
├─ User_deta/
└─ functions/
   └─ api/
      ├─ dev-auth.js
      ├─ ai-explain.js
      ├─ github-pr.js
      ├─ progress.js
      └─ ...
```

---

## 問題データの読み込み方式

このアプリでは、問題JSONや画像をGitHub Rawから直接読み込まず、サイト内のファイルとして読み込みます。

```text
問題JSON: Date/Ques/
画像: Date/img/
```

Cloudflare Pagesにデプロイする際は、`Date` フォルダを必ずデプロイ対象に含めてください。

---

## 問題JSON形式

問題JSONは、基本的に以下のような構成です。

```json
{
  "examId": "46",
  "part": "am",
  "title": "第46回 午前",
  "questions": [
    {
      "number": 1,
      "range": "基礎医学",
      "stem": "問題文",
      "choices": [
        "選択肢1",
        "選択肢2",
        "選択肢3",
        "選択肢4",
        "選択肢5"
      ],
      "correct": [1],
      "negative": false,
      "hasFigure": true,
      "image": "Date/img/46/46_am_q01.jpg",
      "tip": "要点解説",
      "choiceNotes": [
        "正答。...",
        "誤りポイント：...",
        "誤りポイント：...",
        "誤りポイント：...",
        "誤りポイント：..."
      ]
    }
  ]
}
```

---

## 解説生成の基本ルール

各選択肢の解説は、次の形式にそろえます。

### 正しいものを選ぶ問題

```text
正答。なぜ正しいか。
誤りポイント：「どの語句が誤りか」が誤り。正しくは〜。
```

### 誤っているものを選ぶ問題

```text
正答。誤りポイント：「どの語句が誤りか」が誤り。正しくは〜。
この選択肢は誤りではない。正しい内容なので本問では選ばない。
```

---


## ランダム出題の種類別フィルタ

ランダム出題では、従来の6つの出題範囲に加えて、`種類別に選択` から呼吸器、人工心肺・ECMO、感染症・消毒滅菌、安全管理などで絞り込みできます。

この機能は問題JSONを直接変更せず、既存の問題文・選択肢・解説などに含まれる語句からブラウザ側で自動判定します。

---

## ローカルでの確認方法

単純に `index.html` を直接開くと、ブラウザの制限でJSON読み込みが失敗する場合があります。  
ローカル確認では、簡易HTTPサーバーを使ってください。

```bash
python -m http.server 8000
```

その後、ブラウザで以下を開きます。

```text
http://localhost:8000/
```

---

## Cloudflare Pagesへのデプロイ

### 1. GitHubへ反映

```bash
git add .
git commit -m "Update ME2 quiz app"
git push
```

### 2. Cloudflare Pagesで接続

Cloudflare PagesでGitHubリポジトリを接続し、デプロイします。

一般的な設定例です。

```text
Framework preset: None
Build command: 空欄
Build output directory: /
```

プロジェクトの構成によって、出力ディレクトリは調整してください。

---

## Cloudflare Pagesで必要な環境変数

### サイトログイン・進行状況保存

```text
ME2_PROGRESS
```

これはCloudflare KVのBindingです。

### 開発者ログイン

```text
ME2_DEV_ID
ME2_DEV_PASSWORD
```

または、ハッシュ化したパスワードを使う場合は以下を使用します。

```text
ME2_DEV_PASSWORD_HASH
```

---

## AI解説再生成

AI解説再生成を使う場合は、Cloudflare Pagesの環境変数にOpenAI APIキーを設定します。

```text
OPENAI_API_KEY
```

任意でモデルを指定できます。

```text
ME2_AI_MODEL
```

例：

```text
ME2_AI_MODEL=gpt-4.1-mini
```

OpenAI APIの課金はChatGPT Plus/Proとは別です。  
`Your account is not active` などのエラーが出る場合は、OpenAI Platform側のBilling設定を確認してください。

AIが使えない場合でも、開発モード内の `ローカル簡易生成` を利用できます。

---

## GitHub Pull Request作成機能

開発モードでは、編集した問題JSONや画像をGitHubへ送信し、Pull Requestを作成できます。

### 対応内容

- 1問ずつ編集
- `この問題に反映` で一括PRリストへ自動追加
- 複数問題を同じPRにまとめる
- 回数や午前・午後が違う問題も同じPRへ追加
- 既存の問題編集PRがある場合は、そのPRへ追加コミット
- PR本文の重複を自動整理
- JSONはPRブランチ上の最新ファイルを取得し、対象問題だけ差し替え
- 画像は `Date/img/` へ追加・差し替え

---

## GitHub PR作成に必要なCloudflare設定

### Secret

```text
GITHUB_TOKEN
```

GitHubのFine-grained personal access tokenを設定します。  
絶対に `index.html` や公開リポジトリ内へ直接書かないでください。

### Environment variables

```text
GITHUB_OWNER=solitary-coffee
GITHUB_REPO=me2-quiz-app
GITHUB_BRANCH=main
GITHUB_ROOT=
GITHUB_PR_BRANCH_PREFIX=me2/dev-batch
```

`GITHUB_ROOT` は、サイトがリポジトリ直下にある場合は空欄で問題ありません。

---

## GitHub Tokenに必要な権限

Fine-grained personal access tokenを使用してください。

```text
Repository access:
Only selected repositories
→ 対象リポジトリを選択

Repository permissions:
Contents: Read and write
Pull requests: Read and write
```

Organizationリポジトリの場合は、Token作成後にOrganization側の承認が必要な場合があります。

---



## 開発モードの余白調整

開発モードの左側パネルでは、各枠が不要に縦伸びしないように調整しています。  
編集対象のプルダウンは、試験回と午前/午後を短めにし、問題番号を広めに配置しています。

---

## 開発モードの配置

開発モードでは、`解説生成定義を確認・編集` の下に `編集対象` を単独で配置しています。  
左側パネルは、`問題・解答・画像の設定`、`各問題のコミットメッセージ / 編集箇所`、`GitHub 一括PR作成` の順に並びます。

---


## 文面一括チェック

開発モードの文面一括チェックでは、問題文・選択肢・正答・画像パス・要点解説・各選択肢解説の形式をまとめて確認できます。  
チェック結果は画面上に表示し、コピーやCSV保存もできます。

---

## 開発モードの基本操作

### 問題を編集して一括PRに入れる

```text
1. 開発モードへログイン
2. 試験回・午前/午後・問題番号を選択
3. 問題文・選択肢・解説・画像を編集
4. 「この問題に反映」を押す
5. 自動で一括PRリストへ追加・更新
```

### 複数問題を同じPRへ入れる

```text
1問目を編集
→ この問題に反映

2問目を編集
→ この問題に反映

3問目を編集
→ この問題に反映

PR操作部を開く
→ 一括PRを作成 / 既存PRへ更新
```


### コミットメッセージ入力欄

`各問題のコミットメッセージ / 編集箇所` はPR操作部の折りたたみ外に表示されます。  
PR操作部を閉じた状態でも入力でき、`この問題に反映` を押した時点の内容が一括PRリストへ保存されます。

### 注意

- `この問題に反映` を押すと、一括PRリストへ自動追加されます。
- 同じ問題を再編集して再度反映すると、一括PRリスト内の内容も更新されます。
- PR作成ボタンは誤操作防止のため折りたたみ内にあります。

---

## PR本文の仕様

PR本文は以下の構成で整理されます。

```md
## 修正内容

- 第46回 午前 第1問：問題内容・解説を修正
- 第46回 午前 第19問：問題内容・解説を修正

## 送信ファイル

- `Date/Ques/46_am.json`
- `Date/img/46/46_am_q12.jpg`

## 確認

- [ ] 問題文・選択肢を確認
- [ ] 正答を確認
- [ ] 解説を確認
- [ ] 画像表示を確認
```

既存PRへ追加更新する場合、同じ項目は重複追加されません。

---

## コミットメッセージの形式

問題編集時のコミットメッセージは、原則として以下の形式です。

```text
第〇回 午前 第〇問：編集箇所
第〇回 午後 第〇問：編集箇所
```

複数問題を同じJSONにまとめて送信する場合は、代表問題と複数問題編集で表示される場合があります。

---

## 競合を起こしにくくする仕組み

一括PRでは、JSONファイル全体を単純に上書きするのではなく、GitHub上のPRブランチにある最新JSONを取得してから、対象問題だけを差し替えます。

これにより、同じPR内で別の問題を追加しても、以前の修正を上書きしにくくしています。

ただし、同じ問題を複数人が同時に編集した場合は、内容確認が必要です。

---


## PRマージ後の最新データ取得

PRをマージしてCloudflare Pagesの再デプロイが完了した後、開発モードの `マージ後の最新データ取得` を押してください。

この操作により、ブラウザ内の問題データキャッシュをクリアし、サイト内の `Date/Ques` と `Date/img` を再取得します。  
また、一括PRリストに残っている編集データのうち、最新JSONと一致するものはマージ済みとして自動削除されます。

---


## 旧JIS・旧規格に関する注意表示

問題JSONの `standardWarning.legacyJis` を `true` にすると、問題画面と解説画面に注意表示を出せます。

```json
"standardWarning": {
  "legacyJis": true,
  "message": "この問題は旧JIS規格・旧表記に基づいています。現行のJIS規格や法令・ガイドラインとは内容や表記が異なる場合があります。",
  "sourceStandard": "JIS T 0601-1 旧版",
  "reviewRequired": true
}
```

開発モードでは、旧JISフラグ・現行規格との照合要否・関連規格名を編集できます。古い試験回であることだけを理由に付与せず、設問の正答や解説に旧規格が実際に関係する場合に限って設定してください。

---

## よくあるエラー

### Resource not accessible by personal access token

GitHub Tokenの権限不足です。

確認してください。

```text
Repository access:
対象リポジトリが選択されている

Repository permissions:
Contents: Read and write
Pull requests: Read and write
```

### OPENAI_API_KEY が未設定です

Cloudflare Pagesに以下を設定してください。

```text
OPENAI_API_KEY
```

### Your account is not active

OpenAI API Platform側の課金状態が有効ではありません。  
ChatGPT Plus/Proとは別に、OpenAI API側のBilling設定が必要です。

### 問題JSONを読み込めません

`Date/Ques/` がデプロイ対象に含まれているか確認してください。

### 画像を読み込めません

`Date/img/` に画像が存在するか、JSON内の画像パスが正しいか確認してください。

---




## 種類別カテゴリ

種類別ランダム出題では、各問題JSON内の `kindCategories` を優先して使用します。  
問題文・選択肢・解説は変更せず、カテゴリ情報のみを追加しています。

開発モードの `問題種類別カテゴリ` から、現在の問題のカテゴリを編集できます。  
変更内容は通常のJSON保存・JSONコピー・GitHub PR作成に含まれます。

---

## CE国家試験版リンク

トップ画面の `ログイン / 登録` と回数表示の右側に、CE国家試験版へ移動するリンクボタンを配置しています。  
リンク先は `index.html` 内の以下で変更できます。

```js
const CE_EXAM_SITE_URL='/ce/';
```

---


## 計算用ホワイトボード

出題画面の `✏️ 計算用ホワイトボード` から、問題ごとの計算メモを開けます。  
上部ツールバーはペン・消しゴム・色・太さ・描画の1手戻す/1手進む・全消去のための操作欄です。

問題移動は、左側の問題確認パネル下部にある **`◀ 1問戻る`** / **`進む ▶`** に統一しています。

板書はサーバー・DB・端末ストレージには保存せず、解答中だけ問題ごとに一時保持します。

---

## SNS共有表示

`index.html` にはOGP / Twitter Card用のメタタグを設定しています。  
Twitter / X、Discord、LINEなどにURLを貼った際、サイト名・説明文・リンクカード画像が表示されやすくなります。

リンクカード画像は以下です。

```text
assets/ogp.png
```

---

## 更新履歴

詳しい更新履歴は `CHANGELOG.md` を確認してください。

---

## 開発者

```text
開発者: 孤独のコーヒー
連絡先: kikukazu.kk0226@gmail.com
```

---

## 注意事項

このアプリは学習支援を目的としたものです。  
問題文・解説・正答は、必ず公式資料や授業資料などと照合して確認してください。


## 種類別ランダム出題

ランダム出題では、6つの基本範囲に加えて、呼吸器・人工心肺・感染症・安全管理などの種類別カテゴリで問題を絞り込めます。  
種類別カテゴリは問題JSONを直接変更せず、`Date/Ques/random_kind_map.json` で管理します。開発モードから各問題のカテゴリを編集し、カテゴリJSONとして保存・コピーできます。
