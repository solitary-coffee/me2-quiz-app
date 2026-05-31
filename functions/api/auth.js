function safeLoginId(v) {
  const id = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(id)) return null;
  return id;
}
function safeDisplayName(v, fallback) {
  return String(v || fallback || '').trim().slice(0, 40) || fallback;
}
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function bodyJson(request) { try { return await request.json(); } catch (_) { return {}; } }
function passwordPepper(env) { return env.ME2_AUTH_PEPPER || env.AUTH_PEPPER || 'me2-default-pepper-change-me'; }
async function passwordHash(env, loginId, password) {
  return sha256Hex(`${loginId}:${String(password || '')}:${passwordPepper(env)}`);
}
async function createSession(kv, account) {
  const sessionToken = randomHex(32);
  const sessionHash = await sha256Hex(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
  await kv.put(`session:${sessionHash}`, JSON.stringify({ loginId: account.loginId, displayName: account.displayName, createdAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 60 });
  return { sessionToken, sessionExpiresAt };
}
export async function onRequestPost(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return Response.json({ error: 'ME2_PROGRESS KV binding is not configured' }, { status: 500 });
  const body = await bodyJson(context.request);
  const action = String(body.action || 'login');
  if (action === 'logout') {
    if (body.sessionToken) await kv.delete(`session:${await sha256Hex(body.sessionToken)}`);
    return Response.json({ ok: true });
  }
  const loginId = safeLoginId(body.loginId);
  const password = String(body.password || '');
  if (!loginId) return Response.json({ error: 'ログインIDは英数字・_・- の3〜32文字で入力してください。' }, { status: 400 });
  if (password.length < 4) return Response.json({ error: '保存用パスワードは4文字以上にしてください。' }, { status: 400 });
  const accountKey = `account:${loginId}`;
  const existing = await kv.get(accountKey, 'json');
  if (action === 'register') {
    if (existing) return Response.json({ error: 'このログインIDはすでに使われています。' }, { status: 409 });
    const account = {
      loginId,
      displayName: safeDisplayName(body.displayName, loginId),
      passwordHash: await passwordHash(context.env, loginId, password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await kv.put(accountKey, JSON.stringify(account));
    const session = await createSession(kv, account);
    return Response.json({ ok: true, account: { loginId: account.loginId, displayName: account.displayName }, ...session });
  }
  if (action === 'login') {
    if (!existing) return Response.json({ error: 'ログインIDまたはパスワードが違います。' }, { status: 401 });
    const hash = await passwordHash(context.env, loginId, password);
    if (hash !== existing.passwordHash) return Response.json({ error: 'ログインIDまたはパスワードが違います。' }, { status: 401 });
    const session = await createSession(kv, existing);
    return Response.json({ ok: true, account: { loginId: existing.loginId, displayName: existing.displayName }, ...session });
  }
  return Response.json({ error: 'unknown action' }, { status: 400 });
}
export async function onRequestGet(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return Response.json({ authenticated: false, error: 'ME2_PROGRESS KV binding is not configured' }, { status: 200 });
  const loginId = safeLoginId(context.request.headers.get('X-ME2-Login-Id'));
  const token = context.request.headers.get('X-ME2-Session-Token') || '';
  if (!loginId || !token) return Response.json({ authenticated: false });
  const session = await kv.get(`session:${await sha256Hex(token)}`, 'json');
  if (!session || session.loginId !== loginId) return Response.json({ authenticated: false });
  return Response.json({ authenticated: true, account: { loginId: session.loginId, displayName: session.displayName } }, { headers: { 'cache-control': 'no-store' } });
}
