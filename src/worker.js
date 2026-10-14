// Cloudflare Worker + D1, intentionally dependency-free while UI is prototyped.
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const response = (data, status=200) => new Response(JSON.stringify(data), {status, headers});
const fail = (message, status=400) => response({error:message},status);
const isInt = (v,min=0,max=1000000) => Number.isSafeInteger(v)&&v>=min&&v<=max;

async function sameSecret(a,b) {
  if (!a || !b || a.length>200 || b.length>200) return false;
  const enc = new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const u=new Uint8Array(x),v=new Uint8Array(y);
  let diff=0; for(let i=0;i<u.length;i++)diff|=u[i]^v[i]; return diff===0;
}
async function requireDemo(request,env) {
  if (!env.DEMO_KEY || !(await sameSecret(request.headers.get('x-demo-key'), env.DEMO_KEY))) throw Object.assign(new Error('体験用キーが必要です'),{status:401});
}
async function input(request) {
  const text=await request.text();
  if(text.length>32768)throw Object.assign(new Error('送信データが大きすぎます'),{status:413});
  try{return JSON.parse(text)}catch{throw Object.assign(new Error('JSON形式を確認してください'),{status:400})}
}
async function products(db){
  const {results}=await db.prepare('SELECT id,name,type,price,stock,icon,tone,active,image_id AS imageId FROM products ORDER BY rowid').all();
  return results.map(p=>({...p,active:Boolean(p.active)}));
}
async function catalog(db){
  const [{results:ps},{results:ws}]=await Promise.all([db.prepare('SELECT id,name,type,price,stock,icon,tone,active,image_id AS imageId FROM products ORDER BY rowid').all(),db.prepare('SELECT id,name,price,icon FROM wraps ORDER BY rowid').all()]);
  const {results:templates}=await db.prepare('SELECT id,name,image_id AS imageId,parts_json AS partsJson,wrap_id AS wrapId,created_at AS createdAt FROM bouquet_templates WHERE active=1 ORDER BY created_at DESC, rowid DESC LIMIT 60').all();
  return {products:ps.map(p=>({...p,active:Boolean(p.active)})),wraps:ws,templates:templates.map(t=>({id:t.id,name:t.name,imageId:t.imageId,wrapId:t.wrapId,parts:JSON.parse(t.partsJson),createdAt:t.createdAt}))};
}
async function adminState(db){
  const [c,os,ms]=await Promise.all([
    catalog(db),
    db.prepare('SELECT * FROM orders ORDER BY created_at DESC, rowid DESC LIMIT 200').all(),
    db.prepare('SELECT id,product_id AS productId,delta,reason,unit_cost AS unitCost,order_id AS orderId,created_at AS date FROM movements ORDER BY id DESC LIMIT 100').all()
  ]);
  return {...c,orders:os.results.map(o=>({id:o.id,createdAt:o.created_at,name:o.name,contact:o.contact,pickup:o.pickup,status:o.status,payment:o.payment,total:o.total,lines:JSON.parse(o.lines_json),itemSnapshots:JSON.parse(o.snapshots_json)})),movements:ms.results};
}
function normalizeLine(line,byId,byWrap) {
  if(!line||typeof line!=='object') throw new Error('商品を確認してください');
  if(line.kind==='single'){
    if(typeof line.id!=='string'||!isInt(line.qty,1,200))throw new Error('単品の数量を確認してください');
    const p=byId.get(line.id); if(!p||!p.active)throw new Error('販売していない商品が含まれます');
    return {snapshot:{title:p.name,detail:`切り花 ${line.qty}本`,total:p.price*line.qty},parts:[{id:p.id,qty:line.qty}]};
  }
  if(line.kind==='bouquet'){
    if(!Array.isArray(line.parts)||line.parts.length<1||line.parts.length>30)throw new Error('花束の花材を確認してください');
    const w=byWrap.get(line.wrapId); if(!w)throw new Error('包装を確認してください');
    const counts=new Map();
    for(const part of line.parts){
      if(!part||typeof part.id!=='string'||!isInt(part.qty,1,200))throw new Error('花材の本数を確認してください');
      const p=byId.get(part.id); if(!p||!p.active)throw new Error('販売していない花材が含まれます');
      counts.set(p.id,(counts.get(p.id)||0)+part.qty);
    }
    const parts=[...counts].map(([id,qty])=>({id,qty}));
    if(parts.some(p=>p.qty>200))throw new Error('花材の本数が多すぎます');
    const total=parts.reduce((s,p)=>s+byId.get(p.id).price*p.qty,0)+w.price+500;
    const detail=parts.map(p=>`${byId.get(p.id).name} × ${p.qty}`).join('、')+` ／ 包装：${w.name} ／ 制作料込み`;
    return {snapshot:{title:'オーダーメイド花束',detail,total},parts};
  }
  throw new Error('商品種別を確認してください');
}
async function demoCheckout(db,body) {
  if(!body||!Array.isArray(body.lines)||body.lines.length===0||body.lines.length>40)throw new Error('カートを確認してください');
  const name=String(body.name||'').trim(),contact=String(body.contact||'').trim(),pickup=String(body.pickup||'');
  if(!name||!contact||name.length>100||contact.length>100||pickup.length>30)throw new Error('テスト用の注文者情報を確認してください');
  const c=await catalog(db),byId=new Map(c.products.map(p=>[p.id,p])),byWrap=new Map(c.wraps.map(w=>[w.id,w]));
  const calculated=body.lines.map(l=>normalizeLine(l,byId,byWrap));
  const demand=new Map();
  for(const line of calculated)for(const part of line.parts)demand.set(part.id,(demand.get(part.id)||0)+part.qty);
  for(const [id,qty] of demand)if(byId.get(id).stock<qty)throw Object.assign(new Error(`${byId.get(id).name}の在庫が不足しています`),{status:409});
  const total=calculated.reduce((s,l)=>s+l.snapshot.total,0);
  if(!isInt(total,0,10000000))throw new Error('合計金額を確認してください');
  const id=crypto.randomUUID();
  const stmts=[db.prepare('INSERT INTO orders(id,name,contact,pickup,total,lines_json,snapshots_json) VALUES(?,?,?,?,?,?,?)').bind(id,name,contact,pickup,total,JSON.stringify(body.lines),JSON.stringify(calculated.map(l=>l.snapshot)))];
  for(const [pid,qty] of demand){
    stmts.push(db.prepare('INSERT INTO order_demand(order_id,product_id,qty) VALUES(?,?,?)').bind(id,pid,qty));
    // SQLite stock CHECK rejects negative values and rolls back the entire D1 batch.
    stmts.push(db.prepare('UPDATE products SET stock = stock - ? WHERE id=?').bind(qty,pid));
    stmts.push(db.prepare("INSERT INTO movements(product_id,delta,reason,order_id) VALUES(?,?,'ECテスト注文',?)").bind(pid,-qty,id));
  }
  await db.batch(stmts);
  return {id,total,payment:'SIMULATED'};
}
async function createProduct(db,v) {
  const name=String(v?.name||'').trim(),type=String(v?.type||'').trim(),price=v?.price,stock=v?.stock??0;
  if(!name||name.length>80||type.length>80||!isInt(price)||!isInt(stock,0,100000))throw new Error('商品名・価格・在庫数を確認してください');
  const imageId=v?.imageId??null;
  if(imageId!==null && !(await db.prepare('SELECT id FROM media WHERE id=?').bind(imageId).first()))throw new Error('画像が見つかりません');
  const id=crypto.randomUUID();
  const list=[db.prepare("INSERT INTO products(id,name,type,price,stock,icon,tone,active,image_id) VALUES(?,?,?,?,?,'✿','white',1,?)").bind(id,name,type,price,stock,imageId)];
  if(stock>0)list.push(db.prepare("INSERT INTO movements(product_id,delta,reason) VALUES(?,?,'初期在庫')").bind(id,stock));
  await db.batch(list);return {id};
}
async function updateProduct(db,id,v){
  if(typeof v?.price!=='undefined' && !isInt(v.price))throw new Error('価格を確認してください');
  if(typeof v?.active!=='undefined' && typeof v.active!=='boolean')throw new Error('公開設定を確認してください');
  if(v?.imageId!==undefined && v.imageId!==null && !(await db.prepare('SELECT id FROM media WHERE id=?').bind(v.imageId).first()))throw new Error('画像が見つかりません');
  const row=await db.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
  if(!row)throw Object.assign(new Error('商品が見つかりません'),{status:404});
  await db.prepare('UPDATE products SET price=?,active=?,image_id=? WHERE id=?').bind(v.price??row.price,typeof v.active==='boolean'?(v.active?1:0):row.active,v.imageId===undefined?row.image_id:v.imageId,id).run();
  return {ok:true};
}
async function changeStock(db,v){
  const id=String(v?.productId||''),reason=v?.reason,qty=v?.qty,unitCost=v?.unitCost??null;
  const valid=['仕入れ','店頭販売','廃棄・調整','在庫補正'];
  if(!valid.includes(reason)||!isInt(qty,1,100000)||(unitCost!==null&&!isInt(unitCost)))throw new Error('仕入れ・販売の入力を確認してください');
  const row=await db.prepare('SELECT stock,name FROM products WHERE id=?').bind(id).first();
  if(!row)throw Object.assign(new Error('商品が見つかりません'),{status:404});
  const delta=['仕入れ','在庫補正'].includes(reason)?qty:-qty;
  if(row.stock+delta<0)throw Object.assign(new Error('在庫が不足しています'),{status:409});
  await db.batch([
    db.prepare('UPDATE products SET stock=stock+? WHERE id=?').bind(delta,id),
    db.prepare('INSERT INTO movements(product_id,delta,reason,unit_cost) VALUES(?,?,?,?)').bind(id,delta,reason,reason==='仕入れ'?unitCost:null)
  ]);
  return {ok:true};
}
async function setStatus(db,id,status){
  if(!['producing','done','canceled'].includes(status))throw new Error('注文状態を確認してください');
  const o=await db.prepare('SELECT status FROM orders WHERE id=?').bind(id).first();
  if(!o)throw Object.assign(new Error('注文がありません'),{status:404});
  if(!((o.status==='new'&&['producing','canceled'].includes(status))||(o.status==='producing'&&['done','canceled'].includes(status))))throw Object.assign(new Error('注文状態を変更できません'),{status:409});
  // Trigger on status=canceled returns inventory once, transactionally.
  const out=await db.prepare('UPDATE orders SET status=? WHERE id=? AND status=?').bind(status,id,o.status).run();
  if(out.meta?.changes!==1)throw Object.assign(new Error('別の操作で注文状態が変更されました'),{status:409});
  return {ok:true};
}

