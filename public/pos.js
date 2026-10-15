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
 $('loading').hidden=true;$('auth').hidden=false;$('pos').hidden=true;$('signout').hidden=true;$('mobile-totals').hidden=true;
}
function showPos(){
 $('loading').hidden=true;$('auth').hidden=true;$('pos').hidden=false;$('signout').hidden=false;$('mobile-totals').hidden=false;
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

function singleQuantity(id){return cart.find(l=>l.kind==='single'&&l.id===id)?.qty||0}
function setSingleQuantity(id,value){
 const p=prod(id);
 if(!p||!p.active||!Number.isInteger(value)||value<0||value>999)return false;
 const next=cart.map(x=>({...x}));
 const index=next.findIndex(x=>x.kind==='single'&&x.id===id);
 if(value===0){if(index>=0)next.splice(index,1)}
 else if(index>=0)next[index].qty=value;
 else next.push({kind:'single',id,qty:value});
 const issue=validateCart(next);
 if(issue){notice(issue);return false}
 cart=next;resetPending();renderCart();syncProductControls();
 return true;
}
function addSingle(id){
 const n=singleQuantity(id);
 if(n>=999||!setSingleQuantity(id,n+1))notice('在庫または入力上限を確認してください');
}
function syncProductControls(){
 const elements=document.querySelectorAll('[data-stem-card]');
 for(const card of elements){
  const id=card.getAttribute('data-stem-card'),p=prod(id),q=singleQuantity(id);
  card.classList.toggle('selected',q>0);
  const input=card.querySelector('[data-bulk-id]'),status=card.querySelector('[data-stem-status]'),add=card.querySelector('[data-add]');
  if(input&&document.activeElement!==input)input.value=String(q);
  if(status)status.textContent=q>0?'会計中 '+q+'本 · '+yen((p?.price||0)*q):'在庫 '+(p?.stock||0)+'本';
  if(add)add.disabled=!p||!p.active||q>=999||currentDemand().get(id)>=p.stock;
 }
 const items=cart.filter(l=>l.kind==='single');
 const stems=items.reduce((n,l)=>n+l.qty,0);
 $('bulk-summary').textContent='切り花：'+stems+'本 / '+items.length+'種類 · '+yen(items.reduce((n,l)=>n+lineTotal(l),0));
}
function setStemFromInput(id,raw){
 if(raw===''){
  setSingleQuantity(id,0);return;
 }
 const n=Number(raw);
 if(!setSingleQuantity(id,n))notice('本数は0〜999で指定してください');
}
function updateLineQty(index,raw){
 const line=cart[index],n=Number(raw);
 if(!line||!Number.isInteger(n)||n<1||n>999){renderCart();return notice('数量は1〜999で入力してください')}
 const next=cart.map(x=>({...x}));
 next[index].qty=n;
 const issue=validateCart(next);if(issue){renderCart();return notice(issue)}
 cart=next;resetPending();renderCart();syncProductControls();
}
function adjustPart(id,delta){
 const p=prod(id);if(!p)return;
 const n=(parts[id]||0)+delta;
 setPartQty(id,n);
}
function setPartQty(id,n,keepInput=false){
 const p=prod(id);if(!p)return;
 if(!Number.isInteger(n)||n<0||n>999||n>p.stock)return notice(p.name+'の本数を確認してください');
 if(n)parts[id]=n;else delete parts[id];
 if(!keepInput)renderParts();renderBouquetSubtotal();
}
function renderBouquetSubtotal(){
 const qty=Number($('bouquet-quantity').value||1);
 const price=Number($('bouquet-price').value||0);
 const effectiveQty=Number.isInteger(qty)&&qty>0?qty:0;
 const one=Object.values(parts).reduce((n,q)=>n+q,0);
 $('bouquet-subtotal').textContent=Object.keys(parts).length+'種類 / 1点 '+one+'本 × '+effectiveQty+'点 = 花材'+one*effectiveQty+'本 · 売価 '+yen(effectiveQty*price);
 updateSticky();
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
 $('products').innerHTML=catalog.products.filter(p=>p.active&&p.name.toLowerCase().includes(filter)).map(p=>{
  const qty=singleQuantity(p.id);
  return '<div class="stem-card '+(qty?'selected':'')+'" data-stem-card="'+esc(p.id)+'">'+
   '<div class="stem-name"><strong>'+esc(p.name)+'</strong><small>'+yen(p.price)+' / 本</small></div>'+
   '<div class="stem-entry"><label class="stem-input-wrap"><span>本数</span>'+
   '<input data-bulk-id="'+esc(p.id)+'" aria-label="'+esc(p.name)+'の会計本数" type="number" min="0" max="'+Math.min(999,p.stock)+'" step="1" inputmode="numeric" value="'+qty+'" '+(p.stock<=0?'disabled':'')+'></label>'+
   '<button class="light add-one" type="button" data-add="'+esc(p.id)+'" aria-label="'+esc(p.name)+'を1本追加" '+(p.stock<=0||qty>=p.stock||qty>=999?'disabled':'')+'>+1</button></div>'+
   '<div class="stem-current" data-stem-status="'+esc(p.id)+'">'+(qty?'会計中 '+qty+'本 · '+yen(qty*p.price):'在庫 '+p.stock+'本')+'</div></div>';
 }).join('')||'<p class="hint">商品がありません。</p>';
 syncProductControls();
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
 updateSticky();
}

function updateSticky(){
 const singles=cart.filter(l=>l.kind==='single').reduce((n,l)=>n+l.qty,0);
 const bouquets=cart.filter(l=>l.kind==='bouquet').reduce((n,l)=>n+(l.qty||1),0);
 $('mobile-stems').textContent=singles+'本 / 花束'+bouquets+'点';
 $('mobile-total').textContent=yen(cart.reduce((n,l)=>n+lineTotal(l),0));
 const preview=$('draft-preview');
 const count=Object.values(parts).reduce((n,q)=>n+q,0);
 const qty=Number($('bouquet-quantity').value||0);
 preview.hidden=mode!=='bouquet'||count===0;
 if(!preview.hidden)preview.textContent='花束入力中 '+count+'本/点 × '+(qty||0)+'点（会計未追加）';
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
 updateSticky();
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
$('clear').addEventListener('click',()=>{cart=[];resetPending();renderCart();renderProducts()});
$('view-cart').addEventListener('click',()=>{$('basket').scrollIntoView({behavior:'smooth',block:'start'})});
$('bouquet-price').addEventListener('input',renderBouquetSubtotal);
$('bouquet-quantity').addEventListener('input',renderBouquetSubtotal);
document.addEventListener('change',e=>{
 const line=e.target.closest('[data-cart-qty]');if(line){updateLineQty(Number(line.dataset.cartQty),line.value);return}
 const part=e.target.closest('[data-part-qty]');if(part){const n=part.value.trim()===''?0:Number(part.value);setPartQty(part.dataset.partQty,n,true);return}
});
document.addEventListener('input',e=>{
 const item=e.target.closest('[data-bulk-id]');if(item)setStemFromInput(item.dataset.bulkId,item.value);
 const part=e.target.closest('[data-part-qty]');
 if(part){const n=part.value.trim()===''?0:Number(part.value);setPartQty(part.dataset.partQty,n,true)}
});
document.addEventListener('focusout',e=>{
 const item=e.target.closest('[data-bulk-id]');if(item)item.value=String(singleQuantity(item.dataset.bulkId));
 const part=e.target.closest('[data-part-qty]');if(part)part.value=String(parts[part.dataset.partQty]||0);
});
document.addEventListener('click',e=>{
 const m=e.target.closest('[data-mode]');if(m){selectMode(m.dataset.mode);return}
 const add=e.target.closest('[data-add]');if(add){addSingle(add.dataset.add);return}
 const part=e.target.closest('[data-part]');if(part){adjustPart(part.dataset.part,Number(part.dataset.delta));return}
 const remove=e.target.closest('[data-remove]');if(remove){cart.splice(Number(remove.dataset.remove),1);resetPending();renderCart();syncProductControls();return}
});
init();
