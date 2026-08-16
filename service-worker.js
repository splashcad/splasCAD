const CACHE='splashcad-6-0-22-u008-scroll-20260816170500';
const CORE=['/','/index.html','/hob.html','/window.html','/styles.css','/splashcad-app.js','/window-wall.js','/voice.js','/tablet.js','/manifest.webmanifest','/splashcad-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;
  const url=new URL(event.request.url);
  if(url.pathname==='/tablet.js'){
    event.respondWith(fetch(event.request).then(async response=>{
      const text=(await response.text()).replaceAll('UPDATE 006','UPDATE 008');
      const fixed=new Response(text,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});
      const copy=fixed.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return fixed;
    }).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/index.html'))));
});