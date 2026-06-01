const MIN_PASSWORD_LENGTH = 8;

function safeLoginId(v) {
  const id = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(id)) return null;
  return id;
}
function safeDisplayName(v, fallback) {
  return String(v || fallback || '').trim().slice(0, 40) || fallback;
}
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
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(digest);
}
async function bodyJson(request) {
  try { return await request.json(); } catch (_) { return {}; }
}
function passwordPepper(env) {
  return env.ME2_AUTH_PEPPER || env.AUTH_PEPPER || 'me2-default-pepper-change-me';
}
function validPassword(password) {
  const p = String(password || '');
  return p.length >= MIN_PASSWORD_LENGTH && p.length <= 128;
}
async function saltedPasswordHash(env, loginId, password, salt) {
  // Cloudflare Pages/Workers 環境差でPBKDF2が500になることがあるため、
  // HMAC-SHA-256を優先し、失敗時はSHA-256へフォールバックする。
  const enc = new TextEncoder();
  const message = enc.encode(`${loginId}:${salt}:${String(password || '')}`);
  const keyText = `${passwordPepper(env)}:${salt}:${loginId}`;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(keyText),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, message);
    return { method: 'hmac-sha256-v1', hash: bytesToHex(sig) };
  } catch (e) {
    return { method: 'salted-sha256-v1', hash: await sha256Hex(`${keyText}:${String(password || '')}`) };
  }
}
async function legacyPasswordHash(env, loginId, password) {
  return sha256Hex(`${loginId}:${String(password || '')}:${passwordPepper(env)}`);
}
async function makePasswordRecord(env, loginId, password) {
  const salt = randomHex(16);
  const result = await saltedPasswordHash(env, loginId, password, salt);
  return {
    passwordVersion: 3,
    passwordMethod: result.method,
    passwordSalt: salt,
    passwordHashV3: result.hash,
    updatedAt: new Date().toISOString(),
  };
}
async function verifyPassword(env, loginId, password, account) {
  if (account?.passwordVersion === 3 && account.passwordSalt && account.passwordHashV3) {
    const result = await saltedPasswordHash(env, loginId, password, account.passwordSalt);
    return { ok: result.hash === account.passwordHashV3, legacy: false };
  }

  // v1.8.0で作成されたPBKDF2形式が存在する場合は、対応環境では検証する。
  // 対応していない環境でも500にせず、通常の認証失敗として扱う。
  if (account?.passwordVersion === 2 && account.passwordSalt && account.passwordHashV2) {
    try {
      const enc = new TextEncoder();
      const material = await crypto.subtle.importKey(
        'raw',
        enc.encode(`${loginId}:${String(password || '')}:${passwordPepper(env)}`),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const saltBytes = new Uint8Array(account.passwordSalt.match(/.{1,2}/g).map(x => parseInt(x, 16)));
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: account.passwordIterations || 120000 },
        material,
        256
      );
      return { ok: bytesToHex(bits) === account.passwordHashV2, legacy: true };
    } catch (_) {
      return { ok: false, legacy: false };
    }
  }

  // 旧SHA-256形式
  if (account?.passwordHash) {
    const h = await legacyPasswordHash(env, loginId, password);
    return { ok: h === account.passwordHash, legacy: true };
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
async function handlePost(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return json({ error: 'ME2_PROGRESS KV binding が未設定です。Cloudflare Pages の設定で KV を紐付けてください。' }, { status: 503 });

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
    const passRecord = await makePasswordRecord(context.env, loginId, password);
    const account = {
      loginId,
      displayName: safeDisplayName(body.displayName, loginId),
      ...passRecord,
      createdAt: new Date().toISOString(),
    };
    await kv.put(accountKey, JSON.stringify(account));
    const session = await createSession(kv, account);
    return json({ ok: true, account: { loginId: account.loginId, displayName: account.displayName }, ...session });
  }

  if (action === 'login') {
    if (!existing) return json({ error: 'ログインIDまたはパスワードが違います。' }, { status: 401 });
    const verified = await verifyPassword(context.env, loginId, password, existing);
    if (!verified.ok) return json({ error: 'ログインIDまたはパスワードが違います。' }, { status: 401 });

    // 旧形式はログイン成功時にv3へ自動更新
    if (verified.legacy || existing.passwordVersion !== 3) {
      const upgraded = {
        ...existing,
        ...(await makePasswordRecord(context.env, loginId, password)),
      };
      delete upgraded.passwordHash;
      delete upgraded.passwordHashV2;
      delete upgraded.passwordIterations;
      await kv.put(accountKey, JSON.stringify(upgraded));
      existing.passwordVersion = upgraded.passwordVersion;
      existing.passwordMethod = upgraded.passwordMethod;
      existing.passwordSalt = upgraded.passwordSalt;
      existing.passwordHashV3 = upgraded.passwordHashV3;
      existing.updatedAt = upgraded.updatedAt;
    }

    const session = await createSession(kv, existing);
    return json({ ok: true, account: { loginId: existing.loginId, displayName: existing.displayName }, ...session });
  }

  return json({ error: 'unknown action' }, { status: 400 });
}
async function handleGet(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return json({ authenticated: false, error: 'ME2_PROGRESS KV binding が未設定です。' }, { status: 200 });
  const loginId = safeLoginId(context.request.headers.get('X-ME2-Login-Id') || context.request.headers.get('x-me2-login-id'));
  const token = context.request.headers.get('X-ME2-Session-Token') || context.request.headers.get('x-me2-session-token') || '';
  if (!loginId || !token) return json({ authenticated: false });
  const session = await kv.get(`session:${await sha256Hex(token)}`, 'json');
  if (!session || session.loginId !== loginId) return json({ authenticated: false });
  return json({ authenticated: true, account: { loginId: session.loginId, displayName: session.displayName } });
}
export async function onRequestPost(context) {
  try {
    return await handlePost(context);
  } catch (e) {
    return json({ error: `認証APIでエラーが発生しました: ${e && e.message ? e.message : String(e)}` }, { status: 500 });
  }
}
export async function onRequestGet(context) {
  try {
    return await handleGet(context);
  } catch (e) {
    return json({ authenticated: false, error: `認証APIでエラーが発生しました: ${e && e.message ? e.message : String(e)}` }, { status: 200 });
  }
}
