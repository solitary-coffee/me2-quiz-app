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


function safeReviewComponent(value, maxLength = 120) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLength);
}
function reviewStorageKey(examId, part, questionId) {
  return `devreview:${safeReviewComponent(examId)}:${String(part || '').toLowerCase()}:${safeReviewComponent(questionId)}`;
}
async function questionIsConfirmed(context, examId, part, question) {
  const kv = context.env?.ME2_PROGRESS;
  if (!kv || !examId || !part || !question) return false;
  const number = Number(question.number || 0);
  const questionId = String(question.id || `${part}${String(number).padStart(2, '0')}`);
  const item = await kv.get(reviewStorageKey(examId, part, questionId), 'json');
  return Boolean(item?.flags?.confirmed ?? item?.confirmed);
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
  const raw = String(input || '').trim().replace(/[?&]_me2v=[^#]*$/i, '');
  const comma = /^data:/i.test(raw) ? raw.indexOf(',') : -1;
  let value = comma >= 0 ? raw.slice(comma + 1) : raw;
  value = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!value || !/^[A-Za-z0-9+/]+$/.test(value)) return '';
  const remainder = value.length % 4;
  if (remainder === 1) return '';
  if (remainder) value += '='.repeat(4 - remainder);
  try { atob(value); } catch (_) { return ''; }
  return value;
}

function decodedBase64Size(base64) {
  const value = String(base64 || '');
  const padding = (value.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

function base64PrefixBytes(base64, maxBytes = 1024) {
  const chars = Math.min(String(base64 || '').length, Math.ceil(maxBytes / 3) * 4);
  const binary = atob(String(base64 || '').slice(0, chars));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function detectedImageMime(base64) {
  const b = base64PrefixBytes(base64, 1024);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && new TextDecoder().decode(b.slice(0, 6)).startsWith('GIF8')) return 'image/gif';
  if (b.length >= 12 && new TextDecoder().decode(b.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(b.slice(8, 12)) === 'WEBP') return 'image/webp';
  const text = new TextDecoder().decode(b).replace(/^\uFEFF/, '').trimStart();
  if (/^<svg\b/i.test(text) || /^<\?xml[\s\S]*?<svg\b/i.test(text)) return 'image/svg+xml';
  return '';
}

function imageExtensionMime(path) {
  const ext = String(path || '').split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  return {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml'
  }[ext] || '';
}

function validateImageUpload(path, base64, declaredMime = '') {
  if (!base64) throw new GitHubApiError(`画像データが空または不正なBase64です：${path}`, 400);
  const size = decodedBase64Size(base64);
  const max = 20 * 1024 * 1024;
  if (!size) throw new GitHubApiError(`画像データが空です：${path}`, 400);
  if (size > max) throw new GitHubApiError(`画像サイズが20MBを超えています：${path}`, 413);

  const detected = detectedImageMime(base64);
  if (!detected) throw new GitHubApiError(`画像形式を判定できません。PNG・JPEG・WebP・GIF・SVGを使用してください：${path}`, 400);

  const extensionMime = imageExtensionMime(path);
  if (!extensionMime) throw new GitHubApiError(`画像パスの拡張子が不正です：${path}`, 400);
  if (extensionMime !== detected) {
    throw new GitHubApiError(`画像の実形式（${detected}）と拡張子（${extensionMime}）が一致しません：${path}`, 400);
  }
  if (declaredMime && String(declaredMime).toLowerCase() !== detected) {
    throw new GitHubApiError(`画像MIME（${declaredMime}）と実形式（${detected}）が一致しません：${path}`, 400);
  }
  return { mime: detected, sizeBytes: size };
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class GitHubApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.data = data;
  }
}

function githubRetryable(status, message) {
  const text = String(message || '');
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    (status === 403 && /secondary rate limit|temporarily blocked|abuse detection/i.test(text))
  );
}

async function gh(context, method, path, body = null) {
  const env = context.env || {};
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers = {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'x-github-api-version': GITHUB_API_VERSION,
      'user-agent': 'me2-quiz-app-cloudflare-pr'
    };
    const init = { method, headers };
    if (body !== null && body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`https://api.github.com${path}`, init);
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }

      if (response.ok) return data;

      const rawMessage = data?.message || data?.error || text || `GitHub API ${response.status}`;
      const explained = explainGitHubError(context, method, path, rawMessage);
      lastError = new GitHubApiError(explained, response.status, data);

      if (attempt < maxAttempts && githubRetryable(response.status, rawMessage)) {
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const delay = retryAfter > 0
          ? Math.min(15000, retryAfter * 1000)
          : Math.min(8000, 1000 * Math.pow(2, attempt - 1));
        await wait(delay);
        continue;
      }
      throw lastError;
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      lastError = error;
      if (attempt < maxAttempts) {
        await wait(Math.min(8000, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }
      throw new Error(`${method} ${path} のGitHub通信に失敗しました：${error?.message || String(error)}`);
    }
  }

  throw lastError || new Error(`${method} ${path} failed`);
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
    mime: String(f.mime || ''),
    sizeBytes: Number(f.sizeBytes || 0),
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
      question: u.question && typeof u.question === 'object' ? u.question : null,
      questionPatch: u.questionPatch && typeof u.questionPatch === 'object' ? u.questionPatch : null,
      label: String(u.label || ''),
      editSummary: String(u.editSummary || '編集'),
      commitMessage: String(u.commitMessage || '')
    })).filter(u => u.question || u.questionPatch) : []
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

  if (!content) throw new GitHubApiError(`ファイル内容が空または不正です：${path}`, 400);
  if (path.startsWith('Date/img/')) validateImageUpload(path, content, file.mime || '');

  let existing = null;
  try {
    existing = await getContent(context, owner, repo, path, branch);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!/404|Not Found/i.test(message)) throw error;
  }

  if (existing?.content && cleanBase64(existing.content) === content) {
    return { path, sha: existing.sha || null, commitSha: null, skipped: true };
  }

  const body = {
    message: String(file.message || `Update ${path}`).slice(0, 160),
    content,
    branch
  };
  if (existing?.sha) body.sha = existing.sha;
  if (committer.name && committer.email) {
    body.committer = committer;
    body.author = committer;
  }

  try {
    const result = await gh(context, 'PUT', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubPath(path)}`, body);
    return { path, sha: result?.content?.sha || null, commitSha: result?.commit?.sha || null, skipped: false };
  } catch (error) {
    if (/content is identical|sha and content are unchanged|no changes/i.test(String(error?.message || error))) {
      return { path, sha: existing?.sha || null, commitSha: null, skipped: true };
    }
    throw error;
  }
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

    const currentQuestion = pack.questions[idx];
    if (await questionIsConfirmed(context, group.examId, group.part, currentQuestion)) {
      throw new GitHubApiError(`${path} の第${currentQuestion?.number || update.number || '?'}問は「確認済み」のため変更できません。確認済みフラグをOFFにしてから再実行してください。`, 409);
    }

    if (update.question) {
      pack.questions[idx] = update.question;
    } else if (update.questionPatch) {
      pack.questions[idx] = { ...pack.questions[idx], ...update.questionPatch };
    } else {
      throw new Error(`${path} の第${update.number || '?'}問に更新内容がありません。`);
    }

    touched.push({
      index: idx,
      number: update.number || pack.questions[idx]?.number,
      label: update.label,
      editSummary: update.editSummary
    });
  }

  const nextJson = JSON.stringify(pack, null, 2);
  if (raw.trim() === nextJson.trim()) {
    return { path, sha: current.sha || null, commitSha: null, touched, skipped: true };
  }

  const body = {
    message: compactCommitMessageFromUpdates(group),
    content: base64FromUtf8(nextJson),
    branch,
    sha: current.sha
  };
  if (committer.name && committer.email) {
    body.committer = committer;
    body.author = committer;
  }

  try {
    const result = await gh(context, 'PUT', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${githubPath(path)}`, body);
    return { path, sha: result?.content?.sha || null, commitSha: result?.commit?.sha || null, touched, skipped: false };
  } catch (error) {
    if (/content is identical|sha and content are unchanged|no changes/i.test(String(error?.message || error))) {
      return { path, sha: current.sha || null, commitSha: null, touched, skipped: true };
    }
    throw error;
  }
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


