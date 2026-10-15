'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const yen=v=>'¥'+Number(v||0).toLocaleString('ja-JP');
let catalog={products:[],wraps:[]},cart=[],parts={},user=null;
let mode='favorites',preset=1,pendingId=crypto.randomUUID(),processing=false,favorites=new Set(),cartOpen=false,lastAction='—';
const CART_DRAFT_KEY='take-you-register-unpaid-v1';
function persistCart(){
 if(typeof sessionStorage==='undefined'||user?.role!=='staff')return;
 try{sessionStorage.setItem(CART_DRAFT_KEY,JSON.stringify({
  staffId:user.id,lines:cart,requestId:pendingId,last:lastAction
 }))}catch(e){}
}
function restoreCart(){
 if(typeof sessionStorage==='undefined'||user?.role!=='staff')return;
 try{
  const raw=sessionStorage.getItem(CART_DRAFT_KEY);
  if(!raw)return;
  const state=JSON.parse(raw);
  if(state.staffId!==user.id||!Array.isArray(state.lines))return;
  const next=state.lines;
  if(next.length>40||next.some(l=>!l||!['single','bouquet'].includes(l.kind)||!Number.isInteger(l.qty)||l.qty<1||l.qty>999)){
   sessionStorage.removeItem(CART_DRAFT_KEY);return;
  }
  const prev=cart;cart=next;
  if(validateCart(cart)||cart.reduce((n,l)=>n+lineTotal(l),0)>10000000){
   cart=prev;sessionStorage.removeItem(CART_DRAFT_KEY);return;
  }
  if(typeof state.requestId==='string'&&/^[0-9a-f-]{36}$/.test(state.requestId))pendingId=state.requestId;
  lastAction=typeof state.last==='string'&&state.last.length<200?state.last:'—';
  $('last-action').textContent='直近：'+lastAction;
  $('mobile-last-action').textContent='直近：'+lastAction;
 }catch(e){}
}
function forgetCart(){if(typeof sessionStorage!=='undefined'){try{sessionStorage.removeItem(CART_DRAFT_KEY)}catch(e){}}}
function setLastAction(value){
 lastAction=String(value);
 $('last-action').textContent='直近：'+lastAction;
 $('mobile-last-action').textContent='直近：'+lastAction;
 persistCart();
}
const prod=id=>catalog.products.find(p=>p.id===id);
const getWrap=id=>catalog.wraps.find(w=>w.id===id);
async function request(path,method='GET',body){
 const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},
   body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});
 let d={};try{d=await r.json()}catch(e){}
 if(!r.ok)throw Error(d.error||'通信エラー '+r.status);
 return d;
}
function notice(msg){
 $('toast').hidden=false;$('toast').textContent=msg;
 clearTimeout(notice.t);notice.t=setTimeout(()=>$('toast').hidden=true,3400);
}
function loadFavorites(){
 try{
  const stored=localStorage.getItem('take-you-pos-favorites-v1');
  const data=stored?JSON.parse(stored):null;
  favorites=new Set(Array.isArray(data)?data:catalog.products.filter(p=>p.active).slice(0,4).map(p=>p.id));
 }catch(e){favorites=new Set(catalog.products.filter(p=>p.active).slice(0,4).map(p=>p.id))}
}
function saveFavorites(){
 try{localStorage.setItem('take-you-pos-favorites-v1',JSON.stringify([...favorites]))}catch(e){}
}
function showAuth(){
 $('loading').hidden=true;$('auth').hidden=false;$('pos').hidden=true;$('signout').hidden=true;$('mobile-totals').hidden=true;closeCart();
}
function showPos(){
 $('loading').hidden=true;$('auth').hidden=true;$('pos').hidden=false;$('signout').hidden=false;$('mobile-totals').hidden=false;
 $('staff-label').textContent=user.displayName+' / スタッフ';
 loadFavorites();restoreCart();render();fetchSales();
}
async function init(){
 try{
  const result=await request('/api/auth/me');user=result.user;
  if(!user||user.role!=='staff'){showAuth();return}
  catalog=await request('/api/catalog');showPos();
 }catch(e){showAuth();notice(e.message)}
}
async function login(){
 try{
  const r=await request('/api/auth/login','POST',{email:$('email').value.trim(),password:$('password').value});
  user=r.user;
  if(user?.role!=='staff')return notice('スタッフアカウントでログインしてください');
  catalog=await request('/api/catalog');showPos();
 }catch(e){notice(e.message)}
}
function currentDemand(lines=cart){
 const amounts=new Map();
 for(const line of lines){
  const q=line.qty||1;
  const materials=line.kind==='single'?[{id:line.id,qty:1}]:line.parts;
  for(const x of materials||[])amounts.set(x.id,(amounts.get(x.id)||0)+x.qty*q);
 }
 return amounts;
}
function validateCart(lines){
 if(lines.length>40)return '1回の会計は40品目までです';
 const demand=currentDemand(lines);
 for(const [id,qty] of demand){
  const p=prod(id);
  if(!p||!p.active||qty>p.stock)return (p?.name||'花材')+'の在庫が不足しています';
 }
 return null;
}
function singleQuantity(id){return cart.find(l=>l.kind==='single'&&l.id===id)?.qty||0}
function lineTotal(line){return line.kind==='single'?(prod(line.id)?.price||0)*line.qty:line.price*line.qty}
function orderTotal(){return cart.reduce((n,l)=>n+lineTotal(l),0)}
function orderStats(){
 return {
  stems:cart.filter(l=>l.kind==='single').reduce((n,l)=>n+l.qty,0),
  bouquets:cart.filter(l=>l.kind==='bouquet').reduce((n,l)=>n+l.qty,0),
  lines:cart.length
 };
}
function afterCartChange(){
 pendingId=crypto.randomUUID();
 $('receipt').hidden=true;
 renderCart();renderProducts();persistCart();
}
function addSingle(id,qty=preset){
 const p=prod(id);
 if(!p||!p.active||p.stock<1)return notice('販売可能な花材を選択してください');
 if(!Number.isInteger(qty)||qty<1||qty>999)return notice('数量は1〜999本で指定してください');
 const next=cart.map(x=>({...x}));
 const line=next.find(l=>l.kind==='single'&&l.id===id);
 if(line)line.qty+=qty;else next.push({kind:'single',id,qty});
 if((line?.qty||qty)>999)return notice('1商品につき999本まで入力できます');
 const issue=validateCart(next);
 if(issue)return notice(issue);
 cart=next;afterCartChange();
 setLastAction(p.name+' +'+qty+'本 · '+yen(p.price*qty));
}
function updateLineQty(index,raw,updateInput=false){
 const line=cart[index],n=Number(raw);
 if(!line||String(raw).trim()===''||!Number.isInteger(n)||n<1||n>999)return false;
 if(line.qty===n)return true;
 const title=line.kind==='single'?(prod(line.id)?.name||'商品'):'花束';
 const next=cart.map(x=>({...x}));
 next[index].qty=n;
 const issue=validateCart(next);
 if(issue){notice(issue);return false}
 cart=next;
 pendingId=crypto.randomUUID();$('receipt').hidden=true;
 updateTotals();renderProducts();
 const value=$('line-total-'+index);if(value)value.textContent=yen(lineTotal(cart[index]));
 if(!updateInput)renderCart();
 setLastAction(title+' '+n+(line.kind==='single'?'本':'点')+'に変更');
 return true;
}
function removeLine(i){
 if(i<0||i>=cart.length)return;
 const line=cart[i],name=line.kind==='single'?(prod(line.id)?.name||'商品'):'花束';
 cart.splice(i,1);afterCartChange();setLastAction(name+' '+line.qty+(line.kind==='single'?'本':'点')+'を削除');
}
function setPreset(raw){
 const n=Number(raw);
 if(String(raw).trim()===''||!Number.isInteger(n)||n<1||n>999)return false;
 preset=n;$('quick-qty').value=String(n);
 if(catalog.products.length&&mode!=='bouquet')renderProducts();
 document.querySelectorAll('[data-preset]').forEach(btn=>{
  const selected=Number(btn.dataset.preset)===n;
  btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));
 });
 return true;
}
function toggleFavorite(id){
 if(!prod(id))return;
 if(favorites.has(id))favorites.delete(id);else favorites.add(id);
 saveFavorites();renderProducts();
}
function renderProducts(){
 const filter=$('filter').value.toLowerCase().trim();
 let data=catalog.products.filter(p=>p.active);
 if(mode==='favorites')data=data.filter(p=>favorites.has(p.id));
 if(filter)data=data.filter(p=>(p.name+' '+p.type).toLowerCase().includes(filter));
 $('catalog-label').textContent=mode==='favorites'?'よく使う花材':'切り花一覧';
 const chosen=data.filter(p=>singleQuantity(p.id)>0).length;
 $('selection-count').textContent=chosen+'種類を選択中';
 $('products').innerHTML=data.map(p=>{
  const n=singleQuantity(p.id);
  const inOrder=n>0?'会計中 '+n+'本':'在庫 '+p.stock+'本';
  const amount=n>0?yen(n*p.price):'';
  const canAdd=p.stock>0&&(currentDemand().get(p.id)||0)+preset<=p.stock;
  return '<div class="product-tile '+(n?'selected':'')+'" data-tile-id="'+esc(p.id)+'">'+
   '<button class="product-add" data-add="'+esc(p.id)+'" type="button" '+(canAdd?'':'disabled')+' aria-label="'+esc(p.name)+'を'+preset+'本追加">'+
   '<span class="product-title">'+esc(p.name)+'</span>'+
   '<span class="product-bottom"><span class="product-unit">'+yen(p.price)+'/本</span><span class="product-qty '+(n?'':'empty')+'">'+esc(inOrder)+(amount?'<br>'+amount:'')+'</span></span></button>'+
   '<button class="favorite-toggle '+(favorites.has(p.id)?'is-favorite':'')+'" type="button" data-favorite="'+esc(p.id)+'" aria-pressed="'+(favorites.has(p.id)?'true':'false')+'" aria-label="'+esc(p.name)+'のお気に入り登録">★</button></div>';
 }).join('')||'<p class="empty-note">表示する花材がありません。★からお気に入りに登録できます。</p>';
 const stats=orderStats();
 $('bulk-summary').textContent=stats.stems+'本の切り花が会計に追加されています';
}
function selectMode(next){
 if(!['favorites','single','bouquet'].includes(next))return;
 mode=next;
 document.querySelectorAll('[data-mode]').forEach(btn=>{
  const selected=btn.dataset.mode===next;
  btn.classList.toggle('active',selected);btn.setAttribute('aria-selected',String(selected));
 });
 $('single-panel').hidden=next==='bouquet';
 $('bouquet-panel').hidden=next!=='bouquet';
 if(next!=='bouquet')renderProducts();
 updateSticky();
}
function setPartQty(id,qty,preserve=false){
 const p=prod(id);
 if(!p||!Number.isInteger(qty)||qty<0||qty>999||qty>p.stock)return false;
 if(qty===0)delete parts[id];else parts[id]=qty;
 if(!preserve)renderParts();
 renderBouquetSubtotal();return true;
}
function adjustPart(id,delta){
 const n=parts[id]||0;if(!setPartQty(id,n+delta))notice('使用本数を確認してください');
}
function flowerThumb(p){
 const tone=['coral','white','yellow','lilac','green'].includes(p.tone)?p.tone:'neutral';
 const icon='<span class="thumb-symbol" aria-label="写真未登録">'+esc(p.icon||'✿')+'</span>';
 return '<span class="flower-thumb tone-'+tone+'">'+(p.imageId
  ?'<img loading="lazy" src="/api/media/'+encodeURIComponent(p.imageId)+'" alt="" onerror="this.remove()">'
  :'')+icon+'</span>';
}

