/**
 * المستشار اليمني القانوني — Production Admin Engine v2
 * Secure auth + IndexedDB analytics + file processing + approval workflow
 */
(function(global){
  'use strict';

  /* ===== Crypto: SHA-256 Hashing ===== */
  async function sha256(text){
    var encoder = new TextEncoder();
    var data = encoder.encode(text);
    var hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }

  /* ===== IndexedDB Core ===== */
  var DB_NAME = 'admin_production';
  var DB_VERSION = 3;
  var db = null;

  function openDB(){
    return new Promise(function(resolve, reject){
      if(db){ resolve(db); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e){
        var idb = e.target.result;
        if(!idb.objectStoreNames.contains('users')){
          var us = idb.createObjectStore('users', {keyPath:'username'});
          us.createIndex('role','role');
        }
        if(!idb.objectStoreNames.contains('sessions')){
          idb.createObjectStore('sessions', {keyPath:'token'});
        }
        if(!idb.objectStoreNames.contains('analytics')){
          var an = idb.createObjectStore('analytics', {keyPath:'id',autoIncrement:true});
          an.createIndex('type','type');
          an.createIndex('ts','ts');
          an.createIndex('date','date');
        }
        if(!idb.objectStoreNames.contains('knowledge')){
          var kn = idb.createObjectStore('knowledge', {keyPath:'id',autoIncrement:true});
          kn.createIndex('status','status');
          kn.createIndex('workflow','workflow');
          kn.createIndex('confidence','confidence');
        }
        if(!idb.objectStoreNames.contains('audit')){
          var au = idb.createObjectStore('audit', {keyPath:'id',autoIncrement:true});
          au.createIndex('user','user');
          au.createIndex('action','action');
          au.createIndex('ts','ts');
        }
        if(!idb.objectStoreNames.contains('files')){
          idb.createObjectStore('files', {keyPath:'id',autoIncrement:true});
        }
        if(!idb.objectStoreNames.contains('settings')){
          idb.createObjectStore('settings', {keyPath:'key'});
        }
      };
      req.onsuccess = function(e){ db = e.target.result; resolve(db); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbPut(store, data){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(store, 'readwrite');
      var req = tx.objectStore(store).put(data);
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbGet(store, key){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(store, 'readonly');
      var req = tx.objectStore(store).get(key);
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbGetAll(store){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(store, 'readonly');
      var req = tx.objectStore(store).getAll();
      req.onsuccess = function(){ resolve(req.result || []); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbDelete(store, key){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(store, 'readwrite');
      var req = tx.objectStore(store).delete(key);
      req.onsuccess = function(){ resolve(); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbCount(store){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(store, 'readonly');
      var req = tx.objectStore(store).count();
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  /* ===== Authentication ===== */
  var SESSION_KEY = 'admin_session_token';
  var SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

  var DEFAULT_ADMIN = {
    username: 'admin',
    passwordHash: '', // Will be set on first run
    role: 'admin',
    name: 'المدير الرئيسي',
    permissions: ['read','write','delete','approve','settings','users','audit'],
    createdAt: Date.now(),
    active: true
  };

  async function initAdmin(password){
    var existing = await dbGet('users', 'admin');
    if(existing) return existing;
    var hash = await sha256(password);
    var admin = Object.assign({}, DEFAULT_ADMIN, {passwordHash: hash});
    await dbPut('users', admin);
    return admin;
  }

  async function login(username, password){
    var user = await dbGet('users', username);
    if(!user || !user.active) return null;
    var hash = await sha256(password);
    if(hash !== user.passwordHash) return null;

    // Create session
    var token = await sha256(username + Date.now() + Math.random());
    var session = {
      token: token,
      username: username,
      role: user.role,
      name: user.name,
      permissions: user.permissions,
      loginAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION,
      userAgent: navigator.userAgent
    };
    await dbPut('sessions', session);
    localStorage.setItem(SESSION_KEY, token);

    await logAudit('login', username, {role: user.role});
    trackEvent('admin_login', {user: username});

    return session;
  }

  async function logout(){
    var token = localStorage.getItem(SESSION_KEY);
    if(token){
      try { await dbDelete('sessions', token); } catch(e){}
    }
    localStorage.removeItem(SESSION_KEY);
  }

  async function getCurrentSession(){
    var token = localStorage.getItem(SESSION_KEY);
    if(!token) return null;
    var session = await dbGet('sessions', token);
    if(!session || session.expiresAt < Date.now()){
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  }

  async function requireAuth(){
    var session = await getCurrentSession();
    return session;
  }

  async function hasPermission(perm){
    var session = await getCurrentSession();
    if(!session) return false;
    return session.permissions && session.permissions.indexOf(perm) !== -1;
  }

  /* ===== User Management ===== */
  async function getUsers(){
    return await dbGetAll('users');
  }

  async function addUser(userData){
    var hash = await sha256(userData.password);
    var user = {
      username: userData.username,
      passwordHash: hash,
      role: userData.role || 'viewer',
      name: userData.name || userData.username,
      permissions: getRolePermissions(userData.role || 'viewer'),
      createdAt: Date.now(),
      createdBy: (await getCurrentSession() || {}).username || 'system',
      active: true
    };
    await dbPut('users', user);
    await logAudit('add_user', user.username, {role: user.role});
    return user;
  }

  async function updateUser(username, updates){
    var user = await dbGet('users', username);
    if(!user) return null;
    if(updates.password){
      updates.passwordHash = await sha256(updates.password);
      delete updates.password;
    }
    if(updates.role){
      updates.permissions = getRolePermissions(updates.role);
    }
    Object.assign(user, updates, {updatedAt: Date.now()});
    await dbPut('users', user);
    await logAudit('update_user', username, updates);
    return user;
  }

  async function deleteUser(username){
    if(username === 'admin') throw new Error('Cannot delete main admin');
    await dbDelete('users', username);
    await logAudit('delete_user', username);
  }

  function getRolePermissions(role){
    var perms = {
      'admin': ['read','write','delete','approve','settings','users','audit'],
      'editor': ['read','write','approve'],
      'reviewer': ['read','approve'],
      'viewer': ['read']
    };
    return perms[role] || perms['viewer'];
  }

  /* ===== Analytics (IndexedDB) ===== */
  function getToday(){ return new Date().toISOString().slice(0,10); }

  async function trackEvent(type, data){
    var event = {
      type: type,
      data: data || {},
      ts: Date.now(),
      date: getToday(),
      url: location.href,
      userAgent: navigator.userAgent
    };
    await dbPut('analytics', event);
  }

  async function trackPageView(page){
    await trackEvent('pageview', {
      page: page || location.pathname,
      referrer: document.referrer,
      screen: screen.width + 'x' + screen.height,
      device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    });
  }

  async function trackSearch(query, resultCount, intent){
    await trackEvent('search', {query: query.slice(0,200), results: resultCount, intent: intent});
  }

  async function trackAdvisorQuery(query, intent, confidence, hasResults){
    await trackEvent('advisor_query', {
      query: query.slice(0,200),
      intent: intent,
      confidence: confidence,
      hasResults: hasResults
    });
  }

  async function trackNoResult(query){
    await trackEvent('no_result', {query: query.slice(0,200)});
  }

  /* ===== Dashboard Data ===== */
  async function getDashboardData(){
    var events = await dbGetAll('analytics');
    var now = Date.now();
    var today = getToday();
    var weekAgo = new Date(now - 7*86400000).toISOString().slice(0,10);
    var monthAgo = new Date(now - 30*86400000).toISOString().slice(0,10);

    var byType = {};
    var byDate = {};
    var byDevice = {};
    var searchQueries = {};
    var noResultQueries = {};
    var intents = {};

    events.forEach(function(e){
      byType[e.type] = (byType[e.type]||0) + 1;

      if(!byDate[e.date]) byDate[e.date] = {pageviews:0,searches:0,queries:0};
      if(e.type==='pageview') byDate[e.date].pageviews++;
      if(e.type==='search') byDate[e.date].searches++;
      if(e.type==='advisor_query') byDate[e.date].queries++;

      if(e.data.device) byDevice[e.data.device] = (byDevice[e.data.device]||0) + 1;
      if(e.data.query){
        var q = e.data.query.slice(0,60);
        if(e.type==='search'||e.type==='advisor_query') searchQueries[q] = (searchQueries[q]||0)+1;
        if(e.type==='no_result') noResultQueries[q] = (noResultQueries[q]||0)+1;
      }
      if(e.data.intent) intents[e.data.intent] = (intents[e.data.intent]||0)+1;
    });

    // Daily chart (last 14 days)
    var dailyChart = [];
    for(var d = 13; d >= 0; d--){
      var date = new Date(now - d*86400000).toISOString().slice(0,10);
      var day = byDate[date] || {pageviews:0,searches:0,queries:0};
      dailyChart.push({date:date, pageviews:day.pageviews, searches:day.searches, queries:day.queries});
    }

    var todayData = byDate[today] || {pageviews:0,searches:0,queries:0};
    var totalQueries = byType['advisor_query']||0;
    var noResults = byType['no_result']||0;

    return {
      totalEvents: events.length,
      totalPageviews: byType['pageview']||0,
      totalSearches: byType['search']||0,
      totalQueries: totalQueries,
      totalNoResults: noResults,
      todayPageviews: todayData.pageviews,
      todaySearches: todayData.searches,
      todayQueries: todayData.queries,
      successRate: totalQueries > 0 ? Math.round((totalQueries-noResults)/totalQueries*100) : 100,
      noResultRate: totalQueries > 0 ? Math.round(noResults/totalQueries*100) : 0,
      topSearches: sortObj(searchQueries).slice(0,15),
      topIntents: sortObj(intents).slice(0,10),
      noResultQueries: sortObj(noResultQueries).slice(0,15),
      deviceBreakdown: byDevice,
      dailyChart: dailyChart,
      userCount: await dbCount('users'),
      knowledgeCount: await dbCount('knowledge')
    };
  }

  function sortObj(obj){
    return Object.keys(obj).map(function(k){return {label:k,count:obj[k]};})
      .sort(function(a,b){return b.count-a.count;});
  }

  /* ===== File Processing ===== */
  function parseTextFile(text, filename){
    var lines = text.split('\n');
    var articles = [];
    var current = null;
    var lawTitle = '';
    var lawYear = '';
    var lawNumber = '';

    // Detect law title from first 15 lines
    for(var i = 0; i < Math.min(15, lines.length); i++){
      var line = lines[i].trim();
      if(/قانون|نظام|مرسوم|قانون\s+رقم/.test(line) && line.length > 8 && line.length < 250){
        lawTitle = line;
      }
      var ym = line.match(/سنة\s*(\d{4})/);
      if(ym) lawYear = ym[1];
      var nm = line.match(/رقم\s*(\d+)/);
      if(nm) lawNumber = nm[1];
    }

    // Extract articles
    var patterns = [
      /(?:المادة|مادة)\s*[\(٠-٩\d\)]+\s*[-\:]*\s*(.*)/,
      /^[٠-٩\d]+[\s]*[-\.]\s+(.+)/,
      /^الفصل\s+[٠-٩\d]+[\s]*[-\:]*\s*(.*)/
    ];

    for(var i = 0; i < lines.length; i++){
      var line = lines[i].trim();
      if(!line || line.length < 3) continue;

      var numMatch = line.match(/(?:المادة|مادة|مادة|الفصل)\s*[\(]?\s*([٠-٩\d]+)\s*[\)]?/);
      if(numMatch){
        if(current) articles.push(current);
        var num = numMatch[1].replace(/[٠-٩]/g, function(d){return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d));});
        current = {number:num, text:line.replace(numMatch[0],'').trim(), lineStart:i+1};
      } else if(current && line.length > 5){
        current.text += ' ' + line;
      }
    }
    if(current) articles.push(current);

    var section = detectSection(text.slice(0,8000));
    return {
      filename: filename,
      lawTitle: lawTitle || filename.replace(/\.\w+$/,''),
      lawYear: lawYear,
      lawNumber: lawNumber,
      articles: articles,
      section: section,
      totalLines: lines.length,
      totalArticles: articles.length,
      confidence: articles.length > 3 ? 0.8 : articles.length > 0 ? 0.5 : 0.2,
      format: 'text'
    };
  }

  function parseJSONFile(jsonStr, filename){
    try {
      var data = JSON.parse(jsonStr);
      if(data.laws) return {format:'database', data:data, confidence:0.9, filename:filename, totalArticles:JSON.stringify(data).split('"number"').length-1};
      if(Array.isArray(data)){
        var arts = data.filter(function(i){return i.number||i.text||i.content;}).map(function(i){
          return {number:i.number||i.article||'', text:i.text||i.content||''};
        });
        return {format:'articles', articles:arts, confidence:0.7, filename:filename, totalArticles:arts.length, lawTitle:data.title||''};
      }
      if(data.title) return {format:'law', lawTitle:data.title, articles:data.articles||[], confidence:0.8, filename:filename};
      return {format:'unknown', data:data, confidence:0.3, filename:filename};
    } catch(e){ return {format:'error', error:e.message, confidence:0, filename:filename}; }
  }

  function detectSection(text){
    var patterns = {
      'personal-status':/زواج|طلاق|نفقة|حضانة|ميراث|خلع|فسخ|عدة|مهر|رضاع|ولاء/,
      'civil':/ملكية|عقد|ضمان|تعويض|إتلاف|غصب|شفعة|رهن|كفالة|وكالة|وديعة|إخلاء/,
      'criminal':/جريمة|سرقة|قتل|زنا|قذف|حرابة|ردة|شرب|مخدر|تزوير|احتيال|رشوة|اعتداء/,
      'commercial':/تجاري|شركة|إفلاس|شيك|كمبيالة|سند|علامة|تجارة|بضاعة|تاجر/,
      'labor':/عامل|موظف|راتب|أجر|إجازة|فصل|خدمة|تأمين|عمل|نقابة|تسريح/,
      'litigation-procedures':/دعوى|محكمة|حكم|استئناف|نقض|تنفيذ|مرافعة|خصومة|طعن/
    };
    for(var s in patterns){ if(patterns[s].test(text)) return s; }
    return '';
  }

  /* ===== Knowledge Workflow ===== */
  var WORKFLOW_STATES = ['draft','review','approved','published','rejected'];

  async function addKnowledgeEntry(data, submittedBy){
    var entry = {
      // Content
      query: data.query || '',
      lawTitle: data.lawTitle || '',
      lawNumber: data.lawNumber || '',
      lawYear: data.lawYear || '',
      articleNumber: data.articleNumber || '',
      articleText: data.articleText || '',
      section: data.section || '',
      source: data.source || '',
      // Workflow
      workflow: 'draft',
      status: 'pending',
      // Confidence
      confidence: calculateConfidence(data),
      // Metadata
      submittedBy: submittedBy || 'system',
      submittedAt: Date.now(),
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      publishedAt: null,
      rejectionReason: null,
      // Tracking
      useCount: 0,
      lastUsed: null,
      feedback: []
    };
    var id = await dbPut('knowledge', entry);
    entry.id = id;
    await logAudit('add_knowledge', submittedBy, {law:entry.lawTitle, article:entry.articleNumber});
    return entry;
  }

  function calculateConfidence(data){
    var score = 0;
    if(data.lawTitle && data.lawTitle.length > 5) score += 25;
    if(data.articleNumber && /\d+/.test(data.articleNumber)) score += 20;
    if(data.articleText && data.articleText.length > 30) score += 25;
    if(data.source) score += 15;
    if(data.lawYear) score += 5;
    if(data.section) score += 5;
    if(data.status === 'active') score += 5;
    return Math.min(score/100, 1);
  }

  async function updateWorkflow(id, newStage, by, reason){
    var entry = await dbGet('knowledge', id);
    if(!entry) return null;

    entry.workflow = newStage;
    entry.updatedAt = Date.now();

    switch(newStage){
      case 'review':
        entry.reviewedBy = by;
        entry.reviewedAt = Date.now();
        break;
      case 'approved':
        entry.approvedBy = by;
        entry.approvedAt = Date.now();
        entry.status = 'approved';
        break;
      case 'published':
        entry.publishedAt = Date.now();
        entry.status = 'published';
        break;
      case 'rejected':
        entry.status = 'rejected';
        entry.rejectionReason = reason || '';
        break;
    }

    await dbPut('knowledge', entry);
    await logAudit('workflow_' + newStage, by, {id:id, law:entry.lawTitle, reason:reason});
    return entry;
  }

  async function getKnowledgeByStatus(status){
    var all = await dbGetAll('knowledge');
    if(!status) return all;
    return all.filter(function(e){ return e.status === status || e.workflow === status; });
  }

  async function recordKnowledgeUsage(id){
    var entry = await dbGet('knowledge', id);
    if(!entry) return;
    entry.useCount = (entry.useCount||0) + 1;
    entry.lastUsed = Date.now();
    await dbPut('knowledge', entry);
  }

  /* ===== Audit Log ===== */
  async function logAudit(action, user, details){
    await dbPut('audit', {
      action: action,
      user: user || 'system',
      details: details || {},
      ts: Date.now(),
      date: getToday()
    });
  }

  async function getAuditLog(limit){
    var all = await dbGetAll('audit');
    all.sort(function(a,b){return b.ts-a.ts;});
    return all.slice(0, limit || 100);
  }

  /* ===== Settings (IndexedDB) ===== */
  var DEFAULT_SETTINGS = {
    advisorName: 'المستشار اليمني القانوني',
    advisorPersonality: 'مستشار قانوني يمني خبير، يجيب بدقة ووضوح',
    responseStyle: 'detailed',
    legalConservatism: 'high',
    detailLevel: 'high',
    priorityLaws: ['القانون المدني اليمني','قانون الأحوال الشخصية','قانون العقوبات','قانون العمل'],
    trustedSources: ['yemenilaw.com','yemen-nic.info','moj.gov.ye','cby.ye'],
    showConfidence: true,
    showSources: true,
    enableKnowledgeExpansion: true
  };

  async function getSettings(){
    var stored = await dbGet('settings', 'main');
    return Object.assign({}, DEFAULT_SETTINGS, stored ? stored.value : {});
  }

  async function saveSettings(settings){
    await dbPut('settings', {key:'main', value:settings, updatedAt:Date.now()});
    await logAudit('save_settings', (await getCurrentSession()||{}).username, {});
  }

  /* ===== Self-Improvement Analysis ===== */
  async function getImprovementSuggestions(){
    var events = await dbGetAll('analytics');
    var suggestions = [];

    // No-result queries
    var nrc = {};
    events.filter(function(e){return e.type==='no_result';}).forEach(function(e){
      var q = (e.data.query||'').slice(0,60);
      if(q) nrc[q] = (nrc[q]||0)+1;
    });
    var freq = sortObj(nrc).slice(0,10);
    if(freq.length){
      suggestions.push({type:'missing',title:'🔴 أسئلة متكررة بدون إجابة',desc:'هذه الأسئلة تُطرح كثيراً لكن لا توجد إجابة',items:freq,action:'إضافة معرفة قانونية'});
    }

    // Popular intents
    var ic = {};
    events.filter(function(e){return e.data&&e.data.intent;}).forEach(function(e){
      ic[e.data.intent]=(ic[e.data.intent]||0)+1;
    });
    suggestions.push({type:'popular',title:'📊 المواضيع الأكثر طلباً',desc:'تحتاج محتوى أكثر',items:sortObj(ic).slice(0,8),action:'إضافة مواد قانونية'});

    // New vocabulary
    var wc = {};
    events.filter(function(e){return e.data&&e.data.query;}).forEach(function(e){
      (e.data.query||'').split(/\s+/).forEach(function(w){
        if(w.length>3) wc[w]=(wc[w]||0)+1;
      });
    });
    suggestions.push({type:'vocab',title:'💬 كلمات يستخدمها المستخدمون',desc:'قد تحتاج إضافة كمرادفات',items:sortObj(wc).slice(0,20),action:'إضافة مرادفات'});

    return suggestions;
  }

  /* ===== Initialize Default Data ===== */
  async function initialize(password){
    await openDB();
    await initAdmin(password || '777287583');
    // Init settings if not exists
    var existing = await dbGet('settings', 'main');
    if(!existing) await dbPut('settings', {key:'main', value:DEFAULT_SETTINGS, createdAt:Date.now()});
  }

  /* ===== Public API ===== */
  global.AdminEngine = {
    initialize: initialize,
    // Auth
    login: login,
    logout: logout,
    getCurrentSession: getCurrentSession,
    requireAuth: requireAuth,
    hasPermission: hasPermission,
    // Users
    getUsers: getUsers,
    addUser: addUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    // Analytics
    trackEvent: trackEvent,
    trackPageView: trackPageView,
    trackSearch: trackSearch,
    trackAdvisorQuery: trackAdvisorQuery,
    trackNoResult: trackNoResult,
    getDashboardData: getDashboardData,
    // Files
    parseTextFile: parseTextFile,
    parseJSONFile: parseJSONFile,
    detectSection: detectSection,
    // Knowledge
    addKnowledgeEntry: addKnowledgeEntry,
    updateWorkflow: updateWorkflow,
    getKnowledgeByStatus: getKnowledgeByStatus,
    recordKnowledgeUsage: recordKnowledgeUsage,
    // Audit
    logAudit: logAudit,
    getAuditLog: getAuditLog,
    // Settings
    getSettings: getSettings,
    saveSettings: saveSettings,
    // Improvement
    getImprovementSuggestions: getImprovementSuggestions,
    // Constants
    WORKFLOW_STATES: WORKFLOW_STATES
  };

})(window);
