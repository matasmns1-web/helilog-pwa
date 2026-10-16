const CACHE='helilog-v2-11-1-settings-1';
const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './domain.js',
  './print.js',
  './endorsement-bridge.js',
  './endorsement-ui.js',
  './cloud-config.js?v=2.11.1-settings-1',
  './cloud-foundation.js?v=2.11.1-settings-1',
  './cloud-view.js?v=2.11.1-settings-1',
  './cloud-sync.js?v=2.11.1-settings-1',
  './auth-gate.js?v=2.11.1-settings-1',
  './cloud-archives.js?v=2.11.1-settings-1',
  './archive-integrity.js?v=2.11.1-settings-1',
  './recovery.js?v=2.11.1-settings-1',
  './cloud-backups.js?v=2.11.1-settings-1',
  './disaster-recovery.js?v=2.11.1-settings-1'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>
      Promise.allSettled(SHELL.map(url=>cache.add(url)))
    ).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
    );
    return;
  }

  // A previously installed V2.2 PWA may have cached a cloud foundation
  // without V2.3's client() method. Always get fresh JS when connected.
  // The old cache-first policy returned incompatible modules for the first
  // navigation after deployment, despite receiving a new index.html.
  if(url.pathname.endsWith('.js')){
    event.respondWith(
      fetch(event.request).then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
        }
        return response;
      }).catch(()=>caches.match(event.request).then(cached=>cached||Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>{
      if(cached)return cached;
      return fetch(event.request).then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
        }
        return response;
      });
    })
  );
});
