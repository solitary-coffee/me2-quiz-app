function decodeJwtPayload(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch (_) { return {}; }
}
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeLoginId(v) {
  const id = String(v || '').trim().toLowerCase();
  return /^[a-z0-9_-]{3,32}$/.test(id) ? id : null;
}
async function getSiteAccount(request, kv) {
  const loginId = safeLoginId(request.headers.get('X-ME2-Login-Id') || request.headers.get('x-me2-login-id'));
  const token = request.headers.get('X-ME2-Session-Token') || request.headers.get('x-me2-session-token') || '';
  if (!loginId || !token || !kv) return null;
  const session = await kv.get(`session:${await sha256Hex(token)}`, 'json');
  if (!session || session.loginId !== loginId) return null;
  return { authenticated: true, loginId, displayName: session.displayName || loginId };
}
export async function onRequestGet(context) {
  const { request } = context;
  const site = await getSiteAccount(request, context.env.ME2_PROGRESS);

  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('CF-Access-Jwt-Assertion') || '';
  const payload = decodeJwtPayload(jwt);
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')
    || request.headers.get('CF-Access-Authenticated-User-Email')
    || payload.email
    || payload.sub
    || null;

  const guestId = request.headers.get('X-ME2-Guest-Id') || request.headers.get('x-me2-guest-id') || '';
  const guestToken = request.headers.get('X-ME2-Guest-Token') || request.headers.get('x-me2-guest-token') || '';
  const guestName = request.headers.get('X-ME2-Guest-Name') || request.headers.get('x-me2-guest-name') || '';
  let guest = null;
  if (guestId && guestToken && guestId.length >= 8 && guestToken.length >= 10) {
    guest = { authenticated: true, id: guestId, name: guestName || 'ゲスト', tokenFingerprint: (await sha256Hex(`${guestId}:${guestToken}`)).slice(0, 12) };
  }

  const accountType = site ? 'site' : (guest ? 'guest' : (email ? 'access' : 'none'));
  const accountLabel = site ? `${site.displayName}（サイト）` : (guest ? `${guest.name}（ゲスト）` : (email || null));
  return Response.json({
    authenticated: Boolean(site || guest || email),
    accountType,
    accountLabel,
    site,
    guest,
    access: { authenticated: Boolean(email), email, name: payload.name || payload.given_name || null, sub: payload.sub || null, aud: payload.aud || null },
    email,
    name: payload.name || payload.given_name || null,
    kvConfigured: Boolean(context.env.ME2_PROGRESS),
  }, { headers: { 'cache-control': 'no-store' } });
}
