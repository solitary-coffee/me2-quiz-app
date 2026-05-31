function decodeJwtPayload(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch (_) { return {}; }
}
function getEmail(request) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('CF-Access-Jwt-Assertion') || '';
  const payload = decodeJwtPayload(jwt);
  return request.headers.get('Cf-Access-Authenticated-User-Email')
    || request.headers.get('CF-Access-Authenticated-User-Email')
    || payload.email
    || payload.sub
    || null;
}
function safeId(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80); }
function key(email, type, examId, part) { return `${safeId(email)}:${safeId(type)}:${safeId(examId)}:${safeId(part)}`; }
async function bodyJson(request) { try { return await request.json(); } catch (_) { return {}; } }
function requireAuthAndKv(context) {
  const email = getEmail(context.request);
  if (!email) return { error: Response.json({ error: 'login required' }, { status: 401 }) };
  if (!context.env.ME2_PROGRESS) return { error: Response.json({ error: 'ME2_PROGRESS KV binding is not configured' }, { status: 500 }) };
  return { email, kv: context.env.ME2_PROGRESS };
}
export async function onRequestGet(context) {
  const checked = requireAuthAndKv(context); if (checked.error) return checked.error;
  const { email, kv } = checked;
  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'state';
  const examId = url.searchParams.get('examId') || '';
  const part = url.searchParams.get('part') || '';
  if (!examId || !part) return Response.json({ ok: true, authenticated: true, cloudSave: true });
  const data = await kv.get(key(email, type, examId, part), 'json');
  return Response.json({ ok: true, data });
}
export async function onRequestPost(context) {
  const checked = requireAuthAndKv(context); if (checked.error) return checked.error;
  const { email, kv } = checked;
  const body = await bodyJson(context.request);
  if (!body.type || !body.examId || !body.part) return Response.json({ error: 'type, examId, part are required' }, { status: 400 });
  await kv.put(key(email, body.type, body.examId, body.part), JSON.stringify(body.data ?? null));
  return Response.json({ ok: true });
}
export async function onRequestDelete(context) {
  const checked = requireAuthAndKv(context); if (checked.error) return checked.error;
  const { email, kv } = checked;
  const body = await bodyJson(context.request);
  if (!body.type || !body.examId || !body.part) return Response.json({ error: 'type, examId, part are required' }, { status: 400 });
  await kv.delete(key(email, body.type, body.examId, body.part));
  return Response.json({ ok: true });
}