const PR_JOB_PREFIX = 'githubprjob:';
const PR_JOB_TTL_SECONDS = 60 * 60 * 2;

function prJobKey(jobId) {
  return `${PR_JOB_PREFIX}${String(jobId || '').trim()}`;
}
function defaultCommitter(env) {
  return {
    name: env.GITHUB_COMMITTER_NAME || 'ME2 Quiz App',
    email: env.GITHUB_COMMITTER_EMAIL || 'actions@users.noreply.github.com'
  };
}
async function savePrJob(context, job) {
  const kv = context.env.ME2_PROGRESS;
  job.updatedAt = new Date().toISOString();
  await kv.put(prJobKey(job.id), JSON.stringify(job), { expirationTtl: PR_JOB_TTL_SECONDS });
}
async function loadPrJob(context, verified, jobId) {
  const id = String(jobId || '').trim();
  if (!id) throw new GitHubApiError('PR送信ジョブIDがありません。もう一度PR作成を開始してください。', 400);
  const job = await context.env.ME2_PROGRESS.get(prJobKey(id), 'json');
  if (!job) throw new GitHubApiError('PR送信の再開情報が期限切れです。もう一度PR作成を開始してください。', 410);
  if (String(job.devId || '') !== String(verified.session?.id || '')) {
    throw new GitHubApiError('このPR送信ジョブを操作する権限がありません。', 403);
  }
  if (job.owner !== context.env.GITHUB_OWNER || job.repo !== context.env.GITHUB_REPO) {
    throw new GitHubApiError('GitHub接続先が変更されたため、このPR送信ジョブは再利用できません。', 409);
  }
  return job;
}
function publicJob(job) {
  return {
    ok: true,
    jobId: job.id,
    reused: Boolean(job.reused),
    branch: job.branch,
    base: job.base,
    pullRequestNumber: job.pullNumber || null,
    pullRequestUrl: job.pullUrl || null,
    finalized: Boolean(job.finalized),
    files: job.files || []
  };
}
async function startPrJob(context, verified, body) {
  const env = context.env || {};
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const base = env.GITHUB_BRANCH || 'main';
  const title = String(body.title || '[ME2問題編集] 複数問題を修正').trim().slice(0, 160);
  const prBody = String(body.body || '').trim().slice(0, 6000);
  const draft = body.draft !== false;
  const reuseOpenPr = body.reuseOpenPr !== false;

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

  const job = {
    id: crypto.randomUUID(),
    devId: verified.session?.id || '',
    owner,
    repo,
    base,
    branch,
    reused,
    title,
    body: prBody,
    draft,
    pullNumber: pull?.number || null,
    pullUrl: pull?.html_url || null,
    pullApiUrl: pull?.url || null,
    pullTitle: pull?.title || '',
    pullBody: pull?.body || '',
    files: [],
    createdAt: new Date().toISOString(),
    finalized: false
  };
  await savePrJob(context, job);
  return publicJob(job);
}
async function resumePrJob(context, verified, body) {
  const job = await loadPrJob(context, verified, body.jobId);
  return publicJob(job);
}
async function commitJsonForJob(context, verified, body) {
  const job = await loadPrJob(context, verified, body.jobId);
  if (job.finalized) return { ...publicJob(job), skipped: true, reason: 'finalized' };
  const groups = normalizeJsonUpdates([body.group]);
  if (!groups.length) throw new GitHubApiError('送信するJSON更新がありません。', 400);
  const result = await putJsonUpdateGroup(
    context, job.owner, job.repo, job.branch, groups[0], defaultCommitter(context.env || {})
  );
  job.files = [...(job.files || []).filter(x => x.path !== result.path), result];
  await savePrJob(context, job);
  return { ...publicJob(job), ...result };
}
async function commitFileForJob(context, verified, body) {
  const job = await loadPrJob(context, verified, body.jobId);
  if (job.finalized) return { ...publicJob(job), skipped: true, reason: 'finalized' };
  const files = normalizeFiles([body.file]);
  if (!files.length) throw new GitHubApiError('送信する画像ファイルがありません。', 400);
  const result = await putFile(
    context, job.owner, job.repo, job.branch, files[0], defaultCommitter(context.env || {})
  );
  job.files = [...(job.files || []).filter(x => x.path !== result.path), result];
  await savePrJob(context, job);
  return { ...publicJob(job), ...result };
}
async function ensurePrForJob(context, verified, body) {
  const job = await loadPrJob(context, verified, body.jobId);
  if (job.pullNumber) return publicJob(job);

  const existing = await findExistingEditPull(context, job.owner, job.repo, job.base);
  if (existing && existing.head?.ref === job.branch) {
    job.pullNumber = existing.number;
    job.pullUrl = existing.html_url;
    job.pullApiUrl = existing.url;
    job.pullTitle = existing.title;
    job.pullBody = existing.body || '';
    job.reused = true;
    await savePrJob(context, job);
    return publicJob(job);
  }

  const prBody = mergePrBody('', job.body || '');
  const pull = await gh(context, 'POST', `/repos/${encodeURIComponent(job.owner)}/${encodeURIComponent(job.repo)}/pulls`, {
    title: job.title,
    head: job.branch,
    base: job.base,
    body: prBody,
    draft: job.draft,
    maintainer_can_modify: true
  });
  job.pullNumber = pull.number;
  job.pullUrl = pull.html_url;
  job.pullApiUrl = pull.url;
  job.pullTitle = pull.title;
  job.pullBody = pull.body || prBody;
  await savePrJob(context, job);
  return publicJob(job);
}
async function finalizePrJob(context, verified, body) {
  const job = await loadPrJob(context, verified, body.jobId);
  if (job.finalized) return publicJob(job);

  if (body.title) job.title = String(body.title).trim().slice(0, 160);
  if (body.body !== undefined) job.body = String(body.body || '').trim().slice(0, 6000);
  if (body.draft !== undefined) job.draft = body.draft !== false;

  if (!job.pullNumber) {
    await ensurePrForJob(context, verified, { jobId: job.id });
  }

  const refreshed = await loadPrJob(context, verified, job.id);
  const pull = await patchPull(
    context,
    refreshed.owner,
    refreshed.repo,
    refreshed.pullNumber,
    refreshed.pullTitle?.includes('[ME2問題編集]') ? refreshed.pullTitle : refreshed.title,
    mergePrBody(refreshed.pullBody || '', refreshed.body || '')
  );

  refreshed.pullNumber = pull.number;
  refreshed.pullUrl = pull.html_url;
  refreshed.pullApiUrl = pull.url;
  refreshed.pullTitle = pull.title;
  refreshed.pullBody = pull.body || refreshed.pullBody;
  refreshed.finalized = true;
  refreshed.finalizedAt = new Date().toISOString();
  await savePrJob(context, refreshed);
  return publicJob(refreshed);
}

