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


const shell=read('staff-shell.css');
assert.ok(p.includes('rel="stylesheet" href="/staff-shell.css"'),'register uses shared navigation CSS');
assert.ok(staff.includes('rel="stylesheet" href="/staff-shell.css"'),'manager uses shared navigation CSS');
const headerOf=text=>text.split('<header class="staff-shell-header">')[1]?.split('</header>')[0];
const posHeader=headerOf(p),managerHeader=headerOf(staff);
assert.ok(posHeader&&managerHeader,'shared POS/management headers exist');
for(const link of ['href="/pos"','href="/staff"','href="/staff?view=account"']){
 assert.ok(posHeader.includes(link)&&managerHeader.includes(link),'same navigation target '+link);
}
assert.ok(posHeader.includes('class="staff-main-link is-active" aria-current="page">レジ</a>'),'register tab active');
assert.ok(managerHeader.includes('class="staff-main-link is-active" aria-current="page">店舗管理</a>'),'manager tab active');
const normalizeHeader=h=>h.replace(/class="staff-main-link is-active" aria-current="page"/g,'class="staff-main-link"').replace(/class="staff-main-link"/g,'class="staff-main-link"');
assert.equal(normalizeHeader(posHeader),normalizeHeader(managerHeader),'identical header controls and ordering');
assert.ok(shell.includes('staff-main-nav')&&shell.includes('staff-shell-inner'),'navigation driven from shared CSS');
assert.ok(sw.includes('/staff-shell.css'),'PWA precaches updated nav CSS');
assert.ok(sw.includes('take-you-staff-shell-v4-20261015-2'),'new version invalidates old cached shell');
assert.ok(read('pos.js').includes('sessionStorage.setItem(CART_DRAFT_KEY'),'unpaid cart survives navigation');
assert.ok(read('pos.js').includes('sessionStorage.removeItem(CART_DRAFT_KEY'),'completed sale and logout remove draft');
assert.ok(staff.includes("new URLSearchParams(window.location.search).get('view')"),'account view is addressable from register');
console.log('PASS: symmetric staff navigation, active states, account links and update-safe PWA caching');
