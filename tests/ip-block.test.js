import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.js';
import {
  blockResponseForRequest,
  invalidateIpBlockRuleCache,
  __test
} from '../functions/_shared/ip-block.js';

function request(path = '/', ip = '203.0.113.10', headers = {}) {
  return new Request(`https://me.dpi-bot.com${path}`, {
    headers: { 'CF-Connecting-IP': ip, ...headers }
  });
}

test('遮断対象外では次のPages Functionまたは静的ファイルへ進む', async () => {
  let nextWasCalled = false;
  const response = await onRequest({
    request: request(),
    env: {},
    async next() {
      nextWasCalled = true;
      return new Response('quiz app');
    }
  });
  assert.equal(nextWasCalled, true);
  assert.equal(await response.text(), 'quiz app');
});

test('共有D1へ登録したCIDRを403専用画面で遮断する', async () => {
  invalidateIpBlockRuleCache();
  const database = {
    prepare(sql) {
      assert.match(sql, /FROM ip_block_rules/u);
      assert.match(sql, /SELECT \*/u);
      return {
        async all() {
          return {
            results: [{
              network: '203.0.113.0/24',
              reason: '管理画面から登録した理由',
              block_level: 'confirmed'
            }]
          };
        }
      };
    }
  };
  const response = await blockResponseForRequest(request('/', '203.0.113.55', { 'CF-Ray': 'test-ray-NRT' }), {
    IP_BLOCK_DB: database
  });
  assert.equal(response.status, 403);
  assert.match(response.headers.get('content-type'), /^text\/html/u);
  const html = await response.text();
  assert.match(html, /管理画面から登録した理由/u);
  assert.match(html, /test-ray-NRT/u);
  assert.match(html, /me\.dpi-bot\.com/u);
  assert.doesNotMatch(html, /攻撃確定|攻撃疑い/u);
  assert.doesNotMatch(html, /https:\/\/dpi-bot\.com\/site\/supp\//u);
  assert.match(html, /support@dpi-bot\.com/u);
});

test('旧スキーマとNEWSLETTER_DB別名でも共有D1ルールを読み込む', async () => {
  invalidateIpBlockRuleCache();
  const database = {
    prepare(sql) {
      assert.match(sql, /SELECT \*/u);
      assert.doesNotMatch(sql, /SELECT\s+network,\s*reason,\s*block_level/iu);
      return {
        async all() {
          return {
            results: [{
              network: '203.0.113.10',
              reason: '旧スキーマの共有ルール'
            }]
          };
        }
      };
    }
  };

  const response = await blockResponseForRequest(request(), { NEWSLETTER_DB: database });
  assert.equal(response.status, 403);
  const html = await response.text();
  assert.match(html, /旧スキーマの共有ルール/u);
  assert.doesNotMatch(html, /攻撃疑い|攻撃確定/u);
});

test('APIリクエストは403 JSONを返す', async () => {
  const response = await blockResponseForRequest(request('/api/progress'), {
    BLOCKED_IPS: '203.0.113.10|APIアクセスを制限しています。'
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    success: false,
    status: 403,
    code: 'ip_blocked',
    message: 'APIアクセスを制限しています。',
    rayId: '取得できませんでした'
  });
});

test('IPv4・IPv6・CIDRを検証する', () => {
  assert.equal(__test.parseNetwork('198.51.100.0/24').network, '198.51.100.0/24');
  assert.equal(__test.parseNetwork('198.51.100.10/24'), null);
  assert.equal(__test.parseNetwork('2001:db8::/32').network, '2001:db8::/32');
  assert.equal(__test.parseNetwork('999.1.1.1'), null);
});

test('遮断理由をHTMLへ埋め込む際に無害化する', async () => {
  const response = await blockResponseForRequest(request(), {
    BLOCKED_IPS: '203.0.113.10|<script>alert(1)</script>'
  });
  const html = await response.text();
  assert.doesNotMatch(html, /<script>alert/u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
});
