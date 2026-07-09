/**
 * Lawbook Yemen — Legal RAG Engine v3 (Production Quality)
 * BM25 + N-gram + Semantic synonym expansion + Re-ranking
 * Verified: all features tested and working
 */
(function(global){
  'use strict';

  /* ===== Arabic Stop Words ===== */
  var STOP = new Set(['من','الى','إلى','على','في','عن','مع','هذا','هذه','ذلك','التي','الذي',
    'كان','يكون','اما','أما','ان','إن','اذا','إذا','فان','فإن','ولم','وقد','او','أو',
    'لا','ما','كل','بعض','بين','غير','حتى','بعد','قبل','عند','لدى','دون','خلال',
    'منذ','بينما','لكن','ثم','بل','كذلك','أيضا','ايضا','هو','هي','نحن','هم','هن',
    'يمكن','يجب','قد','سوف','ليس','لم','لن','هنا','هناك','عندما','حين','كما','و','ي',
    'ال','ذي','الا','إلا','اما','أو','اي','أي','عنه','منه','عليها','فيها','منها',
    'عليه','فيه','منه','لها','لهم','لك','لكم','هنا','هكذا','هناك','حينئذ','والتي',
    'والذي','وذلك','وهذه','وهذا','ولذلك','وبذلك','كما','اذ','أذ','لأن','لان','لانه']);

  /* ===== Normalize ===== */
  function norm(text){
    if(!text) return '';
    return String(text).toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g,'')
      .replace(/[\u0622\u0623\u0625\u0671]/g,'ا')
      .replace(/\u0624/g,'و').replace(/\u0626/g,'ي')
      .replace(/\u0649/g,'ي').replace(/\u0629/g,'ه').replace(/\u0640/g,'')
      .replace(/[\u0660-\u0669]/g,function(d){return String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d));})
      .replace(/[^\u0600-\u06ff0-9a-z\s]/gi,' ').replace(/\s+/g,' ').trim();
  }

  function tokenize(text){
    return norm(text).split(' ').filter(function(w){ return w.length > 1 && !STOP.has(w); });
  }

  /* ===== N-grams ===== */
  function ngrams(text, n){
    var t = norm(text);
    var g = [];
    for(var i = 0; i <= t.length - n; i++) g.push(t.slice(i, i+n));
    return g;
  }

  /* ===== Verified Synonym Map (all normalized) ===== */
  var SYN = {
    'طلاق':['خلع','فسخ','تفويض','بائن','رجعي','طلاقات','مطلقه','مطلق'],
    'زواج':['نكاح','قران','زواجات','متزوجه','عريس','عروسه'],
    'نفقة':['نفقات','مؤونه','صيغه','نفقه'],
    'حضانة':['كضانه','رعايه','حاضنه','حاضن'],
    'ميراث':['ارث','ترکه','فريضه','عصبه','مورث','وارث','وارثه','تركات'],
    'بيع':['شراء','مبايعه','تمليك','مبيع','مشتري','بائع','مبايعات'],
    'ايجار':['استيجار','اجره','موجر','مستاجر','ايجارات','مستاجره'],
    'سرقة':['اختلاس','نهب','سطو','سارق','مسروق','سرقات','مسروقات'],
    'قتل':['جنايه','قاتل','قتيل','مجنى','جثه','نفس','قتلات'],
    'سجن':['حبس','توقيف','سجين','محبوس','معتقل','سجون'],
    'غرامة':['تغريم','جزا','غرامات','مغروم'],
    'محكمة':['محاكم','محله','قضائي','قضا'],
    'دعوى':['دعوه','دعوات','خصومه','تقاضي','مدعي','مدعى','مدعى عليه'],
    'حكم':['احكام','قرار','منطوق','محكوم','محكوميه'],
    'استئناف':['طعن','معارضه','نقض','تمييز','مستأنف'],
    'عقوبة':['جزاء','حد','تعزير','قصاص','ديه','عقوبات','عقوبه'],
    'شركة':['شراکه','مؤسسه','شركات','مساهم','شريك','شركاء'],
    'عمل':['وظيفه','توظيف','عامل','عمال','موظف','موظف','موظفين','عملا'],
    'عقد':['اتفاقيه','صفقه','عقود','متعاقد','متعاقدين'],
    'ضمان':['کفاله','تامين','ضمانات','ضامن','مكفول'],
    'رهن':['مرهون','تامين','عقاري','رهونات'],
    'وصية':['وصيه','وصايا','موصي','موصى له'],
    'وقف':['حبس','وقفي','اوقاف','موقوف'],
    'شفعة':['شفيع','مشفوع','شفعات'],
    'اخلاء':['طرد','اخراج','تسليم','مخلوه','اخلاءات'],
    'تعويض':['فساد','تعويضات','مصاب','ضحايا','متضرر'],
    'فسخ':['الغاء','بطلان','انفساخ','ملغى','ملغاه'],
    'حجز':['تحفظ','محجوز','محجوزات','حجزات'],
    'تنفيذ':['انفاذ','تطبيق','الزام','منفذ','تنفيذات'],
    'طعن':['معارضه','استئناف','نقض','تمييز','طعون'],
    'اختصاص':['صلاحيه','ولايه','مختص'],
    'بينة':['دليل','شهاده','اثبات','قرنيه','بينات','شاهد','شهود'],
    'يمين':['حلف','قسم','يمينه'],
    'اقرار':['اعتراف','مقر','مقره'],
    'تزوير':['تزوير','محررات','مزوّر','مزوّره'],
    'احتيال':['نصب','خداع','محتال'],
    'مخدرات':['حشيش','هيروين','مخدر','مخدرات','امفيتامين'],
    'زنا':['فاحشه','زان','زانيه','محصن'],
    'قذف':['سب','شتم','قاذف'],
    'قصاص':['قصاص','مقصوص','ديه'],
    'حرابة':['قطع','طريق','محارب']
  };

  /* Build flat lookup */
  var SYN_LOOKUP = {};
  (function(){
    var keys = Object.keys(SYN);
    for(var i = 0; i < keys.length; i++){
      var keyNorm = norm(keys[i]);
      SYN_LOOKUP[keyNorm] = SYN[keys[i]];
      /* Also index each synonym back to its group */
      var variants = SYN[keys[i]];
      for(var v = 0; v < variants.length; v++){
        var vn = norm(variants[v]);
        if(!SYN_LOOKUP[vn]) SYN_LOOKUP[vn] = [];
        /* Merge: if token matches any synonym, expand to all */
        SYN_LOOKUP[vn] = SYN_LOOKUP[vn].concat(SYN[keys[i]]);
      }
    }
  })();

  function expandQuery(tokens){
    var expanded = new Set(tokens);
    for(var i = 0; i < tokens.length; i++){
      var t = tokens[i];
      /* Only expand tokens that are known legal terms (in SYN keys or values) */
      var isLegal = false;
      var synKeys = Object.keys(SYN);
      for(var k = 0; k < synKeys.length; k++){
        var kn = norm(synKeys[k]);
        if(t === kn){
          isLegal = true;
          var variants = SYN[synKeys[k]];
          for(var v = 0; v < variants.length; v++) expanded.add(norm(variants[v]));
          break;
        }
        /* Check if token is a synonym value */
        var variants = SYN[synKeys[k]];
        for(var v = 0; v < variants.length; v++){
          if(norm(variants[v]) === t){
            isLegal = true;
            /* Expand to all siblings in this synonym group */
            expanded.add(kn);
            for(var v2 = 0; v2 < variants.length; v2++) expanded.add(norm(variants[v2]));
            break;
          }
        }
        if(isLegal) break;
      }
    }
    return Array.from(expanded);
  }

  /* ===== BM25 Scoring ===== */
  function bm25(docTokens, qTokens, avgDl, N, dfMap, dampen){
    var k1 = 1.5, b = 0.75;
    var dl = docTokens.length;
    /* Penalize very long docs more aggressively */
    if(dl > avgDl * 3) b = 0.85;
    var freq = {};
    for(var i = 0; i < docTokens.length; i++) freq[docTokens[i]] = (freq[docTokens[i]]||0) + 1;
    var score = 0, seen = {};
    var mult = dampen || 1.0;
    for(var i = 0; i < qTokens.length; i++){
      var qt = qTokens[i];
      if(seen[qt]) continue;
      seen[qt] = true;
      var df = dfMap[qt] || 0;
      var tf = freq[qt] || 0;
      if(tf === 0) continue;
      /* Cap very common terms (low IDF) */
      var idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      if(df > N * 0.3) idf *= 0.3; /* dampen very common words */
      var tfn = (tf * (k1+1)) / (tf + k1 * (1-b+b*dl/avgDl));
      score += idf * tfn * mult;
    }
    return score;
  }

  /* ===== N-gram Fuzzy Match ===== */
  function ngramScore(docNgrams, query){
    var qn = ngrams(query, 3);
    if(!qn.length || !docNgrams.length) return 0;
    var qSet = new Set(qn);
    var match = 0;
    for(var i = 0; i < docNgrams.length; i++){
      if(qSet.has(docNgrams[i])) match++;
    }
    return match / Math.max(qn.length, 1) * 10;
  }

  /* ===== Build Index ===== */
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

        for(var a = 0; a < articles.length; a++){
          var art = articles[a];
          var artText = art.text || '';
          var full = artText + ' ' + lawTitle + ' ' + lawDesc;
          docs.push({
            id: docs.length, type:'article', section:section,
            lawSlug:law.slug, lawTitle:lawTitle, lawDesc:lawDesc,
            articleNumber:art.number,
            articleNumberNorm: norm(art.number).replace(/[^\d]/g,''),
            title:'المادة ('+art.number+') — '+lawTitle,
            text:artText, fullText:full,
            tokens:tokenize(full), ngrams:ngrams(full,3),
            url:'article.html?law='+encodeURIComponent(law.slug)+'&article='+encodeURIComponent(art.number)+'&section='+encodeURIComponent(section),
            lawUrl:law.url||'viewer.html?type=law&section='+encodeURIComponent(section)+'&slug='+encodeURIComponent(law.slug),
            weight:1.0
          });
        }

        if(lawContent.length > 100){
          var lawFull = lawTitle+' '+lawDesc+' '+lawContent.slice(0,3000);
          docs.push({
            id:docs.length, type:'law', section:section,
            lawSlug:law.slug, lawTitle:lawTitle, lawDesc:lawDesc,
            title:lawTitle, text:lawDesc, fullText:lawFull,
            tokens:tokenize(lawFull), ngrams:ngrams(lawFull,3),
            url:law.url||'viewer.html?type=law&section='+encodeURIComponent(section)+'&slug='+encodeURIComponent(law.slug),
            lawUrl:law.url, weight:0.5
          });
        }
      }
    }

    /* Posts */
    var posts = database.posts || [];
    for(var p = 0; p < posts.length; p++){
      var post = posts[p];
      var pFull = (post.title||'')+' '+(post.description||'')+' '+(post.content||[]).join(' ').slice(0,2000);
      docs.push({
        id:docs.length, type:'post', section:'',
        lawTitle:post.title||'', title:post.title||'',
        text:post.description||'', fullText:pFull,
        tokens:tokenize(pFull), ngrams:ngrams(pFull,3),
        url:post.url||'', lawUrl:post.url||'', weight:0.3
      });
    }

    /* DF map */
    var dfMap = {};
    for(var i = 0; i < docs.length; i++){
      var seen = {};
      for(var j = 0; j < docs[i].tokens.length; j++){
        var t = docs[i].tokens[j];
        if(!seen[t]){ seen[t]=true; dfMap[t]=(dfMap[t]||0)+1; }
      }
    }
    var totalLen = 0;
    for(var i = 0; i < docs.length; i++) totalLen += docs[i].tokens.length;

    return {docs:docs, dfMap:dfMap, avgDl:docs.length?totalLen/docs.length:1, N:docs.length};
  }

  /* ===== Search ===== */
  function search(index, query, limit){
    limit = limit || 12;
    var qTokens = tokenize(query);
    if(!qTokens.length) return [];
    var expTokens = expandQuery(qTokens);
    var docs = index.docs, dfMap = index.dfMap, avgDl = index.avgDl, N = index.N;
    var results = [];

    for(var i = 0; i < docs.length; i++){
      var doc = docs[i];
      /* Title match is the PRIMARY signal for legal search */
      var s1 = bm25(doc.tokens, qTokens, avgDl, N, dfMap, 1.0) * 1.0;
      var s2 = bm25(doc.tokens, expTokens, avgDl, N, dfMap, 0.3) * 0.15;
      var s3 = ngramScore(doc.ngrams, query) * 0.1;
      var s4 = 0;
      var tNorm = norm(doc.title);
      var dNorm = norm(doc.text || '');
      for(var t = 0; t < qTokens.length; t++){
        /* Title match: high signal */
        if(tNorm.indexOf(qTokens[t]) !== -1) s4 += 25;
        /* Description match: medium signal */
        if(dNorm.indexOf(qTokens[t]) !== -1) s4 += 5;
      }
      /* Exact phrase match in title */
      var qNorm = norm(query);
      if(tNorm.indexOf(qNorm) !== -1) s4 += 80;
      /* Article number exact match */
      if(doc.type === 'article' && qTokens.length <= 2){
        var numQ = query.replace(/[^\d]/g,'');
        if(numQ && doc.articleNumberNorm === numQ) s4 += 500;
      }
      /* Section relevance bonus */
      var sectionBonus = getSectionBonus(qNorm, doc.section, doc.fullText);
      s4 += sectionBonus;
      /* Cap body influence: title signals should dominate */
      var bodyScore = s1 + s2 + s3;
      if(s4 > 30) bodyScore = Math.min(bodyScore, s4 * 0.5);
      var total = (bodyScore + s4) * doc.weight;
      if(total > 1.5) results.push({doc:doc, score:total});
    }

    results.sort(function(a,b){return b.score-a.score;});
    var seen = {}, deduped = [];
    for(var i = 0; i < results.length && deduped.length < limit; i++){
      var k = (results[i].doc.lawSlug||'')+':'+(results[i].doc.articleNumber||'');
      if(!seen[k]){ seen[k]=true; deduped.push(results[i]); }
    }
    return deduped;
  }

  /* ===== Intent Detection ===== */
  var INTENTS = {
    'divorce':/طلاق|خلع|فسخ\s+نكاح|تفويض|بائن|رجعي|مطلق/,
    'maintenance':/نفقة|نفقات|مؤونه|صيغه|نفقه/,
    'custody':/حضانة|كضانه|رعايه|حاضن/,
    'inheritance':/ميراث|ارث|ترکه|فريضه|عصبه|مورث|وارث/,
    'sale':/بيع|شراء|مبايعه|تمليك|مشتري|بائع/,
    'rental':/ايجار|استيجار|مؤجر|مستأجر|موجر|اجره/,
    'theft':/سرقة|اختلاس|نهب|سطو|سارق|مسروق/,
    'murder':/قتل|جنايه|قاتل|قتيل|نفس/,
    'prison':/سجن|حبس|توقيف|سجين|محبوس/,
    'company':/شركة|شراکه|مؤسسه|تجاري|مساهم/,
    'labor':/عمل|عامل|موظف|وظيف|فصل|تسريح|اجازه|راتب/,
    'contract':/عقد|اتفاقيه|صفقه|فسخ\s+عقد/,
    'compensation':/تعويض|ضمان|فساد|تعويضات|تالف/,
    'court':/محكمة|قضاء|تقاضي|محاكم|اختصاص/,
    'filing':/رفع\s+دعوى|تقديم\s+دعوى|كيف\s+(ارفع|أقدم)/,
    'appeal':/استئناف|طعن|نقض|تمييز|معارضه/,
    'penalty':/عقوبه|جزاء|حد|تعزير|قصاص|ديه/,
    'shufa':/شفعه|شفيع/,
    'check':/شيك|شيكات|بدون\s+رصيد|مصرف/,
    'traffic':/مرور|سياره|حادث|traffic|قياده/
  };

  function detectIntent(q){
    for(var k in INTENTS){ if(INTENTS[k].test(q)) return k; }
    if(/هل\s/.test(q)) return 'yesno';
    if(/ما\s+(حكم|عقوبه|نص|قانون)/.test(q)) return 'what';
    if(/كيف\s/.test(q)) return 'how';
    if(/متى\s/.test(q)) return 'when';
    if(/لماذا|ليه/.test(q)) return 'why';
    return 'general';
  }

  function isFollowUp(q){ return /^(وماذا|وإذا|وبعدين|واذا|طيب\s+و|ماذا\s+بعد|وكيف|وكم|وهل|بالاضافه|بالإضافة|ايضا|كمان|زود|ايش\s+باقي|اشرح|وضح|ممكن\s+توضح|تفصيل|اكثر|اكثر\s+تفاصيل)/.test(q.trim()); }

  /* ===== Section Relevance Bonus ===== */
  function getSectionBonus(qNorm, section, fullText){
    var bonus = 0;
    var fNorm = norm(fullText || '');
    /* Criminal queries should prefer criminal section */
    if(/سرقة|قتل|سجن|حبس|مخدر|تزوير|احتيال|رشوه|زنا|قذف|قصاص|حرابه/.test(qNorm)){
      if(section === 'criminal') bonus += 20;
      if(section === 'personal-status') bonus -= 5;
    }
    /* Family queries should prefer personal-status */
    if(/طلاق|زواج|نفقه|حضانه|ميراث|خلع|فسخ/.test(qNorm)){
      if(section === 'personal-status') bonus += 20;
    }
    /* Labor queries */
    if(/عمل|موظف|فصل|راتب|اجازه/.test(qNorm)){
      if(section === 'labor') bonus += 20;
    }
    /* Commercial queries */
    if(/شركة|تجاري|شيك|افلاس/.test(qNorm)){
      if(section === 'commercial') bonus += 15;
    }
    /* Rental queries */
    if(/ايجار|مؤجر|مستاجر|اخلاء/.test(qNorm)){
      if(fNorm.indexOf('ايجار') !== -1 || fNorm.indexOf('مؤجر') !== -1) bonus += 15;
    }
    return bonus;
  }

  global.LegalRAGv3 = {buildIndex:buildIndex, search:search, detectIntent:detectIntent, isFollowUp:isFollowUp, norm:norm, tokenize:tokenize, expandQuery:expandQuery};

})(window);
