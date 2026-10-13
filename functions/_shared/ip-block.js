const BLOCK_STATUS = 403;
const DATABASE_CACHE_MS = 30_000;
const DEFAULT_MESSAGE = 'サイトの安全な運用のため、この接続元からのアクセスを制限しています。';
let databaseRuleCache = new WeakMap();

const HTML_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
});

const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
});

export async function blockResponseForRequest(request, env) {
  const clientIp = normalizeIp(request.headers.get('cf-connecting-ip'));
  if (!clientIp) return null;

  const staticRules = parseRules(env.BLOCKED_IPS);
  const databaseRules = await loadDatabaseRules(env);
  const rule = findMatchingParsedRule(clientIp, [...staticRules, ...databaseRules]);
  if (!rule) return null;

  const url = new URL(request.url);
  const rayId = cleanText(request.headers.get('cf-ray'), 128) || '取得できませんでした';
  const reason = rule.reason || cleanText(env.IP_BLOCK_MESSAGE, 500) || DEFAULT_MESSAGE;

  console.warn('Blocked request', {
    hostname: url.hostname,
    pathname: url.pathname,
    rule: rule.network,
    rayId
  });

  if (prefersJson(request, url.pathname)) {
    return new Response(JSON.stringify({
      success: false,
      status: BLOCK_STATUS,
      code: 'ip_blocked',
      message: reason,
      rayId
    }), {
      status: BLOCK_STATUS,
      headers: JSON_HEADERS
    });
  }

  const body = request.method === 'HEAD' ? null : renderBlockedPage({
    hostname: url.hostname,
    clientIp,
    reason,
    rayId,
    occurredAt: new Date().toISOString()
  });
  return new Response(body, {
    status: BLOCK_STATUS,
    statusText: 'Forbidden',
    headers: HTML_HEADERS
  });
}

async function loadDatabaseRules(env) {
  const database = env.IP_BLOCK_DB;
  if (!database?.prepare) return [];

  const cached = databaseRuleCache.get(database);
  if (cached?.expiresAt > Date.now()) return cached.rules;

  try {
    const statement = database.prepare(
      `SELECT network, reason FROM ip_block_rules
       WHERE enabled = 1 ORDER BY created_at ASC`
    );
    if (typeof statement?.all !== 'function') return [];
    const result = await statement.all();
    const rules = (result?.results || []).flatMap((row) => {
      const parsed = parseNetwork(row?.network);
      if (!parsed) return [];
      return [{ ...parsed, reason: cleanText(row?.reason, 500) }];
    });
    databaseRuleCache.set(database, { expiresAt: Date.now() + DATABASE_CACHE_MS, rules });
    return rules;
  } catch (error) {
    // D1の一時障害でサイト全体を停止させないため、Secretルールだけで継続します。
    console.error('IP block rules could not be loaded from D1', {
      errorName: error?.name || 'Error',
      errorCode: error?.code || 'unknown'
    });
    databaseRuleCache.set(database, { expiresAt: Date.now() + DATABASE_CACHE_MS, rules: [] });
    return [];
  }
}

function prefersJson(request, pathname) {
  if (pathname === '/api' || pathname.startsWith('/api/')) return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

function findMatchingParsedRule(clientIp, rules) {
  const parsedClient = parseIp(clientIp);
  if (!parsedClient) return null;
  for (const rule of rules) {
    if (rule.version !== parsedClient.version) continue;
    const hostBits = BigInt(rule.bits - rule.prefix);
    if ((parsedClient.value >> hostBits) === (rule.value >> hostBits)) return rule;
  }
  return null;
}

function parseRules(rawRules) {
  const value = typeof rawRules === 'string' ? rawRules.trim() : '';
  if (!value) return [];
  return value.split(/[\n,]+/u).flatMap((entry) => {
    const [networkValue, ...reasonParts] = entry.split('|');
    const parsed = parseNetwork(networkValue.trim());
    if (!parsed) return [];
    return [{ ...parsed, reason: cleanText(reasonParts.join('|'), 500) }];
  });
}

function parseNetwork(value) {
  if (typeof value !== 'string') return null;
  const slash = value.lastIndexOf('/');
  const address = slash === -1 ? value : value.slice(0, slash);
  const prefixValue = slash === -1 ? null : value.slice(slash + 1);
  const parsed = parseIp(address);
  if (!parsed) return null;

  const prefix = prefixValue === null ? parsed.bits : Number(prefixValue);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > parsed.bits) return null;
  const hostBits = BigInt(parsed.bits - prefix);
  const networkValue = (parsed.value >> hostBits) << hostBits;
  if (networkValue !== parsed.value) return null;

  return {
    ...parsed,
    prefix,
    network: prefix === parsed.bits ? parsed.normalized : `${parsed.normalized}/${prefix}`
  };
}

