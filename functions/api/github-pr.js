const GITHUB_API_VERSION = '2022-11-28';
const PR_MARKER = '<!-- ME2_QUESTION_EDIT_PR -->';

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
    throw new Error(`GitHub PR作成に必要なCloudflare環境変数が未設定です：${missing.join(', ')}。Cloudflare PagesのVariables and Secretsを確認してください。`);
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

function utf8FromBase64(b64) {
  const binary = atob(String(b64 || '').replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function cleanBase64(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/^data:[^;,]+;base64,(.+)$/);
  return (m ? m[1] : raw).replace(/\s+/g, '');
}

function explainGitHubError(context, method, path, message) {
  const env = context.env || {};
  const repo = `${env.GITHUB_OWNER || '(GITHUB_OWNER未設定)'}/${env.GITHUB_REPO || '(GITHUB_REPO未設定)'}`;
  const base = env.GITHUB_BRANCH || 'main';
  const raw = String(message || '');

  if (raw.includes('Resource not accessible by personal access token')) {
    return [
      'GitHubトークンの権限不足でPR作成用ブランチを作成できませんでした。',
      '',
      `失敗箇所：${method} ${path}`,
      `対象リポジトリ：${repo}`,
      `baseブランチ：${base}`,
      '',
      'Cloudflareの GITHUB_TOKEN に設定している Fine-grained personal access token を確認してください。',
      '',
      '必要な設定：',
      '1. Resource owner が対象リポジトリの所有者と一致している',
      `2. Repository access で ${repo} が選択されている`,
      '3. Repository permissions の Contents が Read and write',
      '4. Repository permissions の Pull requests が Read and write',
      '5. Organizationリポジトリの場合、作成したトークンがOrganization側で承認されている',
      '',
      '修正後は、Cloudflare Pages の GITHUB_TOKEN を新しいトークンに差し替えて再デプロイしてください。',
      '',
      `GitHub APIからの元メッセージ：${raw}`
    ].join('\n');
  }

  if (raw.includes('Bad credentials')) {
    return [
      'GitHubトークンが無効です。',
      'Cloudflare Pages の Secret「GITHUB_TOKEN」が正しいか、期限切れではないか確認してください。',
      `GitHub APIからの元メッセージ：${raw}`
    ].join('\n');
  }

  if (raw.includes('Not Found')) {
    return [
      'GitHubリポジトリを取得できませんでした。',
      `対象：${repo}`,
      'GITHUB_OWNER / GITHUB_REPO の値、またはトークンのRepository accessを確認してください。',
      `GitHub APIからの元メッセージ：${raw}`
    ].join('\n');
  }

  return `${method} ${path} failed: ${raw}`;
}

async function gh(context, method, path, body = null) {
  const env = context.env || {};
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
  const r = await fetch(`https://api.github.com${path}`, init);
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.message || data?.error || text || `GitHub API ${r.status}`;
    throw new Error(explainGitHubError(context, method, path, msg));
  }
  return data;
}

async function validateGitHubAccess(context, owner, repo, base) {
  await gh(context, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  await gh(context, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(base)}`);
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
  const prefix = String(context.env.GITHUB_PR_BRANCH_PREFIX || 'me2/dev-batch').replace(/^\/+|\/+$/g, '') || 'me2/dev-batch';
  const branch = `${prefix}-${stamp}-${cleanBranchPart(title)}-${rand}`.slice(0, 120);

  await gh(context, 'POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha
  });

  return branch;
}

async function getContent(context, owner, repo, path, branch) {
  return await gh(context, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubPath(path)}?ref=${encodeURIComponent(branch)}`);
}

async function getExistingSha(context, owner, repo, path, branch) {
  try {
    const data = await getContent(context, owner, repo, path, branch);
    return data?.sha || null;
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('404') || msg.includes('Not Found')) return null;
    return null;
  }
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  if (files.length > 20) throw new Error('一度に送信できる画像ファイルは20個までです。');
  return files.map(f => ({
    path: normalizeRepoPath(f.path),
    encoding: String(f.encoding || 'utf-8'),
    content: f.content,
    contentBase64: f.contentBase64,
    message: f.message
  }));
}

function normalizeJsonUpdates(jsonUpdates) {
  if (!Array.isArray(jsonUpdates)) return [];
  if (jsonUpdates.length > 30) throw new Error('一度に送信できるJSON更新は30件までです。');
  return jsonUpdates.map(group => ({
    path: normalizeRepoPath(group.path),
    examId: group.examId,
    part: group.part,
    title: group.title,
    updates: Array.isArray(group.updates) ? group.updates.map(u => ({
      index: Number(u.index),
      number: u.number,
      question: u.question,
      label: String(u.label || ''),
      editSummary: String(u.editSummary || '編集'),
      commitMessage: String(u.commitMessage || '')
    })) : []
  })).filter(g => g.updates.length);
}

