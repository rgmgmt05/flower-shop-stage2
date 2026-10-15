'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const yen=v=>'¥'+Number(v||0).toLocaleString('ja-JP');
let catalog={products:[],wraps:[]},cart=[],parts={},drafts={},mode='single',pendingId=crypto.randomUUID(),user=null;
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

function currentDemand(lines=cart){
 const amounts=new Map();
 for(const line of lines){
  const n=line.kind==='single'?line.qty:(line.qty||1);
  const materials=line.kind==='single'?[{id:line.id,qty:1}]:line.parts;
  for(const x of materials)amounts.set(x.id,(amounts.get(x.id)||0)+x.qty*n);
 }
 return amounts;
}
function validateCart(lines){
 if(lines.length>40)return '1回の会計は40品目までです';
 const demand=currentDemand(lines);
 for(const [id,qty] of demand){
  const p=prod(id);if(!p||!p.active||qty>p.stock)return (p?.name||'花材')+'の在庫を確認してください';
 }
 return null;
}
function changeSingle(id,qty){
 const p=prod(id),n=Number(qty);
 if(!p||!p.active||!Number.isInteger(n)||n<1||n>999)return notice('切り花の本数を確認してください');
 const next=cart.map(x=>({...x}));
 const existing=next.find(l=>l.kind==='single'&&l.id===id);
 if(existing)existing.qty+=n;else next.push({kind:'single',id,qty:n});
 const issue=validateCart(next);
 if(issue)return notice(issue);
 cart=next;resetPending();renderCart();
}
function addSingle(id){changeSingle(id,1)}
function addBulk(){
 const batch=Object.entries(drafts).filter(([id,q])=>Number(q)>0&&prod(id));
 if(!batch.length)return notice('花材の本数を入力してください');
 const next=cart.map(x=>({...x}));
 for(const [id,raw] of batch){
  const qty=Number(raw);
  if(!Number.isInteger(qty)||qty<1||qty>999)return notice('1種類あたり1〜999本で入力してください');
  const current=next.find(l=>l.kind==='single'&&l.id===id);
  if(current)current.qty+=qty;else next.push({kind:'single',id,qty});
 }
 const issue=validateCart(next);if(issue)return notice(issue);
 cart=next;drafts={};resetPending();render();
 notice(batch.length+'種類を会計に追加しました');
}
function updateBulkSummary(){
 const chosen=Object.entries(drafts).filter(([id,q])=>Number(q)>0&&prod(id));
 const stems=chosen.reduce((n,[id,q])=>n+Number(q),0);
 const total=chosen.reduce((n,[id,q])=>n+Number(q)*prod(id).price,0);
 $('bulk-summary').textContent=chosen.length?chosen.length+'種類 / '+stems+'本 / '+yen(total):'本数を入力してください';
}
function setDraft(id,raw){
 if(!prod(id))return;
 if(raw.trim()===''){delete drafts[id];updateBulkSummary();return}
 const qty=Number(raw);
 if(!Number.isInteger(qty)||qty<0||qty>999){notice('本数は0〜999で入力してください');return}
 drafts[id]=qty;updateBulkSummary();
}
function updateLineQty(index,raw){
 const line=cart[index],n=Number(raw);
 if(!line||!Number.isInteger(n)||n<1||n>999){renderCart();return notice('数量は1〜999で入力してください')}
 const next=cart.map(x=>({...x}));
 next[index].qty=n;
 const issue=validateCart(next);if(issue){renderCart();return notice(issue)}
 cart=next;resetPending();renderCart();
}
function adjustPart(id,delta){
 const p=prod(id);if(!p)return;
 const n=(parts[id]||0)+delta;
 setPartQty(id,n);
}
function setPartQty(id,n){
 const p=prod(id);if(!p)return;
 if(!Number.isInteger(n)||n<0||n>999||n>p.stock)return notice(p.name+'の本数を確認してください');
 if(n)parts[id]=n;else delete parts[id];
 renderParts();renderBouquetSubtotal();
}
function renderBouquetSubtotal(){
 const qty=Number($('bouquet-quantity').value||1);
 const price=Number($('bouquet-price').value||0);
 $('bouquet-subtotal').textContent=Object.keys(parts).length+'種類の花材 · '+(Number.isInteger(qty)&&qty>0?qty:0)+'点 · 売上 '+yen((Number.isInteger(qty)&&qty>0?qty:0)*price);
}
function suggestedPrice(){
 const subtotal=Object.entries(parts).reduce((s,[id,n])=>s+(prod(id)?.price||0)*n,0);
 return subtotal+500+(getWrap($('wrap-id').value)?.price||0);
}

