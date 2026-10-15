/* Take you staff PWA. Cache only public static app shells, never API, cookies or transaction results. */
'use strict';
const CACHE='take-you-staff-shell-v4-20261015-2';
const PREFIX='take-you-staff-shell-';
const SHELL=['/pos','/staff','/pos.js','/pos.css','/staff-shell.css','/staff-pwa.js','/staff.webmanifest','/icons/staff-192.png','/icons/staff-512.png'];
const paths=new Set(SHELL);
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  for(const path of SHELL){
   try{
    const response=await fetch(path,{cache:'no-store',credentials:'omit'});
    if(response.ok)await cache.put(path,response);
   }catch(err){ /* Optional offline shell: installing works even if a resource fetch fails. */ }
  }
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys()){
   if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  }
  await self.clients.claim();
 })());
});
self.addEventListener('message',event=>{
 if(event.data&&event.data.type==='ACTIVATE_UPDATE')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!paths.has(url.pathname))return;
 if(request.mode==='navigate'||url.pathname==='/pos'||url.pathname==='/staff'){
  event.respondWith((async()=>{
   try{
    const response=await fetch(request);
    if(response.ok){
     const cache=await caches.open(CACHE);
     await cache.put(url.pathname,response.clone());
    }
    return response;
   }catch(err){
    const cached=await caches.match(url.pathname);
    if(cached)return cached;
    return new Response('通信が必要です。インターネット接続を確認してください。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
   }
  })());
  return;
 }
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cached=await cache.match(url.pathname);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok)await cache.put(url.pathname,response.clone());
  return response;
 })());
});
