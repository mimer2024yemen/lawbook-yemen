/**
 * المستشار اليمني القانوني — Legal RAG Engine v4 (Optimized)
 * Inverted index + BM25 + intent-based section boost
 * Target: <100ms search at 50K articles
 */
(function(global){
  'use strict';

  var STOP = new Set(['من','الى','إلى','على','في','عن','مع','هذا','هذه','ذلك','التي','الذي',
    'كان','يكون','اما','أما','ان','إن','اذا','إذا','فان','فإن','ولم','وقد','او','أو',
    'لا','ما','كل','بعض','بين','غير','حتى','بعد','قبل','عند','لدى','دون','خلال',
    'منذ','بينما','لكن','ثم','بل','كذلك','أيضا','ايضا','هو','هي','نحن','هم','هن',
    'يمكن','يجب','قد','سوف','ليس','لم','لن','هنا','هناك','عندما','حين','كما','و','ي',
    'ال','ذي','الا','إلا','اما','أو','اي','أي','عنه','منه','عليها','فيها','منها',
    'عليه','فيه','منه','لها','لهم','لك','لكم','هنا']);

  function norm(text){
    if(!text) return '';
    return String(text).toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g,'')
      .replace(/[\u0622\u0623\u0625\u0671]/g,'ا').replace(/\u0624/g,'و').replace(/\u0626/g,'ي')
      .replace(/\u0649/g,'ي').replace(/\u0629/g,'ه').replace(/\u0640/g,'')
      .replace(/[\u0660-\u0669]/g,function(d){return String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d));})
      .replace(/[^\u0600-\u06ff0-9a-z\s]/gi,' ').replace(/\s+/g,' ').trim();
  }

  function tokenize(text){
    return norm(text).split(' ').filter(function(w){ return w.length > 1 && !STOP.has(w); });
  }

  /* ===== Synonyms ===== */
  var SYN = {
    'طلاق':['خلع','فسخ','تفويض','بائن','رجعي','طلاقات','مطلقه','مطلق'],
    'زواج':['نكاح','قران','متزوجه'],
    'نفقة':['نفقات','مؤونه','صيغه','نفقه'],
    'حضانة':['كضانه','رعايه','حاضنه'],
    'ميراث':['ارث','ترکه','فريضه','عصبه','مورث','وارث'],
    'بيع':['شراء','مبايعه','تمليك','مشتري','بائع'],
    'ايجار':['استيجار','اجره','موجر','مستاجر'],
    'سرقة':['اختلاس','نهب','سطو','سارق','مسروق'],
    'قتل':['جنايه','قاتل','قتيل','نفس'],
    'سجن':['حبس','توقيف','سجين','محبوس'],
    'محكمة':['محاكم','محله','قضائي'],
    'دعوى':['دعوه','خصومه','تقاضي'],
    'حكم':['احكام','قرار','منطوق'],
    'استئناف':['طعن','معارضه','نقض','تمييز'],
    'عقوبة':['جزاء','حد','تعزير','قصاص','ديه'],
    'شركة':['شراکه','مؤسسه','شريك'],
    'عمل':['وظيفه','توظيف','عامل','موظف'],
    'عقد':['اتفاقيه','صفقه','عقود'],
    'ضمان':['کفاله','تامين','ضامن'],
    'فسخ':['الغاء','بطلان','انفساخ'],
    'شفعه':['شفيع','مشفوع'],
    'اخلاء':['طرد','اخراج','تسليم'],
    'تعويض':['فساد','تعويضات'],
    'تنفيذ':['انفاذ','تطبيق','الزام']
  };

  var SYN_LOOKUP = {};
  (function(){
    var keys = Object.keys(SYN);
    for(var i = 0; i < keys.length; i++){
      var kn = norm(keys[i]);
      SYN_LOOKUP[kn] = SYN[keys[i]];
      var variants = SYN[keys[i]];
      for(var v = 0; v < variants.length; v++){
        var vn = norm(variants[v]);
        if(!SYN_LOOKUP[vn]) SYN_LOOKUP[vn] = [];
        SYN_LOOKUP[vn] = SYN_LOOKUP[vn].concat(SYN[keys[i]]);
      }
    }
  })();

  function expandQuery(tokens){
    var expanded = new Set(tokens);
    for(var i = 0; i < tokens.length; i++){
      var t = tokens[i];
      if(SYN_LOOKUP[t]){
        var syns = SYN_LOOKUP[t];
        for(var s = 0; s < syns.length; s++) expanded.add(norm(syns[s]));
      }
    }
    return Array.from(expanded);
  }

  /* ===== Build Index with Inverted Index ===== */
  function buildIndex(database){
    var docs = [];
    var invertedIndex = {}; // token → [docId, ...]
    var docFreqs = {}; // token → count of docs containing it
    var docTokenSets = []; // per-doc set of unique tokens
    var laws = database.laws || {};
    var sections = Object.keys(laws);
    var totalTokenCount = 0;

    function addDoc(doc){
      var docId = docs.length;
      doc.id = docId;
      docs.push(doc);
      var tokenSet = new Set();
      for(var i = 0; i < doc.tokens.length; i++){
        var t = doc.tokens[i];
        tokenSet.add(t);
        if(!invertedIndex[t]) invertedIndex[t] = [];
        invertedIndex[t].push(docId);
      }
      docTokenSets.push(tokenSet);
      totalTokenCount += doc.tokens.length;
    }

    for(var s = 0; s < sections.length; s++){
      var section = sections[s];
      var items = laws[section] || [];
      for(var l = 0; l < items.length; l++){
        var law = items[l];
        var lawTitle = law.title || '';
        var lawDesc = law.description || '';
        var articles = law.articles || [];

        for(var a = 0; a < articles.length; a++){
          var art = articles[a];
          var artText = art.text || '';
          var full = artText + ' ' + lawTitle + ' ' + lawDesc;
          addDoc({
            type:'article', section:section,
            lawSlug:law.slug, lawTitle:lawTitle,
            articleNumber:art.number,
            articleNumberNorm: norm(art.number).replace(/[^\d]/g,''),
            title:'المادة ('+art.number+') — '+lawTitle,
            text:artText, fullText:full,
            tokens:tokenize(full),
            url:'article.html?law='+encodeURIComponent(law.slug)+'&article='+encodeURIComponent(art.number)+'&section='+encodeURIComponent(section),
            lawUrl:law.url||'',
            weight:1.0
          });
        }

        if(lawDesc.length > 50){
          var lawFull = lawTitle+' '+lawDesc;
          addDoc({
            id:docs.length, type:'law', section:section,
            lawSlug:law.slug, lawTitle:lawTitle,
            title:lawTitle, text:lawDesc, fullText:lawFull,
            tokens:tokenize(lawFull),
            url:law.url||'',
            lawUrl:law.url, weight:0.5
          });
        }
      }
    }

    /* Posts */
    var posts = database.posts || [];
    for(var p = 0; p < posts.length; p++){
      var post = posts[p];
      var pFull = (post.title||'')+' '+(post.description||'');
      addDoc({
        id:docs.length, type:'post', section:'',
        lawTitle:post.title||'', title:post.title||'',
        text:post.description||'', fullText:pFull,
        tokens:tokenize(pFull),
        url:post.url||'', lawUrl:'', weight:0.3
      });
    }

    /* Build docFreq from inverted index */
    var tokenKeys = Object.keys(invertedIndex);
    for(var i = 0; i < tokenKeys.length; i++){
      docFreqs[tokenKeys[i]] = invertedIndex[tokenKeys[i]].length;
    }

    return {
      docs:docs,
      invertedIndex:invertedIndex,
      docFreqs:docFreqs,
      docTokenSets:docTokenSets,
      avgDl:docs.length ? totalTokenCount / docs.length : 1,
      N:docs.length
    };
  }

  /* ===== Fast BM25 using Inverted Index ===== */
  function search(index, query, limit, intent){
    limit = limit || 12;
    var qTokens = tokenize(query);
    if(!qTokens.length) return [];
    var expTokens = expandQuery(qTokens);
    var intentSection = intent ? getIntentSection(intent) : '';

    /* Get candidate doc IDs from inverted index */
    var candidateScores = {};
    var allTokens = qTokens.concat(expTokens);

    for(var i = 0; i < allTokens.length; i++){
      var t = allTokens[i];
      var docIds = index.invertedIndex[t];
      if(!docIds) continue;
      var isOriginal = i < qTokens.length;
      var weight = isOriginal ? 2.0 : 0.5;

      for(var d = 0; d < docIds.length; d++){
        var docId = docIds[d];
        if(!candidateScores[docId]) candidateScores[docId] = 0;
        /* IDF component */
        var df = index.docFreqs[t] || 1;
        var idf = Math.log((index.N - df + 0.5) / (df + 0.5) + 1);
        if(df > index.N * 0.3) idf *= 0.3;
        candidateScores[docId] += idf * weight;
      }
    }

    /* Score candidates with full BM25 */
    var results = [];
    var docIds = Object.keys(candidateScores);
    var k1 = 1.5, b = 0.75;
    var avgDl = index.avgDl;

    for(var c = 0; c < docIds.length; c++){
      var docId = parseInt(docIds[c]);
      var doc = index.docs[docId];
      var dl = doc.tokens.length;

      /* BM25 for original tokens */
      var score = 0;
      var freq = {};
      for(var i = 0; i < doc.tokens.length; i++) freq[doc.tokens[i]] = (freq[doc.tokens[i]]||0) + 1;

      var seen = {};
      for(var i = 0; i < qTokens.length; i++){
        var qt = qTokens[i];
        if(seen[qt]) continue;
        seen[qt] = true;
        var tf = freq[qt] || 0;
        if(tf === 0) continue;
        var df = index.docFreqs[qt] || 1;
        var idf = Math.log((index.N - df + 0.5) / (df + 0.5) + 1);
        if(df > index.N * 0.3) idf *= 0.3;
        var tfn = (tf * (k1+1)) / (tf + k1 * (1-b+b*dl/avgDl));
        score += idf * tfn * 2.0;
      }

      /* Expanded token BM25 */
      var expSeen = {};
      for(var i = 0; i < expTokens.length; i++){
        var et = expTokens[i];
        if(expSeen[et] || seen[et]) continue;
        expSeen[et] = true;
        var tf = freq[et] || 0;
        if(tf === 0) continue;
        var df = index.docFreqs[et] || 1;
        var idf = Math.log((index.N - df + 0.5) / (df + 0.5) + 1);
        if(df > index.N * 0.3) idf *= 0.3;
        var tfn = (tf * (k1+1)) / (tf + k1 * (1-b+b*dl/avgDl));
        score += idf * tfn * 0.5;
      }

      /* Title match bonus */
      var tNorm = norm(doc.title);
      var qNorm = norm(query);
      var titleBonus = 0;
      for(var t = 0; t < qTokens.length; t++){
        if(tNorm.indexOf(qTokens[t]) !== -1) titleBonus += 25;
      }
      if(tNorm.indexOf(qNorm) !== -1) titleBonus += 80;

      /* Article number exact match */
      if(doc.type === 'article' && qTokens.length <= 2){
        var numQ = query.replace(/[^\d]/g,'');
        if(numQ && doc.articleNumberNorm === numQ) titleBonus += 500;
      }

      /* Intent section boost */
      if(intentSection && doc.section === intentSection) titleBonus += 30;
      if(intentSection && doc.section !== intentSection && doc.type === 'article') titleBonus -= 15;

      var total = (score + titleBonus) * doc.weight;
      if(total > 1.5) results.push({doc:doc, score:total});
    }

    results.sort(function(a,b){return b.score-a.score;});

    /* Deduplicate */
    var seen = {}, deduped = [];
    for(var i = 0; i < results.length && deduped.length < limit; i++){
      var k = (results[i].doc.lawSlug||'')+':'+(results[i].doc.articleNumber||'');
      if(!seen[k]){ seen[k]=true; deduped.push(results[i]); }
    }

    return deduped;
  }

  /* ===== Intent Detection ===== */
  function detectIntent(q){
    if(/سرق|سرقة|اختلاس|نهب/.test(q)) return 'theft';
    if(/قتل|جنايه|قاتل/.test(q)) return 'murder';
    if(/طلاق|طلق|خلع|فسخ/.test(q)) return 'divorce';
    if(/اشتريت|اشتري|مرتجع|استرجاع/.test(q)) return 'sale';
    var intents = {
      'maintenance':/نفقة|نفقات|مؤونه|نفقه/,
      'custody':/حضانة|كضانه|رعايه/,
      'inheritance':/ميراث|ارث|ترکه|فريضه|مورث|وارث/,
      'rental':/ايجار|استيجار|مؤجر|مستأجر|موجر/,
      'prison':/سجن|حبس|توقيف|سجين/,
      'company':/شركة|شراکه|مؤسسه|تجاري/,
      'labor':/عمل|عامل|موظف|وظيف|فصل|تسريح/,
      'contract':/عقد|اتفاقيه|فسخ\s+عقد/,
      'compensation':/تعويض|ضمان|فساد/,
      'court':/محكمة|قضاء|تقاضي/,
      'filing':/رفع\s+دعوى|تقديم\s+دعوى|كيف\s+(ارفع|أقدم)/,
      'appeal':/استئناف|طعن|نقض|تمييز/,
      'penalty':/عقوبه|جزاء|حد|تعزير|قصاص/,
      'check':/شيك|شيكات|بدون\s+رصيد/
    };
    for(var k in intents){ if(intents[k].test(q)) return k; }
    if(/هل\s/.test(q)) return 'yesno';
    if(/كيف\s/.test(q)) return 'how';
    if(/متى\s/.test(q)) return 'when';
    if(/لماذا|ليه/.test(q)) return 'why';
    return 'general';
  }

  function getIntentSection(intent){
    var map = {
      'divorce':'personal-status','maintenance':'personal-status','custody':'personal-status','inheritance':'personal-status',
      'theft':'criminal','murder':'criminal','prison':'criminal','penalty':'criminal',
      'labor':'labor','company':'commercial','check':'commercial',
      'filing':'litigation-procedures','appeal':'litigation-procedures','court':'litigation-procedures'
    };
    return map[intent] || '';
  }

  function isFollowUp(q){ return /^(وماذا|وإذا|وبعدين|واذا|طيب\s+و|ماذا\s+بعد|وكيف|وكم|وهل|بالاضافه|ايضا|كمان|زود|اشرح|وضح|ممكن\s+توضح)/.test(q.trim()); }

  global.LegalRAGv4 = {buildIndex:buildIndex, search:search, detectIntent:detectIntent, isFollowUp:isFollowUp, norm:norm, tokenize:tokenize, expandQuery:expandQuery};

})(window);
