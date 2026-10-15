/* Shared staff-app installer, update prompt and offline indicator. */
'use strict';
(()=>{
 const install=document.getElementById('install-staff-app');
 const update=document.getElementById('update-staff-app');
 const help=document.getElementById('install-help');
 const offline=document.getElementById('offline-staff-banner');
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
 let installEvent=null,registration=null;
 function showOffline(){
  const isOffline=!navigator.onLine;
  if(offline)offline.hidden=!isOffline;
  document.body.classList.toggle('staff-offline',isOffline);
  const submit=document.getElementById('checkout');
  if(submit&&isOffline)submit.disabled=true;
  if(submit&&!isOffline&&typeof renderCart==='function')renderCart();
 }
 window.addEventListener('offline',showOffline);
 window.addEventListener('online',showOffline);
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();installEvent=event;
  if(install&&!standalone())install.hidden=false;
 });
 window.addEventListener('appinstalled',()=>{installEvent=null;if(install)install.hidden=true;if(help)help.hidden=true});
 if(install){
  install.addEventListener('click',async()=>{
   if(installEvent){
    const event=installEvent;installEvent=null;install.hidden=true;
    await event.prompt();
    return;
   }
   if(help)help.hidden=!help.hidden;
  });
 }
 if(update)update.addEventListener('click',()=>{
  if(registration?.waiting)registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
 });
 function promptUpdate(reg){
  if(update&&reg.waiting&&navigator.serviceWorker.controller)update.hidden=false;
 }
 if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
   if(!window.__takeYouReloading){window.__takeYouReloading=true;window.location.reload();}
  });
  navigator.serviceWorker.register('/staff-sw.js',{scope:'/',updateViaCache:'none'})
   .then(reg=>{
    registration=reg;promptUpdate(reg);
    reg.addEventListener('updatefound',()=>{
     const worker=reg.installing;
     if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed')promptUpdate(reg)});
    });
   }).catch(()=>{ /* Installation remains optional; online register UI still works. */ });
 }
 if(install&&!standalone()&&!installEvent){
  const ua=navigator.userAgent||'';
  if(/iPad|iPhone|iPod/.test(ua)&&!window.MSStream){
   install.hidden=false;
  }
 }
 showOffline();
})();
