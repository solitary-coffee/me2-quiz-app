const DEFAULT_EXPLANATION_DEFINITION = `# ME2種 AI解説生成の定義

## 1. 共通ルール
- 解説は暗記用として短く、同じ構成で生成する。
- 問題文・選択肢そのものを不必要に長く繰り返さない。
- 選択肢ごとに「何を示すか」「何に使うか」「分類」「正誤理由」をできるだけ入れる。
- 断定できない内容は断定しない。
- 医療・安全に関係する内容は、一般的なME2種学習範囲として説明する。
- 1つの選択肢解説は原則2〜4文まで。
- 文字化け・不要な記号・孤立した数字は入れない。

## 2. 正しいものを選ぶ問題
### 正答選択肢
「正答。〜は〜である。」
### 誤答選択肢
「誤りポイント：「誤っている語句・考え方」が誤り。正しくは「〜」」

## 3. 誤っているものを選ぶ問題
### 選ぶべき誤りの選択肢
「正答。誤りポイント：「誤っている語句・考え方」が誤り。正しくは「〜」。」
### 誤りではない選択肢
「この選択肢は誤りではない。」

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
「正答。公式：V=IR。代入：V=2×50=100V。したがって設問条件に合う。」
「誤りポイント：代入式が誤り。正しくは I=V/R=100/50=2A。」

## 7. 要点解説 tip
以下の形を基本にする。
「要点：〜。覚える：〜。」
- 重要語句・数値・分類を含める。
- 長くしすぎない。
計算問題の場合は使用公式や重要なポイントを含める。
例：
「要点：電圧はオームの法則で求められ、電流と抵抗の積。覚える：V=IR 単位はV（ボルト）。」
## 8. choiceNotesの統一書式
各選択肢の解説は、次のどれかの書き出しに統一する。
- 正答。
- 誤りポイント：
- この選択肢は誤りではない。

## 9. 出力条件
- tipは1つ。
- choiceNotesは選択肢数と同じ数。
- JSONのみで返す。

## 10. 数式・分数・論理式の表記
- 分数、平方根、添字、上付き、ギリシャ文字、論理式はLaTeXで記載する。
- 文章中の数式は \\( ... \\)、独立した数式は \\[ ... \\] で囲む。
- 例：\\( I=\\frac{V}{R} \\)、\\( Z=\\sqrt{R^2+X^2} \\)。
- 論理式の例：\\( \\neg A \\lor B \\)、\\( A \\land B \\)、\\( A \\Rightarrow B \\)。
- 単位は必要に応じて \\mathrm{} を使う。例：\\( R=100\\,\\mathrm{\\Omega} \\)。
- JSONとして返す際は、バックスラッシュを正しくエスケープする。`;

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
  return { number: q?.number, range: String(q?.range || '').slice(0, 120), stem: String(q?.stem || '').slice(0, 1200), annotation: String(q?.annotation || q?.questionAnnotation || q?.questionNote || '').slice(0, 1000), choices, correct, negative: Boolean(q?.negative), hasFigure: Boolean(q?.hasFigure), image: String(q?.image || '').slice(0, 240), tip: String(q?.tip || '').slice(0, 1000), choiceNotes: Array.isArray(q?.choiceNotes) ? q.choiceNotes.map(x => String(x || '').slice(0, 800)) : [] };
}
function cleanDefinition(definition) { const d = String(definition || '').trim(); if (!d) return DEFAULT_EXPLANATION_DEFINITION; return d.slice(0, 8000); }
function buildPrompt(q, definition) {
  return `以下の「解説生成定義」を厳守して、第2種ME技術実力検定試験（ME2種）学習アプリ用の解説を生成してください。

# 解説生成定義
${definition}

# 出力形式
必ずJSONのみで返してください。
{
  "tip": "要点解説",
  "choiceNotes": ["選択肢1の解説", "選択肢2の解説", "..."]
}

# 問題データ
${JSON.stringify(q, null, 2)}`;
}
function extractJsonText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const out = data.output || [];
  for (const item of out) for (const c of (item.content || [])) if (typeof c.text === 'string') return c.text;
  return '';
}
function normalizeAiResult(obj, q) {
  const tip = String(obj?.tip || '').trim();
  let choiceNotes = Array.isArray(obj?.choiceNotes) ? obj.choiceNotes.map(x => String(x || '').trim()) : [];
  while (choiceNotes.length < q.choices.length) choiceNotes.push('');
  if (choiceNotes.length > q.choices.length) choiceNotes = choiceNotes.slice(0, q.choices.length);
  if (!tip || choiceNotes.some(x => !x)) throw new Error('AI応答に空欄があります。もう一度実行してください。');
  return { tip, choiceNotes };
}
async function callOpenAI(env, q, definition) {
  const apiKey = env.OPENAI_API_KEY || env.ME2_OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('OPENAI_API_KEY が未設定です。Cloudflare Pages の環境変数に設定してください。');
  const model = env.ME2_AI_MODEL || 'gpt-4o-mini';
  const payload = {
    model,
    input: [
      { role: 'system', content: 'You generate concise, accurate Japanese explanations for ME2 exam questions. Follow the user-provided definition exactly. Return valid JSON only.' },
      { role: 'user', content: buildPrompt(q, definition) }
    ],
    text: { format: { type: 'json_schema', name: 'me2_explanation', schema: { type: 'object', additionalProperties: false, properties: { tip: { type: 'string' }, choiceNotes: { type: 'array', items: { type: 'string' } } }, required: ['tip', 'choiceNotes'] }, strict: true } }
  };
  const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || data?.message || `OpenAI API error ${r.status}`);
  const text = extractJsonText(data);
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { throw new Error('AI応答をJSONとして読み取れませんでした。'); }
  return normalizeAiResult(parsed, q);
}
async function handlePost(context) {
  const verified = await verifyDevSession(context);
  if (!verified.ok) return json({ error: verified.error }, { status: 401 });
  const body = await bodyJson(context.request);
  const q = cleanQuestion(body.question || {});
  const definition = cleanDefinition(body.definition || DEFAULT_EXPLANATION_DEFINITION);
  if (!q.stem || q.choices.length < 2 || !q.correct.length) return json({ error: '問題文・選択肢・正答が不足しています。' }, { status: 400 });
  const result = await callOpenAI(context.env || {}, q, definition);
  return json({ ok: true, definitionUsed: definition, ...result });
}
export async function onRequest(context) { try { if (context.request.method.toUpperCase() !== 'POST') return json({ error: 'Method not allowed for /api/ai-explain' }, { status: 405 }); return await handlePost(context); } catch (e) { return json({ error: e && e.message ? e.message : String(e) }, { status: 500 }); } }
export async function onRequestPost(context) { try { return await handlePost(context); } catch (e) { return json({ error: e && e.message ? e.message : String(e) }, { status: 500 }); } }
