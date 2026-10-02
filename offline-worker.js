/* Cache only same-origin application files. Cloud requests and account data never enter this cache. */
const CACHE='chennan-shell-20261003-unified-2';
const SHELL=['./','./index.html','./intro.css','./workspace-glass.css','./france70-chat.css','./design-system.css','./theme-system.js','./login-scene.js','./auth.js','./workspace-core.js','./cloud-sync.js','./trade-dashboard.js','./people-detail.js','./trading-simulator.js','./character-memory.js','./france70-chat.js','./document-workspace.js','./ui-shell.js','./security-ui.js','./theme-ui.js','./overview-final.js','./design-system.js','./offline-register.js','./assets/brand/chennan-logo.jpg','./assets/people/avatar-atlas.webp','./assets/login/landscape.webp','./assets/login/brush.webp','./assets/login/bitcoin.webp'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chennan-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.endsWith('.release.json')||url.searchParams.has('hashcheck'))return;
 event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok&&!url.pathname.includes('landscape-8k')){const cache=await caches.open(CACHE);await cache.put(request,response.clone())}return response}catch(error){const cache=await caches.open(CACHE);const hit=await cache.match(request,{ignoreSearch:true});if(hit)return hit;if(request.mode==='navigate'){const home=await cache.match('./index.html');if(home)return home}throw error}})());
});
