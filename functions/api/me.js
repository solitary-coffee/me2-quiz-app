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

export async function onRequestGet(context) {
  const { request } = context;
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
    guest = {
      authenticated: true,
      id: guestId,
      name: guestName || 'ゲスト',
      tokenFingerprint: (await sha256Hex(`${guestId}:${guestToken}`)).slice(0, 12),
    };
  }

  return Response.json({
    authenticated: Boolean(guest || email),
    accountType: guest ? 'guest' : (email ? 'access' : 'none'),
    accountLabel: guest ? `${guest.name}（ゲスト）` : (email || null),
    guest,
    access: {
      authenticated: Boolean(email),
      email,
      name: payload.name || payload.given_name || null,
      sub: payload.sub || null,
      aud: payload.aud || null,
    },
    // Backward compatible fields
    email,
    name: payload.name || payload.given_name || null,
  }, { headers: { 'cache-control': 'no-store' } });
}
