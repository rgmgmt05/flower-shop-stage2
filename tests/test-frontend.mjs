import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:'',style:{},disabled:false});return elements.get(id)}
let state={products:[{id:'rose-r',name:'赤バラ',type:'バラ・赤',price:350,stock:18,icon:'🌹',tone:'coral',active:true}],wraps:[{id:'natural',name:'クラフト',price:200,icon:'◌'}],orders:[],movements:[],templates:[]};
let orderPayload=null;
async function fetchFake(path,opts={}){
 if(path==='/api/auth/me')return {ok:true,status:200,json:async()=>({user:null})};
 if(path==='/api/catalog')return {ok:true,status:200,json:async()=>({products:state.products,wraps:state.wraps,templates:[]})};
 if(path==='/api/demo/orders'){
  assert.equal(opts.headers['x-demo-key'],'test-access-key');
  orderPayload=JSON.parse(opts.body);
  state.products[0].stock-=4;
  return {ok:true,status:201,json:async()=>({id:'test-uuid',total:2100})};
 }
 throw Error('Unknown '+path);
}
const ctx={
 document:{getElementById:el,querySelectorAll:()=>[]},
 window:{scrollTo:()=>{}},
 fetch:fetchFake,console,confirm:()=>true,setTimeout:()=>1,clearTimeout:()=>{},
 Date,Number,Map,Promise,URL,Image:class {}
};
vm.createContext(ctx);vm.runInContext(code,ctx);
await new Promise(r=>setImmediate(r));
vm.runInContext("changeBouquet('rose-r',1);changeBouquet('rose-r',1);changeBouquet('rose-r',1)",ctx);
assert.equal(vm.runInContext('builderTotal().total',ctx),1750);
vm.runInContext('addBouquet()',ctx);
vm.runInContext("addSingle('rose-r')",ctx);
el('customer-name').value='テスト';
el('customer-contact').value='test@example.invalid';
el('guest-key').value='test-access-key';
el('pickup-date').value='2026-11-01T10:00';
el('fulfillment-method').value='pickup';
await vm.runInContext('checkout()',ctx);
assert.equal(orderPayload.lines.length,2);
assert.equal(orderPayload.fulfillmentMethod,'pickup');
assert.equal(state.products[0].stock,14);
assert.equal(vm.runInContext('cart.length',ctx),0);
assert.equal(vm.runInContext('page',ctx),'cart');
assert.ok(el('order-result').textContent.includes('test-uuid'));
console.log('PASS: 顧客UI、花束価格、招待制ゲストテスト注文、在庫更新');
