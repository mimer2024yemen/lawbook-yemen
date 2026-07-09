/**
 * المستشار اليمني القانوني — Data Layer v2
 * IndexedDB + lazy section loading + compact search index
 */
(function(global){
  'use strict';

  var DB_NAME = 'advisor_yemen';
  var DB_VERSION = 1;
  var db = null;

  /* ===== IndexedDB Setup ===== */
  function openDB(){
    return new Promise(function(resolve, reject){
      if(db){ resolve(db); return; }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(e){
        var idb = e.target.result;
        if(!idb.objectStoreNames.contains('sections')){
          idb.createObjectStore('sections', {keyPath: 'name'});
        }
        if(!idb.objectStoreNames.contains('meta')){
          idb.createObjectStore('meta', {keyPath: 'key'});
        }
      };
      request.onsuccess = function(e){ db = e.target.result; resolve(db); };
      request.onerror = function(){ reject(request.error); };
    });
  }

  async function idbGet(store, key){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(store, 'readonly');
      var req = tx.objectStore(store).get(key);
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function idbPut(store, data){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(store, 'readwrite');
      var req = tx.objectStore(store).put(data);
      req.onsuccess = function(){ resolve(); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  /* ===== Memory Cache ===== */
  var memCache = {
    catalog: null,
    searchIndex: null,
    sections: {},
    ragIndex: null
  };

  /* ===== Load Compact Catalog ===== */
  async function loadCatalog(){
    if(memCache.catalog) return memCache.catalog;

    /* Try sessionStorage first */
    try {
      var stored = sessionStorage.getItem('adv_catalog');
      if(stored){ memCache.catalog = JSON.parse(stored); return memCache.catalog; }
    } catch(e){}

    var r = await fetch('data/catalog-compact.json');
    memCache.catalog = await r.json();

    try { sessionStorage.setItem('adv_catalog', JSON.stringify(memCache.catalog)); } catch(e){}
    return memCache.catalog;
  }

  /* ===== Load Search Index (compact, no text) ===== */
  async function loadSearchIndex(){
    if(memCache.searchIndex) return memCache.searchIndex;

    var r = await fetch('data/search-index.json');
    memCache.searchIndex = await r.json();
    return memCache.searchIndex;
  }

  /* ===== Load Section Data (lazy, cached in IndexedDB) ===== */
  async function loadSection(sectionName){
    if(memCache.sections[sectionName]) return memCache.sections[sectionName];

    /* Try IndexedDB first */
    try {
      var cached = await idbGet('sections', sectionName);
      if(cached && cached.data){
        memCache.sections[sectionName] = cached.data;
        return cached.data;
      }
    } catch(e){}

    /* Fetch from network */
    var r = await fetch('data/' + sectionName + '.json');
    var data = await r.json();
    memCache.sections[sectionName] = data;

    /* Store in IndexedDB */
    try { await idbPut('sections', {name: sectionName, data: data, ts: Date.now()}); } catch(e){}

    return data;
  }

  /* ===== Load Full Database (fallback, for advisor) ===== */
  async function loadFullDatabase(){
    /* Try to assemble from section files first */
    var catalog = await loadCatalog();
    var sections = Object.keys(catalog.laws || {});
    var db = {laws: {}, contracts: [], posts: []};

    for(var i = 0; i < sections.length; i++){
      var sectionData = await loadSection(sections[i]);
      if(sectionData && sectionData.laws){
        Object.assign(db.laws, sectionData.laws);
      }
    }

    /* Load contracts and posts */
    try {
      var contractsData = await loadSection('contracts');
      if(contractsData) db.contracts = contractsData.contracts || [];
    } catch(e){}

    try {
      var postsData = await loadSection('posts');
      if(postsData) db.posts = postsData.posts || [];
    } catch(e){}

    return db;
  }

  /* ===== Preload Critical Sections ===== */
  function preloadSections(){
    /* Load most-used sections in background */
    var critical = ['personal-status', 'civil', 'criminal', 'labor'];
    critical.forEach(function(s){
      loadSection(s).catch(function(){});
    });
  }

  /* ===== Public API ===== */
  global.DataLayer = {
    loadCatalog: loadCatalog,
    loadSearchIndex: loadSearchIndex,
    loadSection: loadSection,
    loadFullDatabase: loadFullDatabase,
    preloadSections: preloadSections
  };

})(window);
