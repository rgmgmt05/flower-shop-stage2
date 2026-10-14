import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:'',style:{},disabled:false});return elements.get(id)}
let state={products:[{id:'rose-r',name:'赤バラ',type:'バラ・赤',price:350,stock:18,icon:'🌹',tone:'coral',active:true}],wraps:[{id:'natural',name:'クラフト',price:200,icon:'◌'}],orders:[],movements:[]};
let orderPayload=null;
const store={};
async function fetchFake(path,opts){
 const authenticated=opts?.headers?.['x-demo-key']==='test-access-key';
 if(path==='/api/admin/state' && !authenticated)return {ok:false,status:401,json:async()=>({error:'unauthorized'})};
 if(path==='/api/demo/orders'){
  assert.equal(authenticated,true);orderPayload=JSON.parse(opts.body);
  state.products[0].stock-=4;
  state.orders.push({id:'test-uuid',name:'テスト',contact:'demo@example.invalid',pickup:'',status:'new',createdAt:'2026-10-14 21:00',payment:'SIMULATED',total:2100,lines:orderPayload.lines,itemSnapshots:[{title:'花束',detail:'赤バラ×3',total:1750}]});
  return {ok:true,status:201,json:async()=>({id:'test-uuid',total:2100})};
 }
 if(path==='/api/catalog'||path==='/api/admin/state')return {ok:true,status:200,json:async()=>path==='/api/admin/state'?state:{products:state.products,wraps:state.wraps}};
 throw Error('Unknown '+path);
}
const ctx={document:{getElementById:el,querySelectorAll:()=>[]},window:{scrollTo:()=>{}},sessionStorage:{getItem:k=>store[k],setItem:(k,v)=>store[k]=v,removeItem:k=>delete store[k]},fetch:fetchFake,console,confirm:()=>true,setTimeout:()=>1,clearTimeout:()=>{},Date,Number,Map,Promise};
vm.createContext(ctx);vm.runInContext(code,ctx);await new Promise(r=>setImmediate(r));
vm.runInContext("changeBouquet('rose-r',1);changeBouquet('rose-r',1);changeBouquet('rose-r',1)",ctx);
assert.equal(vm.runInContext('builderTotal().total',ctx),1750);
vm.runInContext('addBouquet()',ctx);
el('demo-key').value='test-access-key';
await vm.runInContext('loginDemo()',ctx);
assert.equal(store['flower-shop-demo-key'],'test-access-key');
// Add one single item, so 4 rose stems are consumed.
vm.runInContext("addSingle('rose-r')",ctx);
el('customer-name').value='テスト';el('customer-contact').value='demo@example.invalid';
await vm.runInContext('checkout()',ctx);
assert.equal(orderPayload.lines.length,2);
assert.equal(state.products[0].stock,14);
assert.equal(vm.runInContext('cart.length',ctx),0);
assert.equal(vm.runInContext('page',ctx),'admin');
console.log('PASS: 共有UIの読み込み、花束価格、デモキー、サーバー注文、在庫再取得、注文画面表示');
