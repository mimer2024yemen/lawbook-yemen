/**
 * المستشار اليمني القانوني — Core App Module
 * Handles: SW registration, lazy data loading, caching, shared utilities
 */
(function(global){
  'use strict';

  /* ===== Service Worker Registration ===== */
  function registerSW(){
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js').catch(function(){});
    }
  }

  /* ===== Data Cache (in-memory + sessionStorage) ===== */
  var cache = {
    catalog: null,
    database: null,
    ragIndex: null
  };

  function getCached(key){
    if(cache[key]) return cache[key];
    try {
      var stored = sessionStorage.getItem('advisor_' + key);
      if(stored){
        cache[key] = JSON.parse(stored);
        return cache[key];
      }
    } catch(e){}
    return null;
  }

  function setCache(key, data){
    cache[key] = data;
    try {
      sessionStorage.setItem('advisor_' + key, JSON.stringify(data));
    } catch(e){}
  }

  /* ===== Lazy Data Loading ===== */
  async function loadCatalog(){
    var cached = getCached('catalog');
    if(cached) return cached;
    var r = await fetch('catalog.json');
    var data = await r.json();
    setCache('catalog', data);
    return data;
  }

  async function loadDatabase(){
    var cached = getCached('database');
    if(cached) return cached;
    var r = await fetch('database.json');
    var data = await r.json();
    setCache('database', data);
    return data;
  }

  /* Load catalog first, database in background */
  async function loadEssential(){
    var catalog = await loadCatalog();
    /* Start database load in background (don't await) */
    loadDatabase().catch(function(){});
    return catalog;
  }

  /* ===== Shared Utilities ===== */
  function esc(s){
    return String(s||'').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c];
    });
  }

  function formatNumber(v){
    return Number(v||0).toLocaleString('en-US');
  }

  function truncate(text, limit){
    var s = String(text||'').replace(/\s+/g,' ').trim();
    return s.length <= limit ? s : s.slice(0,limit).trim() + '...';
  }

  /* ===== Scroll to Top Button ===== */
  function initScrollTop(){
    var btn = document.getElementById('scrollTop');
    if(!btn) return;
    window.addEventListener('scroll', function(){
      btn.classList.toggle('visible', window.scrollY > 300);
    }, {passive: true});
    btn.addEventListener('click', function(){
      window.scrollTo({top:0, behavior:'smooth'});
    });
  }

  /* ===== Mobile Menu ===== */
  function initMobileMenu(){
    var toggle = document.getElementById('menuToggle');
    var links = document.getElementById('navLinks');
    if(!toggle || !links) return;
    toggle.addEventListener('click', function(){
      links.classList.toggle('open');
    });
    /* Close on link click */
    links.querySelectorAll('.nav-link').forEach(function(link){
      link.addEventListener('click', function(){
        links.classList.remove('open');
      });
    });
  }

  /* ===== Initialize Common Features ===== */
  function initCommon(){
    registerSW();
    initScrollTop();
    initMobileMenu();
  }

  /* ===== Public API ===== */
  global.App = {
    init: initCommon,
    loadCatalog: loadCatalog,
    loadDatabase: loadDatabase,
    loadEssential: loadEssential,
    esc: esc,
    formatNumber: formatNumber,
    truncate: truncate
  };

  /* Auto-init on DOM ready */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initCommon);
  } else {
    initCommon();
  }

})(window);
