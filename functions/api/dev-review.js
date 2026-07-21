const REVIEW_PREFIX = 'devreview:';
const FLAG_TYPES = ['review', 'imageChange', 'aiRegenerate', 'confirmed'];

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

function safePart(value) {
  const part = String(value || '').trim().toLowerCase();
  return part === 'am' || part === 'pm' ? part : '';
}

function safeComponent(value, maxLength = 120) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLength);
}

function reviewKey(examId, part, questionId) {
  return `${REVIEW_PREFIX}${safeComponent(examId)}:${safePart(part)}:${safeComponent(questionId)}`;
}

function publicKey(examId, part, questionId) {
  return `${String(examId)}:${String(part)}:${String(questionId)}`;
}

function normalizeFlags(item) {
  const flags = item?.flags || {};
  return {
    review: Boolean(flags.review ?? item?.review ?? item?.flagged),
    imageChange: Boolean(flags.imageChange ?? item?.imageChange),
    aiRegenerate: Boolean(flags.aiRegenerate ?? item?.aiRegenerate),
    confirmed: Boolean(flags.confirmed ?? item?.confirmed)
  };
}

function hasAnyFlag(flags) {
  return FLAG_TYPES.some(type => Boolean(flags?.[type]));
}

function normalizeStoredItem(item) {
  if (!item) return null;
  const flags = normalizeFlags(item);
  return {
    ...item,
    flagged: flags.review,
    review: flags.review,
    imageChange: flags.imageChange,
    aiRegenerate: flags.aiRegenerate,
    confirmed: flags.confirmed,
    flags
  };
}

async function requireDeveloper(context) {
  const kv = context.env?.ME2_PROGRESS;
  if (!kv) {
    return {
      error: json(
        { error: 'ME2_PROGRESS KV binding が未設定です。Cloudflare Pages のBindingsで設定してください。' },
        { status: 503 }
      )
    };
  }

  const token =
    context.request.headers.get('X-ME2-Dev-Session') ||
    context.request.headers.get('x-me2-dev-session') ||
    '';

  if (!token) return { error: json({ error: '開発者ログインが必要です。' }, { status: 401 }) };

  const session = await kv.get(await sessionKey(token), 'json');
  if (!session) return { error: json({ error: '開発者セッションが無効または期限切れです。' }, { status: 401 }) };

  return { kv, session };
}

async function listAllReviews(kv) {
  const items = [];
  let cursor = undefined;

  do {
    const page = await kv.list({ prefix: REVIEW_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const entry of page.keys || []) {
      const value = normalizeStoredItem(await kv.get(entry.name, 'json'));
      if (value && hasAnyFlag(value.flags)) items.push(value);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  items.sort((a, b) => {
    const byExam = String(a.examId).localeCompare(String(b.examId), 'ja', { numeric: true });
    if (byExam) return byExam;
    const byPart = String(a.part).localeCompare(String(b.part));
    if (byPart) return byPart;
    return Number(a.number || 0) - Number(b.number || 0);
  });

  return items;
}

async function handleGet(context) {
  const checked = await requireDeveloper(context);
  if (checked.error) return checked.error;

  const { kv } = checked;
  const url = new URL(context.request.url);
  const examId = String(url.searchParams.get('examId') || '').trim();
  const part = safePart(url.searchParams.get('part'));
  const questionId = String(url.searchParams.get('questionId') || '').trim();

  if (examId && part && questionId) {
    const item = normalizeStoredItem(await kv.get(reviewKey(examId, part, questionId), 'json'));
    return json({ ok: true, item: item && hasAnyFlag(item.flags) ? item : null });
  }

  const items = await listAllReviews(kv);
  return json({ ok: true, items, count: items.length });
}

async function handlePost(context) {
  const checked = await requireDeveloper(context);
  if (checked.error) return checked.error;

  const { kv, session } = checked;
  const body = await bodyJson(context.request);

  const examId = String(body.examId || '').trim();
  const part = safePart(body.part);
  const questionId = String(body.questionId || '').trim();

  if (!examId || !part || !questionId) {
    return json({ error: 'examId、part、questionId が必要です。' }, { status: 400 });
  }

  const storageKey = reviewKey(examId, part, questionId);
  const key = publicKey(examId, part, questionId);
  const existing = normalizeStoredItem(await kv.get(storageKey, 'json')) || {};
  const flags = normalizeFlags(existing);

  if (body.flags && typeof body.flags === 'object') {
    for (const type of FLAG_TYPES) {
      if (Object.prototype.hasOwnProperty.call(body.flags, type)) flags[type] = Boolean(body.flags[type]);
    }
  } else {
    const flagType = String(body.flagType || 'review');
    if (!FLAG_TYPES.includes(flagType)) {
      return json({ error: `未対応のフラグです：${flagType}` }, { status: 400 });
    }
    flags[flagType] = Boolean(body.flagged);
  }

  if (!hasAnyFlag(flags)) {
    await kv.delete(storageKey);
    return json({ ok: true, key, flags, item: null });
  }

  const item = normalizeStoredItem({
    ...existing,
    key,
    examId,
    part,
    questionId,
    number: Number(body.number || existing.number || 0),
    sourceTitle: String(body.sourceTitle || existing.sourceTitle || ''),
    stem: String(body.stem || existing.stem || '').slice(0, 1000),
    range: String(body.range || existing.range || '').slice(0, 300),
    flags,
    updatedAt: new Date().toISOString(),
    updatedBy: String(session.id || 'developer')
  });

  await kv.put(storageKey, JSON.stringify(item));
  return json({ ok: true, flags, item });
}

async function route(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return handleGet(context);
  if (method === 'POST') return handlePost(context);
  if (method === 'OPTIONS') return json({ ok: true });
  return json({ error: `Method ${method} is not allowed for /api/dev-review` }, { status: 405 });
}

export async function onRequest(context) {
  try {
    return await route(context);
  } catch (error) {
    return json(
      { error: `問題作業フラグAPIでエラーが発生しました: ${error?.message || String(error)}` },
      { status: 500 }
    );
  }
}

export async function onRequestGet(context) {
  try {
    return await handleGet(context);
  } catch (error) {
    return json(
      { error: `問題作業フラグAPIでエラーが発生しました: ${error?.message || String(error)}` },
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    return await handlePost(context);
  } catch (error) {
    return json(
      { error: `問題作業フラグAPIでエラーが発生しました: ${error?.message || String(error)}` },
      { status: 500 }
    );
  }
}
