/** DPI-Bot site maintenance; /api routes and background handlers remain operational. */
const DEFAULT_TEXT='現在、安全確認のためWebサイトを一時的に公開停止しています。';
function escapeHtml(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function maintenanceResponse(req,message){
 const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>メンテナンス中 | DPI-Bot</title><style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:grid;place-items:center;background:#0c1425;color:#edf3ff;padding:24px}
main{max-width:650px;padding:clamp(28px,6vw,54px);border-radius:20px;background:#17253d;border:1px solid #344761}
.brand{font-weight:800;letter-spacing:.1em;color:#9ecaff}h1{font-size:clamp(26px,5vw,36px);margin:30px 0 16px}
p{white-space:pre-wrap;line-height:1.9;color:#ccd7e9}small{display:block;margin-top:28px;color:#9eaec5}
</style></head><body><main><div class="brand">DPI-Bot</div><h1>ただいまメンテナンス中です</h1><p>${escapeHtml(message)}</p><small>お問い合わせ：support@dpi-bot.com</small></main></body></html>`;
 return new Response(req.method==='HEAD'?null:html,{status:503,headers:{
 'content-type':'text/html; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate, max-age=0',
 'retry-after':'300','x-robots-tag':'noindex, nofollow, noarchive','x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
 }});
}
export async function publicMaintenanceGate(req,env,siteKey){
 const path=new URL(req.url).pathname;
 if(path==='/api'||path.startsWith('/api/'))return null;
 if(!env?.DPI_MAINTENANCE_KV)return null; // Stage safely before the shared KV binding exists.
 let rule;
 try{
  const globalRule=await env.DPI_MAINTENANCE_KV.get('maintenance:global','json');
  rule=globalRule?.enabled===true?globalRule:await env.DPI_MAINTENANCE_KV.get('maintenance:site:'+siteKey,'json');
 }catch(e){console.error('maintenance KV read failure',e?.name||'Error');return maintenanceResponse(req,DEFAULT_TEXT);}
 if(rule?.enabled!==true)return null;
 const message=typeof rule.message==='string'?rule.message.trim():'';
 return maintenanceResponse(req,message?message.slice(0,280):DEFAULT_TEXT);
}
