const SESSION_TTL_SECONDS = 60 * 60 * 12;

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {})
    }
  });
}
async function bodyJson(request) {
  try { return await request.json(); } catch (_) { return {}; }
}
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(digest);
}
function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}
function safeDevId(v) {
  return String(v || '').trim();
}
async function passwordOk(env, inputPassword) {
  const plain = env.ME2_DEV_PASSWORD || '';
  const hash = env.ME2_DEV_PASSWORD_HASH || '';
  if (plain) return inputPassword === plain;
  if (hash) return (await sha256Hex(inputPassword)) === String(hash).toLowerCase();
  return false;
}
function configured(env) {
  return Boolean(env.ME2_DEV_ID && (env.ME2_DEV_PASSWORD || env.ME2_DEV_PASSWORD_HASH));
}
async function sessionKey(token) {
  return `devsession:${await sha256Hex(token)}`;
}
async function handlePost(context) {
  const env = context.env || {};
  const kv = env.ME2_PROGRESS;

  if (!kv) {
    return json({ error: 'ME2_PROGRESS KV binding が未設定です。Cloudflare Pages の Functions/Bindings で ME2_PROGRESS を設定してください。' }, { status: 503 });
  }
  if (!configured(env)) {
    return json({ error: '開発者用の環境変数 ME2_DEV_ID と ME2_DEV_PASSWORD または ME2_DEV_PASSWORD_HASH を設定してください。' }, { status: 503 });
  }

  const body = await bodyJson(context.request);
  const action = String(body.action || 'login');

  if (action === 'logout') {
    const token = context.request.headers.get('X-ME2-Dev-Session') || body.sessionToken || '';
    if (token) await kv.delete(await sessionKey(token));
    return json({ ok: true });
  }

  const id = safeDevId(body.id);
  const password = String(body.password || '');

  if (!id || !password) return json({ error: '開発者IDとパスワードを入力してください。' }, { status: 400 });
  if (password.length < 8) return json({ error: '開発者パスワードは8文字以上にしてください。' }, { status: 400 });

  if (id !== env.ME2_DEV_ID || !(await passwordOk(env, password))) {
    return json({ error: '開発者IDまたはパスワードが違います。' }, { status: 401 });
  }

  const sessionToken = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await kv.put(await sessionKey(sessionToken), JSON.stringify({
    id,
    createdAt: new Date().toISOString(),
    expiresAt
  }), { expirationTtl: SESSION_TTL_SECONDS });

  return json({ ok: true, id, sessionToken, expiresAt });
}
async function handleGet(context) {
  const env = context.env || {};
  const kv = env.ME2_PROGRESS;

  if (!kv) return json({ ok: false, error: 'ME2_PROGRESS KV binding が未設定です。' }, { status: 503 });
  if (!configured(env)) return json({ ok: false, error: '開発者用環境変数が未設定です。' }, { status: 503 });

  const token = context.request.headers.get('X-ME2-Dev-Session') || '';
  if (!token) return json({ ok: false }, { status: 401 });

  const session = await kv.get(await sessionKey(token), 'json');
  if (!session) return json({ ok: false }, { status: 401 });

  return json({ ok: true, id: session.id, expiresAt: session.expiresAt });
}

async function route(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'POST') return handlePost(context);
  if (method === 'GET') return handleGet(context);
  if (method === 'OPTIONS') return json({ ok: true });
  return json({ error: `Method ${method} is not allowed for /api/dev-auth` }, { status: 405 });
}

// Cloudflare Pages Functions が method-specific handler を拾えない場合に備え、onRequestも用意する。
export async function onRequest(context) {
  try { return await route(context); }
  catch (e) { return json({ error: `開発者認証APIでエラーが発生しました: ${e && e.message ? e.message : String(e)}` }, { status: 500 }); }
}
export async function onRequestPost(context) {
  try { return await handlePost(context); }
  catch (e) { return json({ error: `開発者認証APIでエラーが発生しました: ${e && e.message ? e.message : String(e)}` }, { status: 500 }); }
}
export async function onRequestGet(context) {
  try { return await handleGet(context); }
  catch (e) { return json({ ok: false, error: `開発者認証APIでエラーが発生しました: ${e && e.message ? e.message : String(e)}` }, { status: 500 }); }
}
