/**
 * المستشار اليمني القانوني — Backend Integration Layer
 * Supabase-powered centralized database, auth, analytics, storage
 * 
 * SETUP: Replace SUPABASE_URL and SUPABASE_ANON_KEY with your Supabase project credentials
 */
(function(global){
  'use strict';

  /* ===== Supabase Configuration ===== */
  var CONFIG = {
    SUPABASE_URL: 'https://ocucwsjzrqrnivgytapk.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_HnV9aGkOJnjQmUQFA5gy5w_k3Eoolc3',
    TABLES: {
      users: 'admin_users',
      knowledge: 'knowledge_base',
      analytics: 'site_analytics',
      audit: 'audit_log',
      settings: 'advisor_settings',
      files: 'uploaded_files'
    }
  };

  /* ===== Supabase Client (minimal) ===== */
  var supabase = null;
  var currentUser = null;
  var currentSession = null;

  function initSupabase(){
    if(typeof window.supabase !== 'undefined' && window.supabase.createClient){
      supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      return true;
    }
    // Load Supabase JS client dynamically
    return new Promise(function(resolve){
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = function(){
        supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        resolve(true);
      };
      script.onerror = function(){ resolve(false); };
      document.head.appendChild(script);
    });
  }

  function isConfigured(){
    return CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL' && CONFIG.SUPABASE_URL.length > 10;
  }

  async function signIn(username, password){
    if(!supabase) return {error: 'Not configured'};
    
    var email = username + '@lawbook-ye.local';
    
    // Try sign in
    var result = await supabase.auth.signInWithPassword({email: email, password: password});
    
    if(result.error){
      // Auto-create user on first login
      var signUp = await supabase.auth.signUp({email: email, password: password});
      if(signUp.error) return {error: signUp.error.message};
      result = signUp;
    }
    
    currentSession = result.data.session;
    currentUser = result.data.user;
    
    if(currentUser){
      // Try to get/create profile
      try {
        var profile = await dbGet(CONFIG.TABLES.users, {username: username});
        if(!profile){
          await dbInsert(CONFIG.TABLES.users, {
            user_id: currentUser.id,
            username: username,
            name: username === 'admin' ? 'المدير الرئيسي' : username,
            role: username === 'admin' ? 'admin' : 'viewer',
            permissions: username === 'admin' ? ['read','write','delete','approve','settings','users','audit'] : ['read'],
            active: true
          });
          profile = {username: username, role: username === 'admin' ? 'admin' : 'viewer'};
        }
        currentUser.profile = profile;
      } catch(e){
        // Tables might not be set up yet
        currentUser.profile = {username: username, role: username === 'admin' ? 'admin' : 'viewer'};
      }
    }
    
    try { await logAudit('login', username, {role: currentUser.profile.role}); } catch(e){}
    return {user: currentUser, session: currentSession, profile: currentUser.profile};
  }

  async function signOut(){
    if(supabase) await supabase.auth.signOut();
    currentUser = null;
    currentSession = null;
  }

  async function getSession(){
    if(!supabase) return null;
    var result = await supabase.auth.getSession();
    if(result.data.session){
      currentSession = result.data.session;
      currentUser = result.data.session.user;
      return currentSession;
    }
    return null;
  }

  async function getUser(){
    if(currentUser) return currentUser;
    var session = await getSession();
    if(session) return currentUser;
    return null;
  }

  /* ===== Database Operations ===== */
  async function dbSelect(table, filters, options){
    if(!supabase) return [];
    var query = supabase.from(table).select(options && options.select || '*');
    if(filters){
      Object.keys(filters).forEach(function(key){
        query = query.eq(key, filters[key]);
      });
    }
    if(options && options.order) query = query.order(options.order.column, {ascending: options.order.ascending});
    if(options && options.limit) query = query.limit(options.limit);
    if(options && options.range) query = query.range(options.range.from, options.range.to);
    var result = await query;
    return result.data || [];
  }

  async function dbGet(table, filters){
    var results = await dbSelect(table, filters, {limit: 1});
    return results[0] || null;
  }

  async function dbInsert(table, data){
    if(!supabase) return null;
    var result = await supabase.from(table).insert(data).select();
    return result.data ? result.data[0] : null;
  }

  async function dbUpdate(table, filters, updates){
    if(!supabase) return null;
    var query = supabase.from(table).update(updates);
    Object.keys(filters).forEach(function(key){
      query = query.eq(key, filters[key]);
    });
    var result = await query.select();
    return result.data ? result.data[0] : null;
  }

  async function dbDelete(table, filters){
    if(!supabase) return false;
    var query = supabase.from(table).delete();
    Object.keys(filters).forEach(function(key){
      query = query.eq(key, filters[key]);
    });
    await query;
    return true;
  }

  async function dbCount(table, filters){
    if(!supabase) return 0;
    var query = supabase.from(table).select('*', {count: 'exact', head: true});
    if(filters){
      Object.keys(filters).forEach(function(key){
        query = query.eq(key, filters[key]);
      });
    }
    var result = await query;
    return result.count || 0;
  }

  /* ===== Analytics ===== */
  async function trackEvent(type, data){
    if(!supabase) return;
    try {
      await dbInsert(CONFIG.TABLES.analytics, {
        type: type,
        data: data || {},
        page: location.pathname,
        user_agent: navigator.userAgent,
        screen: screen.width + 'x' + screen.height,
        device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        created_at: new Date().toISOString()
      });
    } catch(e){ /* Silently fail if table not accessible */ }
  }

  async function trackPageView(){
    await trackEvent('pageview', {referrer: document.referrer});
  }

  async function trackSearch(query, results, intent){
    await trackEvent('search', {query: query.slice(0,200), results: results, intent: intent});
  }

  async function trackAdvisorQuery(query, intent, confidence, hasResults){
    await trackEvent('advisor_query', {query: query.slice(0,200), intent: intent, confidence: confidence, hasResults: hasResults});
  }

  async function trackNoResult(query){
    await trackEvent('no_result', {query: query.slice(0,200)});
  }

  async function getDashboardData(){
    if(!supabase) return getDefaultDashboard();
    
    try {
      var now = new Date();
      var today = now.toISOString().slice(0,10);

      var allEvents = await dbSelect(CONFIG.TABLES.analytics, null, {limit: 5000, order: {column: 'created_at', ascending: false}});
      var users = await dbCount(CONFIG.TABLES.users);
      var knowledge = await dbCount(CONFIG.TABLES.knowledge);

      var byType = {}, byDate = {}, intents = {}, searches = {}, noResults = {};
      allEvents.forEach(function(e){
        byType[e.type] = (byType[e.type]||0) + 1;
        var d = (e.created_at||'').slice(0,10);
        if(!byDate[d]) byDate[d] = {pageviews:0, searches:0, queries:0};
        if(e.type==='pageview') byDate[d].pageviews++;
        if(e.type==='search') byDate[d].searches++;
        if(e.type==='advisor_query') byDate[d].queries++;
        if(e.data && e.data.intent) intents[e.data.intent] = (intents[e.data.intent]||0) + 1;
        if(e.data && e.data.query){
          var q = e.data.query.slice(0,60);
          if(e.type==='search'||e.type==='advisor_query') searches[q] = (searches[q]||0) + 1;
          if(e.type==='no_result') noResults[q] = (noResults[q]||0) + 1;
        }
      });

      var totalQueries = byType['advisor_query']||0;
      var totalNoResults = byType['no_result']||0;

      var dailyChart = [];
      for(var d = 13; d >= 0; d--){
        var date = new Date(now - d*86400000).toISOString().slice(0,10);
        var day = byDate[date] || {pageviews:0,searches:0,queries:0};
        dailyChart.push({date:date, pageviews:day.pageviews, searches:day.searches, queries:day.queries});
      }

      return {
        totalEvents: allEvents.length,
        totalPageviews: byType['pageview']||0,
        totalSearches: byType['search']||0,
        totalQueries: totalQueries,
        totalNoResults: totalNoResults,
        todayPageviews: (byDate[today]||{}).pageviews||0,
        todaySearches: (byDate[today]||{}).searches||0,
        todayQueries: (byDate[today]||{}).queries||0,
        successRate: totalQueries > 0 ? Math.round((totalQueries-totalNoResults)/totalQueries*100) : 100,
        noResultRate: totalQueries > 0 ? Math.round(totalNoResults/totalQueries*100) : 0,
        topSearches: sortObj(searches).slice(0,15),
        topIntents: sortObj(intents).slice(0,10),
        noResultQueries: sortObj(noResults).slice(0,15),
        dailyChart: dailyChart,
        userCount: users,
        knowledgeCount: knowledge
      };
    } catch(e){
      return getDefaultDashboard();
    }
  }

  function getDefaultDashboard(){
    return {totalEvents:0,totalPageviews:0,totalSearches:0,totalQueries:0,totalNoResults:0,todayPageviews:0,todaySearches:0,todayQueries:0,successRate:100,noResultRate:0,topSearches:[],topIntents:[],noResultQueries:[],dailyChart:[],userCount:0,knowledgeCount:0};
  }

  function sortObj(obj){
    return Object.keys(obj).map(function(k){return {label:k,count:obj[k]};}).sort(function(a,b){return b.count-a.count;});
  }

  /* ===== Knowledge Base ===== */
  async function addKnowledge(data, submittedBy){
    return await dbInsert(CONFIG.TABLES.knowledge, {
      query: data.query || '',
      law_title: data.lawTitle || '',
      law_number: data.lawNumber || '',
      law_year: data.lawYear || '',
      article_number: data.articleNumber || '',
      article_text: data.articleText || '',
      section: data.section || '',
      source: data.source || '',
      workflow: 'draft',
      status: 'pending',
      confidence: calculateConfidence(data),
      submitted_by: submittedBy || 'system',
      submitted_at: new Date().toISOString(),
      use_count: 0
    });
  }

  function calculateConfidence(data){
    var s = 0;
    if(data.lawTitle && data.lawTitle.length > 5) s += 25;
    if(data.articleNumber && /\d+/.test(data.articleNumber)) s += 20;
    if(data.articleText && data.articleText.length > 30) s += 25;
    if(data.source) s += 15;
    if(data.lawYear) s += 5;
    if(data.section) s += 5;
    if(data.status === 'active') s += 5;
    return Math.min(s/100, 1);
  }

  async function getKnowledge(status){
    var filters = status ? {status: status} : null;
    return await dbSelect(CONFIG.TABLES.knowledge, filters, {order: {column: 'submitted_at', ascending: false}});
  }

  async function updateKnowledgeWorkflow(id, stage, by){
    var updates = {workflow: stage, updated_at: new Date().toISOString()};
    if(stage === 'review'){ updates.reviewed_by = by; updates.reviewed_at = new Date().toISOString(); }
    if(stage === 'approved'){ updates.approved_by = by; updates.approved_at = new Date().toISOString(); updates.status = 'approved'; }
    if(stage === 'published'){ updates.published_at = new Date().toISOString(); updates.status = 'published'; }
    if(stage === 'rejected'){ updates.status = 'rejected'; }
    return await dbUpdate(CONFIG.TABLES.knowledge, {id: id}, updates);
  }

  async function searchKnowledge(query){
    if(!supabase) return [];
    // Full-text search on article_text and law_title
    var result = await supabase.from(CONFIG.TABLES.knowledge)
      .select('*')
      .or('article_text.ilike.%'+query+'%,law_title.ilike.%'+query+'%')
      .eq('status', 'approved')
      .limit(5);
    return result.data || [];
  }

  /* ===== Audit Log ===== */
  async function logAudit(action, user, details){
    if(!supabase) return;
    await dbInsert(CONFIG.TABLES.audit, {
      action: action,
      user_name: user || 'system',
      details: details || {},
      created_at: new Date().toISOString()
    });
  }

  async function getAuditLog(limit){
    return await dbSelect(CONFIG.TABLES.audit, null, {limit: limit || 100, order: {column: 'created_at', ascending: false}});
  }

  /* ===== Settings ===== */
  async function getSettings(){
    var stored = await dbGet(CONFIG.TABLES.settings, {key: 'main'});
    return stored ? stored.value : getDefaultSettings();
  }

  async function saveSettings(settings){
    var existing = await dbGet(CONFIG.TABLES.settings, {key: 'main'});
    if(existing){
      await dbUpdate(CONFIG.TABLES.settings, {key: 'main'}, {value: settings, updated_at: new Date().toISOString()});
    } else {
      await dbInsert(CONFIG.TABLES.settings, {key: 'main', value: settings, created_at: new Date().toISOString()});
    }
    await logAudit('save_settings', (currentUser||{}).email||'system', {});
  }

  function getDefaultSettings(){
    return {
      advisorName: 'المستشار اليمني القانوني',
      advisorPersonality: 'مستشار قانوني يمني خبير',
      responseStyle: 'detailed',
      legalConservatism: 'high',
      detailLevel: 'high',
      priorityLaws: ['القانون المدني اليمني','قانون الأحوال الشخصية','قانون العقوبات','قانون العمل'],
      trustedSources: ['yemenilaw.com','yemen-nic.info','moj.gov.ye'],
      showConfidence: true,
      showSources: true
    };
  }

  /* ===== Users ===== */
  async function getUsers(){
    return await dbSelect(CONFIG.TABLES.users, null, {order: {column: 'created_at', ascending: false}});
  }

  async function addUser(userData){
    return await dbInsert(CONFIG.TABLES.users, {
      username: userData.username,
      name: userData.name,
      role: userData.role || 'viewer',
      permissions: getRolePermissions(userData.role || 'viewer'),
      created_at: new Date().toISOString()
    });
  }

  async function updateUser(id, updates){
    updates.updated_at = new Date().toISOString();
    if(updates.role) updates.permissions = getRolePermissions(updates.role);
    return await dbUpdate(CONFIG.TABLES.users, {id: id}, updates);
  }

  function getRolePermissions(role){
    var p = {
      'admin': ['read','write','delete','approve','settings','users','audit'],
      'editor': ['read','write','approve'],
      'reviewer': ['read','approve'],
      'viewer': ['read']
    };
    return p[role] || p['viewer'];
  }

  /* ===== Self-Improvement ===== */
  async function getImprovementSuggestions(){
    var events = await dbSelect(CONFIG.TABLES.analytics, null, {limit: 5000});
    var suggestions = [];

    var nrc = {};
    events.filter(function(e){return e.type==='no_result';}).forEach(function(e){
      var q = (e.data&&e.data.query||'').slice(0,60);
      if(q) nrc[q] = (nrc[q]||0)+1;
    });
    var freq = sortObj(nrc).slice(0,10);
    if(freq.length) suggestions.push({type:'missing',title:'🔴 أسئلة بدون إجابة',items:freq,action:'إضافة معرفة'});

    var ic = {};
    events.filter(function(e){return e.data&&e.data.intent;}).forEach(function(e){
      ic[e.data.intent]=(ic[e.data.intent]||0)+1;
    });
    suggestions.push({type:'popular',title:'📊 مواضيع شائعة',items:sortObj(ic).slice(0,8),action:'محتوى أكثر'});

    return suggestions;
  }

  /* ===== Initialize ===== */
  async function initialize(){
    var loaded = await initSupabase();
    if(!loaded || !isConfigured()){
      console.warn('Supabase not configured. Using local mode.');
      return false;
    }
    // Check existing session
    await getSession();
    return true;
  }

  /* ===== Public API ===== */
  global.Backend = {
    initialize: initialize,
    isConfigured: isConfigured,
    // Auth
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getUser: getUser,
    // Database
    dbSelect: dbSelect,
    dbGet: dbGet,
    dbInsert: dbInsert,
    dbUpdate: dbUpdate,
    dbDelete: dbDelete,
    dbCount: dbCount,
    // Analytics
    trackEvent: trackEvent,
    trackPageView: trackPageView,
    trackSearch: trackSearch,
    trackAdvisorQuery: trackAdvisorQuery,
    trackNoResult: trackNoResult,
    getDashboardData: getDashboardData,
    // Knowledge
    addKnowledge: addKnowledge,
    getKnowledge: getKnowledge,
    updateKnowledgeWorkflow: updateKnowledgeWorkflow,
    searchKnowledge: searchKnowledge,
    // Audit
    logAudit: logAudit,
    getAuditLog: getAuditLog,
    // Settings
    getSettings: getSettings,
    saveSettings: saveSettings,
    // Users
    getUsers: getUsers,
    addUser: addUser,
    updateUser: updateUser,
    // Improvement
    getImprovementSuggestions: getImprovementSuggestions,
    // Config
    CONFIG: CONFIG
  };

})(window);
