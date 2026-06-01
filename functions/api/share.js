
function decodeJwtPayload(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch (_) { return {}; }
}
function safeId(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100); }
function safeLoginId(v) {
  const id = String(v || '').trim().toLowerCase();
  return /^[a-z0-9_-]{3,32}$/.test(id) ? id : null;
}
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function getAccessEmail(request) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('CF-Access-Jwt-Assertion') || '';
  const payload = decodeJwtPayload(jwt);
  return request.headers.get('Cf-Access-Authenticated-User-Email')
    || request.headers.get('CF-Access-Authenticated-User-Email')
    || payload.email
    || payload.sub
    || null;
}
async function getSiteAccount(request, kv) {
  const loginId = safeLoginId(request.headers.get('X-ME2-Login-Id') || request.headers.get('x-me2-login-id'));
  const token = request.headers.get('X-ME2-Session-Token') || request.headers.get('x-me2-session-token') || '';
  if (!loginId || !token) return null;
  const session = await kv.get(`session:${await sha256Hex(token)}`, 'json');
  if (!session || session.loginId !== loginId) return null;
  return { type: 'site', id: `site:${safeId(loginId)}`, label: session.displayName || loginId, loginId, displayName: session.displayName || loginId };
}
async function getAccount(request, kv) {
  const site = await getSiteAccount(request, kv);
  if (site) return site;
  const guestId = request.headers.get('X-ME2-Guest-Id') || request.headers.get('x-me2-guest-id') || '';
  const guestToken = request.headers.get('X-ME2-Guest-Token') || request.headers.get('x-me2-guest-token') || '';
  const guestName = request.headers.get('X-ME2-Guest-Name') || request.headers.get('x-me2-guest-name') || '';
  if (guestId && guestToken && guestId.length >= 8 && guestToken.length >= 10) {
    const hash = await sha256Hex(`${guestId}:${guestToken}`);
    return { type: 'guest', id: `guest:${safeId(guestId)}:${hash.slice(0, 40)}`, label: guestName || guestId, publicId: guestId };
  }
  const email = getAccessEmail(request);
  if (email) return { type: 'access', id: `access:${safeId(email)}`, email, label: email };
  return null;
}
function publicAccount(account) {
  if (!account) return null;
  return { type: account.type, label: account.label, loginId: account.loginId || null, displayName: account.displayName || null, publicId: account.publicId || null, email: account.email || null };
}
async function bodyJson(request) { try { return await request.json(); } catch (_) { return {}; } }
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return [...a].map(x => alphabet[x % alphabet.length]).join('');
}
function safeCode(v) {
  const code = String(v || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  return code.length >= 6 ? code : null;
}
function trimPayload(data) {
  const src = data && typeof data === 'object' ? data : {};
  const out = { schemaVersion: 2, createdAt: src.createdAt || new Date().toISOString(), states: [], histories: [] };
  if (Array.isArray(src.states)) {
    out.states = src.states.slice(0, 200).map(x => ({ examId: x.examId || x.data?.examId, part: x.part || x.data?.part, data: x.data || x })).filter(x => x.examId && x.part && x.data);
  }
  if (Array.isArray(src.histories)) {
    out.histories = src.histories.slice(0, 200).map(x => ({ examId: x.examId, part: x.part, data: Array.isArray(x.data) ? x.data.slice(0, 500) : [] })).filter(x => x.examId && x.part);
  }
  return out;
}
export async function onRequestPost(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return Response.json({ error: 'ME2_PROGRESS KV binding is not configured' }, { status: 500 });
  const account = await getAccount(context.request, kv);
  if (!account) return Response.json({ error: 'login required to create share link' }, { status: 401 });
  const body = await bodyJson(context.request);
  const payload = trimPayload(body.data);
  const total = payload.states.length + payload.histories.reduce((a, h) => a + (h.data?.length || 0), 0);
  if (!total) return Response.json({ error: 'share data is empty' }, { status: 400 });
  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const exists = await kv.get(`share:${code}`);
    if (!exists) break;
    code = randomCode();
  }
  const now = new Date();
  const ttl = 60 * 60 * 24 * 90;
  const item = {
    code,
    title: String(body.title || 'ME2種 進行データ共有').slice(0, 80),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    createdBy: publicAccount(account),
    data: payload,
  };
  await kv.put(`share:${code}`, JSON.stringify(item), { expirationTtl: ttl });
  const url = new URL(context.request.url);
  return Response.json({ ok: true, code, url: `${url.origin}/?share=${encodeURIComponent(code)}`, expiresAt: item.expiresAt });
}
export async function onRequestGet(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return Response.json({ error: 'ME2_PROGRESS KV binding is not configured' }, { status: 500 });
  const url = new URL(context.request.url);
  const code = safeCode(url.searchParams.get('code') || url.searchParams.get('share'));
  if (!code) return Response.json({ error: 'valid share code is required' }, { status: 400 });
  const item = await kv.get(`share:${code}`, 'json');
  if (!item) return Response.json({ error: 'share data not found or expired' }, { status: 404 });
  return Response.json({ ok: true, code, title: item.title, createdAt: item.createdAt, expiresAt: item.expiresAt, createdBy: item.createdBy, data: item.data }, { headers: { 'cache-control': 'no-store' } });
}
