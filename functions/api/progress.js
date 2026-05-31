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
function simpleHashText(str) {
  let h = 2166136261;
  const t = String(str || '');
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function attemptSignature(data, examId, part) {
  const d = data && typeof data === 'object' ? data : {};
  const answers = Array.isArray(d.answers) ? d.answers.map(a => `${a?.q || ''}:${a?.choice || ''}:${(a?.correctAnswer || []).join('/')}:${a?.correct ? '1' : '0'}`).join(',') : '';
  const order = Array.isArray(d.order) ? d.order.join(',') : '';
  return simpleHashText([d.examId || examId || '', d.part || part || '', d.mode || 'all', d.startedAt || '', d.completedAt || '', d.correct ?? '', d.elapsedMs ?? '', order, answers].join('|'));
}
function stableLegacyAttemptId(data, examId, part) { return `legacy_${attemptSignature(data, examId, part)}`; }
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
function attemptPrefix(account, examId, part) {
  return `${account.id}:attempt:${safeId(examId)}:${safeId(part)}:`;
}
function attemptKey(account, examId, part, attemptId) {
  return `${attemptPrefix(account, examId, part)}${safeId(attemptId)}`;
}
function newAttemptId() {
  return `att_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
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
function normalizeAttempt(data, examId, part, createNew = false) {
  const d = data && typeof data === 'object' ? { ...data } : {};
  d.examId = d.examId || examId;
  d.part = d.part || part;
  d.attemptId = d.attemptId || (createNew ? newAttemptId() : stableLegacyAttemptId(d, examId, part));
  d.completedAt = d.completedAt || new Date().toISOString();
  d.finished = true;
  return d;
}
function dedupeAttempts(rows, examId, part) {
  const seen = new Set();
  const out = [];
  rows.filter(x => x && typeof x === 'object').forEach(raw => {
    const x = normalizeAttempt(raw, examId, part, false);
    const keys = [x.attemptId, attemptSignature(x, examId, part)].filter(Boolean);
    if (keys.some(k => seen.has(k))) return;
    keys.forEach(k => seen.add(k));
    out.push(x);
  });
  return out.sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0));
}
async function readHistory(kv, account, examId, part) {
  const prefix = attemptPrefix(account, examId, part);
  const listed = await kv.list({ prefix, limit: 300 });
  const rows = [];
  for (const item of listed.keys || []) {
    const val = await kv.get(item.name, 'json');
    if (!val) continue;
    rows.push(val.data && val.data.examId ? val.data : val);
  }
  // 旧形式の履歴も拾って、新形式への移行後も消えたように見せない。
  const legacy = await kv.get(key(account, 'history', examId, part), 'json');
  const legacyData = legacy?.data || legacy;
  if (Array.isArray(legacyData)) rows.push(...legacyData);
  return dedupeAttempts(rows, examId, part);
}
async function saveAttempt(kv, account, examId, part, data) {
  const attempt = normalizeAttempt(data, examId, part, true);
  await kv.put(attemptKey(account, examId, part, attempt.attemptId), JSON.stringify({ savedAt: new Date().toISOString(), accountType: account.type, data: attempt }));
  return attempt;
}

function attemptCompletenessScore(row) {
  const h = row?.data || row || {};
  let score = 0;
  if (row?.source === 'attempt') score += 1000;
  if (h.completedAt) score += 100;
  if (h.finished) score += 80;
  score += Array.isArray(h.answers) ? h.answers.length : 0;
  score += Array.isArray(h.order) ? Math.min(h.order.length, 100) / 10 : 0;
  score += Number(h.correct || 0) / 100;
  score += Number(h.elapsedMs || 0) / 100000000;
  return score;
}
function compactDuplicateAttempts(rows, examId, part) {
  const groups = new Map();
  const addToGroup = (groupKey, row) => {
    if (!groupKey) return;
    const arr = groups.get(groupKey) || [];
    arr.push(row);
    groups.set(groupKey, arr);
  };
  rows.filter(x => x && typeof x === 'object').forEach(row => {
    const data = normalizeAttempt(row.data || row, examId, part, false);
    const normalized = { ...row, data };
    addToGroup(`id:${data.attemptId}`, normalized);
    addToGroup(`sig:${attemptSignature(data, examId, part)}`, normalized);
  });

  // Union groups that share either attemptId or content signature.
  const parent = new Map();
  const find = x => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x);
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  rows.filter(x => x && typeof x === 'object').forEach(row => {
    const data = normalizeAttempt(row.data || row, examId, part, false);
    const idKey = `id:${data.attemptId}`;
    const sigKey = `sig:${attemptSignature(data, examId, part)}`;
    union(idKey, sigKey);
  });

  const buckets = new Map();
  rows.filter(x => x && typeof x === 'object').forEach(row => {
    const data = normalizeAttempt(row.data || row, examId, part, false);
    const root = find(`id:${data.attemptId}`);
    const arr = buckets.get(root) || [];
    arr.push({ ...row, data });
    buckets.set(root, arr);
  });

  const kept = [];
  const duplicates = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      const byScore = attemptCompletenessScore(b) - attemptCompletenessScore(a);
      if (byScore) return byScore;
      return new Date(b.data.completedAt || b.data.startedAt || 0) - new Date(a.data.completedAt || a.data.startedAt || 0);
    });
    kept.push(arr[0].data);
    duplicates.push(...arr.slice(1));
  }
  kept.sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0));
  return { kept, duplicates };
}
async function cleanupDuplicateHistory(kv, account, examId, part) {
  const prefix = attemptPrefix(account, examId, part);
  const listed = await kv.list({ prefix, limit: 1000 });
  const rows = [];
  for (const item of listed.keys || []) {
    const val = await kv.get(item.name, 'json');
    if (!val) continue;
    rows.push({ source: 'attempt', key: item.name, data: val.data && val.data.examId ? val.data : val, savedAt: val.savedAt || null });
  }
  const legacyKey = key(account, 'history', examId, part);
  const legacy = await kv.get(legacyKey, 'json');
  const legacyData = legacy?.data || legacy;
  if (Array.isArray(legacyData)) {
    legacyData.forEach((item, index) => rows.push({ source: 'legacy', key: legacyKey, index, data: item }));
  }

  const before = rows.length;
  const { kept, duplicates } = compactDuplicateAttempts(rows, examId, part);

  // DB内を正規化するため、旧attemptキーと旧historyキーをいったん消して、重複除去後の履歴だけを書き戻す。
  // これにより、表示上だけでなくKV上の重複も減る。
  await Promise.all((listed.keys || []).map(k => kv.delete(k.name)));
  await kv.delete(legacyKey);
  for (const attempt of kept) {
    const normalized = normalizeAttempt(attempt, examId, part, false);
    await kv.put(attemptKey(account, examId, part, normalized.attemptId), JSON.stringify({ savedAt: new Date().toISOString(), accountType: account.type, data: normalized }));
  }
  return { before, after: kept.length, deleted: Math.max(0, before - kept.length), rewritten: kept.length, duplicateRows: duplicates.length };
}

export async function onRequestGet(context) {
  const checked = await requireAccountAndKv(context); if (checked.error) return checked.error;
  const { account, kv } = checked;
  const url = new URL(context.request.url);
  const type = url.searchParams.get('type') || 'state';
  const examId = url.searchParams.get('examId') || '';
  const part = url.searchParams.get('part') || '';
  if (!examId || !part) return Response.json({ ok: true, authenticated: true, cloudSave: true, account: publicAccount(account) });
  if (type === 'history' || type === 'attempt') {
    const data = await readHistory(kv, account, examId, part);
    return Response.json({ ok: true, data, account: publicAccount(account) });
  }
  const data = await kv.get(key(account, type, examId, part), 'json');
  return Response.json({ ok: true, data, account: publicAccount(account) });
}
export async function onRequestPost(context) {
  const checked = await requireAccountAndKv(context); if (checked.error) return checked.error;
  const { account, kv } = checked;
  const body = await bodyJson(context.request);
  if (!body.type || !body.examId || !body.part) return Response.json({ error: 'type, examId, part are required' }, { status: 400 });
  if (body.type === 'attempt') {
    const attempt = await saveAttempt(kv, account, body.examId, body.part, body.data);
    return Response.json({ ok: true, attemptId: attempt.attemptId, account: publicAccount(account) });
  }
  if (body.type === 'history') {
    const list = Array.isArray(body.data) ? body.data : [body.data];
    const saved = [];
    for (const item of list.filter(Boolean)) saved.push(await saveAttempt(kv, account, body.examId, body.part, item));
    return Response.json({ ok: true, saved: saved.length, account: publicAccount(account) });
  }
  if (body.type === 'historyDedupe' || body.type === 'history_duplicates') {
    const result = await cleanupDuplicateHistory(kv, account, body.examId, body.part);
    return Response.json({ ok: true, ...result, account: publicAccount(account) });
  }
  const value = { savedAt: new Date().toISOString(), accountType: account.type, data: body.data ?? null };
  await kv.put(key(account, body.type, body.examId, body.part), JSON.stringify(value));
  return Response.json({ ok: true, account: publicAccount(account) });
}
export async function onRequestDelete(context) {
  const checked = await requireAccountAndKv(context); if (checked.error) return checked.error;
  const { account, kv } = checked;
  const body = await bodyJson(context.request);
  if (!body.type || !body.examId || !body.part) return Response.json({ error: 'type, examId, part are required' }, { status: 400 });
  if (body.type === 'history' || body.type === 'attempt') {
    const listed = await kv.list({ prefix: attemptPrefix(account, body.examId, body.part), limit: 300 });
    await Promise.all((listed.keys || []).map(k => kv.delete(k.name)));
    await kv.delete(key(account, 'history', body.examId, body.part));
    return Response.json({ ok: true, deleted: listed.keys?.length || 0 });
  }
  await kv.delete(key(account, body.type, body.examId, body.part));
  return Response.json({ ok: true });
}
