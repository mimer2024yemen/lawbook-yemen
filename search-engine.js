/**
 * المستشار اليمني القانوني — محرك البحث القانوني المتقدم
 * Supports: article numbers, law names, penalties, courts, years, case types
 * Features: smart normalization, fuzzy matching, live suggestions, highlighting
 */
(function(global){
  'use strict';

  /* ===== Constants ===== */
  var TYPE_LABELS = { law: 'قانون', contract: 'عقد', post: 'مقال', article: 'مادة' };
  var SECTION_LABELS = {
    'civil':'الدعاوى المدنية','personal-status':'الأحوال الشخصية','litigation-procedures':'إجراءات التقاضي',
    'criminal':'الجرائم الجنائية','labor':'العمل','yemeni-laws':'القوانين اليمنية',
    'legal-procedure-deadlines':'مواعيد الإجراءات القانونية','urgent':'الدعاوى المستعجلة','commercial':'الدعاوى التجارية'
  };

  /* Court keywords for detection */
  var COURT_KEYWORDS = {
    'ابتدائي': 'محكمة ابتدائية','استئناف': 'محكمة استئناف','تمييز': 'محكمة تمييز','نقض': 'محكمة نقض',
    'تجارية': 'محكمة تجارية','جنائية': 'محكمة جنائية','جنح': 'محكمة جنح','أحوال': 'محكمة أحوال شخصية',
    'عمل': 'محكمة عمل','عسكري': 'محكمة عسكرية','شرعية': 'محكمة شرعية','ميادين': 'محكمة ميادين',
    '⨀': 'محكمة'
  };

  /* Penalty keywords */
  var PENALTY_KEYWORDS = [
    'عقوبة','سجن','حبس','غرامة','إعدام','مؤبد','أشغال','جلد','قطع','رجم',
    'تغريم','حرمان','عزل','منع','confiscation','مصادرة','توقيف','حبس احتياطي',
    'عقوبة بديلة','عقوبة تعزيرية','حد','قصاص','دية','كفارة'
  ];

  /* Year pattern: matches 19xx or 20xx in Arabic or Western numerals */
  var YEAR_PATTERN = /(?:19|20)\d{2}|[\u0660-\u0669]{4}/;

  /* ===== Arabic Normalization ===== */
  var ARABIC_NORM_MAP = {
    '\u0622':'ا','\u0623':'ا','\u0625':'ا','\u0671':'ا', /* أإآٱ → ا */
    '\u0624':'و', /* ؤ → و */
    '\u0626':'ي', /* ئ → ي */
    '\u0649':'ي', /* ى → ي */
    '\u0629':'ه', /* ة → ه */
    '\u0640':''   /* ـ → (remove) */
  };

  function normalizeArabic(text){
    if(!text) return '';
    return String(text)
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '') /* remove diacritics */
      .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
      .replace(/\u0624/g, 'و')
      .replace(/\u0626/g, 'ي')
      .replace(/\u0649/g, 'ي')
      .replace(/\u0629/g, 'ه')
      .replace(/\u0640/g, '')
      .replace(/[\u0660-\u0669]/g, function(d){ return String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d)); }) /* Arabic digits → Western */
      .replace(/[^\u0600-\u06ff0-9a-z\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeArticleNumber(num){
    if(!num) return '';
    return String(num)
      .replace(/[\u0660-\u0669]/g, function(d){ return String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d)); })
      .replace(/[^\d]/g, '')
      .trim();
  }

  function tokenize(text){
    var norm = normalizeArabic(text);
    if(!norm) return [];
    return norm.split(' ').filter(function(t){ return t.length > 1; });
  }

  /* ===== Fuzzy Match (Edit Distance) ===== */
  function editDistance(a, b){
    var la = a.length, lb = b.length;
    if(!la) return lb;
    if(!lb) return la;
    if(Math.abs(la - lb) > 2) return 3; /* early exit for efficiency */
    var dp = [];
    for(var i = 0; i <= la; i++){
      dp[i] = [i];
    }
    for(var j = 0; j <= lb; j++){
      dp[0][j] = j;
    }
    for(var i = 1; i <= la; i++){
      for(var j = 1; j <= lb; j++){
        var cost = a[i-1] === b[j-1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i-1][j] + 1,
          dp[i][j-1] + 1,
          dp[i-1][j-1] + cost
        );
      }
    }
    return dp[la][lb];
  }

  function fuzzyMatch(query, target){
    if(!query || !target) return false;
    if(target.indexOf(query) !== -1) return true;
    /* Check if any token is within edit distance 1-2 */
    var qTokens = query.split(' ');
    var tTokens = target.split(' ');
    for(var i = 0; i < qTokens.length; i++){
      if(qTokens[i].length < 3) continue;
      for(var j = 0; j < tTokens.length; j++){
        if(tTokens[j].length < 3) continue;
        if(editDistance(qTokens[i], tTokens[j]) <= 1) return true;
      }
    }
    return false;
  }

  /* ===== Spell Correction Dictionary ===== */
  var COMMON_CORRECTIONS = {
    'نكاح':'نكاح','زواج':'زواج','طلاق':'طلاق','فسخ':'فسخ','خلع':'خلع',
    'نفقه':'نفقة','نفقة':'نفقة','حضانه':'حضانة','حضانة':'حضانة',
    'ميراث':'ميراث','تركة':'تركة','وصية':'وصية','وقف':'وقف',
    'بيع':'بيع','شراء':'شراء','ايجار':'إيجار','إيجار':'إيجار',
    'رهن':'رهن','ضمان':'ضمان','كفالة':'كفالة','وكالة':'وكالة',
    'شركة':'شركة','شراكة':'شراكة','تاجر':'تاجر','تجاري':'تجاري',
    'جنائي':'جنائي','جريمة':'جريمة','سرقة':'سرقة','قتل':'قتل',
    'دعوى':'دعوى','محكمة':'محكمة','قاضي':'قاضي','حكم':'حكم',
    'مدني':'مدني','عمل':'عمل','عمال':'عمال','موظف':'موظف',
    'عقاب':'عقوبة','جزاء':'جزاء','حد':'حد','تعزير':'تعزير'
  };

  function correctSpelling(query){
    var tokens = normalizeArabic(query).split(' ');
    var corrected = [];
    var hasCorrection = false;
    for(var i = 0; i < tokens.length; i++){
      var t = tokens[i];
      if(COMMON_CORRECTIONS[t]){
        corrected.push(COMMON_CORRECTIONS[t]);
        if(COMMON_CORRECTIONS[t] !== t) hasCorrection = true;
      } else {
        /* Try fuzzy match against dictionary */
        var best = null, bestDist = 3;
        var keys = Object.keys(COMMON_CORRECTIONS);
        for(var k = 0; k < keys.length; k++){
          var d = editDistance(t, keys[k]);
          if(d < bestDist){ bestDist = d; best = COMMON_CORRECTIONS[keys[k]]; }
        }
        if(best && bestDist <= 1){
          corrected.push(best);
          hasCorrection = true;
        } else {
          corrected.push(t);
        }
      }
    }
    return { text: corrected.join(' '), corrected: hasCorrection };
  }

  /* ===== Intent Detection ===== */
  function detectIntent(query){
    var q = normalizeArabic(query);
    var intent = { type: 'general' };

    /* Article number: "مادة 1256" or "المادة 1256" or just "1256" */
    var artMatch = q.match(/(?:ماد[هة]\s*)?(\d{1,5})/);
    if(artMatch && /^\d{1,5}$/.test(q.trim())){
      intent.type = 'article_number';
      intent.articleNumber = artMatch[1];
      return intent;
    }
    if(q.match(/ماد[هة]\s*\d/)){
      intent.type = 'article_number';
      intent.articleNumber = q.match(/(\d{1,5})/)[1];
      return intent;
    }

    /* Court detection */
    var courtKeys = Object.keys(COURT_KEYWORDS);
    for(var c = 0; c < courtKeys.length; c++){
      if(q.indexOf(courtKeys[c]) !== -1){
        intent.type = 'court';
        intent.court = COURT_KEYWORDS[courtKeys[c]];
        break;
      }
    }

    /* Penalty detection */
    for(var p = 0; p < PENALTY_KEYWORDS.length; p++){
      if(q.indexOf(PENALTY_KEYWORDS[p]) !== -1){
        intent.type = 'penalty';
        intent.penalty = PENALTY_KEYWORDS[p];
        break;
      }
    }

    /* Year detection */
    var yearMatch = q.match(YEAR_PATTERN);
    if(yearMatch){
      intent.year = yearMatch[0].replace(/[\u0660-\u0669]/g, function(d){ return String('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'.indexOf(d)); });
    }

    return intent;
  }

  /* ===== Index Building ===== */
  function buildIndex(catalog, database){
    var index = [];

    /* Index laws from catalog */
    var sections = Object.keys(catalog.laws || {});
    for(var i = 0; i < sections.length; i++){
      var section = sections[i];
      var items = catalog.laws[section] || [];
      for(var j = 0; j < items.length; j++){
        index.push(prepareLawItem(items[j], section));
      }
    }

    /* Index individual articles from database */
    if(database && database.laws){
      var dbSections = Object.keys(database.laws);
      for(var s = 0; s < dbSections.length; s++){
        var sec = dbSections[s];
        var laws = database.laws[sec] || [];
        for(var l = 0; l < laws.length; l++){
          var law = laws[l];
          var articles = law.articles || [];
          for(var a = 0; a < articles.length; a++){
            index.push(prepareArticleItem(articles[a], law, sec));
          }
        }
      }
    }

    /* Index contracts */
    var contracts = catalog.contracts || [];
    for(var c = 0; c < contracts.length; c++){
      index.push(prepareContractItem(contracts[c]));
    }

    /* Index posts */
    var posts = catalog.posts || [];
    for(var p = 0; p < posts.length; p++){
      index.push(preparePostItem(posts[p]));
    }

    return index;
  }

  function prepareLawItem(item, section){
    var title = item.title || '';
    var desc = item.description || '';
    var searchText = item.searchText || desc;
    return {
      type: 'law',
      typeLabel: 'قانون',
      section: section,
      sectionLabel: item.sectionLabel || SECTION_LABELS[section] || '',
      url: item.url || '',
      slug: item.slug || '',
      title: title,
      description: desc,
      searchText: searchText,
      articleCount: item.articleCount || 0,
      category: item.category || '',
      normalizedTitle: normalizeArabic(title),
      normalizedDesc: normalizeArabic(desc),
      normalizedText: normalizeArabic(searchText),
      tokens: tokenize(title + ' ' + searchText)
    };
  }

  function prepareArticleItem(article, law, section){
    var num = article.number || '';
    var text = article.text || '';
    var normNum = normalizeArticleNumber(num);
    return {
      type: 'article',
      typeLabel: 'مادة',
      section: section,
      sectionLabel: SECTION_LABELS[section] || law.sectionLabel || '',
      url: 'article.html?law=' + encodeURIComponent(law.slug || '') + '&article=' + encodeURIComponent(num) + '&section=' + encodeURIComponent(section),
      slug: law.slug || '',
      lawTitle: law.title || '',
      articleNumber: num,
      articleNumberNorm: normNum,
      title: 'مادة (' + num + ') — ' + (law.title || ''),
      description: text,
      searchText: text + ' ' + (law.title || ''),
      articleCount: 0,
      normalizedTitle: normalizeArabic('مادة ' + num + ' ' + (law.title || '')),
      normalizedDesc: normalizeArabic(text),
      normalizedText: normalizeArabic(text + ' ' + (law.title || '')),
      tokens: tokenize(text + ' ' + (law.title || ''))
    };
  }

  function prepareContractItem(item){
    var title = item.title || '';
    var desc = item.description || '';
    var searchText = item.searchText || desc;
    return {
      type: 'contract',
      typeLabel: 'عقد',
      section: '',
      sectionLabel: '',
      url: item.url || '',
      slug: item.slug || '',
      title: title,
      description: desc,
      searchText: searchText,
      articleCount: item.articleCount || 0,
      category: item.category || '',
      normalizedTitle: normalizeArabic(title),
      normalizedDesc: normalizeArabic(desc),
      normalizedText: normalizeArabic(searchText),
      tokens: tokenize(title + ' ' + searchText)
    };
  }

  function preparePostItem(item){
    var title = item.title || '';
    var desc = item.description || '';
    var searchText = item.searchText || desc;
    return {
      type: 'post',
      typeLabel: 'مقال',
      section: '',
      sectionLabel: '',
      url: item.url || '',
      slug: item.slug || '',
      title: title,
      description: desc,
      searchText: searchText,
      articleCount: item.articleCount || 0,
      normalizedTitle: normalizeArabic(title),
      normalizedDesc: normalizeArabic(desc),
      normalizedText: normalizeArabic(searchText),
      tokens: tokenize(title + ' ' + searchText)
    };
  }

  /* ===== Scoring ===== */
  function scoreItem(entry, normalizedQuery, queryTokens, intent){
    var score = 0;
    var title = entry.normalizedTitle;
    var desc = entry.normalizedDesc;
    var text = entry.normalizedText;

    /* Article number exact match */
    if(intent.type === 'article_number' && entry.type === 'article'){
      if(entry.articleNumberNorm === intent.articleNumber) score += 5000;
      else if(entry.articleNumberNorm && entry.articleNumberNorm.indexOf(intent.articleNumber) === 0) score += 2000;
      return score;
    }

    /* Court filter */
    if(intent.type === 'court' && intent.court){
      var courtNorm = normalizeArabic(intent.court);
      if(text.indexOf(courtNorm) !== -1) score += 800;
      else return -1; /* skip if no court match */
    }

    /* Penalty filter */
    if(intent.type === 'penalty' && intent.penalty){
      var penaltyNorm = normalizeArabic(intent.penalty);
      if(text.indexOf(penaltyNorm) !== -1) score += 800;
      else return -1;
    }

    /* Year filter */
    if(intent.year){
      if(text.indexOf(intent.year) !== -1) score += 300;
    }

    /* Exact full query match */
    if(title === normalizedQuery) score += 2000;
    if(title.indexOf(normalizedQuery) === 0) score += 1100;
    if(title.indexOf(normalizedQuery) !== -1) score += 700;
    if(desc.indexOf(normalizedQuery) !== -1) score += 260;
    if(text.indexOf(normalizedQuery) !== -1) score += 120;

    /* Token-based matching */
    var matchedTokens = 0;
    for(var i = 0; i < queryTokens.length; i++){
      var token = queryTokens[i];
      var tokenScore = 0;
      if(title === token) tokenScore += 240;
      if(title.indexOf(token) === 0) tokenScore += 170;
      else if(title.indexOf(token) !== -1) tokenScore += 105;
      if(desc.indexOf(token) !== -1) tokenScore += 48;
      if(text.indexOf(token) !== -1) tokenScore += 24;
      if(tokenScore > 0) matchedTokens++;
      score += tokenScore;
    }

    /* All tokens matched bonus */
    if(queryTokens.length && matchedTokens === queryTokens.length) score += 260;
    else if(queryTokens.length > 1 && matchedTokens >= Math.max(1, queryTokens.length - 1)) score += 80;

    /* Type bonuses */
    if(entry.type === 'article') score += 15;
    else if(entry.type === 'law') score += 10;

    /* Article count bonus */
    score += Math.min(entry.articleCount || 0, 80);

    /* Fuzzy fallback for low scores */
    if(score <= 0 && queryTokens.length > 0){
      for(var t = 0; t < queryTokens.length; t++){
        if(queryTokens[t].length >= 3){
          var titleTokens = title.split(' ');
          for(var tt = 0; tt < titleTokens.length; tt++){
            if(editDistance(queryTokens[t], titleTokens[tt]) <= 1){
              score += 50;
              break;
            }
          }
        }
      }
    }

    return score;
  }

  /* ===== Snippet Extraction ===== */
  function extractSnippet(entry, queryTokens){
    var source = entry.searchText || entry.description || entry.title || '';
    if(!source) return '';
    var parts = String(source).split(/[\n•]+/);
    for(var i = 0; i < parts.length; i++){
      var part = parts[i].trim();
      if(!part || part.length < 10) continue;
      var normalizedPart = normalizeArabic(part);
      for(var j = 0; j < queryTokens.length; j++){
        if(queryTokens[j] && normalizedPart.indexOf(queryTokens[j]) !== -1){
          return summarize(part, 200);
        }
      }
    }
    return summarize(entry.description || source, 200);
  }

  function summarize(text, limit){
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if(s.length <= limit) return s;
    return s.slice(0, limit).trim() + '...';
  }

  function escapeHtml(text){
    return String(text || '').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ===== Main Search Function ===== */
  function search(index, query, options){
    options = options || {};
    var normalizedQuery = normalizeArabic(query);
    if(!normalizedQuery) return [];

    var intent = detectIntent(query);
    var queryTokens = [];
    /* For article number search, don't tokenize the number */
    if(intent.type === 'article_number'){
      queryTokens = []; /* rely on article number matching */
    } else {
      var unique = {};
      var raw = tokenize(normalizedQuery);
      for(var i = 0; i < raw.length; i++){
        if(!unique[raw[i]]){ unique[raw[i]] = true; queryTokens.push(raw[i]); }
      }
    }

    var limit = options.limit || 25;
    var filterTypes = options.types || null;
    var section = options.section || '';
    var results = [];

    for(var i = 0; i < index.length; i++){
      var entry = index[i];
      if(filterTypes && filterTypes.indexOf(entry.type) === -1) continue;
      if(section && entry.section !== section) continue;

      var score = scoreItem(entry, normalizedQuery, queryTokens, intent);
      if(score <= 0) continue;

      results.push({
        score: score,
        type: entry.type,
        section: entry.section,
        url: entry.url,
        title: entry.title,
        description: entry.description,
        articleCount: entry.articleCount,
        typeLabel: entry.typeLabel,
        sectionLabel: entry.sectionLabel,
        category: entry.category,
        articleNumber: entry.articleNumber || '',
        lawTitle: entry.lawTitle || '',
        item: entry,
        snippet: extractSnippet(entry, queryTokens)
      });
    }

    results.sort(function(a, b){
      if(b.score !== a.score) return b.score - a.score;
      if((b.articleCount || 0) !== (a.articleCount || 0)) return (b.articleCount || 0) - (a.articleCount || 0);
      return (a.title || '').localeCompare((b.title || ''), 'ar');
    });

    return results.slice(0, limit);
  }

  /* ===== Live Suggestions ===== */
  function suggest(index, query, limit){
    limit = limit || 6;
    var q = normalizeArabic(query);
    if(!q || q.length < 2) return [];
    var seen = {};
    var suggestions = [];

    for(var i = 0; i < index.length && suggestions.length < limit * 3; i++){
      var entry = index[i];
      if(entry.normalizedTitle.indexOf(q) !== -1 && !seen[entry.title]){
        seen[entry.title] = true;
        suggestions.push({
          title: entry.title,
          type: entry.type,
          typeLabel: entry.typeLabel,
          sectionLabel: entry.sectionLabel,
          url: entry.url,
          articleNumber: entry.articleNumber || ''
        });
      }
    }

    /* Sort: articles first, then by title relevance */
    suggestions.sort(function(a, b){
      var aStart = normalizeArabic(a.title).indexOf(q) === 0 ? 0 : 1;
      var bStart = normalizeArabic(b.title).indexOf(q) === 0 ? 0 : 1;
      if(aStart !== bStart) return aStart - bStart;
      return a.title.localeCompare(b.title, 'ar');
    });

    return suggestions.slice(0, limit);
  }

  /* ===== Highlight Matching Text ===== */
  function highlightText(text, query){
    if(!text || !query) return escapeHtml(text);
    var normalized = normalizeArabic(query);
    var tokens = tokenize(normalized);
    var escaped = escapeHtml(text);
    /* Highlight each matching token */
    for(var i = 0; i < tokens.length; i++){
      if(tokens[i].length < 2) continue;
      var regex = new RegExp('(' + tokens[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      escaped = escaped.replace(regex, '<mark>$1</mark>');
    }
    return escaped;
  }

  /* ===== Flatten Laws ===== */
  function flattenLaws(catalog, section){
    var result = [];
    var sections = Object.keys(catalog.laws || {});
    for(var i = 0; i < sections.length; i++){
      if(section && section !== 'all' && sections[i] !== section) continue;
      var items = catalog.laws[sections[i]] || [];
      for(var j = 0; j < items.length; j++) result.push(items[j]);
    }
    return result;
  }

  /* ===== Public API ===== */
  global.LawbookSearch = {
    TYPE_LABELS: TYPE_LABELS,
    SECTION_LABELS: SECTION_LABELS,
    escapeHtml: escapeHtml,
    normalizeArabic: normalizeArabic,
    normalizeArticleNumber: normalizeArticleNumber,
    tokenize: tokenize,
    buildIndex: buildIndex,
    search: search,
    suggest: suggest,
    highlightText: highlightText,
    flattenLaws: flattenLaws,
    correctSpelling: correctSpelling,
    detectIntent: detectIntent,
    sectionLabel: function(key){ return SECTION_LABELS[key] || key || ''; }
  };

})(window);