// Images are uploaded via the staff-only endpoint and stored in an R2 bucket.
async function uploadMedia(request,env){
  if(!env.FLOWER_IMAGES)throw Object.assign(new Error('R2バケット接続がありません'),{status:503});
  const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error('JPEG・PNG・WebPの画像を選んでください');
  const declared=Number(request.headers.get('content-length')||0);
  if(declared>4*1024*1024)throw Object.assign(new Error('画像は4MB以下にしてください'),{status:413});
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(!bytes.length||bytes.length>4*1024*1024)throw Object.assign(new Error('画像は4MB以下にしてください'),{status:413});
  const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const webp=String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP';
  if(!(mime==='image/jpeg'&&jpeg||mime==='image/png'&&png||mime==='image/webp'&&webp))throw new Error('画像形式が一致しません');
  const id=crypto.randomUUID(), key='flowers/'+id, put=await env.FLOWER_IMAGES.put(key,bytes,{httpMetadata:{contentType:mime}});
  if(!put)throw Object.assign(new Error('画像保存に失敗しました'),{status:500});
  try{await env.DB.prepare('INSERT INTO media(id,r2_key,mime,byte_count) VALUES(?,?,?,?)').bind(id,key,mime,bytes.length).run()}
  catch(e){await env.FLOWER_IMAGES.delete(key);throw e}
  return {id,url:'/api/media/'+id};
}
async function serveMedia(id,env){
  if(!/^[0-9a-f-]{36}$/.test(id))return fail('画像が見つかりません',404);
  const row=await env.DB.prepare('SELECT r2_key,mime FROM media WHERE id=?').bind(id).first();
  if(!row||!env.FLOWER_IMAGES)return fail('画像が見つかりません',404);
  const data=await env.FLOWER_IMAGES.get(row.r2_key);
  if(!data)return fail('画像が見つかりません',404);
  return new Response(data.body,{headers:{'Content-Type':row.mime,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
async function saveTemplate(db,v){
  const name=String(v?.name||'').trim(),wrapId=String(v?.wrapId||''),imageId=String(v?.imageId||'');
  if(!name||name.length>80||!imageId||!Array.isArray(v?.parts)||v.parts.length<1||v.parts.length>30)throw new Error('花束の名称・写真・花材を確認してください');
  const [w,m,ps]=await Promise.all([
    db.prepare('SELECT id FROM wraps WHERE id=?').bind(wrapId).first(),
    db.prepare('SELECT id FROM media WHERE id=?').bind(imageId).first(),
    db.prepare('SELECT id FROM products').all()
  ]);
  if(!w||!m)throw new Error('包装または写真が見つかりません');
  const valid=new Set(ps.results.map(p=>p.id)),sum=new Map();
  for(const part of v.parts){
    if(!valid.has(part?.id)||!isInt(part?.qty,1,200))throw new Error('花材の内容を確認してください');
    sum.set(part.id,(sum.get(part.id)||0)+part.qty);
  }
  if([...sum.values()].some(q=>q>200))throw new Error('花材の本数が多すぎます');
  const parts=[...sum].map(([id,qty])=>({id,qty})),id=crypto.randomUUID();
  await db.prepare('INSERT INTO bouquet_templates(id,name,image_id,parts_json,wrap_id) VALUES(?,?,?,?,?)').bind(id,name,imageId,JSON.stringify(parts),wrapId).run();
  return {id};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname;
    if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
    if(!env.DB)return fail('D1接続が設定されていません',503);
    try{
      if(path==='/api/catalog'&&request.method==='GET')return response(await catalog(env.DB));
      const mediaMatch=path.match(/^\/api\/media\/([^/]+)$/);
      if(mediaMatch&&request.method==='GET')return await serveMedia(mediaMatch[1],env);
      // Entire stage-2 write/admin API is behind DEMO_KEY. No public customer checkout yet.
      await requireDemo(request,env);
      if(path==='/api/admin/state'&&request.method==='GET')return response(await adminState(env.DB));
      if(path==='/api/admin/media'&&request.method==='POST')return response(await uploadMedia(request,env),201);
      if(path==='/api/admin/templates'&&request.method==='POST')return response(await saveTemplate(env.DB,await input(request)),201);
      if(path==='/api/demo/orders'&&request.method==='POST')return response(await demoCheckout(env.DB,await input(request)),201);
      if(path==='/api/admin/products'&&request.method==='POST')return response(await createProduct(env.DB,await input(request)),201);
      const productMatch=path.match(/^\/api\/admin\/products\/([^/]+)$/);
      if(productMatch&&request.method==='PATCH')return response(await updateProduct(env.DB,decodeURIComponent(productMatch[1]),await input(request)));
      if(path==='/api/admin/movements'&&request.method==='POST')return response(await changeStock(env.DB,await input(request)),201);
      const orderMatch=path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
      if(orderMatch&&request.method==='PATCH')return response(await setStatus(env.DB,decodeURIComponent(orderMatch[1]),(await input(request)).status));
      return fail('APIが見つかりません',404);
    }catch(e){
      const code=e.status||(/constraint|INSUFFICIENT_STOCK|SALE_DISABLED|CHECK constraint|FOREIGN KEY/i.test(e.message)?409:400);
      if(code>=500)console.error(e);
      return fail(e.message||'処理に失敗しました',code);
    }
  }
};
