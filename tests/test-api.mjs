import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';

class MockDB {
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON;');this.db.exec(fs.readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../migrations/0002_images_bouquets.sql',import.meta.url),'utf8'))}
 prepare(sql){
  const instance=this.db;
  function bound(params=[]){return {
   _run:()=>instance.prepare(sql).run(...params),
   run:async()=>{const x=instance.prepare(sql).run(...params);return {meta:{changes:x.changes}}},
   first:async()=>instance.prepare(sql).get(...params)||null,
   all:async()=>({results:instance.prepare(sql).all(...params)}),
   bind:(...args)=>bound(args)
  }}
  return bound();
 }
 async batch(stmts){
  this.db.exec('BEGIN');
  try{const res=stmts.map(stmt=>({meta:{changes:stmt._run().changes}}));this.db.exec('COMMIT');return res}
  catch(e){this.db.exec('ROLLBACK');throw e}
 }
}
const imageMap=new Map();const mockR2={put:async(k,data)=>{imageMap.set(k,data);return {etag:'ok'}},get:async(k)=>imageMap.has(k)?{body:imageMap.get(k)}:null,delete:async(k)=>imageMap.delete(k)};
const db=new MockDB(),env={DB:db,FLOWER_IMAGES:mockR2,DEMO_KEY:'a-random-long-demo-secret',ASSETS:{fetch:()=>new Response('ok')}};
async function req(path, method='GET', data=null, key=true){
 const headers={};if(key)headers['x-demo-key']=env.DEMO_KEY;
 if(data!==null)headers['content-type']='application/json';
 const result=await worker.fetch(new Request('https://demo.example'+path,{method,headers,body:data===null?undefined:JSON.stringify(data)}),env);
 return {status:result.status, data:await result.json()};
}
assert.equal((await req('/api/catalog','GET',null,false)).data.products.length,6);
assert.equal((await req('/api/admin/state','GET',null,false)).status,401);
assert.equal((await req('/api/demo/orders','POST',{lines:[]},false)).status,401);
const start=(await req('/api/admin/state')).data;
assert.equal(start.products.find(p=>p.id==='rose-r').stock,18);
const cart={name:'試験用',contact:'example.invalid',pickup:'2026-11-01',total:1,lines:[{kind:'single',id:'rose-r',qty:1},{kind:'bouquet',parts:[{id:'rose-r',qty:3}],wrapId:'natural'}]};
const checkout=await req('/api/demo/orders','POST',cart);
assert.equal(checkout.status,201,JSON.stringify(checkout));
assert.equal(checkout.data.total,2100);
let latest=(await req('/api/admin/state')).data;
assert.equal(latest.products.find(p=>p.id==='rose-r').stock,14);
assert.equal(latest.orders.length,1);
assert.equal(latest.movements.length,1);
assert.equal((await req('/api/demo/orders','POST',{...cart,lines:[{kind:'single',id:'rose-r',qty:15}]})).status,409);
assert.equal((await req('/api/admin/state')).data.products.find(p=>p.id==='rose-r').stock,14);
assert.equal((await req('/api/admin/orders/'+checkout.data.id+'/status','PATCH',{status:'producing'})).status,200);
assert.equal((await req('/api/admin/orders/'+checkout.data.id+'/status','PATCH',{status:'canceled'})).status,200);
latest=(await req('/api/admin/state')).data;
assert.equal(latest.products.find(p=>p.id==='rose-r').stock,18);
assert.equal((await req('/api/admin/orders/'+checkout.data.id+'/status','PATCH',{status:'canceled'})).status,409);
assert.equal((await req('/api/admin/state')).data.products.find(p=>p.id==='rose-r').stock,18);
assert.equal((await req('/api/admin/movements','POST',{productId:'rose-r',reason:'仕入れ',qty:5,unitCost:100})).status,201);
assert.equal((await req('/api/admin/movements','POST',{productId:'rose-r',reason:'店頭販売',qty:3})).status,201);
assert.equal((await req('/api/admin/state')).data.products.find(p=>p.id==='rose-r').stock,20);
assert.equal((await req('/api/admin/movements','POST',{productId:'rose-r',reason:'店頭販売',qty:999})).status,409);
assert.equal((await req('/api/admin/state')).data.products.find(p=>p.id==='rose-r').stock,20);
assert.equal((await req('/api/admin/products/rose-r','PATCH',{price:370,active:false})).status,200);
assert.equal((await req('/api/demo/orders','POST',{...cart,lines:[{kind:'single',id:'rose-r',qty:1}]})).status,400);
const created=await req('/api/admin/products','POST',{name:'ヒマワリ',type:'黄',price:340,stock:9});
assert.equal(created.status,201);
assert.equal((await req('/api/catalog','GET',null,false)).data.products.length,7);
console.log('PASS: API認証、商品・在庫、原価付き仕入れ、店頭販売、模擬注文、価格再計算、注文取消、二重取消防止、在庫不足防止、商品追加');

// Product imagery + reusable bouquet template, with R2 stored media.
const jpg=new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,0xff,0xd9]);
const imageResp=await worker.fetch(new Request('https://demo.example/api/admin/media',{method:'POST',headers:{'x-demo-key':env.DEMO_KEY,'content-type':'image/jpeg'},body:jpg}),env);
assert.equal(imageResp.status,201);
const imageId=(await imageResp.json()).id;
assert.ok(imageId);
const imageView=await worker.fetch(new Request('https://demo.example/api/media/'+imageId),env);
assert.equal(imageView.status,200);
assert.equal(imageView.headers.get('content-type'),'image/jpeg');
assert.deepEqual(new Uint8Array(await imageView.arrayBuffer()),jpg);
assert.equal((await req('/api/admin/products/rose-r','PATCH',{imageId})).status,200);
assert.equal((await req('/api/catalog','GET',null,false)).data.products.find(p=>p.id==='rose-r').imageId,imageId);
const template=await req('/api/admin/templates','POST',{name:'完成花束の実例',imageId,wrapId:'white',parts:[{id:'rose-r',qty:2},{id:'tulip',qty:3}]});
assert.equal(template.status,201,JSON.stringify(template));
const templates=(await req('/api/catalog','GET',null,false)).data.templates;
assert.equal(templates.length,1);
assert.equal(templates[0].parts[0].qty,2);
assert.equal(templates[0].imageId,imageId);
assert.equal((await req('/api/admin/state')).data.products.find(p=>p.id==='rose-r').stock,20,'実例登録は在庫を減らさない');
assert.equal((await req('/api/admin/templates','POST',{name:'wrong',imageId,wrapId:'white',parts:[{id:'invalid',qty:1}]})).status,400);
const wrongMime=await worker.fetch(new Request('https://demo.example/api/admin/media',{method:'POST',headers:{'x-demo-key':env.DEMO_KEY,'content-type':'image/svg+xml'},body:'<svg/>',}),env);
assert.equal(wrongMime.status,400);
console.log('PASS: R2画像保存・公開、花材画像の更新、完成花束の実例登録と在庫非連動');