function compactCommitMessageFromUpdates(group) {
  const updates = group.updates || [];
  if (updates.length === 1) {
    const u = updates[0];
    return (u.commitMessage || `${u.label || group.title || group.path}：${u.editSummary || '編集'}`).slice(0, 160);
  }
  const first = updates[0];
  const label = first?.label ? `${first.label}ほか` : `${group.title || group.path} 複数問題`;
  return `${label}：複数問題編集`.slice(0, 160);
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

async function putJsonUpdateGroup(context, owner, repo, branch, group, committer) {
  const path = withRoot(context.env || {}, group.path);
  let current;
  try {
    current = await getContent(context, owner, repo, path, branch);
  } catch (e) {
    throw new Error(`${path} をGitHubから取得できませんでした。既存JSONを取得してから部分更新するため、対象ファイルが必要です。詳細：${e.message || e}`);
  }

  const raw = utf8FromBase64(current.content || '');
  let pack;
  try { pack = JSON.parse(raw); } catch (e) { throw new Error(`${path} のJSONを解析できませんでした。`); }
  if (!Array.isArray(pack.questions)) throw new Error(`${path} に questions 配列がありません。`);

  const touched = [];
  for (const update of group.updates) {
    let idx = Number.isInteger(update.index) && update.index >= 0 ? update.index : -1;
    if (idx < 0 || idx >= pack.questions.length) {
      idx = pack.questions.findIndex(q => String(q.number) === String(update.number));
    }
    if (idx < 0 || idx >= pack.questions.length) {
      throw new Error(`${path} の第${update.number || '?'}問を特定できませんでした。`);
    }
    pack.questions[idx] = update.question;
    touched.push({ index: idx, number: update.number || pack.questions[idx]?.number, label: update.label, editSummary: update.editSummary });
  }

  const body = {
    message: compactCommitMessageFromUpdates(group),
    content: base64FromUtf8(JSON.stringify(pack, null, 2)),
    branch,
    sha: current.sha
  };
  if (committer.name && committer.email) {
    body.committer = committer;
    body.author = committer;
  }

  const result = await gh(context, 'PUT', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubPath(path)}`, body);
  return { path, sha: result?.content?.sha || null, commitSha: result?.commit?.sha || null, touched };
}

async function findExistingEditPull(context, owner, repo, base) {
  const pulls = await gh(context, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`);
  const prefix = String(context.env.GITHUB_PR_BRANCH_PREFIX || 'me2/dev-batch').replace(/^\/+|\/+$/g, '') || 'me2/dev-batch';
  return (pulls || []).find(pr => {
    const ref = String(pr?.head?.ref || '');
    const title = String(pr?.title || '');
    const body = String(pr?.body || '');
    return ref.startsWith(`${prefix}-`) || title.includes('[ME2問題編集]') || body.includes(PR_MARKER);
  }) || null;
}

async function patchPull(context, owner, repo, number, title, body) {
  return await gh(context, 'PATCH', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(number)}`, {
    title,
    body
  });
}

function normalizePrLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function parsePrSections(body) {
  const text = String(body || '').replace(PR_MARKER, '').replace(/---+/g, '\n').trim();
  const sections = { fixes: [], files: [], checks: [] };
  let current = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#+\s*修正内容/.test(line)) { current = 'fixes'; continue; }
    if (/^#+\s*送信ファイル/.test(line)) { current = 'files'; continue; }
    if (/^#+\s*確認/.test(line)) { current = 'checks'; continue; }
    if (/^#+\s*/.test(line)) { current = ''; continue; }
    if (!current) continue;
    if (/^[-*]\s+/.test(line) || /^\[[ xX]\]\s+/.test(line)) {
      const normalized = normalizePrLine(line);
      if (normalized) sections[current].push(normalized);
    }
  }
  return sections;
}

function uniquePush(list, line) {
  const normalized = normalizePrLine(line);
  if (!normalized) return;
  const key = normalized
    .replace(/^[-*]\s+/, '')
    .replace(/^- \[[ xX]\]\s+/, '')
    .replace(/`/g, '')
    .toLowerCase();
  const exists = list.some(x => x.replace(/^[-*]\s+/, '').replace(/^- \[[ xX]\]\s+/, '').replace(/`/g, '').toLowerCase() === key);
  if (!exists) list.push(normalized);
}

function mergePrBody(oldBody, newBody) {
  const oldSections = parsePrSections(oldBody);
  const newSections = parsePrSections(newBody);

  const fixes = [];
  const files = [];
  const checks = [];

  [...oldSections.fixes, ...newSections.fixes].forEach(line => uniquePush(fixes, line));
  [...oldSections.files, ...newSections.files].forEach(line => uniquePush(files, line));

  const defaultChecks = [
    '- [ ] 問題文・選択肢を確認',
    '- [ ] 正答を確認',
    '- [ ] 解説を確認',
    '- [ ] 画像表示を確認'
  ];
  [...oldSections.checks, ...newSections.checks, ...defaultChecks].forEach(line => uniquePush(checks, line));

  const body = [
    PR_MARKER,
    '## 修正内容',
    '',
    ...(fixes.length ? fixes : ['- 問題を修正']),
    '',
    '## 送信ファイル',
    '',
    ...(files.length ? files : ['- 送信ファイルなし']),
    '',
    '## 確認',
    '',
    ...checks
  ].join('\n');

  return body.slice(0, 6000);
}

async function tryUpdateBranch(context, owner, repo, pullNumber) {
  try {
    await gh(context, 'PUT', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(pullNumber)}/update-branch`, {});
    return true;
  } catch (_) {
    return false;
  }
}

