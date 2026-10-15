import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/storefront.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/storefront.css',import.meta.url),'utf8');
const staff=fs.readFileSync(new URL('../public/staff.html',import.meta.url),'utf8');
const staffJs=staff.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(staffJs,'staff script is present');
new vm.Script(staffJs);
assert.ok(staffJs.includes("if(count)count.textContent=cart.length"),'staff render must not depend on a removed cart badge');
assert.ok(staffJs.includes("if(authUser?.role==='staff')navigate('admin')"),'staff login should open management');
assert.ok(!staff.match(/<header[\s\S]*?<\/header>/)?.[0].includes('data-nav="shop"'),'staff header should not expose storefront');

new vm.Script(js);
assert.ok(html.includes('class="video-background"'),'accepted full-page v0.2 background');
assert.ok(html.includes('class="film-section"'),'v0.2 film overlay');
assert.ok(html.includes('ここにテキストを入力'),'copy stays unspecified');
assert.ok(!/<header[\s\S]*?<\/header>/.exec(html)?.[0].includes('店舗管理'),'staff link must not appear in customer header');
assert.ok(staff.includes('id="view-admin"'),'staff stock UI intact');
assert.ok(css.includes('.subpage'),'functional app screens inherit minimal style');
assert.ok(css.includes('.bouquet-image img{display:block;width:100%;height:100%;object-fit:cover}'),'preview image cannot overflow');
assert.ok(js.includes("$('bouquet-preview').textContent='花束写真'"),'unverified photos stay out of hero');
const nodes=new Map();
function element(id){
 if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',hidden:false,classList:{toggle(){},add(){},remove(){}},style:{},setAttribute(){},getAttribute(){return ''},value:'',disabled:false});
 return nodes.get(id);
}
const calls=[],listeners={};
let stock=12;
const products=[{id:'rose-r',name:'赤バラ',type:'バラ',price:350,stock,active:true,imageId:null}];
const wraps=[{id:'natural',name:'クラフト',price:200}];
const examples=[{id:'bouquet-example',name:'制作事例',parts:[{id:'rose-r',qty:2}],wrapId:'natural',imageId:null}];
const site={document:{body:{classList:{toggle(){}}},getElementById:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn},
 window:{scrollTo:()=>{},addEventListener(){}},history:{pushState(){}},
 location:{pathname:'/',search:''},localStorage:{getItem(){return null},setItem(){}},
 URLSearchParams,Date,Number,Promise,Map,console,setTimeout:()=>1,clearTimeout:()=>{},
 fetch:async(path,opt={})=>{
  calls.push(path);
  if(path==='/api/catalog')return {ok:true,json:async()=>({products,wraps,templates:examples})};
  if(path==='/api/auth/me')return {ok:true,json:async()=>({user:null})};
  if(path==='/api/demo/orders'){const data=JSON.parse(opt.body);assert.equal(opt.headers['x-demo-key'],'test-invite');assert.equal(data.lines.length,1);assert.equal(data.lines[0].parts[0].qty,2);assert.equal(data.fulfillmentMethod,'pickup');return {ok:true,json:async()=>({id:'test-order-01'})}}
  throw Error('Unexpected API: '+path);
 }};
element('mobile-menu').hidden=true;
element('menu-button').setAttribute=()=>{};
element('guest-key-wrap').hidden=false;
const context=vm.createContext(site);
vm.runInContext(js,context);
await new Promise(resolve=>setImmediate(resolve));
assert.ok(element('product-grid').innerHTML.includes('赤バラ'));
vm.runInContext("navigate('builder');adjust('rose-r',2);",context);
assert.equal(vm.runInContext('bouquetTotal().total',context),1400);
vm.runInContext("addBouquet()",context);
assert.equal(vm.runInContext('cart.length',context),1);
element('order-name').value='仮名';
element('order-contact').value='test@example.invalid';
element('order-pickup').value='2026-11-01T11:00';
element('guest-key').value='test-invite';
await vm.runInContext('checkout()',context);
assert.ok(calls.includes('/api/demo/orders'));
assert.equal(vm.runInContext('cart.length',context),0);
assert.ok(element('order-result').textContent.includes('test-order-01'));
console.log('PASS: v0.2 storefront, customer-only navigation, catalog, bouquet pricing, guest checkout, admin isolation');
