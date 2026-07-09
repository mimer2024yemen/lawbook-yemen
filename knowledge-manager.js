/**
 * المستشار اليمني القانوني — Knowledge Manager
 * Self-expanding legal knowledge base with verification and confidence scoring
 * Uses IndexedDB for persistent client-side storage
 */
(function(global){
  'use strict';

  /* ===== Constants ===== */
  var DB_NAME = 'advisor_knowledge';
  var DB_VERSION = 1;
  var STORE_NAME = 'knowledge';
  var PENDING_STORE = 'pending';
  var FEEDBACK_STORE = 'feedback';

  var CONFIDENCE_THRESHOLDS = {
    HIGH: 0.8,    // Auto-use in responses
    MEDIUM: 0.5,  // Use with disclaimer
    LOW: 0.2,     // Show as reference only
    REJECTED: 0   // Do not use
  };

  var TRUSTED_SOURCES = [
    'yemenilaw.com',
    'yemen-nic.info',
    'president.ye',
    'moj.gov.ye',
    'cby.ye',
    'parliament.ye',
    'cabinet.ye',
    'aljareeda.net',
    'alsabaah.ye',
    'saba.ye',
    'yemenigazette.gov.ye'
  ];

  var VERIFIED_LAW_PATTERNS = [
    /قانون\s+(رقم|ال)\s*\d+/,
    /مادة\s*\(\s*\d+\s*\)/,
    /المادة\s+(ال)?\d+/,
    /قانون\s+\S+\s+اليمني/,
    /سنة\s+\d{4}/,
    /رقم\s+\d+\s+لسنة/
  ];

  /* ===== Database ===== */
  var db = null;

  function openDB(){
    return new Promise(function(resolve, reject){
      if(db){ resolve(db); return; }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(e){
        var idb = e.target.result;
        if(!idb.objectStoreNames.contains(STORE_NAME)){
          var store = idb.createObjectStore(STORE_NAME, {keyPath: 'id', autoIncrement: true});
          store.createIndex('status', 'status');
          store.createIndex('confidence', 'confidence');
          store.createIndex('topic', 'topic');
          store.createIndex('lawTitle', 'lawTitle');
          store.createIndex('createdAt', 'createdAt');
        }
        if(!idb.objectStoreNames.contains(PENDING_STORE)){
          var pending = idb.createObjectStore(PENDING_STORE, {keyPath: 'id', autoIncrement: true});
          pending.createIndex('status', 'status');
        }
        if(!idb.objectStoreNames.contains(FEEDBACK_STORE)){
          idb.createObjectStore(FEEDBACK_STORE, {keyPath: 'id', autoIncrement: true});
        }
      };
      request.onsuccess = function(e){ db = e.target.result; resolve(db); };
      request.onerror = function(){ reject(request.error); };
    });
  }

  async function dbPut(storeName, data){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(storeName, 'readwrite');
      var req = tx.objectStore(storeName).put(data);
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbGet(storeName, id){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(storeName, 'readonly');
      var req = tx.objectStore(storeName).get(id);
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbGetAll(storeName){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(storeName, 'readonly');
      var req = tx.objectStore(storeName).getAll();
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  async function dbDelete(storeName, id){
    var idb = await openDB();
    return new Promise(function(resolve, reject){
      var tx = idb.transaction(storeName, 'readwrite');
      var req = tx.objectStore(storeName).delete(id);
      req.onsuccess = function(){ resolve(); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  /* ===== Verification System ===== */
  function verifyKnowledge(entry){
    var score = 0;
    var issues = [];

    // 1. Check if law name is present
    if(entry.lawTitle && entry.lawTitle.length > 5){
      score += 25;
    } else {
      issues.push('اسم القانون مفقود أو قصير جداً');
    }

    // 2. Check if article number is present
    if(entry.articleNumber && /\d+/.test(entry.articleNumber)){
      score += 20;
    } else {
      issues.push('رقم المادة مفقود');
    }

    // 3. Check if article text is present and meaningful
    if(entry.articleText && entry.articleText.length > 30){
      score += 25;
    } else {
      issues.push('نص المادة مفقود أو قصير جداً');
    }

    // 4. Check if source is provided
    if(entry.source){
      // Check if source is from trusted domain
      var isTrusted = TRUSTED_SOURCES.some(function(domain){
        return entry.source.toLowerCase().indexOf(domain) !== -1;
      });
      if(isTrusted){
        score += 20;
      } else {
        score += 10;
        issues.push('المصدر ليس من موقع حكومي يمني رسمي');
      }
    } else {
      issues.push('المصدر مفقود');
    }

    // 5. Check if law year is mentioned
    if(entry.year && /\d{4}/.test(String(entry.year))){
      score += 5;
    }

    // 6. Check if text contains legal patterns
    var fullText = (entry.articleText || '') + ' ' + (entry.lawTitle || '');
    var hasLegalPattern = VERIFIED_LAW_PATTERNS.some(function(p){ return p.test(fullText); });
    if(hasLegalPattern) score += 5;

    // 7. Check if law status is mentioned (active/repealed)
    if(entry.status === 'active'){
      score += 5;
    } else if(entry.status === 'repealed'){
      score += 0;
      issues.push('القانون ملغى — لا يُستخدم في الإجابات');
    }

    return {
      score: Math.min(score, 100),
      confidence: score / 100,
      issues: issues,
      verified: score >= 50
    };
  }

  /* ===== Knowledge Entry Creation ===== */
  function createKnowledgeEntry(data){
    var entry = {
      // Core data
      query: data.query || '',
      lawTitle: data.lawTitle || '',
      articleNumber: data.articleNumber || '',
      articleText: data.articleText || '',
      section: data.section || '',
      
      // Metadata
      source: data.source || '',
      year: data.year || '',
      lawNumber: data.lawNumber || '',
      status: data.status || 'active', // active, repealed, amended
      
      // Search optimization
      normalizedTitle: '',
      normalizedText: '',
      keywords: [],
      topic: data.topic || '',
      
      // Verification
      confidence: 0,
      verified: false,
      verificationIssues: [],
      verificationScore: 0,
      
      // Lifecycle
      status: 'pending', // pending, approved, rejected
      createdAt: Date.now(),
      updatedAt: Date.now(),
      reviewedAt: null,
      reviewedBy: null,
      
      // Usage tracking
      useCount: 0,
      lastUsed: null,
      userFeedback: []
    };

    // Verify
    var verification = verifyKnowledge(entry);
    entry.confidence = verification.confidence;
    entry.verified = verification.verified;
    entry.verificationIssues = verification.issues;
    entry.verificationScore = verification.score;

    // Normalize for search
    if(typeof LegalRAGv3 !== 'undefined'){
      entry.normalizedTitle = LegalRAGv3.norm(entry.lawTitle + ' ' + entry.articleNumber);
      entry.normalizedText = LegalRAGv3.norm(entry.articleText);
      entry.keywords = LegalRAGv3.tokenize(entry.articleText + ' ' + entry.lawTitle);
    }

    return entry;
  }

  /* ===== Add Knowledge ===== */
  async function addKnowledge(data){
    var entry = createKnowledgeEntry(data);
    
    // If confidence is high enough, auto-approve
    if(entry.confidence >= CONFIDENCE_THRESHOLDS.HIGH && entry.verified){
      entry.status = 'approved';
      entry.reviewedAt = Date.now();
      entry.reviewedBy = 'auto';
    }
    
    // Store in appropriate store
    var storeName = entry.status === 'approved' ? STORE_NAME : PENDING_STORE;
    var id = await dbPut(storeName, entry);
    entry.id = id;
    
    return entry;
  }

  /* ===== Search Knowledge Base ===== */
  async function searchKnowledge(query, limit){
    limit = limit || 5;
    
    // Get all approved knowledge
    var allKnowledge = await dbGetAll(STORE_NAME);
    if(!allKnowledge.length) return [];
    
    // Score each entry
    var queryNorm = typeof LegalRAGv3 !== 'undefined' ? LegalRAGv3.norm(query) : query.toLowerCase();
    var queryTokens = typeof LegalRAGv3 !== 'undefined' ? LegalRAGv3.tokenize(query) : queryNorm.split(' ');
    
    var results = [];
    for(var i = 0; i < allKnowledge.length; i++){
      var entry = allKnowledge[i];
      if(entry.status !== 'approved') continue;
      
      var score = 0;
      
      // Title match
      if(entry.normalizedTitle && entry.normalizedTitle.indexOf(queryNorm) !== -1) score += 50;
      
      // Text match
      if(entry.normalizedText){
        for(var t = 0; t < queryTokens.length; t++){
          if(entry.normalizedText.indexOf(queryTokens[t]) !== -1) score += 10;
        }
      }
      
      // Keyword match
      if(entry.keywords){
        for(var t = 0; t < queryTokens.length; t++){
          if(entry.keywords.indexOf(queryTokens[t]) !== -1) score += 5;
        }
      }
      
      // Query match (direct)
      if(entry.query && entry.query.indexOf(queryNorm) !== -1) score += 30;
      
      // Confidence bonus
      score *= entry.confidence;
      
      if(score > 10){
        results.push({ entry: entry, score: score });
      }
    }
    
    results.sort(function(a, b){ return b.score - a.score; });
    return results.slice(0, limit).map(function(r){ return r.entry; });
  }

  /* ===== Approve/Reject Knowledge ===== */
  async function approveKnowledge(id){
    var entry = await dbGet(PENDING_STORE, id);
    if(!entry) return null;
    
    entry.status = 'approved';
    entry.reviewedAt = Date.now();
    entry.reviewedBy = 'admin';
    entry.updatedAt = Date.now();
    
    await dbDelete(PENDING_STORE, id);
    await dbPut(STORE_NAME, entry);
    
    return entry;
  }

  async function rejectKnowledge(id, reason){
    var entry = await dbGet(PENDING_STORE, id);
    if(!entry) return null;
    
    entry.status = 'rejected';
    entry.reviewedAt = Date.now();
    entry.rejectionReason = reason || '';
    entry.updatedAt = Date.now();
    
    await dbDelete(PENDING_STORE, id);
    await dbPut('rejected', entry);
    
    return entry;
  }

  /* ===== Get Pending Items ===== */
  async function getPendingItems(){
    return await dbGetAll(PENDING_STORE);
  }

  /* ===== Get All Approved ===== */
  async function getApprovedItems(){
    return await dbGetAll(STORE_NAME);
  }

  /* ===== Record Usage ===== */
  async function recordUsage(id){
    var entry = await dbGet(STORE_NAME, id);
    if(!entry) return;
    entry.useCount = (entry.useCount || 0) + 1;
    entry.lastUsed = Date.now();
    await dbPut(STORE_NAME, entry);
  }

  /* ===== Record Feedback ===== */
  async function recordFeedback(id, feedback){
    var entry = await dbGet(STORE_NAME, id);
    if(!entry) return;
    entry.userFeedback = entry.userFeedback || [];
    entry.userFeedback.push({
      type: feedback.type, // 'helpful', 'incorrect', 'incomplete'
      comment: feedback.comment || '',
      ts: Date.now()
    });
    
    // Adjust confidence based on feedback
    var positive = entry.userFeedback.filter(function(f){ return f.type === 'helpful'; }).length;
    var negative = entry.userFeedback.filter(function(f){ return f.type === 'incorrect'; }).length;
    var total = positive + negative;
    if(total > 0){
      entry.confidence = Math.max(0.1, Math.min(1.0, 0.5 + (positive - negative) / total * 0.3));
    }
    
    await dbPut(STORE_NAME, entry);
  }

  /* ===== Get Statistics ===== */
  async function getStats(){
    var approved = await dbGetAll(STORE_NAME);
    var pending = await dbGetAll(PENDING_STORE);
    
    return {
      approved: approved.length,
      pending: pending.length,
      totalUseCount: approved.reduce(function(s, e){ return s + (e.useCount || 0); }, 0),
      avgConfidence: approved.length ? approved.reduce(function(s, e){ return s + (e.confidence || 0); }, 0) / approved.length : 0,
      topics: approved.reduce(function(acc, e){
        var t = e.topic || 'أخرى';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /* ===== Auto-Update Search Index ===== */
  function getKnowledgeForSearch(){
    return dbGetAll(STORE_NAME).then(function(items){
      return items.filter(function(e){ return e.status === 'approved'; }).map(function(e){
        return {
          type: 'knowledge',
          typeLabel: 'معرفة مضافة',
          section: e.section || '',
          sectionLabel: e.section || '',
          lawTitle: e.lawTitle || '',
          articleNumber: e.articleNumber || '',
          title: (e.articleNumber ? 'مادة (' + e.articleNumber + ') — ' : '') + (e.lawTitle || 'معرفة قانونية'),
          text: e.articleText || '',
          url: '',
          lawUrl: '',
          confidence: e.confidence || 0,
          source: e.source || '',
          id: e.id
        };
      });
    });
  }

  /* ===== Public API ===== */
  global.KnowledgeManager = {
    addKnowledge: addKnowledge,
    searchKnowledge: searchKnowledge,
    approveKnowledge: approveKnowledge,
    rejectKnowledge: rejectKnowledge,
    getPendingItems: getPendingItems,
    getApprovedItems: getApprovedItems,
    recordUsage: recordUsage,
    recordFeedback: recordFeedback,
    getStats: getStats,
    getKnowledgeForSearch: getKnowledgeForSearch,
    verifyKnowledge: verifyKnowledge,
    CONFIDENCE_THRESHOLDS: CONFIDENCE_THRESHOLDS,
    TRUSTED_SOURCES: TRUSTED_SOURCES
  };

})(window);
