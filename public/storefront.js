'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'¥'+Number(n||0).toLocaleString('ja-JP');
const product=id=>catalog.products.find(p=>p.id===id);
const wrap=id=>catalog.wraps.find(w=>w.id===id);
const image=id=>'/api/media/'+encodeURIComponent(id);
let catalog={products:[],wraps:[],templates:[]};
let cart=[],parts={},wrapId='',user=null,orders=[];
try{const saved=JSON.parse(localStorage.getItem('take-you-demo-cart-v3b')||'[]');if(Array.isArray(saved))cart=saved.slice(0,40)}catch(e){}
function saveCart(){try{localStorage.setItem('take-you-demo-cart-v3b',JSON.stringify(cart))}catch(e){}}
function feedback(message,error=false){
 const e=$('toast');if(!e)return;e.textContent=message;e.hidden=false;e.classList.toggle('error',error);
 clearTimeout(feedback.timer);feedback.timer=setTimeout(()=>e.hidden=true,3500);
}
async function api(path,method='GET',data,invitation){
 const headers={};if(data!==undefined)headers['Content-Type']='application/json';
 if(invitation)headers['x-demo-key']=invitation;
 const r=await fetch(path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',credentials:'same-origin'});
 let result={};try{result=await r.json()}catch(e){}
 if(!r.ok)throw Error(result.error||'通信エラー '+r.status);
 return result;
}
function navigate(view='home',push=true){
 if(!['home','catalog','examples','builder','cart','account'].includes(view))view='home';
 $('home-content').hidden=view!=='home';
 $('page-content').hidden=view==='home';
 document.body.classList.toggle('mode-subpage',view!=='home');
 document.querySelectorAll('[data-screen]').forEach(e=>e.hidden=e.getAttribute('data-screen')!==view);
 $('mobile-menu').hidden=true;
 $('menu-button').setAttribute('aria-expanded','false');
 if(push)history.pushState({view},'',view==='home'?location.pathname:location.pathname+'?view='+encodeURIComponent(view));
 window.scrollTo({top:0,left:0});
 if(view==='catalog')renderCatalog();
 if(view==='examples')renderExamples();
 if(view==='builder')renderBuilder();
 if(view==='cart')renderCart();
 if(view==='account')renderAccount();
}
function card(p,preview=false){
 const photo=p.imageId?'<img loading="lazy" src="'+image(p.imageId)+'" alt="'+esc(p.name)+'">':'<span>商品写真</span>';
 return '<article class="product"><div class="item-image">'+photo+'</div>'+
 '<div class="item-title">'+esc(p.name)+'</div><div class="product-detail">'+esc(p.type)+'</div>'+
 '<div class="product-price">'+money(p.price)+' / 本　<span class="product-detail">在庫 '+Number(p.stock)+'</span></div>'+
 (preview?'':'<div class="inline-actions"><button class="flat-button" data-add="'+esc(p.id)+'" '+(p.stock<1?'disabled':'')+'>カートに追加</button></div>')+'</article>';
}
function renderPreview(){
 const active=catalog.products.filter(p=>p.active);
 $('product-grid').innerHTML=active.slice(0,3).map(p=>card(p,true)).join('')||'<p class="blank">商品はまだ登録されていません。</p>';
 /* Stage 3B preview: do not automatically promote unverified test images to the home hero. */
 $('bouquet-preview').textContent='花束写真';
 $('cart-count').textContent=cart.length;
}
function renderCatalog(){
 const active=catalog.products.filter(p=>p.active);
 $('catalog-grid').innerHTML=active.map(p=>card(p)).join('')||'<p class="blank">商品はまだ登録されていません。</p>';
}
function exampleCard(t){
 const photo=t.imageId?'<img loading="lazy" src="'+image(t.imageId)+'" alt="'+esc(t.name)+'">':'<span>花束写真</span>';
 return '<article class="product"><div class="item-image">'+photo+'</div><div class="item-title">'+esc(t.name)+'</div>'+
 '<p class="product-detail">'+t.parts.map(p=>esc(product(p.id)?.name||p.id)+' × '+Number(p.qty)).join(' / ')+'</p>'+
 '<button class="flat-button" data-template="'+esc(t.id)+'">花材を編集する</button></article>';
}
function renderExamples(){
 $('examples-grid').innerHTML=catalog.templates.map(exampleCard).join('')||'<p class="blank">制作事例はまだ登録されていません。</p>';
}
function loadTemplate(id){
 const t=catalog.templates.find(t=>t.id===id);if(!t)return;
 parts={};let shortage=false;
 for(const x of t.parts){const p=product(x.id);if(p&&p.active){parts[x.id]=Math.min(p.stock,Number(x.qty));if(parts[x.id]<x.qty)shortage=true}else shortage=true;}
 wrapId=wrap(t.wrapId)?t.wrapId:(catalog.wraps[0]?.id||'');
 navigate('builder');
 if(shortage)feedback('在庫のない花材があるため、選択内容を調整しました。');
}
function adjust(id,delta){
 const p=product(id);if(!p)return;
 const n=(parts[id]||0)+delta;
 if(n<0||n>p.stock)return;
 parts[id]=n;
 renderBuilder();
}
function bouquetTotal(){
 let total=0,count=0;for(const [id,qty] of Object.entries(parts)){const p=product(id);if(p&&qty>0){count+=qty;total+=qty*p.price}}
 return {count,total:count?total+(wrap(wrapId)?.price||0)+500:0};
}
function renderBuilder(){
 $('builder-products').innerHTML=catalog.products.filter(p=>p.active).map(p=>
 '<div class="plain-line"><div><strong>'+esc(p.name)+'</strong><small>'+money(p.price)+' / 本　　在庫 '+p.stock+'</small></div>'+
 '<div class="plain-counter"><button type="button" data-part="'+esc(p.id)+'" data-delta="-1" aria-label="減らす">−</button><strong>'+(parts[p.id]||0)+'</strong><button type="button" data-part="'+esc(p.id)+'" data-delta="1" aria-label="増やす" '+((parts[p.id]||0)>=p.stock?'disabled':'')+'>＋</button></div></div>').join('')||'<p class="blank">商品はまだ登録されていません。</p>';
 $('builder-wraps').innerHTML=catalog.wraps.map(w=>'<button type="button" data-wrap="'+esc(w.id)+'" class="'+(w.id===wrapId?'selected':'')+'">'+esc(w.name)+'　'+money(w.price)+'</button>').join('');
 const b=bouquetTotal();
 const selections=Object.entries(parts).filter(([id,n])=>n>0&&product(id));
 $('builder-summary').innerHTML=selections.map(([id,qty])=>'<div class="plain-line"><span>'+esc(product(id).name)+' × '+qty+'</span><span>'+money(product(id).price*qty)+'</span></div>').join('')+
 (b.count?'<div class="plain-line"><span>包装</span><span>'+money(wrap(wrapId)?.price)+'</span></div><div class="plain-line"><span>制作料（仮）</span><span>¥500</span></div>':'<p class="blank">花材を選択してください。</p>')+
 '<div class="plain-line"><strong>合計</strong><strong class="plain-total">'+money(b.total)+'</strong></div>';
 $('add-bouquet').disabled=b.count===0;
}
function addBouquet(){
 const b=bouquetTotal();if(!b.count)return;
 cart.push({kind:'bouquet',parts:Object.entries(parts).filter(([id,q])=>q>0).map(([id,qty])=>({id,qty})),wrapId});
 parts={};saveCart();renderPreview();navigate('cart');feedback('花束をカートに追加しました。');
}
function addSingle(id){
 const p=product(id);if(!p||p.stock<1)return feedback('在庫を確認してください。',true);
 cart.push({kind:'single',id,qty:1});
 saveCart();renderPreview();feedback('カートに追加しました。');
}
function itemInfo(l){
 if(l.kind==='single'){const p=product(l.id);return {name:p?.name||'商品',detail:'切り花 × '+l.qty,total:(p?.price||0)*Number(l.qty)}}
 let total=500+(wrap(l.wrapId)?.price||0);
 const detail=(l.parts||[]).map(x=>{const p=product(x.id);total+=(p?.price||0)*Number(x.qty);return (p?.name||'商品')+' × '+Number(x.qty)}).join(' / ');
 return {name:'花束',detail:detail+' / 包装：'+(wrap(l.wrapId)?.name||'未設定'),total};
}
function renderCart(){
 $('cart-lines').innerHTML=cart.map((l,i)=>{const a=itemInfo(l);return '<div class="plain-line"><div><strong>'+esc(a.name)+'</strong><small>'+esc(a.detail)+'</small><button class="flat-button" data-remove="'+i+'" type="button">削除</button></div><span>'+money(a.total)+'</span></div>'}).join('')||'<p class="blank">カートは空です。</p>';
 $('cart-total').textContent=money(cart.reduce((t,l)=>t+itemInfo(l).total,0));
 $('checkout-button').disabled=!cart.length;
 $('guest-key-wrap').hidden=!!user;
}
async function checkout(){
 if(!cart.length)return;
 const name=$('order-name').value.trim(),contact=$('order-contact').value.trim(),pickup=$('order-pickup').value;
 if(!name||!contact||!pickup)return feedback('お名前・連絡先・受取希望日時を入力してください。',true);
 const invite=user?'':$('guest-key').value.trim();
 if(!user&&!invite)return feedback('ゲストのテスト注文には招待キーが必要です。',true);
 $('checkout-button').disabled=true;
 try{
  const r=await api('/api/demo/orders','POST',{name,contact,pickup,fulfillmentMethod:'pickup',lines:cart},invite);
  cart=[];saveCart();renderPreview();renderCart();
  $('order-result').hidden=false;$('order-result').textContent='テスト注文番号：'+r.id+'（決済なし）';
  if(user){await loadOrders()}
  feedback('テスト注文を保存しました。');
 }catch(e){feedback(e.message,true)}
 finally{$('checkout-button').disabled=!cart.length}
}
async function refresh(){
 try{
  catalog=await api('/api/catalog');
  if(!wrapId)wrapId=catalog.wraps[0]?.id||'';
  renderPreview();
  renderBuilder();
  navigate(new URLSearchParams(location.search).get('view')||'home',false);
 }catch(e){
  $('product-grid').textContent='商品データの取得に失敗しました。';
  feedback(e.message,true);
 }
 try{
  const auth=await api('/api/auth/me');
  user=auth.user;
  if(user?.role==='customer')await loadOrders();else orders=[];
  if(new URLSearchParams(location.search).get('view')==='account')renderAccount();
  if(new URLSearchParams(location.search).get('view')==='cart')renderCart();
 }catch(e){
  user=null;
 }
}
async function loadOrders(){
 try{const r=await api('/api/account/orders');orders=r.orders||[]}catch(e){orders=[]}
}
function renderAccount(){
 const host=$('account-content');
 if(user&&user.role==='staff'){
  host.innerHTML='<p class="form-note">会員向けのマイページです。</p><button class="flat-button" data-logout>ログアウト</button>';
 }else if(user){
  host.innerHTML='<div class="sub-section"><h2>'+esc(user.displayName)+'</h2><p class="product-detail">'+esc(user.email)+'</p><button class="flat-button" data-logout>ログアウト</button></div>'+
  '<div class="sub-section"><h2>注文履歴（テスト）</h2>'+
  (orders.map(o=>'<div class="order-item"><strong>'+esc(o.id.slice(0,8))+'</strong><p class="product-detail">'+esc(o.createdAt)+' / '+esc(o.status)+' / 受取 '+esc(o.pickup||'未指定')+'</p><p>'+money(o.total)+'</p></div>').join('')||'<p class="blank">注文履歴はありません。</p>')+'</div>';
 }else{
  host.innerHTML='<div class="sub-columns"><div class="sub-section"><h2>ログイン</h2>'+
  '<form id="login-form"><div class="field-group"><label for="login-email">メールアドレス</label><input id="login-email" type="email" required autocomplete="username"></div>'+
  '<div class="field-group"><label for="login-password">パスワード</label><input id="login-password" type="password" required autocomplete="current-password"></div>'+
  '<button class="flat-button solid" type="submit">ログイン</button></form></div>'+
  '<div class="sub-section"><h2>テスト会員登録</h2><form id="register-form">'+
  '<div class="field-group"><label for="register-name">表示名（仮名）</label><input id="register-name" required></div>'+
  '<div class="field-group"><label for="register-email">メールアドレス（架空）</label><input id="register-email" type="email" required></div>'+
  '<div class="field-group"><label for="register-password">パスワード（12文字以上）</label><input id="register-password" type="password" minlength="12" autocomplete="new-password" required></div>'+
  '<div class="field-group"><label for="register-key">テスト用招待キー</label><input id="register-key" type="password" required></div>'+
  '<button class="flat-button" type="submit">テスト会員登録</button></form></div></div>';
 }
}
async function login(){
 const email=$('login-email').value.trim(),password=$('login-password').value;
 try{const r=await api('/api/auth/login','POST',{email,password});user=r.user;if(user?.role==='customer')await loadOrders();renderAccount();feedback('ログインしました。')}
 catch(e){feedback(e.message,true)}
}
async function register(){
 const email=$('register-email').value.trim(),displayName=$('register-name').value.trim(),password=$('register-password').value,key=$('register-key').value;
 try{const r=await api('/api/auth/register','POST',{email,displayName,password,role:'customer'},key);user=r.user;orders=[];renderAccount();feedback('テスト会員を登録しました。')}
 catch(e){feedback(e.message,true)}
}
async function logout(){
 try{await api('/api/auth/logout','POST',{});user=null;orders=[];renderAccount();feedback('ログアウトしました。')}
 catch(e){feedback(e.message,true)}
}
document.addEventListener('click',e=>{
 const view=e.target.closest('[data-view]');
 if(view){e.preventDefault();navigate(view.getAttribute('data-view'));return}
 const add=e.target.closest('[data-add]');
 if(add){addSingle(add.getAttribute('data-add'));return}
 const change=e.target.closest('[data-part]');
 if(change){adjust(change.getAttribute('data-part'),Number(change.getAttribute('data-delta')));return}
 const w=e.target.closest('[data-wrap]');if(w){wrapId=w.getAttribute('data-wrap');renderBuilder();return}
 const t=e.target.closest('[data-template]');if(t){loadTemplate(t.getAttribute('data-template'));return}
 const rm=e.target.closest('[data-remove]');if(rm){cart.splice(Number(rm.getAttribute('data-remove')),1);saveCart();renderPreview();renderCart();return}
 if(e.target.closest('[data-logout]')){logout();return}
 if(e.target.closest('#add-bouquet')){addBouquet();return}
 if(e.target.closest('#checkout-button')){checkout();return}
 if(e.target.closest('#menu-button')){
  const next=$('mobile-menu').hidden;$('mobile-menu').hidden=!next;$('menu-button').setAttribute('aria-expanded',String(next));return
 }
});
document.addEventListener('submit',e=>{
 if(e.target.id==='login-form'){e.preventDefault();login()}
 if(e.target.id==='register-form'){e.preventDefault();register()}
});
window.addEventListener('popstate',()=>navigate(new URLSearchParams(location.search).get('view')||'home',false));
refresh();
