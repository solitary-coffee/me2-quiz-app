const ALLOWED_PREFIX = ['Date/Ques/', 'Date/img/'];
const CONTENT_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
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

async function fetchLocalAsset(request, path) {
  // GitHub環境変数が未設定でも、Pagesに同梱された Date/Ques / Date/img を返します。
  // これにより、/api/github?path=... を使ったままでもローカル同梱ファイルへ自動フォールバックできます。
  const localUrl = new URL('/' + path, request.url);
  const res = await fetch(localUrl.toString(), { cf: { cacheTtl: path.endsWith('.json') ? 60 : 86400, cacheEverything: true } });
  if (!res.ok) return null;
  return new Response(res.body, {
    status: 200,
    headers: {
      'content-type': CONTENT_TYPES[ext(path)] || res.headers.get('content-type') || 'application/octet-stream',
      'cache-control': path.endsWith('.json') ? 'no-store' : 'public, max-age=86400',
      'x-me2-source': 'local-fallback',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = sanitizePath(url.searchParams.get('path'));
  if (!path) return Response.json({ error: 'invalid path' }, { status: 400 });
  const target = rawUrl(env, path);
  if (!target) { const local = await fetchLocalAsset(request, path); if (local) return local; return Response.json({ error: 'GITHUB_OWNER / GITHUB_REPO is not configured and local asset was not found', path }, { status: 500 }); }
  const headers = { 'user-agent': 'me2-quiz-cloudflare-pages' };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const upstream = await fetch(target, { headers, cf: { cacheTtl: path.endsWith('.json') ? 60 : 86400, cacheEverything: true } });
  if (!upstream.ok) { const local = await fetchLocalAsset(request, path); if (local) return local; return Response.json({ error: 'github fetch failed and local fallback failed', status: upstream.status, path }, { status: upstream.status }); }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': CONTENT_TYPES[ext(path)] || upstream.headers.get('content-type') || 'application/octet-stream',
      'cache-control': path.endsWith('.json') ? 'no-store' : 'public, max-age=86400',
    },
  });
}
