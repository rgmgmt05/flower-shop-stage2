'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const yen=v=>'¥'+Number(v||0).toLocaleString('ja-JP');
let catalog={products:[],wraps:[]},cart=[],parts={},mode='single',pendingId=crypto.randomUUID(),user=null;
const prod=id=>catalog.products.find(p=>p.id===id);
const getWrap=id=>catalog.wraps.find(w=>w.id===id);
async function request(path,method='GET',body){
 const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});
 let d={};try{d=await r.json()}catch(e){}
 if(!r.ok)throw Error(d.error||'通信エラー '+r.status);return d;
}
function notice(msg){$('toast').hidden=false;$('toast').textContent=msg;clearTimeout(notice.t);notice.t=setTimeout(()=>$('toast').hidden=true,3500)}
function showAuth(){
 $('loading').hidden=true;$('auth').hidden=false;$('pos').hidden=true;$('signout').hidden=true;
}
function showPos(){
 $('loading').hidden=true;$('auth').hidden=true;$('pos').hidden=false;$('signout').hidden=false;
 $('staff-label').textContent=user.displayName+' / スタッフ';
 render();fetchSales();
}
async function init(){
 try{
  const result=await request('/api/auth/me');
  user=result.user;
  if(!user||user.role!=='staff'){showAuth();return}
  catalog=await request('/api/catalog');showPos();
 }catch(e){showAuth();notice(e.message)}
}
async function login(){
 try{
  const r=await request('/api/auth/login','POST',{email:$('email').value.trim(),password:$('password').value});
  user=r.user;
  if(user.role!=='staff')return notice('スタッフのログインが必要です');
  catalog=await request('/api/catalog');showPos();
 }catch(e){notice(e.message)}
}
function addSingle(id){
 const p=prod(id);if(!p||!p.active||p.stock<1)return;
 let line=cart.find(l=>l.kind==='single'&&l.id===id);
 if(line){if(line.qty>=p.stock)return notice('在庫を確認してください');line.qty++}
 else cart.push({kind:'single',id,qty:1});
 resetPending();render();
}
function adjustSingle(id,delta){
 const p=prod(id),line=cart.find(l=>l.kind==='single'&&l.id===id);
 if(!line)return;line.qty+=delta;
 if(line.qty<1)cart=cart.filter(l=>l!==line);
 else if(p&&line.qty>p.stock)line.qty=p.stock;
 resetPending();render();
}
function adjustPart(id,delta){
 const p=prod(id);if(!p)return;
 const next=(parts[id]||0)+delta;
 if(next<0||next>p.stock)return notice('在庫を確認してください');
 if(next)parts[id]=next;else delete parts[id];
 renderParts();
}
function suggestedPrice(){
 const subtotal=Object.entries(parts).reduce((s,[id,n])=>s+(prod(id)?.price||0)*n,0);
 return subtotal+500+(getWrap($('wrap-id').value)?.price||0);
}
function addBouquet(){
 const price=Number($('bouquet-price').value);
 if(!Object.keys(parts).length)return notice('花材を選んでください');
 if($('bouquet-price').value===''||!Number.isInteger(price)||price<0||price>10000000)return notice('売価を入力してください');
 cart.push({kind:'bouquet',parts:Object.entries(parts).map(([id,qty])=>({id,qty})),wrapId:$('wrap-id').value||null,price});
 parts={};$('bouquet-price').value='';resetPending();render();selectMode('single');
}
function lineTotal(line){return line.kind==='single'?(prod(line.id)?.price||0)*line.qty:line.price}
function renderProducts(){
 const filter=$('filter').value.toLowerCase().trim();
 $('products').innerHTML=catalog.products.filter(p=>p.active&&p.name.toLowerCase().includes(filter))
  .map(p=>'<button class="product" type="button" data-add="'+esc(p.id)+'" '+(p.stock<=0?'disabled':'')+'><strong>'+esc(p.name)+'</strong><span>'+yen(p.price)+' / 本　 在庫 '+p.stock+'</span></button>').join('')||'<p>商品がありません。</p>';
}
function renderParts(){
 $('bouquet-parts').innerHTML=catalog.products.filter(p=>p.active).map(p=>'<div class="row"><div><strong>'+esc(p.name)+'</strong><small>'+yen(p.price)+' / 本　 在庫 '+p.stock+'</small></div><div class="q"><button data-part="'+esc(p.id)+'" data-delta="-1">−</button><span>'+(parts[p.id]||0)+'</span><button data-part="'+esc(p.id)+'" data-delta="1" '+((parts[p.id]||0)>=p.stock?'disabled':'')+'>＋</button></div></div>').join('');
}
function renderCart(){
 const itemHtml=cart.map((l,i)=>{
 const title=l.kind==='single'?prod(l.id)?.name||'商品':'即興花束';
 const detail=l.kind==='single'?'本数 '+l.qty+'本':l.parts.map(x=>(prod(x.id)?.name||'花材')+' × '+x.qty).join(' / ');
 return '<div class="row"><div><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small><button class="light" type="button" data-remove="'+i+'">削除</button></div><strong>'+yen(lineTotal(l))+'</strong></div>'
 }).join('');
 $('lines').innerHTML=itemHtml||'<p class="hint">販売する商品を選んでください。</p>';
 $('total').textContent=yen(cart.reduce((a,l)=>a+lineTotal(l),0));
 $('checkout').disabled=cart.length===0;
}
function render(){
 renderProducts();renderParts();
 const before=$('wrap-id').value;
 $('wrap-id').innerHTML=catalog.wraps.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'（'+yen(w.price)+'）</option>').join('');
 if(catalog.wraps.some(w=>w.id===before))$('wrap-id').value=before;
 renderCart();
}
function selectMode(m){
 mode=m;document.querySelectorAll('[data-mode]').forEach(e=>e.classList.toggle('active',e.dataset.mode===m));
 $('single-panel').hidden=m!=='single';$('bouquet-panel').hidden=m!=='bouquet';
}
function resetPending(){pendingId=crypto.randomUUID();$('receipt').hidden=true}
async function checkout(){
 if(!user||user.role!=='staff'||!cart.length)return;
 const method=$('payment').value;
 if(!confirm('受領を確認し、'+yen(cart.reduce((a,l)=>a+lineTotal(l),0))+'の会計を確定しますか？'))return;
 $('checkout').disabled=true;
 try{
  const r=await request('/api/pos/sales','POST',{requestId:pendingId,paymentMethod:method,lines:cart});
  $('receipt').hidden=false;$('receipt').textContent='会計確定：'+r.id.slice(0,8)+'　'+yen(r.total)+(r.alreadyProcessed?'（処理済み）':'');
  cart=[];parts={};pendingId=crypto.randomUUID();
  catalog=await request('/api/catalog');render();fetchSales();notice('会計を保存しました');
 }catch(e){notice(e.message);$('checkout').disabled=false}
}
async function fetchSales(){
 try{const r=await request('/api/pos/sales');$('recent').innerHTML=r.sales.slice(0,15).map(s=>
 '<div class="row"><span>'+esc(s.createdAt)+'<small>'+esc(s.id.slice(0,8))+' / '+(s.paymentMethod==='cash'?'現金':'外部決済')+'</small></span><strong>'+yen(s.total)+'</strong></div>').join('')||'<p class="hint">店頭会計はまだありません。</p>'}catch(e){notice(e.message)}
}
$('login-form').addEventListener('submit',e=>{e.preventDefault();login()});
$('signout').addEventListener('click',async()=>{try{await request('/api/auth/logout','POST',{});user=null;cart=[];showAuth()}catch(e){notice(e.message)}});
$('filter').addEventListener('input',renderProducts);
$('wrap-id').addEventListener('change',()=>{});
$('suggest-price').addEventListener('click',()=>{$('bouquet-price').value=String(suggestedPrice())});
$('add-bouquet').addEventListener('click',addBouquet);
$('checkout').addEventListener('click',checkout);
$('clear').addEventListener('click',()=>{cart=[];resetPending();renderCart()});
document.addEventListener('click',e=>{
 const m=e.target.closest('[data-mode]');if(m){selectMode(m.dataset.mode);return}
 const add=e.target.closest('[data-add]');if(add){addSingle(add.dataset.add);return}
 const part=e.target.closest('[data-part]');if(part){adjustPart(part.dataset.part,Number(part.dataset.delta));return}
 const remove=e.target.closest('[data-remove]');if(remove){cart.splice(Number(remove.dataset.remove),1);resetPending();renderCart();return}
});
init();