async function handlePost(context) {
  const verified = await verifyDevSession(context);
  if (!verified.ok) return json({ error: verified.error }, { status: 401 });

  const env = context.env || {};
  requireEnv(env);

  const body = await bodyJson(context.request);
  const title = String(body.title || '[ME2問題編集] 複数問題を修正').trim().slice(0, 160);
  const incomingBody = String(body.body || '').trim().slice(0, 6000);
  const files = normalizeFiles(body.files);
  const jsonUpdates = normalizeJsonUpdates(body.jsonUpdates);
  const draft = body.draft !== false;
  const reuseOpenPr = body.reuseOpenPr !== false;

  if (!files.length && !jsonUpdates.length) return json({ error: '送信する更新がありません。' }, { status: 400 });

  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const base = env.GITHUB_BRANCH || 'main';
  const committer = {
    name: env.GITHUB_COMMITTER_NAME || 'ME2 Quiz App',
    email: env.GITHUB_COMMITTER_EMAIL || 'actions@users.noreply.github.com'
  };

  await validateGitHubAccess(context, owner, repo, base);

  let pull = reuseOpenPr ? await findExistingEditPull(context, owner, repo, base) : null;
  let branch = '';
  let reused = false;

  if (pull) {
    reused = true;
    branch = pull.head.ref;
    await tryUpdateBranch(context, owner, repo, pull.number);
  } else {
    branch = await createBranch(context, owner, repo, base, title);
  }

  const committed = [];
  for (const group of jsonUpdates) {
    committed.push(await putJsonUpdateGroup(context, owner, repo, branch, group, committer));
  }
  for (const file of files) {
    committed.push(await putFile(context, owner, repo, branch, file, committer));
  }

  const prBody = mergePrBody('', incomingBody || '');

  if (pull) {
    pull = await patchPull(context, owner, repo, pull.number, pull.title.includes('[ME2問題編集]') ? pull.title : title, mergePrBody(pull.body || '', prBody));
  } else {
    pull = await gh(context, 'POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, {
      title,
      head: branch,
      base,
      body: prBody,
      draft,
      maintainer_can_modify: true
    });
  }

  return json({
    ok: true,
    reused,
    branch,
    base,
    files: committed,
    pullRequestNumber: pull.number,
    pullRequestUrl: pull.html_url,
    apiUrl: pull.url
  });
}

async function handleGet(context) {
  try {
    const verified = await verifyDevSession(context);
    if (!verified.ok) return json({ ok: false, error: verified.error }, { status: 401 });

    const env = context.env || {};
    requireEnv(env);
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const base = env.GITHUB_BRANCH || 'main';

    await validateGitHubAccess(context, owner, repo, base);
    const pull = await findExistingEditPull(context, owner, repo, base);

    return json({
      ok: true,
      message: 'GitHub接続確認OKです。PR作成に必要な最低限の読み取り確認に成功しました。',
      repository: `${owner}/${repo}`,
      base,
      existingEditPull: pull ? { number: pull.number, url: pull.html_url, branch: pull.head.ref, title: pull.title } : null
    });
  } catch (e) {
    return json({ ok: false, error: e && e.message ? e.message : String(e) }, { status: 500 });
  }
}

async function route(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'POST') return handlePost(context);
  if (method === 'GET') return handleGet(context);
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
export async function onRequestGet(context) {
  return handleGet(context);
}
