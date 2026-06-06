const SESSION_TTL_SECONDS = 60 * 60 * 12;
const GITHUB_API_VERSION = '2022-11-28';

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

async function bodyJson(request) {
  try { return await request.json(); } catch (_) { return {}; }
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(digest);
}

async function sessionKey(token) {
  return `devsession:${await sha256Hex(token)}`;
}

async function verifyDevSession(context) {
  const kv = context.env.ME2_PROGRESS;
  if (!kv) return { ok: false, error: 'ME2_PROGRESS KV binding が未設定です。' };

  const token = context.request.headers.get('X-ME2-Dev-Session') || '';
  if (!token) return { ok: false, error: '開発者ログインが必要です。' };

  const session = await kv.get(await sessionKey(token), 'json');
  if (!session) return { ok: false, error: '開発者セッションが無効または期限切れです。再ログインしてください。' };

  return { ok: true, session };
}

function requireEnv(env) {
  const missing = [];
  for (const name of ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO']) {
    if (!env[name]) missing.push(name);
  }
  if (missing.length) {
    throw new Error(`GitHub PR作成に必要な環境変数が未設定です：${missing.join(', ')}`);
  }
}

function cleanBranchPart(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'update';
}

function githubPath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function normalizeRepoPath(path) {
  const p = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!p || p.includes('..')) throw new Error(`不正なパスです：${path}`);
  if (!p.startsWith('Date/Ques/') && !p.startsWith('Date/img/')) {
    throw new Error(`PR送信できるのは Date/Ques/ または Date/img/ のみです：${p}`);
  }
  return p;
}

function withRoot(env, path) {
  const root = String(env.GITHUB_ROOT || '').replace(/^\/+/, '').replace(/\/+$/,'');
  const p = normalizeRepoPath(path);
  return root ? `${root}/${p}` : p;
}

function base64FromUtf8(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function cleanBase64(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/^data:[^;,]+;base64,(.+)$/);
  return (m ? m[1] : raw).replace(/\s+/g, '');
}

async function gh(context, method, path, body = null) {
  const env = context.env || {};
  const url = `https://api.github.com${path}`;
  const headers = {
    'accept': 'application/vnd.github+json',
    'authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'x-github-api-version': GITHUB_API_VERSION,
    'user-agent': 'me2-quiz-app-cloudflare-pr'
  };
  const init = { method, headers };
  if (body) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const r = await fetch(url, init);
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.message || data?.error || text || `GitHub API ${r.status}`;
    throw new Error(`${method} ${path} failed: ${msg}`);
  }
  return data;
}

async function getBaseSha(context, owner, repo, base) {
  const ref = await gh(context, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(base)}`);
  return ref?.object?.sha;
}

async function createBranch(context, owner, repo, base, title) {
  const baseSha = await getBaseSha(context, owner, repo, base);
  if (!baseSha) throw new Error(`baseブランチ ${base} のSHAを取得できませんでした。`);

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = crypto.randomUUID().slice(0, 8);
  const branch = `me2/dev-${stamp}-${cleanBranchPart(title)}-${rand}`.slice(0, 120);

  await gh(context, 'POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha
  });

  return branch;
}

async function getExistingSha(context, owner, repo, path, branch) {
  try {
    const data = await gh(context, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubPath(path)}?ref=${encodeURIComponent(branch)}`);
    return data?.sha || null;
  } catch (e) {
    if (String(e.message || '').includes('404')) return null;
    if (String(e.message || '').includes('Not Found')) return null;
    return null;
  }
}

async function putFile(context, owner, repo, branch, file, committer) {
  const path = withRoot(context.env || {}, file.path);
  const encoding = String(file.encoding || 'utf-8').toLowerCase();
  let content = '';

  if (encoding === 'base64') {
    content = cleanBase64(file.contentBase64 || file.content || '');
  } else {
    content = base64FromUtf8(file.content || '');
  }

  if (!content) throw new Error(`ファイル内容が空です：${path}`);

  const sha = await getExistingSha(context, owner, repo, path, branch);
  const body = {
    message: String(file.message || `Update ${path}`).slice(0, 160),
    content,
    branch
  };
  if (sha) body.sha = sha;
  if (committer.name && committer.email) {
    body.committer = committer;
    body.author = committer;
  }

  const result = await gh(context, 'PUT', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubPath(path)}`, body);
  return { path, sha: result?.content?.sha || null, commitSha: result?.commit?.sha || null };
}

function cleanFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new Error('送信ファイルがありません。');
  if (files.length > 8) throw new Error('一度に送信できるファイルは8個までです。');
  return files.map(f => ({
    path: normalizeRepoPath(f.path),
    encoding: String(f.encoding || 'utf-8'),
    content: f.content,
    contentBase64: f.contentBase64,
    message: f.message
  }));
}

async function handlePost(context) {
  const verified = await verifyDevSession(context);
  if (!verified.ok) return json({ error: verified.error }, { status: 401 });

  const env = context.env || {};
  requireEnv(env);

  const body = await bodyJson(context.request);
  const title = String(body.title || '').trim().slice(0, 160);
  const prBody = String(body.body || '').trim().slice(0, 6000);
  const files = cleanFiles(body.files);
  const draft = body.draft !== false;

  if (!title) return json({ error: 'PRタイトルが空です。' }, { status: 400 });

  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const base = env.GITHUB_BRANCH || 'main';
  const committer = {
    name: env.GITHUB_COMMITTER_NAME || 'ME2 Quiz App',
    email: env.GITHUB_COMMITTER_EMAIL || 'actions@users.noreply.github.com'
  };

  const branch = await createBranch(context, owner, repo, base, title);
  const committed = [];
  for (const file of files) {
    committed.push(await putFile(context, owner, repo, branch, file, committer));
  }

  const pull = await gh(context, 'POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, {
    title,
    head: branch,
    base,
    body: prBody || `ME2アプリの開発モードから作成されたPull Requestです。`,
    draft,
    maintainer_can_modify: true
  });

  return json({
    ok: true,
    branch,
    base,
    files: committed,
    pullRequestNumber: pull.number,
    pullRequestUrl: pull.html_url,
    apiUrl: pull.url
  });
}

async function route(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'POST') return handlePost(context);
  if (method === 'OPTIONS') return json({ ok: true });
  return json({ error: `Method ${method} is not allowed for /api/github-pr` }, { status: 405 });
}

export async function onRequest(context) {
  try { return await route(context); }
  catch (e) { return json({ error: e && e.message ? e.message : String(e) }, { status: 500 }); }
}
export async function onRequestPost(context) {
  try { return await handlePost(context); }
  catch (e) { return json({ error: e && e.message ? e.message : String(e) }, { status: 500 }); }
}
