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
    error: '共有リンク制は廃止されました。ログインアカウント内のDBアップロード・DBダウンロード同期を使用してください。'
  }, { status: 410 });
}
export async function onRequest() { return retired(); }
export async function onRequestGet() { return retired(); }
export async function onRequestPost() { return retired(); }
