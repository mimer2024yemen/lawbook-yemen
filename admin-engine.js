/**
 * المستشار اليمني القانوني — Admin Engine
 * Analytics, file parsing, permissions, settings, self-improvement
 */
(function(global){
  'use strict';

  /* ===== Analytics ===== */
  var ANALYTICS_KEY = 'advisor_analytics';

  function trackEvent(type, data){
    var analytics = getAnalytics();
    var event = { type: type, data: data || {}, ts: Date.now(), url: location.href };
    analytics.events.push(event);
    if(analytics.events.length > 5000) analytics.events = analytics.events.slice(-5000);
    
    // Update counters
    if(!analytics.counters[type]) analytics.counters[type] = 0;
    analytics.counters[type]++;
    
    // Track daily
    var today = new Date().toISOString().slice(0,10);
    if(!analytics.daily[today]) analytics.daily[today] = {};
    if(!analytics.daily[today][type]) analytics.daily[today][type] = 0;
    analytics.daily[today][type]++;
    
    saveAnalytics(analytics);
  }

  function getAnalytics(){
    try {
      return JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '{"events":[],"counters":{},"daily":{},"sessions":{}}');
    } catch(e){ return {events:[],counters:{},daily:{},sessions:{}}; }
  }

  function saveAnalytics(data){
    try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(data)); } catch(e){}
  }

  function trackPageView(){
    trackEvent('pageview', { page: location.pathname });
  }

  function trackSearch(query, resultCount, intent){
    trackEvent('search', { query: query.slice(0,100), results: resultCount, intent: intent });
  }

  function trackAdvisorQuery(query, intent, confidence, hasResults){
    trackEvent('advisor_query', { 
      query: query.slice(0,100), 
      intent: intent, 
      confidence: confidence,
      hasResults: hasResults
    });
  }

  function trackNoResult(query){
    trackEvent('no_result', { query: query.slice(0,200) });
  }

  /* ===== Session Tracking ===== */
  var sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  var sessionStart = Date.now();

  function getSessionId(){ return sessionId; }

  function trackSession(){
    var analytics = getAnalytics();
    if(!analytics.sessions) analytics.sessions = {};
    analytics.sessions[sessionId] = {
      start: sessionStart,
      lastActive: Date.now(),
      pageviews: 0,
      searches: 0,
      advisorQueries: 0
    };
    saveAnalytics(analytics);
  }

  /* ===== Analytics Dashboard Data ===== */
  function getDashboardData(){
    var analytics = getAnalytics();
    var now = Date.now();
    var today = new Date().toISOString().slice(0,10);
    var weekAgo = new Date(now - 7*24*60*60*1000).toISOString().slice(0,10);
    var monthAgo = new Date(now - 30*24*60*60*1000).toISOString().slice(0,10);
    
    // Count events by time period
    var todayEvents = analytics.events.filter(function(e){ 
      return new Date(e.ts).toISOString().slice(0,10) === today; 
    });
    var weekEvents = analytics.events.filter(function(e){ 
      return new Date(e.ts).toISOString().slice(0,10) >= weekAgo; 
    });
    var monthEvents = analytics.events.filter(function(e){ 
      return new Date(e.ts).toISOString().slice(0,10) >= monthAgo; 
    });
    
    // Top searches
    var searchCounts = {};
    analytics.events.filter(function(e){ return e.type === 'search' || e.type === 'advisor_query'; })
      .forEach(function(e){
        var q = (e.data.query || '').slice(0,50);
        if(q) searchCounts[q] = (searchCounts[q]||0) + 1;
      });
    var topSearches = Object.keys(searchCounts)
      .sort(function(a,b){ return searchCounts[b] - searchCounts[a]; })
      .slice(0,10)
      .map(function(q){ return {query: q, count: searchCounts[q]}; });
    
    // Top intents
    var intentCounts = {};
    analytics.events.filter(function(e){ return e.data && e.data.intent; })
      .forEach(function(e){
        var i = e.data.intent;
        intentCounts[i] = (intentCounts[i]||0) + 1;
      });
    var topIntents = Object.keys(intentCounts)
      .sort(function(a,b){ return intentCounts[b] - intentCounts[a]; })
      .slice(0,10)
      .map(function(i){ return {intent: i, count: intentCounts[i]}; });
    
    // No-result queries
    var noResultQueries = analytics.events
      .filter(function(e){ return e.type === 'no_result'; })
      .map(function(e){ return e.data.query || ''; })
      .filter(Boolean)
      .slice(-20);
    
    // Success rate
    var totalQueries = (analytics.counters.advisor_query || 0);
    var noResults = (analytics.counters.no_result || 0);
    var successRate = totalQueries > 0 ? Math.round((totalQueries - noResults) / totalQueries * 100) : 0;
    
    // Daily chart data (last 7 days)
    var dailyChart = [];
    for(var d = 6; d >= 0; d--){
      var date = new Date(now - d*24*60*60*1000).toISOString().slice(0,10);
      var dayData = analytics.daily[date] || {};
      dailyChart.push({
        date: date,
        pageviews: dayData.pageview || 0,
        searches: dayData.search || 0,
        queries: dayData.advisor_query || 0
      });
    }
    
    return {
      // Counts
      totalPageviews: analytics.counters.pageview || 0,
      totalSearches: analytics.counters.search || 0,
      totalQueries: totalQueries,
      totalNoResults: noResults,
      
      // Today
      todayPageviews: todayEvents.filter(function(e){ return e.type === 'pageview'; }).length,
      todaySearches: todayEvents.filter(function(e){ return e.type === 'search'; }).length,
      todayQueries: todayEvents.filter(function(e){ return e.type === 'advisor_query'; }).length,
      
      // Week
      weekPageviews: weekEvents.filter(function(e){ return e.type === 'pageview'; }).length,
      weekQueries: weekEvents.filter(function(e){ return e.type === 'advisor_query'; }).length,
      
      // Month
      monthPageviews: monthEvents.filter(function(e){ return e.type === 'pageview'; }).length,
      monthQueries: monthEvents.filter(function(e){ return e.type === 'advisor_query'; }).length,
      
      // Rates
      successRate: successRate,
      noResultRate: totalQueries > 0 ? Math.round(noResults / totalQueries * 100) : 0,
      
      // Rankings
      topSearches: topSearches,
      topIntents: topIntents,
      noResultQueries: noResultQueries,
      
      // Chart
      dailyChart: dailyChart,
      
      // Sessions
      activeSessions: Object.keys(analytics.sessions || {}).length
    };
  }

  /* ===== File Parser ===== */
  function parseTextFile(text){
    var lines = text.split('\n');
    var articles = [];
    var currentArticle = null;
    var lawTitle = '';
    var lawYear = '';
    var lawNumber = '';
    
    // Try to detect law title from first lines
    for(var i = 0; i < Math.min(10, lines.length); i++){
      var line = lines[i].trim();
      if(/قانون|نظام|مرسوم/.test(line) && line.length > 10 && line.length < 200){
        lawTitle = line;
      }
      if(/سنة\s*\d{4}/.test(line)){
        var yearMatch = line.match(/سنة\s*(\d{4})/);
        if(yearMatch) lawYear = yearMatch[1];
      }
      if(/رقم\s*\d+/.test(line)){
        var numMatch = line.match(/رقم\s*(\d+)/);
        if(numMatch) lawNumber = numMatch[1];
      }
    }
    
    // Extract articles
    var articlePattern = /^[\s]*[٠-٩\d]+[\s]*[-\-\.][\s]*(.+)/;
    var materialPattern = /(?:المادة|مادة)\s*[\(]?\s*([٠-٩\d]+)\s*[\)]?\s*[-\:]*\s*(.*)/;
    
    for(var i = 0; i < lines.length; i++){
      var line = lines[i].trim();
      if(!line) continue;
      
      var materialMatch = line.match(materialPattern);
      if(materialMatch){
        if(currentArticle) articles.push(currentArticle);
        currentArticle = {
          number: materialMatch[1],
          text: materialMatch[2] || '',
          lineStart: i + 1
        };
      } else if(currentArticle){
        currentArticle.text += ' ' + line;
      }
    }
    if(currentArticle) articles.push(currentArticle);
    
    // Detect section from content
    var fullText = text.slice(0, 5000);
    var section = detectSection(fullText);
    
    return {
      lawTitle: lawTitle,
      lawYear: lawYear,
      lawNumber: lawNumber,
      articles: articles,
      section: section,
      totalLines: lines.length,
      totalArticles: articles.length,
      confidence: articles.length > 0 ? 0.7 : 0.2
    };
  }

  function detectSection(text){
    var sectionPatterns = {
      'personal-status': /زواج|طلاق|نفقة|حضانة|ميراث|خلع|فسخ|عدة|مهر|ولاء|رضاع/,
      'civil': /ملكية|عقد|ضمان|تعويض|إتلاف|غصب|شفعة|رهن|كفالة|وكالة|وديعة/,
      'criminal': /جريمة|سرقة|قتل|زنا|قذف|حرابة|ردة|شرب|مخدر|تزوير|احتيال|رشوة/,
      'commercial': /تجاري|شركة|إفلاس|شيك|كمبيالة|سند|علامة|تجارة|بضاعة/,
      'labor': /عامل|موظف|راتب|أجر|إجازة|فصل|خدمة|تأمين|عمل|نقابة/,
      'litigation-procedures': /دعوى|محكمة|حكم|استئناف|نقض|تنفيذ|مرافعة|خصومة/
    };
    
    for(var section in sectionPatterns){
      if(sectionPatterns[section].test(text)) return section;
    }
    return '';
  }

  function parseJSONFile(jsonStr){
    try {
      var data = JSON.parse(jsonStr);
      var articles = [];
      var lawTitle = '';
      
      // Detect format
      if(data.laws){
        // Our database format
        return { format: 'database', data: data, confidence: 0.9 };
      }
      if(Array.isArray(data)){
        // Array of articles
        data.forEach(function(item){
          if(item.number || item.text || item.content){
            articles.push({
              number: item.number || item.article || '',
              text: item.text || item.content || ''
            });
          }
        });
        return { format: 'articles', articles: articles, confidence: 0.7 };
      }
      if(data.title && (data.content || data.articles)){
        // Single law
        return { 
          format: 'law', 
          lawTitle: data.title,
          articles: data.articles || [],
          content: data.content || [],
          confidence: 0.8
        };
      }
      
      return { format: 'unknown', data: data, confidence: 0.3 };
    } catch(e){
      return { format: 'error', error: e.message, confidence: 0 };
    }
  }

  /* ===== Settings Management ===== */
  var SETTINGS_KEY = 'advisor_settings';

  var defaultSettings = {
    // AI Settings
    advisorName: 'المستشار اليمني القانوني',
    advisorPersonality: 'مستشار قانوني يمني خبير، يجيب بدقة ووضوح، يلتزم بالقانون اليمني النافذ',
    responseStyle: 'detailed', // detailed, concise, balanced
    legalConservatism: 'high', // high, medium, low
    detailLevel: 'high', // high, medium, low
    
    // Sources
    priorityLaws: ['القانون المدني اليمني', 'قانون الأحوال الشخصية', 'قانون العقوبات', 'قانون العمل'],
    trustedSources: ['yemenilaw.com', 'yemen-nic.info', 'moj.gov.ye'],
    
    // Features
    enableExternalSearch: false,
    enableKnowledgeExpansion: true,
    enableAutoApprove: false,
    autoApproveThreshold: 0.8,
    
    // Display
    showConfidence: true,
    showSources: true,
    showRelatedArticles: true,
    maxResponseLength: 2000
  };

  function getSettings(){
    try {
      var stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return Object.assign({}, defaultSettings, stored);
    } catch(e){ return Object.assign({}, defaultSettings); }
  }

  function saveSettings(settings){
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e){}
  }

  /* ===== Permissions ===== */
  var AUTH_KEY = 'advisor_auth';
  var USERS_KEY = 'advisor_users';

  var defaultUsers = {
    'admin': { 
      password: 'admin123', // Default — should be changed
      role: 'admin', 
      name: 'المدير الرئيسي',
      permissions: ['read','write','delete','approve','settings','users']
    },
    'editor': { 
      password: 'editor123', 
      role: 'editor', 
      name: 'محرر قانوني',
      permissions: ['read','write','approve']
    },
    'reviewer': { 
      password: 'reviewer123', 
      role: 'reviewer', 
      name: 'مراجع',
      permissions: ['read','approve']
    },
    'viewer': { 
      password: 'viewer123', 
      role: 'viewer', 
      name: 'قارئ فقط',
      permissions: ['read']
    }
  };

  function getUsers(){
    try {
      var stored = JSON.parse(localStorage.getItem(USERS_KEY));
      if(!stored || !Object.keys(stored).length){
        localStorage.setItem(USERS_KEY, JSON.stringify(defaultUsers));
        return defaultUsers;
      }
      return stored;
    } catch(e){ return defaultUsers; }
  }

  function login(username, password){
    var users = getUsers();
    var user = users[username];
    if(!user || user.password !== password) return null;
    
    var session = {
      username: username,
      role: user.role,
      name: user.name,
      permissions: user.permissions,
      loginAt: Date.now()
    };
    
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(session)); } catch(e){}
    trackEvent('admin_login', { user: username, role: user.role });
    return session;
  }

  function logout(){
    try { localStorage.removeItem(AUTH_KEY); } catch(e){}
  }

  function getCurrentUser(){
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    } catch(e){ return null; }
  }

  function hasPermission(permission){
    var user = getCurrentUser();
    if(!user) return false;
    return user.permissions && user.permissions.indexOf(permission) !== -1;
  }

  function requireAuth(){
    var user = getCurrentUser();
    if(!user) return false;
    return true;
  }

  /* ===== Audit Log ===== */
  var AUDIT_KEY = 'advisor_audit';

  function logAudit(action, details){
    var log = getAuditLog();
    log.push({
      action: action,
      details: details || {},
      user: (getCurrentUser() || {}).username || 'system',
      ts: Date.now()
    });
    if(log.length > 1000) log = log.slice(-1000);
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(log)); } catch(e){}
  }

  function getAuditLog(){
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch(e){ return []; }
  }

  /* ===== Self-Improvement Analysis ===== */
  function getImprovementSuggestions(){
    var analytics = getAnalytics();
    var suggestions = [];
    
    // 1. Frequent no-result queries
    var noResultQueries = analytics.events
      .filter(function(e){ return e.type === 'no_result'; })
      .map(function(e){ return e.data.query || ''; })
      .filter(Boolean);
    
    var nrc = {};
    noResultQueries.forEach(function(q){ nrc[q] = (nrc[q]||0) + 1; });
    var frequentNoResult = Object.keys(nrc)
      .sort(function(a,b){ return nrc[b] - nrc[a]; })
      .slice(0,10)
      .map(function(q){ return {query: q, count: nrc[q]}; });
    
    if(frequentNoResult.length){
      suggestions.push({
        type: 'missing_knowledge',
        title: 'أسئلة متكررة بدون إجابة',
        description: 'هذه الأسئلة تُطرح كثيراً لكن النظام لا يجد إجابة لها',
        items: frequentNoResult,
        action: 'إضافة معرفة قانونية لهذه المواضيع'
      });
    }
    
    // 2. Popular topics that need more content
    var intentCounts = {};
    analytics.events.filter(function(e){ return e.data && e.data.intent; })
      .forEach(function(e){
        intentCounts[e.data.intent] = (intentCounts[e.data.intent]||0) + 1;
      });
    
    var popularIntents = Object.keys(intentCounts)
      .sort(function(a,b){ return intentCounts[b] - intentCounts[a]; })
      .slice(0,5);
    
    suggestions.push({
      type: 'popular_topics',
      title: 'المواضيع الأكثر طلباً',
      description: 'هذه المواضيع تحتاج محتوى أكثر',
      items: popularIntents.map(function(i){ return {topic: i, count: intentCounts[i]}; }),
      action: 'إضافة مواد قانونية أكثر لهذه المواضيع'
    });
    
    // 3. New user vocabulary
    var userWords = {};
    analytics.events.filter(function(e){ return e.data && e.data.query; })
      .forEach(function(e){
        var words = (e.data.query || '').split(/\s+/);
        words.forEach(function(w){
          if(w.length > 3) userWords[w] = (userWords[w]||0) + 1;
        });
      });
    
    var newWords = Object.keys(userWords)
      .sort(function(a,b){ return userWords[b] - userWords[a]; })
      .slice(0,20);
    
    suggestions.push({
      type: 'user_vocabulary',
      title: 'كلمات يستخدمها المستخدمون',
      description: 'هذه الكلمات قد تحتاج إضافة كمرادفات في محرك البحث',
      items: newWords.map(function(w){ return {word: w, count: userWords[w]}; }),
      action: 'إضافة كمرادفات في محرك البحث'
    });
    
    return suggestions;
  }

  /* ===== Public API ===== */
  global.AdminEngine = {
    // Analytics
    trackEvent: trackEvent,
    trackPageView: trackPageView,
    trackSearch: trackSearch,
    trackAdvisorQuery: trackAdvisorQuery,
    trackNoResult: trackNoResult,
    getAnalytics: getAnalytics,
    getDashboardData: getDashboardData,
    trackSession: trackSession,
    getSessionId: getSessionId,
    
    // File Parser
    parseTextFile: parseTextFile,
    parseJSONFile: parseJSONFile,
    detectSection: detectSection,
    
    // Settings
    getSettings: getSettings,
    saveSettings: saveSettings,
    defaultSettings: defaultSettings,
    
    // Permissions
    login: login,
    logout: logout,
    getCurrentUser: getCurrentUser,
    hasPermission: hasPermission,
    requireAuth: requireAuth,
    getUsers: getUsers,
    
    // Audit
    logAudit: logAudit,
    getAuditLog: getAuditLog,
    
    // Self-improvement
    getImprovementSuggestions: getImprovementSuggestions
  };

  // Auto-track pageview
  if(typeof document !== 'undefined'){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', trackPageView);
    } else {
      trackPageView();
    }
  }

})(window);
