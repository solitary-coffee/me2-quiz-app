import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Use a data URL so this test works even in repositories without "type":"module".
const src=readFileSync(new URL('../functions/_shared/maintenance.js',import.meta.url),'utf8');
const {publicMaintenanceGate}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const SITE='me2';
const request=(path,method='GET')=>new Request('https://example.com'+path,{method});
function env(data={}){
 return {DPI_MAINTENANCE_KV:{async get(key){return data[key]??null;}}};
}
test('unconfigured KV is safe and maintenance starts disabled',async()=>{
 assert.equal(await publicMaintenanceGate(request('/'),{},SITE),null);
 assert.equal(await publicMaintenanceGate(request('/'),env(),SITE),null);
});
test('global maintenance and site maintenance return 503 with no-store',async()=>{
 let r=await publicMaintenanceGate(request('/index.html'),env({'maintenance:global':{enabled:true}}),SITE);
 assert.equal(r.status,503);
 assert.match(await r.text(),/メンテナンス中/);
 assert.match(r.headers.get('cache-control'),/no-store/);
 r=await publicMaintenanceGate(request('/styles.css'),env({['maintenance:site:'+SITE]:{enabled:true}}),SITE);
 assert.equal(r.status,503);
});
test('API bypass is precise and does not read KV',async()=>{
 const e={DPI_MAINTENANCE_KV:{async get(){throw Error('API should not check KV');}}};
 assert.equal(await publicMaintenanceGate(request('/api'),e,SITE),null);
 assert.equal(await publicMaintenanceGate(request('/api/notify'),e,SITE),null);
 assert.equal((await publicMaintenanceGate(request('/api2'),env({'maintenance:global':{enabled:true}}),SITE)).status,503);
});
test('HEAD is empty and HTML message is escaped',async()=>{
 const e=env({'maintenance:global':{enabled:true,message:'<script>alert(1)</script>'}});
 const head=await publicMaintenanceGate(request('/','HEAD'),e,SITE);
 assert.equal(head.status,503);
 assert.equal(await head.text(),'');
 const r=await publicMaintenanceGate(request('/'),e,SITE),body=await r.text();
 assert.match(body,/&lt;script&gt;/);
 assert.ok(!body.includes('<script>'));
});
test('KV lookup failure closes only web pages',async()=>{
 const e={DPI_MAINTENANCE_KV:{async get(){throw Error('offline');}}};
 assert.equal((await publicMaintenanceGate(request('/'),e,SITE)).status,503);
 assert.equal(await publicMaintenanceGate(request('/api/notify'),e,SITE),null);
});
