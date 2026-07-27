const DEFAULT_EXPLANATION_DEFINITION = String.raw`# ME2種 AI解説生成の定義

## 1. 共通ルール
- 解説は暗記用として短く、同じ構成で生成する。
- 問題文・選択肢そのものを不必要に長く繰り返さない。
- 選択肢ごとに「何を示すか」「何に使うか」「分類」「正誤理由」をできるだけ入れる。
- 断定できない内容は断定しない。
- 医療・安全に関係する内容は、一般的なME2種学習範囲として説明する。
- 1つの選択肢解説は原則2〜4文まで。
- 文字化け・不要な記号・孤立した数字は入れない。
- 選択肢本文はchoices側に表示されるため、choiceNotes内で選択肢全文を引用して重複させない。
- 「この設問について正しくは、〜」のように、設問全体の正答を各選択肢解説で繰り返さない。
- 「この記述は設問の基礎事項と一致する。」などの抽象的な定型文だけで終わらせない。

## 2. 正しいものを選ぶ問題
### 正答選択肢
- 「正答。理由：〜。」を基本とし、正しい理由を具体的に記載する。
### 誤答選択肢
- 誤っている語句・数値・単位・方向・因果関係を具体的に示す。
- 正しい語句・数値・単位・方向を提示する。
- 単に「誤り」「不正解」「内容が異なる」だけで終わらせない。

## 3. 誤っているものを選ぶ問題
### 選ぶべき誤りの選択肢
- 「正答。誤りポイント：〜。正しくは〜。」を基本とする。
### 誤りではない選択肢
- 「この選択肢は誤りではない。」に続けて、正しい理由を具体的に記載する。

## 4. センサ・トランスデューサ・計測機器
- 何を測定するかを書く。
- 何を電気量へ変換するかを書く。
例：
- ストレインゲージ：ひずみを抵抗変化に変換。力・圧力・荷重測定に利用。
- 差動トランス：変位・位置を電圧変化として測定。
- ホール素子：磁場・磁束密度を電圧に変換。
- 圧電素子：圧力・力・振動・加速度を電圧に変換。
- 熱電対：温度差を熱起電力として測定。

## 5. 薬剤・消毒薬・材料・装置・方法・規格・部品
- 分類を書く。
- 用途を書く。
- 何に有効か、何に不向きかを書く。
- 装置や部品は、役割・接続先・使用場面を書く。

## 6. 計算・公式問題
- 使用した公式をすべて必ず書く。
- 代入した式を必ず書く。
- 計算結果には単位を付ける。
- 誤答選択肢では、公式・代入・計算・単位のどこが違うかを書く。
例：
- 「正答。公式：\( V=IR \)。代入：\( V=2\times50=100\,\mathrm{V} \)。したがって設問条件に合う。」
- 「誤りポイント：代入式が誤り。正しくは \( I=\frac{V}{R}=\frac{100}{50}=2\,\mathrm{A} \)。」

## 7. 要点解説 tip
以下の形を基本にする。
「要点：〜。覚える：〜。」
- 重要語句・数値・分類を含める。
- 長くしすぎない。
- 計算問題では、使用公式・代入・単位を含める。

## 8. choiceNotesの統一書式
各選択肢の解説は、次の書き出しを基本にする。
- 正答。
- 誤りポイント：
- この選択肢は誤りではない。
- choiceNotesはchoicesと同じ数にする。
- 図だけで示される、OCR崩れ、記号欠落などで安全に特定できない場合に限り「誤り。要点解説参照。」を使用できる。

## 9. サイト内でのLaTeX使用方法
- このサイトはMathJaxでLaTeXを表示できる。
- 問題文stem、選択肢choices、問題注釈annotation、要点解説tip、各選択肢解説choiceNotesで使用できる。
- 文章中の数式は必ず \( ... \) で囲む。
- 独立した数式は必ず \[ ... \] で囲む。
- 開発モードの入力欄ではバックスラッシュを1個で入力する。
- 開発モードでは、円記号の「¥」「￥」が入力された場合もバックスラッシュへ正規化される。
- JSONファイルを直接編集する場合は、JSONの仕様によりバックスラッシュを2個にする。
- HTMLタグで数式を表現しない。
- 数式では必要に応じて単位を \mathrm{} で表し、数値と単位の間は \, を使用する。

### よく使う記法
- 分数：\( \frac{a}{b} \)
- 平方根：\( \sqrt{R^2+X^2} \)
- 下付き：\( V_{\mathrm{rms}} \)、\( PaCO_2 \)
- 上付き：\( 10^{-3} \)
- 掛け算：\( 3.0\times10^8 \)
- 単位：\( 100\,\mathrm{V} \)、\( 2\,\mathrm{A} \)
- ギリシャ文字：\( \alpha \)、\( \beta \)、\( \Delta \)、\( \Omega \)
- 比較：\( \leq \)、\( \geq \)、\( \neq \)、\( \approx \)
- 論理否定：\( \neg A \)
- AND：\( A\land B \)
- OR：\( A\lor B \)
- 含意：\( A\Rightarrow B \)
- 同値：\( A\Leftrightarrow B \)
- 和集合・共通部分：\( A\cup B \)、\( A\cap B \)

### JSONへ直接記載する例
- 画面上で表示させたい内容：電流は \( I=\frac{V}{R} \) で求める。
- JSON文字列内：「電流は \\( I=\\frac{V}{R} \\) で求める。」
- AIはJSONを返すため、応答JSONではバックスラッシュをJSONとして正しくエスケープする。

## 9.1 問題画像の利用
- hasFigureがtrueで問題画像が送信されている場合は、画像内の図・表・グラフ・回路・波形・選択肢記号を必ず確認する。
- 画像から読み取れない内容を推測で補わない。
- 問題文と画像の情報が食い違う場合は、画像を優先したと断定せず、要点解説で確認が必要な箇所を明示する。
- 画像が解答判断に必要な問題では、画像を参照した具体的な理由をchoiceNotesへ反映する。

## 10. 出力条件
- tipは1つ。
- choiceNotesは選択肢数と同じ数。
- tipとchoiceNotes以外の問題データを変更しない。
- JSONのみで返す。`;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), { status: init.status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) } });
}
async function bodyJson(request) { try { return await request.json(); } catch (_) { return {}; } }
function bytesToHex(bytes) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function sha256Hex(text) { const bytes = new TextEncoder().encode(String(text || '')); const digest = await crypto.subtle.digest('SHA-256', bytes); return bytesToHex(digest); }
async function sessionKey(token) { return `devsession:${await sha256Hex(token)}`; }
async function verifyDevSession(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return { ok: false, error: 'ME2_PROGRESS KV binding が未設定です。' };
  const token = context.request.headers.get('X-ME2-Dev-Session') || '';
  if (!token) return { ok: false, error: '開発者ログインが必要です。' };
  const session = await kv.get(await sessionKey(token), 'json');
  if (!session) return { ok: false, error: '開発者セッションが無効または期限切れです。再ログインしてください。' };
  return { ok: true, session };
}
function cleanQuestion(q) {
  const choices = Array.isArray(q?.choices) ? q.choices.map(x => String(x || '').slice(0, 500)) : [];
  const correct = Array.isArray(q?.correct) ? q.correct.map(Number).filter(n => n >= 1 && n <= choices.length) : [];
  return { number: q?.number, range: String(q?.range || '').slice(0, 120), stem: String(q?.stem || '').slice(0, 1200), annotation: String(q?.annotation || q?.questionAnnotation || q?.questionNote || '').slice(0, 1000), choices, correct, negative: Boolean(q?.negative), hasFigure: Boolean(q?.hasFigure), image: String(q?.image || '').slice(0, 500), hint: String(q?.hint || '').slice(0, 1000), tip: String(q?.tip || '').slice(0, 1000), choiceNotes: Array.isArray(q?.choiceNotes) ? q.choiceNotes.map(x => String(x || '').slice(0, 800)) : [] };
}
function cleanImageInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw)) {
    throw new Error('AI送信用画像が不正です。PNG・JPEG・WebPのBase64 Data URLを使用してください。');
  }
  const comma = raw.indexOf(',');
  const base64 = raw.slice(comma + 1);
  const padding = (base64.match(/=+$/) || [''])[0].length;
  const size = Math.floor(base64.length * 3 / 4) - padding;
  if (size <= 0) throw new Error('AI送信用画像が空です。');
  if (size > 15 * 1024 * 1024) throw new Error('AI送信用画像が15MBを超えています。');
  return raw;
}
function cleanDefinition(definition) { const d = String(definition || '').trim(); if (!d) return DEFAULT_EXPLANATION_DEFINITION; return d.slice(0, 8000); }
function buildPrompt(q, definition) {
  const promptQuestion = { ...q, imageProvidedToModel: Boolean(q.imageInput) };
  delete promptQuestion.imageInput;
  return `以下の「解説生成定義」を厳守して、第2種ME技術実力検定試験（ME2種）学習アプリ用の解説を生成してください。

# 解説生成定義
${definition}

# 出力形式
必ずJSONのみで返してください。
{
  "hint": "正答を直接示さず、計算問題では公式・数値と記号の対応・単位換算・代入式・次の計算、知識問題では作用・部位・方向・増減・因果関係を具体的に示すヒント",
  "tip": "要点解説",
  "choiceNotes": ["選択肢1の解説", "選択肢2の解説", "..."]
}

# 問題データ
${JSON.stringify(promptQuestion, null, 2)}`;
}
function extractJsonText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const out = data.output || [];
  for (const item of out) for (const c of (item.content || [])) if (typeof c.text === 'string') return c.text;
  return '';
}
function normalizeAiResult(obj, q) {
  const hint = String(obj?.hint || '').trim();
  const tip = String(obj?.tip || '').trim();
  let choiceNotes = Array.isArray(obj?.choiceNotes) ? obj.choiceNotes.map(x => String(x || '').trim()) : [];
  while (choiceNotes.length < q.choices.length) choiceNotes.push('');
  if (choiceNotes.length > q.choices.length) choiceNotes = choiceNotes.slice(0, q.choices.length);
  if (!hint || !tip || choiceNotes.some(x => !x)) {
    throw new Error('AI応答のhint・tip・choiceNotesに空欄があります。もう一度実行してください。');
  }
  return { hint, tip, choiceNotes };
}
async function callOpenAI(env, q, definition) {
  const apiKey = env.OPENAI_API_KEY || env.ME2_OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY が未設定です。Cloudflare Pages の環境変数に設定してください。');
  const model = env.ME2_AI_MODEL || 'gpt-4o-mini';
  const userContent = [
    { type: 'input_text', text: buildPrompt(q, definition) }
  ];
  if (q.imageInput) {
    userContent.push({
      type: 'input_image',
      image_url: q.imageInput,
      detail: 'high'
    });
  }
  const payload = {
    model,
    input: [
      { role: 'system', content: 'You generate concise, accurate Japanese explanations for ME2 exam questions. Follow the user-provided definition exactly. Return valid JSON only.' },
      { role: 'user', content: userContent }
    ],
    text: { format: { type: 'json_schema', name: 'me2_explanation', schema: { type: 'object', additionalProperties: false, properties: { hint: { type: 'string' }, tip: { type: 'string' }, choiceNotes: { type: 'array', items: { type: 'string' } } }, required: ['hint', 'tip', 'choiceNotes'] }, strict: true } }
  };
  const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || data?.message || `OpenAI API error ${r.status}`);
  const text = extractJsonText(data);
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { throw new Error('AI応答をJSONとして読み取れませんでした。'); }
  return { ...normalizeAiResult(parsed, q), imageUsed: Boolean(q.imageInput) };
}
async function handlePost(context) {
  const verified = await verifyDevSession(context);
  if (!verified.ok) return json({ error: verified.error }, { status: 401 });
  const body = await bodyJson(context.request);
  const q = cleanQuestion(body.question || {});
  q.imageInput = q.hasFigure ? cleanImageInput(body.imageInput || '') : '';
  const definition = cleanDefinition(body.definition || DEFAULT_EXPLANATION_DEFINITION);
  if (!q.stem || q.choices.length < 2 || !q.correct.length) return json({ error: '問題文・選択肢・正答が不足しています。' }, { status: 400 });
  const result = await callOpenAI(context.env || {}, q, definition);
  return json({ ok: true, definitionUsed: definition, ...result });
}
export async function onRequest(context) { try { if (context.request.method.toUpperCase() !== 'POST') return json({ error: 'Method not allowed for /api/ai-explain' }, { status: 405 }); return await handlePost(context); } catch (e) { return json({ error: e && e.message ? e.message : String(e) }, { status: 500 }); } }
export async function onRequestPost(context) { try { return await handlePost(context); } catch (e) { return json({ error: e && e.message ? e.message : String(e) }, { status: 500 }); } }
