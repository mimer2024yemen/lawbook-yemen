/**
 * المستشار اليمني القانوني — Service Worker
 * Caches static assets and JSON data for instant loading
 */
var CACHE_NAME = 'advisor-ye-v1';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/sw.js',
  '/search-engine.js',
  '/legal-rag-v3.js',
  '/legal-response.js',
  '/data-loader.js',
  '/knowledge-manager.js',
  '/admin.html',
  '/advisor.html',
  '/laws.html',
  '/contracts.html',
  '/posts.html',
  '/services.html',
  '/viewer.html',
  '/article.html',
  '/about.html',
  '/privacy.html',
  '/terms.html',
  '/disclaimer.html',
  '/404.html',
  '/robots.txt',
  '/manifest.json'
];

var DATA_ASSETS = [
  '/catalog.json',
  '/database.json'
];

/* Install: cache static assets immediately */
self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

/* Activate: clean old caches */
self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

/* Fetch: cache-first for static, network-first for data */
self.addEventListener('fetch', function(event){
  var url = new URL(event.request.url);
  
  /* Skip non-GET requests */
  if(event.request.method !== 'GET') return;
  
  /* Skip cross-origin requests */
  if(url.origin !== location.origin) return;
  
  var path = url.pathname;
  
  /* JSON data: cache with network-first strategy */
  if(path.endsWith('.json')){
    event.respondWith(
      fetch(event.request).then(function(response){
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, clone); });
        return response;
      }).catch(function(){
        return caches.match(event.request);
      })
    );
    return;
  }
  
  /* Static assets: cache-first */
  event.respondWith(
    caches.match(event.request).then(function(cached){
      if(cached) return cached;
      return fetch(event.request).then(function(response){
        if(response.ok){
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, clone); });
        }
        return response;
      });
    })
  );
});
