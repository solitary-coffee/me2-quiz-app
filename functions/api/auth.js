const MIN_PASSWORD_LENGTH = 8;
const PBKDF2_ITERATIONS = 120000;

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
function hexToBytes(hex) {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}
async function bodyJson(request) { try { return await request.json(); } catch (_) { return {}; } }
function passwordPepper(env) { return env.ME2_AUTH_PEPPER || env.AUTH_PEPPER || 'me2-default-pepper-change-me'; }
function validPassword(password) {
  return String(password || '').length >= MIN_PASSWORD_LENGTH && String(password || '').length <= 128;
}
async function legacyPasswordHash(env, loginId, password) {
  return sha256Hex(`${loginId}:${String(password || '')}:${passwordPepper(env)}`);
}
async function pbkdf2PasswordHash(env, loginId, password, saltHex) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${loginId}:${String(password || '')}:${passwordPepper(env)}`),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS },
    material,
    256
  );
  return bytesToHex(bits);
}
async function makePasswordRecord(env, loginId, password) {
  const salt = randomHex(16);
  return {
    passwordVersion: 2,
    passwordSalt: salt,
    passwordHashV2: await pbkdf2PasswordHash(env, loginId, password, salt),
    passwordIterations: PBKDF2_ITERATIONS,
  };
}
async function verifyPassword(env, loginId, password, account) {
  if (account?.passwordVersion === 2 && account.passwordSalt && account.passwordHashV2) {
    const h = await pbkdf2PasswordHash(env, loginId, password, account.passwordSalt);
    return h === account.passwordHashV2 ? { ok: true, legacy: false } : { ok: false, legacy: false };
  }
  if (account?.passwordHash) {
    const h = await legacyPasswordHash(env, loginId, password);
    return h === account.passwordHash ? { ok: true, legacy: true } : { ok: false, legacy: true };
  }
  return { ok: false, legacy: false };
}
async function createSession(kv, account) {
  const sessionToken = randomHex(32);
  const sessionHash = await sha256Hex(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
  await kv.put(`session:${sessionHash}`, JSON.stringify({
    loginId: account.loginId,
    displayName: account.displayName,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 60 * 60 * 24 * 60 });
  return { sessionToken, sessionExpiresAt };
}
function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', ...(init.headers || {}) },
  });
}
export async function onRequestPost(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return json({ error: 'ME2_PROGRESS KV binding is not configured' }, { status: 500 });

  const body = await bodyJson(context.request);
  const action = String(body.action || 'login');

  if (action === 'logout') {
    if (body.sessionToken) await kv.delete(`session:${await sha256Hex(body.sessionToken)}`);
    return json({ ok: true });
  }

  const loginId = safeLoginId(body.loginId);
  const password = String(body.password || '');

  if (!loginId) return json({ error: 'ログインIDは英数字・_・- の3〜32文字で入力してください。' }, { status: 400 });
  if (!validPassword(password)) return json({ error: `保存用パスワードは${MIN_PASSWORD_LENGTH}文字以上128文字以下にしてください。` }, { status: 400 });
  if (password.toLowerCase().includes(loginId)) return json({ error: 'パスワードにログインIDを含めないでください。' }, { status: 400 });

  const accountKey = `account:${loginId}`;
  const existing = await kv.get(accountKey, 'json');

  if (action === 'register') {
    if (existing) return json({ error: 'このログインIDはすでに使われています。' }, { status: 409 });
    const account = {
      loginId,
      displayName: safeDisplayName(body.displayName, loginId),
      ...(await makePasswordRecord(context.env, loginId, password)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await kv.put(accountKey, JSON.stringify(account));
    const session = await createSession(kv, account);
    return json({ ok: true, account: { loginId: account.loginId, displayName: account.displayName }, ...session });
  }

  if (action === 'login') {
    if (!existing) return json({ error: 'ログインIDまたはパスワードが違います。' }, { status: 401 });
    const verified = await verifyPassword(context.env, loginId, password, existing);
    if (!verified.ok) return json({ error: 'ログインIDまたはパスワードが違います。' }, { status: 401 });

    // 旧SHA-256形式のアカウントは、ログイン成功時にPBKDF2形式へ自動更新する。
    if (verified.legacy) {
      const upgraded = {
        ...existing,
        ...(await makePasswordRecord(context.env, loginId, password)),
        passwordHash: undefined,
        updatedAt: new Date().toISOString(),
      };
      delete upgraded.passwordHash;
      await kv.put(accountKey, JSON.stringify(upgraded));
      existing.passwordVersion = upgraded.passwordVersion;
      existing.passwordSalt = upgraded.passwordSalt;
      existing.passwordHashV2 = upgraded.passwordHashV2;
      existing.passwordIterations = upgraded.passwordIterations;
      existing.updatedAt = upgraded.updatedAt;
    }

    const session = await createSession(kv, existing);
    return json({ ok: true, account: { loginId: existing.loginId, displayName: existing.displayName }, ...session });
  }

  return json({ error: 'unknown action' }, { status: 400 });
}
export async function onRequestGet(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return json({ authenticated: false, error: 'ME2_PROGRESS KV binding is not configured' }, { status: 200 });
  const loginId = safeLoginId(context.request.headers.get('X-ME2-Login-Id') || context.request.headers.get('x-me2-login-id'));
  const token = context.request.headers.get('X-ME2-Session-Token') || context.request.headers.get('x-me2-session-token') || '';
  if (!loginId || !token) return json({ authenticated: false });
  const session = await kv.get(`session:${await sha256Hex(token)}`, 'json');
  if (!session || session.loginId !== loginId) return json({ authenticated: false });
  return json({ authenticated: true, account: { loginId: session.loginId, displayName: session.displayName } });
}
