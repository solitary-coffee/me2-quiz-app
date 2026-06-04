function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 410,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {})
    }
  });
}
function retired() {
  return json({
    ok: false,
    error: 'GitHubからの問題データ読み込みは廃止されました。Date/Ques と Date/img をサイト内に配置してください。'
  }, { status: 410 });
}
export async function onRequest() { return retired(); }
export async function onRequestGet() { return retired(); }