function addBouquet(){
 const price=Number($('bouquet-price').value),qty=Number($('bouquet-quantity').value);
 if(!Object.keys(parts).length)return notice('花材を選んでください');
 if($('bouquet-price').value===''||!Number.isInteger(price)||price<0||price>10000000)return notice('花束1点の売価を入力してください');
 if(!Number.isInteger(qty)||qty<1||qty>999)return notice('花束の点数は1〜999で入力してください');
 const next=[...cart,{kind:'bouquet',parts:Object.entries(parts).map(([id,qty])=>({id,qty})),wrapId:$('wrap-id').value||null,price,qty}];
 const issue=validateCart(next);if(issue)return notice(issue);
 if(next.reduce((t,l)=>t+lineTotal(l),0)>10000000)return notice('1会計の上限額を超えています');
 cart=next;
 parts={};$('bouquet-price').value='';$('bouquet-quantity').value='1';resetPending();render();selectMode('single');
 notice('花束を'+qty+'点追加しました');
}
function lineTotal(line){return line.kind==='single'?(prod(line.id)?.price||0)*line.qty:line.price*(line.qty||1)}
function renderProducts(){
 const filter=$('filter').value.toLowerCase().trim();
 $('products').innerHTML=catalog.products.filter(p=>p.active&&p.name.toLowerCase().includes(filter))
  .map(p=>'<div class="bulk-row"><div class="bulk-product"><strong>'+esc(p.name)+'</strong><small>'+yen(p.price)+' / 本　　在庫 '+p.stock+'</small></div><div class="bulk-quantity"><input aria-label="'+esc(p.name)+'の本数" data-bulk-id="'+esc(p.id)+'" type="number" min="0" max="'+Math.min(999,p.stock)+'" step="1" inputmode="numeric" placeholder="0" value="'+(drafts[p.id]||'')+'" '+(p.stock<=0?'disabled':'')+'><button class="light add-one" type="button" data-add="'+esc(p.id)+'" '+(p.stock<=0?'disabled':'')+' aria-label="'+esc(p.name)+'を1本追加">+1</button></div></div>').join('')||'<p class="hint">商品がありません。</p>';
 updateBulkSummary();
}
function renderParts(){
 $('bouquet-parts').innerHTML=catalog.products.filter(p=>p.active).map(p=>'<div class="bulk-row bouquet-row"><div class="bulk-product"><strong>'+esc(p.name)+'</strong><small>'+yen(p.price)+' / 本　 在庫 '+p.stock+'</small></div><div class="q"><button type="button" data-part="'+esc(p.id)+'" data-delta="-1" aria-label="'+esc(p.name)+'を減らす">−</button><input aria-label="'+esc(p.name)+'の使用本数" type="number" inputmode="numeric" min="0" max="'+Math.min(999,p.stock)+'" step="1" data-part-qty="'+esc(p.id)+'" value="'+(parts[p.id]||0)+'"><button type="button" data-part="'+esc(p.id)+'" data-delta="1" '+((parts[p.id]||0)>=p.stock?'disabled':'')+' aria-label="'+esc(p.name)+'を増やす">＋</button></div></div>').join('');
}

function renderCart(){
 $('lines').innerHTML=cart.map((line,i)=>{
 const title=line.kind==='single'?prod(line.id)?.name||'商品':'即興花束';
 const detail=line.kind==='single'?yen(prod(line.id)?.price)+' / 本':line.parts.map(x=>(prod(x.id)?.name||'花材')+' × '+x.qty).join(' / ')+' · '+yen(line.price)+' / 点';
 return '<div class="cart-row"><div class="cart-row-head"><strong>'+esc(title)+'</strong><button class="remove" type="button" data-remove="'+i+'">削除</button></div><small>'+esc(detail)+'</small><div class="cart-row-bottom"><label>数量 <input type="number" inputmode="numeric" min="1" max="999" step="1" value="'+(line.qty||1)+'" data-cart-qty="'+i+'" aria-label="'+esc(title)+'の販売数量"></label><strong>'+yen(lineTotal(line))+'</strong></div></div>';
 }).join('')||'<p class="hint">販売する商品を選んでください。</p>';
 $('total').textContent=yen(cart.reduce((a,l)=>a+lineTotal(l),0));
 $('cart-lines-count').textContent=cart.length+'品目';
 $('checkout').disabled=cart.length===0;
}
function render(){
 renderProducts();renderParts();
 const before=$('wrap-id').value;
 $('wrap-id').innerHTML=catalog.wraps.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'（'+yen(w.price)+'）</option>').join('');
 if(catalog.wraps.some(w=>w.id===before))$('wrap-id').value=before;
 renderCart();renderBouquetSubtotal();
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
$('clear-quantities').addEventListener('click',()=>{drafts={};renderProducts()});
$('add-bulk').addEventListener('click',addBulk);
$('bouquet-price').addEventListener('input',renderBouquetSubtotal);
$('bouquet-quantity').addEventListener('input',renderBouquetSubtotal);
document.addEventListener('change',e=>{
 const line=e.target.closest('[data-cart-qty]');if(line){updateLineQty(Number(line.dataset.cartQty),line.value);return}
 const part=e.target.closest('[data-part-qty]');if(part){const n=part.value.trim()===''?0:Number(part.value);setPartQty(part.dataset.partQty,n);return}
});
document.addEventListener('input',e=>{
 const item=e.target.closest('[data-bulk-id]');if(item)setDraft(item.dataset.bulkId,item.value);
});
document.addEventListener('click',e=>{
 const m=e.target.closest('[data-mode]');if(m){selectMode(m.dataset.mode);return}
 const add=e.target.closest('[data-add]');if(add){addSingle(add.dataset.add);return}
 const part=e.target.closest('[data-part]');if(part){adjustPart(part.dataset.part,Number(part.dataset.delta));return}
 const remove=e.target.closest('[data-remove]');if(remove){cart.splice(Number(remove.dataset.remove),1);resetPending();renderCart();return}
});
init();
