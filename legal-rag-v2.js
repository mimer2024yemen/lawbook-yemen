/**
 * Lawbook Yemen — Enhanced Legal RAG Engine v2
 * Semantic search, BM25 scoring, re-ranking, multi-law context extraction
 */
(function(global){
  'use strict';

  /* ===== Arabic Normalization ===== */
  var ARABIC_STOP = new Set('من الى إلى على في عن مع هذا هذه ذلك التي الذي كان يكون أما إن إذا فان ولم وقد أو لا ما كل بعض غير حتى بعد قبل عند لدى دون خلف أمام فوق تحت بين منذ بينما لكن ثم بل كذلك أيضا هو هي نحن هم أنتم هن الذين يمكن يجب قد سوف ليس لم لن يكون هذه ذلك هنا هناك عندما حين كما أي بعض لكل بلا ضد حول خلال حتى بدون سواء إما أم لكن'.split(' '));

  function normalize(text){
    if(!text) return '';
    return String(text).toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g,'')
      .replace(/[\u0622\u0623\u0625\u0671]/g,'ا').replace(/\u0624/g,'و').replace(/\u0626/g,'ي')
      .replace(/\u0649/g,'ي').replace(/\u0629/g,'ه').replace(/\u0640/g,'')
      .replace(/[\u0660-\u0669]/g,function(d){return String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d));})
      .replace(/[^\u0600-\u06ff0-9a-z\s]/gi,' ').replace(/\s+/g,' ').trim();
  }

  function tokenize(text){
    var norm = normalize(text);
    return norm.split(' ').filter(function(w){ return w.length > 1 && !ARABIC_STOP.has(w); });
  }

  function ngrams(text, n){
    var norm = normalize(text);
    var grams = [];
    for(var i = 0; i <= norm.length - n; i++) grams.push(norm.slice(i, i+n));
    return grams;
  }

  /* ===== Legal Synonyms ===== */
  var SYN_MAP = {
    'طلاق':'خلع فسخ تفويض بائن رجعي','زواج':'نكاح قران عقد زواج',
    'نفقة':'مؤونه صيغه نفقات','حضانة':'كضانه رعايه حضانه',
    'ميراث':'ارث ترکه فريضه عصبه','بيع':'شراء مبايعه تمليك',
    'ايجار':'استئجار اجره مؤجر مستأجر','سرقة':'اختلاس نهب سطو سرقات',
    'قتل':'جنايه روح قتل نفس','سجن':'حبس توقيف سجناء',
    'غرامة':'تغريم جزاء مالي','محكمة':'محله قضاء محاكم',
    'دعوى':'دعوه خصومه تقاضي','حكم':'قرار منطوق احكام',
    'استئناف':'طعن معارضه نقض تمييز','عقوبة':'جزاء حد تعزير قصاص ديه',
    'شركة':'شراکه مؤسسه شركات','عمل':'وظيفه توظيف عامل موظف',
    'عقد':'اتفاقيه صفقة عقود','ضمان':'کفاله تامين ضمانات',
    'رهن':'رهن رسمي تامين عقاري','وصية':'وصيه تشريع تبرع',
    'وقف':'حبس وقفي','شفعة':'شفيع حق الشفعه',
    'اخلاء':'طرد اخراج تسليم','تعويض':'ضمان فساد تعويضات',
    'فسخ':'الغاء بطلان انفساخ','حجز':'توقيف تحفظ حجز',
    'تنفيذ':'انفاذ تطبيق الزام','طعن':'معارضه استئناف نقض',
    'اختصاص':'صلاحيه ولايه نظر','بينة':'دليل شهاده اثبات قرينه',
    'يمين':'حلف قسم','اقرار':'اعتراف اشهاد',
    'تدليس':'احتيال خداع','غش':'تزوير تحريف',
    'احتيال':'نصب خداع احتيالات','تزوير':'تزوير محرفات',
    'رشوة':'فساد ارشاء','مخدرات':'حشيش هيروين مخدرات',
    'إرهاب':'تخريب تطرف عنف','جريمة':'جنحه جنائي مخالفه',
    'قصاص':'حد ديه کفاره','حرابة':'قطع الطريق سلب نهب',
    'زنا':'فاحشه احسان','قذف':'سب شتم',
    'شرب':'خمر مسكر','طلاق':'طلاق ثلاث طلقات'
  };

  function expandQuery(tokens){
    var expanded = new Set(tokens);
    for(var i = 0; i < tokens.length; i++){
      var t = tokens[i];
      var synKeys = Object.keys(SYN_MAP);
      for(var s = 0; s < synKeys.length; s++){
        var sn = normalize(synKeys[s]);
        if(t === sn || t.indexOf(sn) !== -1 || sn.indexOf(t) !== -1){
          var variants = SYN_MAP[synKeys[s]].split(' ');
          for(var v = 0; v < variants.length; v++){
            var vn = normalize(variants[v]);
            if(vn) expanded.add(vn);
          }
        }
      }
    }
    return Array.from(expanded);
  }

  /* ===== BM25 Scoring ===== */
  function bm25Score(docTokens, queryTokens, avgDl, N, dfMap){
    var k1 = 1.5, b = 0.75;
    var dl = docTokens.length;
    var docFreq = {};
    for(var i = 0; i < docTokens.length; i++) docFreq[docTokens[i]] = (docFreq[docTokens[i]]||0) + 1;

    var score = 0;
    var seen = {};
    for(var i = 0; i < queryTokens.length; i++){
      var qt = queryTokens[i];
      if(seen[qt]) continue;
      seen[qt] = true;
      var df = dfMap[qt] || 0;
      var tf = docFreq[qt] || 0;
      if(tf === 0) continue;
      var idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      var tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / avgDl));
      score += idf * tfNorm;
    }
    return score;
  }

  /* ===== Build Searchable Index ===== */
  function buildIndex(database){
    var docs = [];
    var laws = database.laws || {};
    var sections = Object.keys(laws);

    for(var s = 0; s < sections.length; s++){
      var section = sections[s];
      var items = laws[section] || [];
      for(var l = 0; l < items.length; l++){
        var law = items[l];
        var lawTitle = law.title || '';
        var lawDesc = law.description || '';
        var lawContent = (law.content || []).join(' ');
        var articles = law.articles || [];

        /* Index each article as a separate document */
        for(var a = 0; a < articles.length; a++){
          var art = articles[a];
          var artText = art.text || '';
          var fullText = artText + ' ' + lawTitle + ' ' + lawDesc;
          var tokens = tokenize(fullText);

          docs.push({
            id: docs.length,
            type: 'article',
            section: section,
            lawSlug: law.slug,
            lawTitle: lawTitle,
            lawDesc: lawDesc,
            articleNumber: art.number,
            articleNumberNorm: normalize(art.number).replace(/[^\d]/g,''),
            title: 'المادة (' + art.number + ') — ' + lawTitle,
            text: artText,
            fullText: fullText,
            tokens: tokens,
            ngrams: ngrams(fullText, 3),
            url: 'article.html?law=' + encodeURIComponent(law.slug) + '&article=' + encodeURIComponent(art.number) + '&section=' + encodeURIComponent(section),
            lawUrl: law.url || 'viewer.html?type=law&section=' + encodeURIComponent(section) + '&slug=' + encodeURIComponent(law.slug),
            weight: 1.0
          });
        }

        /* Index law-level content */
        if(lawContent.length > 100){
          var lawFull = lawTitle + ' ' + lawDesc + ' ' + lawContent.slice(0, 3000);
          docs.push({
            id: docs.length,
            type: 'law',
            section: section,
            lawSlug: law.slug,
            lawTitle: lawTitle,
            lawDesc: lawDesc,
            title: lawTitle,
            text: lawDesc,
            fullText: lawFull,
            tokens: tokenize(lawFull),
            ngrams: ngrams(lawFull, 3),
            url: law.url || 'viewer.html?type=law&section=' + encodeURIComponent(section) + '&slug=' + encodeURIComponent(law.slug),
            lawUrl: law.url,
            weight: 0.6
          });
        }
      }
    }

    /* Index posts */
    var posts = database.posts || [];
    for(var p = 0; p < posts.length; p++){
      var post = posts[p];
      var postContent = (post.content || []).join(' ');
      var postFull = (post.title||'') + ' ' + (post.description||'') + ' ' + postContent.slice(0, 2000);
      docs.push({
        id: docs.length,
        type: 'post',
        section: '',
        lawTitle: post.title || '',
        title: post.title || '',
        text: post.description || '',
        fullText: postFull,
        tokens: tokenize(postFull),
        ngrams: ngrams(postFull, 3),
        url: post.url || '',
        lawUrl: post.url || '',
        weight: 0.4
      });
    }

    /* Build document frequency map */
    var dfMap = {};
    for(var i = 0; i < docs.length; i++){
      var seen = {};
      for(var j = 0; j < docs[i].tokens.length; j++){
        var t = docs[i].tokens[j];
        if(!seen[t]){ seen[t] = true; dfMap[t] = (dfMap[t]||0) + 1; }
      }
    }

    /* Average document length */
    var totalLen = 0;
    for(var i = 0; i < docs.length; i++) totalLen += docs[i].tokens.length;
    var avgDl = docs.length > 0 ? totalLen / docs.length : 1;

    return { docs: docs, dfMap: dfMap, avgDl: avgDl, N: docs.length };
  }

  /* ===== Search ===== */
  function search(index, query, limit){
    limit = limit || 12;
    var queryTokens = tokenize(query);
    if(!queryTokens.length) return [];

    var expandedTokens = expandQuery(queryTokens);
    var docs = index.docs;
    var dfMap = index.dfMap;
    var avgDl = index.avgDl;
    var N = index.N;

    var results = [];
    for(var i = 0; i < docs.length; i++){
      var doc = docs[i];
      /* BM25 on original query tokens */
      var score1 = bm25Score(doc.tokens, queryTokens, avgDl, N, dfMap) * 2.0;
      /* BM25 on expanded tokens (lower weight) */
      var score2 = bm25Score(doc.tokens, expandedTokens, avgDl, N, dfMap) * 0.5;
      /* N-gram fuzzy match for typo tolerance */
      var score3 = ngramMatch(doc.ngrams, query) * 0.3;
      /* Title match bonus */
      var titleNorm = normalize(doc.title);
      var score4 = 0;
      for(var t = 0; t < queryTokens.length; t++){
        if(titleNorm.indexOf(queryTokens[t]) !== -1) score4 += 15;
      }
      /* Article number exact match */
      if(doc.type === 'article' && queryTokens.length <= 2){
        var numQ = query.replace(/[^\d]/g,'');
        if(numQ && doc.articleNumberNorm === numQ) score4 += 500;
      }

      var totalScore = (score1 + score2 + score3 + score4) * doc.weight;
      if(totalScore > 2){
        results.push({ doc: doc, score: totalScore });
      }
    }

    results.sort(function(a,b){ return b.score - a.score; });

    /* Deduplicate */
    var seen = {};
    var deduped = [];
    for(var i = 0; i < results.length && deduped.length < limit; i++){
      var key = (results[i].doc.lawSlug||'') + ':' + (results[i].doc.articleNumber||'') + ':' + (results[i].doc.title||'');
      if(!seen[key]){ seen[key] = true; deduped.push(results[i]); }
    }

    return deduped;
  }

  function ngramMatch(docNgrams, query){
    var qn = ngrams(query, 3);
    if(!qn.length || !docNgrams.length) return 0;
    var qSet = new Set(qn);
    var match = 0;
    for(var i = 0; i < docNgrams.length; i++){
      if(qSet.has(docNgrams[i])) match++;
    }
    return match / Math.max(qn.length, 1);
  }

  /* ===== Intent Detection ===== */
  var INTENTS = {
    'divorce': /طلاق|خلع|فسخ\s+نكاح|تفويض|بائن|رجعي/,
    'maintenance': /نفقة|نفقات|مؤونه|صيغه/,
    'custody': /حضانة|كضانه|رعايه|حضانه/,
    'inheritance': /ميراث|ارث|ترکه|فريضه|عصبه|ميراث/,
    'sale': /بيع|شراء|مبايعه|تمليك/,
    'rental': /ايجار|استئجار|مؤجر|مستأجر|ايجار/,
    'theft': /سرقة|اختلاس|نهب|سطو|سارق/,
    'murder': /قتل|جنايه|جريمه|نفس|قاتل/,
    'prison': /سجن|حبس|توقيف|سجين/,
    'company': /شركة|شراکه|مؤسسه|تجار/,
    'labor': /عمل|عامل|موظف|وظيف|فصل|تسريح/,
    'contract': /عقد|اتفاقيه|صفقه|عقود/,
    'compensation': /تعويض|ضمان|فساد|تعويضات/,
    'court': /محكمة|قضاء|تقاضي|محاكم/,
    'filing': /رفع\s+دعوى|تقديم\s+دعوى|كيف\s+(ارفع|أقدم)/,
    'appeal': /استئناف|طعن|نقض|تمييز|معارضه/,
    'penalty': /عقوبه|جزاء|حد|تعزير|قصاص|ديه/,
    'shufa': /شفعه|شفيع/
  };

  function detectIntent(query){
    var q = normalize(query);
    for(var key in INTENTS){
      if(INTENTS[key].test(query)) return key;
    }
    if(/هل\s/.test(query)) return 'yesno';
    if(/ما\s+(حكم|عقوبه|نص|قانون)/.test(query)) return 'what';
    if(/كيف\s/.test(query)) return 'how';
    if(/متى\s/.test(query)) return 'when';
    if(/لماذا|ليه/.test(query)) return 'why';
    return 'general';
  }

  /* ===== Follow-up Detection ===== */
  var FOLLOWUP_PATTERNS = /^وماذا|وإذا|وبعدين|واذا|طيب\s+و|ماذا\s+بعد|وكيف|وكم|وهل|بالاضافه|بالإضافة|ايضا|ايضاً|كمان|زود|ايش\s+باقي|ايش\s+ الثاني|يعني\s+ايش|ايش\s+يعني|تفصيل|اكثر|اكثر\s+تفاصيل|اشرح\s+لي|وضح|ممكن\s+توضح/;

  function isFollowUp(query){
    return FOLLOWUP_PATTERNS.test(query.trim());
  }

  /* ===== Public API ===== */
  global.LegalRAGv2 = {
    buildIndex: buildIndex,
    search: search,
    detectIntent: detectIntent,
    isFollowUp: isFollowUp,
    normalize: normalize,
    tokenize: tokenize,
    expandQuery: expandQuery
  };

})(window);