async function legacyPost(context, verified, body) {
  const started = await startPrJob(context, verified, body);
  const jobId = started.jobId;
  const jsonUpdates = normalizeJsonUpdates(body.jsonUpdates);
  const files = normalizeFiles(body.files);
  if (!jsonUpdates.length && !files.length) {
    throw new GitHubApiError('送信する更新がありません。', 400);
  }
  let ensured = Boolean(started.pullRequestNumber);
  for (const group of jsonUpdates) {
    const result = await commitJsonForJob(context, verified, { jobId, group });
    if (!ensured && !result.skipped) {
      await ensurePrForJob(context, verified, { jobId });
      ensured = true;
    }
  }
  for (const file of files) {
    const result = await commitFileForJob(context, verified, { jobId, file });
    if (!ensured && !result.skipped) {
      await ensurePrForJob(context, verified, { jobId });
      ensured = true;
    }
  }
  return finalizePrJob(context, verified, { jobId, title: body.title, body: body.body, draft: body.draft });
}

async function handlePost(context) {
  const verified = await verifyDevSession(context);
  if (!verified.ok) return json({ error: verified.error }, { status: 401 });

  requireEnv(context.env || {});
  const body = await bodyJson(context.request);
  const action = String(body.action || 'legacy').trim().toLowerCase();

  try {
    let result;
    if (action === 'start') result = await startPrJob(context, verified, body);
    else if (action === 'resume') result = await resumePrJob(context, verified, body);
    else if (action === 'commit-json') result = await commitJsonForJob(context, verified, body);
    else if (action === 'commit-file') result = await commitFileForJob(context, verified, body);
    else if (action === 'ensure-pr') result = await ensurePrForJob(context, verified, body);
    else if (action === 'finalize') result = await finalizePrJob(context, verified, body);
    else result = await legacyPost(context, verified, body);
    return json(result);
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({
      error: error?.message || String(error),
      action,
      retryable: githubRetryable(status, error?.message || '')
    }, { status: status >= 400 && status <= 599 ? status : 500 });
  }
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