function renderParts(){
 $('bouquet-parts').innerHTML=catalog.products.filter(p=>p.active).map(p=>{
  const n=parts[p.id]||0;
  const details=(p.type?esc(p.type)+' · ':'')+yen(p.price)+' / 本 · 在庫 '+p.stock;
  return '<div class="bouquet-row">'+flowerThumb(p)+'<div class="part-name"><strong>'+esc(p.name)+'</strong><small>'+details+'</small></div>'+
  '<div class="bouquet-step"><button type="button" data-part="'+esc(p.id)+'" data-delta="-1" aria-label="'+esc(p.name)+'を減らす">−</button>'+
  '<input aria-label="'+esc(p.name)+'の使用本数" data-part-qty="'+esc(p.id)+'" type="number" min="0" max="'+Math.min(999,p.stock)+'" inputmode="numeric" step="1" value="'+n+'">'+
  '<button type="button" data-part="'+esc(p.id)+'" data-delta="1" '+(n>=p.stock?'disabled':'')+' aria-label="'+esc(p.name)+'を増やす">＋</button></div></div>';
 }).join('');
}

function suggestedPrice(){
 return Object.entries(parts).reduce((n,[id,q])=>n+(prod(id)?.price||0)*q,0)+500+(getWrap($('wrap-id').value)?.price||0);
}
function renderBouquetSubtotal(){
 const q=Number($('bouquet-quantity').value||0),price=Number($('bouquet-price').value||0);
 const stems=Object.values(parts).reduce((n,x)=>n+x,0);
 const n=Number.isInteger(q)&&q>0?q:0;
 $('bouquet-subtotal').textContent=stems?'1点 '+stems+'本 × '+n+'点 = 使用花材 '+stems*n+'本 / '+yen(price*n):'花材を選択してください';
 updateSticky();
}
function addBouquet(){
 const price=Number($('bouquet-price').value),qty=Number($('bouquet-quantity').value);
 if(Object.keys(parts).length===0)return notice('花材を選択してください');
 if($('bouquet-price').value.trim()===''||!Number.isInteger(price)||price<0||price>10000000)return notice('花束1点の売価を入力してください');
 if(!Number.isInteger(qty)||qty<1||qty>999)return notice('花束の点数を1〜999で指定してください');
 const next=[...cart,{kind:'bouquet',parts:Object.entries(parts).map(([id,n])=>({id,qty:n})),wrapId:$('wrap-id').value||null,price,qty}];
 const issue=validateCart(next);if(issue)return notice(issue);
 if(next.reduce((n,line)=>n+lineTotal(line),0)>10000000)return notice('1会計の上限額を超えています');
 cart=next;parts={};$('bouquet-price').value='';$('bouquet-quantity').value='1';
 afterCartChange();setLastAction('花束 +'+qty+'点 · '+yen(price*qty));renderParts();renderBouquetSubtotal();openCart();
}
function renderCart(){
 $('lines').innerHTML=cart.map((line,i)=>{
  const title=line.kind==='single'?prod(line.id)?.name||'商品':'オーダー花束';
  const detail=line.kind==='single'?yen(prod(line.id)?.price)+' / 本':
   line.parts.map(x=>(prod(x.id)?.name||'花材')+' × '+x.qty).join(' / ')+' · '+yen(line.price)+' / 点';
  return '<div class="cart-row"><div class="cart-row-head"><strong>'+esc(title)+'</strong>'+
   '<button class="remove" type="button" data-remove="'+i+'">削除</button></div>'+
   '<small>'+esc(detail)+'</small><div class="cart-row-bottom"><label>数量 '+
   '<input data-cart-qty="'+i+'" type="number" inputmode="numeric" min="1" max="999" step="1" value="'+line.qty+'" aria-label="'+esc(title)+'の数量"></label>'+
   '<strong id="line-total-'+i+'">'+yen(lineTotal(line))+'</strong></div></div>';
 }).join('')||'<p class="empty-note">まだ商品が選択されていません。</p>';
 updateTotals();
}
function updateTotals(){
 const stats=orderStats(),total=yen(orderTotal());
 $('total').textContent=total;
 $('mobile-total').textContent=total;
 $('cart-lines-count').textContent=stats.lines+'品目 · 切り花'+stats.stems+'本 · 花束'+stats.bouquets+'点';
 $('mobile-stems').textContent='切り花'+stats.stems+'本 · 花束'+stats.bouquets+'点';
 $('checkout').disabled=stats.lines===0||processing;
 $('bulk-summary').textContent='切り花 '+stats.stems+'本 · 花束 '+stats.bouquets+'点 · '+total;
}
function updateSticky(){
 const e=$('draft-preview');
 const stems=Object.values(parts).reduce((n,x)=>n+x,0);
 const qty=Number($('bouquet-quantity').value||0);
 e.hidden=mode!=='bouquet'||stems===0;
 if(!e.hidden)e.textContent='花束入力中：'+stems+'本/点 × '+(Number.isInteger(qty)&&qty>0?qty:0)+'点（未追加）';
}
function render(){
 const existing=$('wrap-id').value;
 $('wrap-id').innerHTML=catalog.wraps.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+' ('+yen(w.price)+')</option>').join('');
 if(catalog.wraps.some(w=>w.id===existing))$('wrap-id').value=existing;
 renderParts();renderBouquetSubtotal();selectMode(mode);setPreset(preset);renderCart();
}
function openCart(){
 cartOpen=true;document.body.classList.add('cart-open');$('cart-scrim').hidden=false;
 $('view-cart').setAttribute('aria-expanded','true');
 if(typeof window!=='undefined'&&window.matchMedia&&!window.matchMedia('(max-width:760px)').matches){
  closeCart();$('basket').scrollIntoView({behavior:'smooth',block:'nearest'});return;
 }
 $('close-cart').focus();
}
function closeCart(){
 cartOpen=false;document.body.classList.remove('cart-open');$('cart-scrim').hidden=true;
 $('view-cart').setAttribute('aria-expanded','false');
}
function clearCart(){
 cart=[];pendingId=crypto.randomUUID();$('receipt').hidden=true;renderCart();renderProducts();setLastAction('会計をクリア');
}
async function checkout(){
 if(!user||user.role!=='staff'||processing||cart.length===0)return;
 const total=orderTotal(),method=$('payment').value;
 if(!confirm('支払の受領を確認して、'+yen(total)+'の会計を確定しますか？'))return;
 processing=true;$('checkout').disabled=true;
 try{
  const result=await request('/api/pos/sales','POST',{requestId:pendingId,paymentMethod:method,lines:cart});
  cart=[];parts={};pendingId=crypto.randomUUID();forgetCart();
  setLastAction('会計確定 · '+yen(result.total));
  $('receipt').textContent='会計完了 · '+result.id.slice(0,8)+' · '+yen(result.total)+(result.alreadyProcessed?'（再送確認）':'');
  $('receipt').hidden=false;
  try{catalog=await request('/api/catalog')}catch(e){notice('会計は保存しました。商品情報の更新に失敗しました')}
  render();fetchSales();
 }catch(e){notice(e.message)}
 finally{processing=false;$('checkout').disabled=cart.length===0}
}
async function fetchSales(){
 try{
  const data=await request('/api/pos/sales');
  $('recent').innerHTML=data.sales.slice(0,15).map(s=>'<div class="row"><span>'+esc(s.createdAt)+'<small>'+esc(s.id.slice(0,8))+' / '+(s.paymentMethod==='cash'?'現金':'外部決済')+'</small></span><strong>'+yen(s.total)+'</strong></div>').join('')||'<p>店頭会計はありません。</p>';
 }catch(e){notice(e.message)}
}
$('login-form').addEventListener('submit',e=>{e.preventDefault();login()});
$('signout').addEventListener('click',async()=>{
 try{await request('/api/auth/logout','POST',{});forgetCart();user=null;cart=[];parts={};setLastAction('—');showAuth()}catch(e){notice(e.message)}
});
$('filter').addEventListener('input',renderProducts);
$('quick-qty').addEventListener('change',e=>{
 if(!setPreset(e.target.value)){notice('本数は1〜999で指定してください');e.target.value=String(preset)}
});
$('quick-qty').addEventListener('input',e=>{
 const value=e.target.value;
 if(value!==''&&/^\d+$/.test(value)){const n=Number(value);if(n>=1&&n<=999){preset=n;renderProducts();document.querySelectorAll('[data-preset]').forEach(b=>{const match=Number(b.dataset.preset)===n;b.classList.toggle('active',match);b.setAttribute('aria-pressed',String(match))});}}
});
$('wrap-id').addEventListener('change',renderBouquetSubtotal);
$('bouquet-quantity').addEventListener('input',renderBouquetSubtotal);
$('bouquet-price').addEventListener('input',renderBouquetSubtotal);
$('suggest-price').addEventListener('click',()=>{$('bouquet-price').value=String(suggestedPrice());renderBouquetSubtotal()});
$('add-bouquet').addEventListener('click',addBouquet);
$('view-cart').addEventListener('click',openCart);
$('close-cart').addEventListener('click',closeCart);
$('cart-scrim').addEventListener('click',closeCart);
$('checkout').addEventListener('click',checkout);
$('clear').addEventListener('click',clearCart);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cartOpen)closeCart()});
document.addEventListener('click',e=>{
 const tab=e.target.closest('[data-mode]');if(tab){selectMode(tab.dataset.mode);return}
 const step=e.target.closest('[data-preset]');if(step){setPreset(step.dataset.preset);return}
 const favorite=e.target.closest('[data-favorite]');if(favorite){toggleFavorite(favorite.dataset.favorite);return}
 const add=e.target.closest('[data-add]');if(add){addSingle(add.dataset.add);return}
 const part=e.target.closest('[data-part]');if(part){adjustPart(part.dataset.part,Number(part.dataset.delta));return}
 const remove=e.target.closest('[data-remove]');if(remove){removeLine(Number(remove.dataset.remove));return}
});
document.addEventListener('input',e=>{
 const x=e.target.closest('[data-cart-qty]');
 if(x){updateLineQty(Number(x.dataset.cartQty),x.value,true);return}
 const p=e.target.closest('[data-part-qty]');
 if(p){const n=p.value.trim()===''?0:Number(p.value);if(Number.isInteger(n)&&n>=0)setPartQty(p.dataset.partQty,n,true)}
});
document.addEventListener('change',e=>{
 const x=e.target.closest('[data-cart-qty]');
 if(x){if(!updateLineQty(Number(x.dataset.cartQty),x.value,true))notice('数量と在庫を確認してください');renderCart();return}
 const p=e.target.closest('[data-part-qty]');
 if(p){const n=p.value.trim()===''?0:Number(p.value);if(!setPartQty(p.dataset.partQty,n))notice('花材の在庫を確認してください');return}
});
init();
