import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const pos=fs.readFileSync(new URL('../public/pos.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../public/pos.js',import.meta.url),'utf8');
const staff=fs.readFileSync(new URL('../public/staff.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
new vm.Script(script);
assert.ok(pos.includes('id="bouquet-price"'),'custom bouquet needs independent sale price');
assert.ok(pos.includes('id="bouquet-parts"'),'materials must be explicitly accounted for');
assert.ok(pos.includes('id="checkout"'),'cash register is complete');
assert.ok(staff.includes('href="/pos"'),'POS navigation must be staff-facing');
assert.ok(!fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').includes('href="/pos"'),'public customers should not see register link');
assert.ok(worker.includes("actor?.role!=='staff'"),'POS API authorization must be staff only');
assert.ok(worker.includes("await db.batch(statements)"),'POS materials must be deducted transactionally');
assert.ok(worker.includes('request_id=?'),'repeated requests must be idempotent');

assert.ok(pos.includes('id="add-bulk"'),'batch flower entry is available');
assert.ok(pos.includes('id="bouquet-quantity"'),'bouquet quantity input exists');
assert.ok(pos.includes('id="bulk-summary"'),'batch flower subtotal is present');
assert.ok(staff.includes('class="nav-pos"'),'management/POS share styled navigation');
assert.ok(staff.includes('a,a:link,a:visited{color:inherit;text-decoration:none}'),'default blue links are overridden');

const elements=new Map();
const getEl=id=>{
 if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,classList:{toggle(){},add(){},remove(){}},addEventListener(){}});
 return elements.get(id);
};
const browser={
 document:{getElementById:getEl,querySelectorAll:()=>[],addEventListener(){}},
 crypto:{randomUUID:()=> '68fdbe15-9a5a-459b-a223-6b29dcabc837'},
 fetch:async()=>({ok:true,json:async()=>({user:null})}),
 console,confirm:()=>true,clearTimeout,setTimeout:()=>0,Map,Date,Math,Promise,Number
};
getEl('bouquet-quantity').value='1';
const context=vm.createContext(browser);
vm.runInContext(script,context);
vm.runInContext("catalog={products:[{id:'rose',name:'バラ',price:350,stock:250,active:true},{id:'eucalyptus',name:'ユーカリ',price:170,stock:250,active:true}],wraps:[{id:'natural',name:'クラフト',price:200}]}",context);
vm.runInContext("setDraft('rose','35');setDraft('eucalyptus','17');addBulk()",context);
assert.equal(vm.runInContext('cart.length',context),2);
assert.equal(vm.runInContext("cart.find(l=>l.id==='rose').qty",context),35);
assert.equal(vm.runInContext("cart.find(l=>l.id==='eucalyptus').qty",context),17);
vm.runInContext("updateLineQty(0,'42')",context);
assert.equal(vm.runInContext("cart.find(l=>l.id==='rose').qty",context),42);
vm.runInContext("updateLineQty(0,'300')",context);
assert.equal(vm.runInContext("cart.find(l=>l.id==='rose').qty",context),42);
vm.runInContext("setPartQty('rose',3);setPartQty('eucalyptus',2)",context);
getEl('wrap-id').value='natural';
getEl('bouquet-price').value='2200';
getEl('bouquet-quantity').value='10';
vm.runInContext('addBouquet()',context);
assert.equal(vm.runInContext("cart.find(l=>l.kind==='bouquet').qty",context),10);
assert.equal(vm.runInContext("cart.find(l=>l.kind==='bouquet').price",context),2200);
assert.equal(vm.runInContext("currentDemand().get('rose')",context),72);
assert.equal(vm.runInContext("currentDemand().get('eucalyptus')",context),37);
assert.equal(vm.runInContext("cart.reduce((n,l)=>n+lineTotal(l),0)",context),42*350+17*170+10*2200);
console.log('PASS: batch stem input, direct cart quantity edits, stock limits and bulk bouquet totals');

