import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const m=JSON.parse(read('staff.webmanifest'));
const p=read('pos.html'),staff=read('staff.html'),sw=read('staff-sw.js'),client=read('staff-pwa.js');
assert.equal(m.id,'/take-you-staff');
assert.equal(m.start_url,'/pos');
assert.equal(m.scope,'/');
assert.equal(m.display,'standalone');
assert.equal(m.shortcuts.length,2);
assert.deepEqual(m.shortcuts.map(s=>s.url),['/pos','/staff']);
for(const [i,sz] of [[0,192],[1,512]]){
 const item=m.icons[i],data=fs.readFileSync(new URL('../public'+item.src,import.meta.url));
 assert.equal(item.sizes,sz+'x'+sz);
 assert.equal(item.type,'image/png');
 assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(data.readUInt32BE(16),sz);
 assert.equal(data.readUInt32BE(20),sz);
 assert.ok(data.length>1000,'real PNG icon must have content');
}
for(const source of [p,staff]){
 assert.ok(source.includes('rel="manifest" href="/staff.webmanifest"'),'PWA manifest tag');
 assert.ok(source.includes('apple-touch-icon'),'iOS home-screen icon');
 assert.ok(source.includes('id="install-staff-app"'),'install control');
 assert.ok(source.includes('id="update-staff-app"'),'update control');
 assert.ok(source.includes('id="offline-staff-banner"'),'offline state');
 assert.ok(source.includes('src="/staff-pwa.js" defer'),'service worker registration');
}
const customer=read('index.html');
assert.ok(!customer.includes('staff.webmanifest'),'storefront must not install as staff PWA');
assert.ok(!customer.includes('staff-pwa.js'),'customer should not be controlled by client PWA script');
assert.ok(sw.includes("url.pathname.startsWith('/api/')"),'API requests must bypass the service worker');
assert.ok(sw.includes("request.method!=='GET'"),'mutating API requests must bypass the service worker');
assert.ok(!sw.includes('/api/catalog'),'no private or mutable API pre-cached');
assert.ok(!sw.includes('/api/pos/sales'),'no sale endpoint cached');
assert.ok(sw.includes("event.respondWith"),'staff shell can load offline');
assert.ok(sw.includes("'ACTIVATE_UPDATE'"),'service worker update is interactive');
new vm.Script(sw);
new vm.Script(client);
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
assert.ok(worker.includes("'/pos'"),'staff register route');
assert.ok(worker.includes("'/staff'"),'staff manager route');
console.log('PASS: installable staff PWA manifest, PNG icons, one app scope, static-only cache and offline status');