function parseIp(value) {
  const normalized = normalizeIp(value);
  if (!normalized) return null;
  if (!normalized.includes(':')) {
    const numeric = normalized.split('.').map(Number)
      .reduce((result, octet) => (result << 8n) | BigInt(octet), 0n);
    return { normalized, version: 4, bits: 32, value: numeric };
  }

  const groups = expandIpv6(normalized);
  if (!groups) return null;
  const numeric = groups.reduce((result, group) => (result << 16n) | BigInt(group), 0n);
  return { normalized, version: 6, bits: 128, value: numeric };
}

function normalizeIp(value) {
  if (typeof value !== 'string') return '';
  const candidate = value.trim().replace(/^\[|\]$/gu, '').split('%', 1)[0];
  if (!candidate) return '';

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(candidate)) {
    const octets = candidate.split('.').map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return '';
    return octets.join('.');
  }

  if (!candidate.includes(':') || !/^[0-9a-f:.]+$/iu.test(candidate)) return '';
  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return '';
  }
}

function expandIpv6(value) {
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/iu.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function renderBlockedPage({ hostname, clientIp, reason, rayId, occurredAt }) {
  const safeHostname = escapeHtml(hostname);
  const safeClientIp = escapeHtml(clientIp);
  const safeReason = escapeHtml(reason);
  const safeRayId = escapeHtml(rayId);
  const safeOccurredAt = escapeHtml(occurredAt);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>403 - アクセスが制限されています | DPI-Bot</title>
  <style>
    :root{color-scheme:dark;--panel:#0d1b2d;--line:#20344d;--text:#eef6ff;--muted:#a9bad0;--accent:#54b8ff;--warn:#ffbf69}
    *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:28px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;background:radial-gradient(circle at top,#102a47 0,#07111f 50%);color:var(--text)}
    main{width:min(720px,100%);padding:clamp(28px,6vw,52px);background:rgba(13,27,45,.96);border:1px solid var(--line);border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.38)}
    .status{display:inline-flex;align-items:center;gap:10px;margin:0 0 22px;padding:8px 13px;border:1px solid rgba(255,191,105,.4);border-radius:999px;color:var(--warn);font-weight:750;letter-spacing:.04em}.dot{width:9px;height:9px;border-radius:50%;background:currentColor;box-shadow:0 0 16px currentColor}
    h1{margin:0;font-size:clamp(28px,6vw,46px);line-height:1.2}p{font-size:16px;line-height:1.85;color:var(--muted)}.lead{margin:18px 0 28px;font-size:18px;color:var(--text)}
    .detail{display:grid;grid-template-columns:max-content 1fr;gap:10px 20px;margin:28px 0;padding:20px;border-radius:16px;background:#091625;border:1px solid var(--line);font-size:14px}.detail dt{color:var(--muted)}.detail dd{margin:0;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    .help{padding-top:22px;border-top:1px solid var(--line)}a{color:var(--accent)}small{display:block;margin-top:28px;color:#7f93ac}
    @media(max-width:520px){body{padding:16px}.detail{grid-template-columns:1fr;gap:5px}.detail dd{margin-bottom:10px}}
  </style>
</head>
<body>
  <main>
    <div class="status"><span class="dot"></span>HTTP 403 Forbidden</div>
    <h1>アクセスが制限されています</h1>
    <p class="lead">${safeReason}</p>
    <p>この制限は <strong>${safeHostname}</strong> 配下のページおよびAPIに適用されています。共有回線・VPN・プロキシを利用している場合は、接続先を変更してからもう一度お試しください。</p>
    <dl class="detail">
      <dt>接続元IP</dt><dd>${safeClientIp}</dd>
      <dt>Ray ID</dt><dd>${safeRayId}</dd>
      <dt>判定時刻</dt><dd>${safeOccurredAt}</dd>
    </dl>
    <p class="help">心当たりがない場合は、上記のRay IDと判定時刻を添えて <a href="mailto:support@dpi-bot.com">support@dpi-bot.com</a> までお問い合わせください。</p>
    <small>DPI-Bot Security Gateway</small>
  </main>
</body>
</html>`;
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function invalidateIpBlockRuleCache() {
  databaseRuleCache = new WeakMap();
}

export const __test = Object.freeze({
  findMatchingParsedRule,
  normalizeIp,
  parseNetwork,
  parseRules,
  prefersJson
});
