function decodeJwtPayload(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch (_) {
    return {};
  }
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

  return Response.json({
    authenticated: Boolean(email),
    email,
    name: payload.name || payload.given_name || null,
    sub: payload.sub || null,
    aud: payload.aud || null,
  }, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
