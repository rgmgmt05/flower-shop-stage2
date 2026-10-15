import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../public/pos.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../public/pos.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/pos.css',import.meta.url),'utf8');
const staff=fs.readFileSync(new URL('../public/staff.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
new vm.Script(script);
for(const id of ['products','quick-qty','mobile-totals','mobile-total','last-action','mobile-last-action','mobile-stems','basket','view-cart','close-cart','cart-scrim','bouquet-parts','bouquet-price','bouquet-quantity','lines','total','checkout'])
 assert.ok(html.includes('id="'+id+'"'),'missing cashier feature '+id);
assert.ok(html.includes('data-mode="favorites"'),'favorite products tab');
assert.ok(css.includes('body.cart-open .basket'),'mobile receipt sheet CSS');
assert.ok(css.includes('.products{grid-template-columns:repeat(2'),'compact two-column mobile grid');
assert.ok(staff.includes('class="nav-pos"'),'staff POS navigation');
assert.ok(!fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').includes('href="/pos"'),'POS hidden from customers');
assert.ok(worker.includes("actor?.role!=='staff'"),'staff authorization');
assert.ok(worker.includes('await db.batch(statements)'),'atomic receipt transaction');

const elements=new Map(),listeners=new Map();
const classes=new Set();
const element=id=>{
 if(!elements.has(id))elements.set(id,{
  id,hidden:false,value:'',textContent:'',innerHTML:'',disabled:false,
  classList:{add(){},remove(){},toggle(){return true}},
  setAttribute(){},focus(){},addEventListener(name,fn){listeners.set(id+':'+name,fn)}
 });
 return elements.get(id);
};
const browser={
 document:{
  getElementById:element,
  querySelectorAll:()=>[],
  body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},
  addEventListener(name,fn){listeners.set('document:'+name,fn)}
 },
 crypto:{randomUUID:()=> '68fdbe15-9a5a-459b-a223-6b29dcabc837'},
 fetch:async()=>({ok:true,json:async()=>({user:null})}),
 console,confirm:()=>true,clearTimeout,setTimeout:()=>0,Map,Set,Date,Math,Promise,Number
};
const context=vm.createContext(browser);
vm.runInContext(script,context);
vm.runInContext("catalog={products:[{id:'rose',name:'赤バラ',type:'バラ',price:350,stock:250,active:true},{id:'green',name:'ユーカリ',type:'グリーン',price:170,stock:250,active:true}],wraps:[{id:'natural',name:'クラフト',price:200}]} ;favorites=new Set(['rose'])",context);
vm.runInContext('render()',context);
assert.ok(element('products').innerHTML.includes('赤バラ'));
assert.ok(!element('products').innerHTML.includes('ユーカリ'));
vm.runInContext("setPreset(10);addSingle('rose')",context);
assert.equal(vm.runInContext("singleQuantity('rose')",context),10);
assert.equal(element('mobile-total').textContent,'¥3,500');
assert.equal(element('last-action').textContent,'直近：赤バラ +10本 · ¥3,500');
assert.equal(element('mobile-last-action').textContent,element('last-action').textContent);
assert.ok(element('products').innerHTML.includes('会計中 10本'));
vm.runInContext("addSingle('rose');selectMode('single');addSingle('green',5)",context);
assert.equal(vm.runInContext("singleQuantity('rose')",context),20);
assert.equal(vm.runInContext("singleQuantity('green')",context),5);
assert.equal(element('mobile-total').textContent,'¥7,850');
assert.ok(element('mobile-stems').textContent.includes('25本'));
vm.runInContext("updateLineQty(0,35)",context);
assert.equal(vm.runInContext("singleQuantity('rose')",context),35);
assert.equal(element('mobile-total').textContent,'¥13,100');
assert.equal(element('last-action').textContent,'直近：赤バラ 35本に変更');
assert.equal(vm.runInContext("updateLineQty(0,300)",context),false);
assert.equal(vm.runInContext("singleQuantity('rose')",context),35);
vm.runInContext("toggleFavorite('green');selectMode('favorites')",context);
assert.ok(element('products').innerHTML.includes('ユーカリ'));
vm.runInContext("parts={rose:2,green:1};selectMode('bouquet')",context);
element('wrap-id').value='natural';
element('bouquet-price').value='1700';
element('bouquet-quantity').value='10';
vm.runInContext('renderBouquetSubtotal();addBouquet()',context);
assert.equal(vm.runInContext("cart.find(x=>x.kind==='bouquet').qty",context),10);
assert.equal(vm.runInContext("currentDemand().get('rose')",context),55);
assert.equal(vm.runInContext("currentDemand().get('green')",context),15);
assert.equal(element('mobile-total').textContent,'¥30,100');
assert.ok(classes.has('cart-open'),'bouquet opens receipt sheet');
assert.equal(element('mobile-last-action').textContent,'直近：花束 +10点 · ¥17,000');
vm.runInContext('closeCart()',context);
assert.ok(!classes.has('cart-open'));
vm.runInContext("updateLineQty(2,200)",context); // Should be rejected due to stock.
assert.equal(vm.runInContext("cart.find(x=>x.kind==='bouquet').qty",context),10);
console.log('PASS: compact POS, quick quantity, immediate tile/total updates, favorites, editable receipt and bouquet stock calculations');
