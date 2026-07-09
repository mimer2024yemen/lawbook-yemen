/**
 * Lawbook Yemen — Legal RAG Engine
 * Retrieval-Augmented Generation for Yemeni Law
 * Searches database, scores relevance, extracts context, generates structured responses
 */
(function(global){
  'use strict';

  /* ===== Arabic Legal Stop Words ===== */
  var STOP_WORDS = {
    'من','الى','إلى','على','في','عن','مع','هذا','هذه','ذلك','التي','الذي',
    'كان','يكون','اما','أما','ان','إن','اذا','إذا','فان','فإن','ولم','وقد',
    'او','أو','لا','ما','كل','بعض','بين','غير','حتى','بعد','قبل','عند','لدى',
    'دون','خلال','منذ','بينما','لكن','ثم','بل','حتى','كذلك','أيضا','ايضا',
    'هو','هي','نحن','هم','انت','أنتم','هى','هم','هن','الذين','اللواتي',
    'يمكن','يجب','يمكنك','يمكنك','قد','سوف','سوف','ليس','لم','لن',
    'هو','هي','ذلك','تلك','هنا','هناك','عندما','حين','كما','و','ي'
  };

  /* ===== Legal Synonym Dictionary ===== */
  var SYNONYMS = {
    'طلاق':'طلاق|تفويض|خلع|فسخ|انحلال الزواج',
    'زواج':'زواج|نكاح|عقد الزواج|قران',
    'نفقة':'نفقة|نفقات|مؤونة|معونة|صيغة',
    'حضانة':'حضانة|كضانة|رعاية|حجز',
    'ميراث':'ميراث|إرث|تركة|نصيب|فريضة|عصبة',
    'بيع':'بيع|شراء|مبايعة|تمليك|ثمن',
    'إيجار':'إيجار|استئجار|أجرة|مؤجر|مستأجر|عقار',
    'سرقة':'سرقة|اختلاس|نهب|سلب|سطو',
    'قتل':'قتل|جناية|جريمة قتل|نفس|רצח',
    'سجن':'سجن|حبس| incarceration|عقوبة سالبة للحرية|توقيف',
    'غرامة':'غرامة|جزاء مالي|تغريم|تعويض',
    'محكمة':'محكمة|هيئة قضائية|مجلس قضائي|裁判',
    'قاضي':'قاضي|حكم|قضاة|مجلس قضاء',
    'دعوى':'دعوى|دعوى قضائية|خصومة|تقاضي|مرافعة',
    'حكم':'حكم|判决|قرار قضائي|منطوق',
    'استئناف':'استئناف|طعن|معارضة|نقض',
    'عقوبة':'عقوبة|جزاء|حد|تعزير|قصاص|دية',
    'كفالة':'كفالة|ضمان|كفيل|ضامن',
    'وكالة':'وكالة|تفويض|نيابة|توكيل',
    'شركة':'شركة|شراكة|تكتل|مؤسسة|منظمة',
    'تاجر':'تاجر|تاجر|مسوق|شركة تجارية',
    'عمل':'عمل|شغل|وظيفة|توظيف|عامل',
    'موظف':'موظف|مستخدم|عامل|موظفة',
    ' contract':'عقد|اتفاق|اتفاقية|صفقة|تعاقد',
    'ضمان':'ضمان|كفالة|تأمين|ضمانة',
    'رهن':'رهن|抵押|garantie|رهن رسمي',
    'إرث':'إرث|ميراث|تركة|فريضة|عصبة',
    'وصية':'وصية|تشريع|تبرع|وصاية',
    'وقف':'وقف|حبس|تصدق',
    ' شفعة':'شفعة|حق الشفعة|شفيع',
    'إخلاء':'إخلاء|طرد|إخراج|تسليم العين',
    'تعويض':'تعويض|ضمان|פיצוי|بديل',
    'فسخ':'فسخ|إلغاء|بطلان|انفساخ|حل',
    'نزع':'نزع|مصادرة|استملاك|تأميم',
    'حجز':'حجز|توقيف|منع|تحفظ',
    'تنفيذ':'تنفيذ|إنفاذ|تطبيق|إلزام',
    'طعن':'طعن|معارضة|استئناف|نقض|تمييز',
    ' اختصاص':'اختصاص|ولاية|صلاحية|نظر',
    'نصاب':'نصاب|حد|ميزان|معيار',
    'بينة':'بينة|دليل|شهادة|إثبات|قرينة',
    'يمين':'يمين|حلف|قسم|شهادة',
    'إقرار':'إقرار|اعتراف|إشهاد',
    'تدليس':'تدليس|احتيال|خداع|تزوير',
    'غش':'غش|تزوير|تحريف|تزوير',
    'احتيال':'احتيال|نصب|خداع|احتيال',
    'تزوير':'تزوير|تزوير|تحريف|تزوير',
    'رشوة':'رشوة|فساد|إرشاء|propagande',
    'اختلاس':'اختلاس|سرقة|نهب|استيلاء',
    'تهريب':'تهريب|تهريب| smuggling|تهجير',
    'مخدرات':'مخدرات|حشيش|هيروين|مخدرات',
    'terror':'إرهاب|تخريب|تطرف|عنف',
    'جريمة':'جريمة|جنحة|جنائية|مخالفة',
    'حدود':'حدود|شرعية|قصاص|دية|تعزير',
    'قصاص':'قصاص|قصاص|حد|دية',
    'دية':'دية|ضمان|تعويض|كفارة',
    'حرابة':'حرابة|قطع الطريق|سلب|نهب',
    'ردة':'ردة|كفر|ارتداد',
    'زنا':'زنا|فاحشة|إحسان|زانية',
    'قذف':'قذف|سب|شتم|قذف',
    'شرب':'شرب|خمر|مسكر|خمور',
    'سرقة':'سرقة|قطع اليد| حد|سارق'
  };

  /* ===== TF-IDF-like Scoring ===== */
  function extractKeywords(text){
    if(!text) return [];
    var norm = normalizeArabic(text);
    var words = norm.split(/\s+/);
    var freq = {};
    for(var i = 0; i < words.length; i++){
      var w = words[i];
      if(w.length < 2 || STOP_WORDS[w]) continue;
      freq[w] = (freq[w]||0) + 1;
    }
    return Object.keys(freq).map(function(w){ return { word: w, freq: freq[w] }; }).sort(function(a,b){ return b.freq - a.freq; });
  }

  function normalizeArabic(text){
    if(!text) return '';
    return String(text)
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
      .replace(/\u0624/g, 'و')
      .replace(/\u0626/g, 'ي')
      .replace(/\u0649/g, 'ي')
      .replace(/\u0629/g, 'ه')
      .replace(/\u0640/g, '')
      .replace(/[\u0660-\u0669]/g, function(d){ return String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d)); })
      .replace(/[^\u0600-\u06ff0-9a-z\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function expandSynonyms(keywords){
    var expanded = [];
    var seen = {};
    for(var i = 0; i < keywords.length; i++){
      var kw = keywords[i].word;
      if(!seen[kw]){ seen[kw] = true; expanded.push(kw); }
      /* Check synonyms */
      var synKeys = Object.keys(SYNONYMS);
      for(var s = 0; s < synKeys.length; s++){
        var synNorm = normalizeArabic(synKeys[s]);
        if(synNorm === kw || kw.indexOf(synNorm) !== -1 || synNorm.indexOf(kw) !== -1){
          var variants = SYNONYMS[synKeys[s]].split('|');
          for(var v = 0; v < variants.length; v++){
            var vn = normalizeArabic(variants[v]);
            if(vn && !seen[vn]){ seen[vn] = true; expanded.push(vn); }
          }
        }
      }
    }
    return expanded;
  }

  /* ===== Document Scoring ===== */
  function scoreDocument(doc, queryKeywords, expandedKeywords){
    var titleNorm = normalizeArabic(doc.title || '');
    var descNorm = normalizeArabic(doc.description || '');
    var textNorm = normalizeArabic(doc.fullText || doc.searchText || '');
    var score = 0;
    var matchedOriginal = 0;
    var matchedExpanded = 0;

    /* Score original keywords (higher weight) */
    for(var i = 0; i < queryKeywords.length; i++){
      var kw = queryKeywords[i].word;
      var freq = queryKeywords[i].freq;
      var weight = Math.min(freq, 3) * 15;

      if(titleNorm.indexOf(kw) !== -1){ score += weight * 3; matchedOriginal++; }
      if(descNorm.indexOf(kw) !== -1){ score += weight * 1.5; matchedOriginal++; }
      if(textNorm.indexOf(kw) !== -1){ score += weight; matchedOriginal++; }
    }

    /* Score expanded keywords (lower weight) */
    for(var i = 0; i < expandedKeywords.length; i++){
      var kw = expandedKeywords[i];
      if(textNorm.indexOf(kw) !== -1){ score += 5; matchedExpanded++; }
      if(titleNorm.indexOf(kw) !== -1){ score += 10; matchedExpanded++; }
    }

    /* Article number exact match bonus */
    if(doc.type === 'article' && queryKeywords.length === 1){
      var numNorm = doc.articleNumberNorm || '';
      if(numNorm === queryKeywords[0].word) score += 500;
    }

    /* Coverage bonus: more original keywords matched = higher relevance */
    if(queryKeywords.length > 1){
      var coverage = matchedOriginal / queryKeywords.length;
      if(coverage >= 0.8) score += 100;
      else if(coverage >= 0.5) score += 40;
    }

    /* Penalize very short texts (likely not useful) */
    if(textNorm.length < 30) score *= 0.3;

    return score;
  }

  /* ===== Build Searchable Index ===== */
  function buildSearchIndex(database){
    var index = [];
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

        /* Index each article */
        var articles = law.articles || [];
        for(var a = 0; a < articles.length; a++){
          var art = articles[a];
          var artText = art.text || '';
          index.push({
            type: 'article',
            section: section,
            lawSlug: law.slug,
            lawTitle: lawTitle,
            articleNumber: art.number,
            articleNumberNorm: normalizeArabic(art.number).replace(/[^\d]/g,''),
            title: 'مادة (' + art.number + ') — ' + lawTitle,
            description: artText,
            fullText: artText + ' ' + lawTitle + ' ' + lawDesc,
            url: 'article.html?law=' + encodeURIComponent(law.slug) + '&article=' + encodeURIComponent(art.number) + '&section=' + encodeURIComponent(section),
            lawUrl: law.url || 'viewer.html?type=law&section=' + encodeURIComponent(section) + '&slug=' + encodeURIComponent(law.slug)
          });
        }

        /* Index law-level content */
        if(lawContent.length > 50){
          index.push({
            type: 'law',
            section: section,
            lawSlug: law.slug,
            lawTitle: lawTitle,
            title: lawTitle,
            description: lawDesc,
            fullText: lawTitle + ' ' + lawDesc + ' ' + lawContent.slice(0, 2000),
            url: law.url || 'viewer.html?type=law&section=' + encodeURIComponent(section) + '&slug=' + encodeURIComponent(law.slug),
            lawUrl: law.url
          });
        }
      }
    }

    /* Index posts */
    var posts = database.posts || [];
    for(var p = 0; p < posts.length; p++){
      var post = posts[p];
      var postContent = (post.content || []).join(' ');
      index.push({
        type: 'post',
        section: '',
        title: post.title || '',
        description: post.description || '',
        fullText: (post.title||'') + ' ' + (post.description||'') + ' ' + postContent.slice(0, 2000),
        url: post.url || '',
        lawUrl: post.url || ''
      });
    }

    return index;
  }

  /* ===== Main RAG Search ===== */
  function search(query, index, limit){
    limit = limit || 10;
    var queryKeywords = extractKeywords(query);
    if(!queryKeywords.length) return [];

    var expandedKeywords = expandSynonyms(queryKeywords);
    var results = [];

    for(var i = 0; i < index.length; i++){
      var doc = index[i];
      var score = scoreDocument(doc, queryKeywords, expandedKeywords);
      if(score > 10){
        results.push({
          doc: doc,
          score: score
        });
      }
    }

    results.sort(function(a, b){ return b.score - a.score; });

    /* Deduplicate by law+article */
    var seen = {};
    var deduped = [];
    for(var i = 0; i < results.length && deduped.length < limit; i++){
      var key = (results[i].doc.lawSlug||'') + ':' + (results[i].doc.articleNumber||'') + ':' + (results[i].doc.title||'');
      if(!seen[key]){
        seen[key] = true;
        deduped.push(results[i]);
      }
    }

    return deduped;
  }

  /* ===== Intent Detection ===== */
  function detectQueryType(query){
    var q = normalizeArabic(query);

    /* Question patterns */
    if(/هل\s/.test(query)) return 'question_yesno';
    if(/ما\s+(حكم|عقوبة|نص|قانون|مصدر)/.test(query)) return 'question_what';
    if(/كيف\s/.test(query)) return 'question_how';
    if(/متى\s/.test(query)) return 'question_when';
    if(/اين\s|أين\s/.test(query)) return 'question_where';
    if(/لماذا\s|لماذ/.test(query)) return 'question_why';
    if(/من\s+(يملك|يحق|يمكن)/.test(query)) return 'question_who';

    /* Legal action patterns */
    if(/رفع\s+دعوى|تقديم\s+دعوى|كيف\s+ارفع/.test(query)) return 'action_filing';
    if(/استئناف|طعن|نقض/.test(query)) return 'action_appeal';
    if(/ تنفيذ|حكم\s+نهائي/.test(query)) return 'action_enforcement';

    /* Legal topic patterns */
    if(/طلاق|خلع|فسخ\s+نكاح|تفويض/.test(query)) return 'topic_divorce';
    if(/نفقة|نفقات/.test(query)) return 'topic_maintenance';
    if(/حضانة|كضانة/.test(query)) return 'topic_custody';
    if(/ميراث|إرث|تركة|فريضة/.test(query)) return 'topic_inheritance';
    if(/بيع|شراء|تمليك/.test(query)) return 'topic_sale';
    if(/إيجار|استئجار|مؤجر|مستأجر/.test(query)) return 'topic_rental';
    if(/سرقة|اختلاس|نهب/.test(query)) return 'topic_theft';
    if(/قتل|جناية|جريمة/.test(query)) return 'topic_murder';
    if(/سجن|حبس|توقيف/.test(query)) return 'topic_prison';
    if(/شركة|شراكة|تجاري/.test(query)) return 'topic_commercial';
    if(/عمل|عامل|موظف|وظيف/.test(query)) return 'topic_labor';
    if(/عقد|اتفاق|اتفاقية/.test(query)) return 'topic_contract';
    if(/تعويض|ضمان|פיצוי/.test(query)) return 'topic_compensation';
    if(/محكمة|قضاء|تقاضي/.test(query)) return 'topic_court';

    return 'general';
  }

  /* ===== Response Generation ===== */
  function generateResponse(query, searchResults, queryType){
    if(!searchResults.length){
      return generateNoResultsResponse(query);
    }

    var topResults = searchResults.slice(0, 5);
    var confidence = calculateConfidence(topResults, query);

    /* Build response sections */
    var response = {
      query: query,
      queryType: queryType,
      confidence: confidence,
      summary: generateSummary(query, topResults, queryType),
      legalTexts: extractLegalTexts(topResults),
      analysis: generateAnalysis(query, topResults, queryType),
      relatedArticles: extractRelated(topResults),
      sources: extractSources(topResults),
      disclaimer: generateDisclaimer(confidence)
    };

    return response;
  }

  function generateNoResultsResponse(query){
    return {
      query: query,
      queryType: 'no_results',
      confidence: 'low',
      summary: 'لم أعثر على نص قانوني يمني موثق يدعم هذه الإجابة في قاعدة المعرفة أو المصادر الرسمية المتاحة.',
      legalTexts: [],
      analysis: 'يُنصح بمراجعة محامٍ متخصص أو الرجوع إلى الجريدة الرسمية للتشريعات اليمنية للحصول على إجابة دقيقة.',
      relatedArticles: [],
      sources: [],
      disclaimer: '⚠️ تنبيه: هذه الاستشارة لأغراض إعلامية فقط ولا تغني عن استشارة محامٍ متخصص.'
    };
  }

  function calculateConfidence(results, query){
    if(!results.length) return 'low';
    var topScore = results[0].score;
    if(topScore > 200 && results.length >= 3) return 'high';
    if(topScore > 80) return 'medium';
    return 'low';
  }

  function generateSummary(query, results, queryType){
    var topDoc = results[0].doc;
    var summary = '';

    switch(queryType){
      case 'topic_divorce':
        summary = 'بناءً على قاعدة المعرفة القانونية، ';
        summary += topDoc.type === 'article'
          ? 'تنص المادة (' + topDoc.articleNumber + ') من ' + topDoc.lawTitle + ' على ما يتعلق بمسألة الطلاق.'
          : 'يوضح ' + topDoc.title + ' الإطار القانوني لهذه المسألة.';
        break;
      case 'topic_inheritance':
        summary = 'وفقاً للتشريعات اليمنية، ';
        summary += topDoc.type === 'article'
          ? 'تنص المادة (' + topDoc.articleNumber + ') من ' + topDoc.lawTitle + ' على أحكام الميراث.'
          : 'يوضح ' + topDoc.title + ' أحكام الإرث.';
        break;
      case 'question_what':
        summary = ' ';
        if(topDoc.type === 'article'){
          summary += 'تنص المادة (' + topDoc.articleNumber + ') من ' + topDoc.lawTitle + ' على:';
        } else {
          summary += 'يوضح ' + topDoc.title + ':';
        }
        break;
      case 'question_how':
        summary = 'بناءً على النصوص القانونية المتاحة: ';
        break;
      case 'action_filing':
        summary = 'إجراءات رفع الدعوى وفقاً للقانون اليمني: ';
        break;
      default:
        summary = 'وفقاً لقاعدة المعرفة القانونية: ';
        if(topDoc.type === 'article'){
          summary += 'المادة (' + topDoc.articleNumber + ') من ' + topDoc.lawTitle + ' تتعلق بهذه المسألة.';
        }
    }

    return summary;
  }

  function extractLegalTexts(results){
    var texts = [];
    var seen = {};
    for(var i = 0; i < results.length && texts.length < 4; i++){
      var doc = results[i].doc;
      if(doc.type !== 'article') continue;
      var key = doc.lawSlug + ':' + doc.articleNumber;
      if(seen[key]) continue;
      seen[key] = true;
      texts.push({
        lawTitle: doc.lawTitle,
        articleNumber: doc.articleNumber,
        text: doc.description,
        url: doc.url
      });
    }
    return texts;
  }

  function generateAnalysis(query, results, queryType){
    var analysis = '';
    var docs = results.map(function(r){ return r.doc; });

    /* Group by law */
    var lawGroups = {};
    for(var i = 0; i < docs.length; i++){
      var key = docs[i].lawTitle || 'أخرى';
      if(!lawGroups[key]) lawGroups[key] = [];
      lawGroups[key].push(docs[i]);
    }

    var lawNames = Object.keys(lawGroups);
    if(lawNames.length === 1){
      analysis += 'المواد القانونية المتعلقة تنتمي إلى ' + lawNames[0] + '. ';
    } else if(lawNames.length > 1){
      analysis += 'المواد القانونية المتعلقة موجودة في عدة قوانين: ' + lawNames.slice(0, 3).join('، ') + '. ';
    }

    /* Add topic-specific analysis */
    var topicAnalyses = {
      'topic_divorce': 'الطلاق في القانون اليمني يكون بلفظ صريح أو ما يدل عليه، ويترتب عليه آثار قانونية تشمل العدة والنفقة والحضانة. يوجد أنواع عدة: الطلاق الرجعي والبائن والخلع والتفويض.',
      'topic_inheritance': 'الميراث في الشريعة الإسلامية والقانون اليمني يخضع لأحكام الفريضة والعصبة وترتيب الورثة. يُشترط وجود المتوفى والموروث والوارث.',
      'topic_custody': 'الحضانة حق للصغير يُعطى لأولى الأهلية وفق ترتيب شرعي، وتنتهي ببلوغ الصغير سن معينة أو بزواج الأم في بعض الحالات.',
      'topic_sale': 'عقد البيع ينعقد بالإيجاب والقبول ويترتب عليه نقل الملكية بتسليم الثمن والمبيع. يشترط أن يكون العين مباحة معلومة قابلة للتسليم.',
      'topic_rental': 'الإيجار عقد يلتزم فيه المؤجر بتسليم المنفعة والمستأجر بدفع الأجرة. يحدد القانون حقوق والتزامات كل طرف.',
      'topic_labor': 'قانون العمل اليمني يحمي حقوق العمال وينظم علاقات العمل بما فيها الأجور والإجازات و إنهاء الخدمة.',
      'topic_theft': 'السرقة جريمة حدية يعاقب عليها الشريعة الإسلامية والقانون اليمني، وعقوبتها تعتمد على نوع السرقة وظروفها.',
      'topic_commercial': 'القانون التجاري اليمني ينظم الأعمال التجارية والشركات والإفلاس والعلامات التجارية.'
    };

    if(topicAnalyses[queryType]){
      analysis += topicAnalyses[queryType] + ' ';
    }

    return analysis;
  }

  function extractRelated(results){
    var related = [];
    var seen = {};
    for(var i = 0; i < results.length && related.length < 6; i++){
      var doc = results[i].doc;
      if(doc.type !== 'article') continue;
      var key = doc.lawSlug + ':' + doc.articleNumber;
      if(seen[key]) continue;
      seen[key] = true;
      related.push({
        lawTitle: doc.lawTitle,
        articleNumber: doc.articleNumber,
        preview: (doc.description || '').slice(0, 120),
        url: doc.url
      });
    }
    return related;
  }

  function extractSources(results){
    var sources = [];
    var seen = {};
    for(var i = 0; i < results.length; i++){
      var doc = results[i].doc;
      var key = doc.lawTitle || '';
      if(!key || seen[key]) continue;
      seen[key] = true;
      var sourceType = doc.type === 'article' ? 'من قاعدة بيانات الموقع' : 'من قاعدة بيانات الموقع';
      sources.push({
        lawTitle: doc.lawTitle,
        section: doc.section,
        type: sourceType,
        url: doc.lawUrl
      });
    }
    return sources;
  }

  function generateDisclaimer(confidence){
    var disclaimers = {
      'high': '✅ هذه الإجابة مبنية على نصوص قانونية موجودة في قاعدة بيانات الموقع. مستوى الثقة: مرتفع.',
      'medium': '⚠️ هذه الإجابة مبنية على نصوص قانونية قد تحتاج مراجعة إضافية. مستوى الثقة: متوسط. يُنصح بمحامٍ متخصص.',
      'low': '⚠️ لم أعثر على نص قانوني يمني كافٍ للإجابة بدقة. يُنصح بالرجوع إلى محامٍ متخصص أو المصادر الرسمية. مستوى الثقة: منخفض.'
    };
    return disclaimers[confidence] || disclaimers['low'];
  }

  /* ===== Format Response for Display ===== */
  function formatResponse(response){
    var html = '';

    /* Summary */
    html += '<div class="advisor-summary">' + escapeHtml(response.summary) + '</div>';

    /* Legal Texts */
    if(response.legalTexts.length){
      html += '<div class="advisor-section">';
      html += '<div class="advisor-section-title">📜 النصوص القانونية</div>';
      for(var i = 0; i < response.legalTexts.length; i++){
        var lt = response.legalTexts[i];
        html += '<div class="advisor-law-text">';
        html += '<div class="advisor-law-header">';
        html += '<span class="advisor-law-name">' + escapeHtml(lt.lawTitle) + '</span>';
        html += '<a href="' + lt.url + '" class="advisor-article-link">المادة (' + escapeHtml(lt.articleNumber) + ')</a>';
        html += '</div>';
        html += '<div class="advisor-law-body">' + escapeHtml(lt.text) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    /* Analysis */
    if(response.analysis){
      html += '<div class="advisor-section">';
      html += '<div class="advisor-section-title">📋 التحليل القانوني</div>';
      html += '<div class="advisor-analysis">' + escapeHtml(response.analysis) + '</div>';
      html += '</div>';
    }

    /* Related Articles */
    if(response.relatedArticles.length){
      html += '<div class="advisor-section">';
      html += '<div class="advisor-section-title">🔗 المواد ذات الصلة</div>';
      html += '<div class="advisor-related-list">';
      for(var i = 0; i < response.relatedArticles.length; i++){
        var ra = response.relatedArticles[i];
        html += '<a href="' + ra.url + '" class="advisor-related-item">';
        html += '<span class="advisor-related-law">' + escapeHtml(ra.lawTitle) + '</span>';
        html += '<span class="advisor-related-num">مادة (' + escapeHtml(ra.articleNumber) + ')</span>';
        html += '</a>';
      }
      html += '</div></div>';
    }

    /* Sources */
    if(response.sources.length){
      html += '<div class="advisor-sources">';
      html += '<div class="advisor-sources-title">📚 المصادر</div>';
      for(var i = 0; i < response.sources.length; i++){
        var src = response.sources[i];
        html += '<div class="advisor-source-item">';
        html += '<span class="advisor-source-icon">✅</span>';
        html += '<span>' + escapeHtml(src.type) + ': <strong>' + escapeHtml(src.lawTitle) + '</strong></span>';
        html += '</div>';
      }
      html += '</div>';
    }

    /* Disclaimer */
    html += '<div class="advisor-disclaimer">' + escapeHtml(response.disclaimer) + '</div>';

    return html;
  }

  function escapeHtml(text){
    return String(text||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; });
  }

  /* ===== Public API ===== */
  global.LegalRAG = {
    buildSearchIndex: buildSearchIndex,
    search: search,
    detectQueryType: detectQueryType,
    generateResponse: generateResponse,
    formatResponse: formatResponse,
    normalizeArabic: normalizeArabic,
    extractKeywords: extractKeywords,
    expandSynonyms: expandSynonyms
  };

})(window);
