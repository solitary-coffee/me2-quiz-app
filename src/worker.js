const ALLOWED_PREFIX = ['Date/Ques/', 'Date/img/'];
const CONTENT_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'
};
function ext(path) { const m = path.toLowerCase().match(/\.[a-z0-9]+$/); return m ? m[0] : ''; }
function sanitizePath(path) {
  const p = String(path || '').replace(/^\/+/, '');
  if (!p || p.includes('..') || p.includes('\\')) return null;
  if (!ALLOWED_PREFIX.some(prefix => p.startsWith(prefix))) return null;
  return p;
}
function rawUrl(env, path) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const root = (env.GITHUB_ROOT || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!owner || !repo) return null;
  const full = `${root ? root + '/' : ''}${path}`;
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${full.split('/').map(encodeURIComponent).join('/')}`;
}
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
    || payload.email || payload.sub || null;
}
function safeId(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80); }
function kvKey(email, type, examId, part) { return `${safeId(email)}:${safeId(type)}:${safeId(examId)}:${safeId(part)}`; }
async function bodyJson(request) { try { return await request.json(); } catch (_) { return {}; } }
function responseJson(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) }
  });
}
async function handleMe(request) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('CF-Access-Jwt-Assertion') || '';
  const payload = decodeJwtPayload(jwt);
  const email = getEmail(request);
  return responseJson({ authenticated: Boolean(email), email, name: payload.name || payload.given_name || null, sub: payload.sub || null, aud: payload.aud || null });
}
async function handleGithub(request, env) {
  if (request.method !== 'GET') return responseJson({ error: 'method not allowed' }, { status: 405 });
  const url = new URL(request.url);
  const path = sanitizePath(url.searchParams.get('path'));
  if (!path) return responseJson({ error: 'invalid path' }, { status: 400 });
  const target = rawUrl(env, path);
  if (!target) return responseJson({ error: 'GITHUB_OWNER / GITHUB_REPO is not configured' }, { status: 500 });
  const headers = { 'user-agent': 'me2-quiz-cloudflare-workers' };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const upstream = await fetch(target, { headers, cf: { cacheTtl: path.endsWith('.json') ? 60 : 86400, cacheEverything: true } });
  if (!upstream.ok) return responseJson({ error: 'github fetch failed', status: upstream.status, path }, { status: upstream.status });
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': CONTENT_TYPES[ext(path)] || upstream.headers.get('content-type') || 'application/octet-stream',
      'cache-control': path.endsWith('.json') ? 'no-store' : 'public, max-age=86400'
    }
  });
}
async function handleProgress(request, env) {
  const email = getEmail(request);
  if (!email) return responseJson({ error: 'login required' }, { status: 401 });
  if (!env.ME2_PROGRESS) return responseJson({ error: 'ME2_PROGRESS KV binding is not configured' }, { status: 500 });
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const type = url.searchParams.get('type') || 'state';
    const examId = url.searchParams.get('examId') || '';
    const part = url.searchParams.get('part') || '';
    if (!examId || !part) return responseJson({ ok: true, authenticated: true, cloudSave: true });
    const data = await env.ME2_PROGRESS.get(kvKey(email, type, examId, part), 'json');
    return responseJson({ ok: true, data });
  }
  if (request.method === 'POST') {
    const body = await bodyJson(request);
    if (!body.type || !body.examId || !body.part) return responseJson({ error: 'type, examId, part are required' }, { status: 400 });
    await env.ME2_PROGRESS.put(kvKey(email, body.type, body.examId, body.part), JSON.stringify(body.data ?? null));
    return responseJson({ ok: true });
  }
  if (request.method === 'DELETE') {
    const body = await bodyJson(request);
    if (!body.type || !body.examId || !body.part) return responseJson({ error: 'type, examId, part are required' }, { status: 400 });
    await env.ME2_PROGRESS.delete(kvKey(email, body.type, body.examId, body.part));
    return responseJson({ ok: true });
  }
  return responseJson({ error: 'method not allowed' }, { status: 405 });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/me') return handleMe(request);
    if (url.pathname === '/api/github') return handleGithub(request, env);
    if (url.pathname === '/api/progress') return handleProgress(request, env);
    return env.ASSETS.fetch(request);
  }
};
