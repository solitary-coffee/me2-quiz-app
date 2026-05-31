function decodeJwtPayload(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch (_) { return {}; }
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
function key(account, type, examId, part) {
  return `${account.id}:${safeId(type)}:${safeId(examId)}:${safeId(part)}`;
}
async function bodyJson(request) { try { return await request.json(); } catch (_) { return {}; } }
async function requireAccountAndKv(context) {
  if (!context.env.ME2_PROGRESS) return { error: Response.json({ error: 'ME2_PROGRESS KV binding is not configured' }, { status: 500 }) };
  const kv = context.env.ME2_PROGRESS;
  const account = await getAccount(context.request, kv);
  if (!account) return { error: Response.json({ error: 'site login, guest login, or Cloudflare Access login required' }, { status: 401 }) };
  return { account, kv };
}
function publicAccount(account) {
  return { type: account.type, label: account.label, loginId: account.loginId || null, displayName: account.displayName || null, publicId: account.publicId || null, email: account.email || null };
}
export async function onRequestGet(context) {
  const checked = await requireAccountAndKv(context); if (checked.error) return checked.error;
  const { account, kv } = checked;
  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'state';
  const examId = url.searchParams.get('examId') || '';
  const part = url.searchParams.get('part') || '';
  if (!examId || !part) return Response.json({ ok: true, authenticated: true, cloudSave: true, account: publicAccount(account) });
  const data = await kv.get(key(account, type, examId, part), 'json');
  return Response.json({ ok: true, data, account: publicAccount(account) });
}
export async function onRequestPost(context) {
  const checked = await requireAccountAndKv(context); if (checked.error) return checked.error;
  const { account, kv } = checked;
  const body = await bodyJson(context.request);
  if (!body.type || !body.examId || !body.part) return Response.json({ error: 'type, examId, part are required' }, { status: 400 });
  const value = { savedAt: new Date().toISOString(), accountType: account.type, data: body.data ?? null };
  await kv.put(key(account, body.type, body.examId, body.part), JSON.stringify(value));
  return Response.json({ ok: true, account: publicAccount(account) });
}
export async function onRequestDelete(context) {
  const checked = await requireAccountAndKv(context); if (checked.error) return checked.error;
  const { account, kv } = checked;
  const body = await bodyJson(context.request);
  if (!body.type || !body.examId || !body.part) return Response.json({ error: 'type, examId, part are required' }, { status: 400 });
  await kv.delete(key(account, body.type, body.examId, body.part));
  return Response.json({ ok: true });
}
