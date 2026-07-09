(function(global){
  'use strict';

  var TYPE_LABELS = { law: 'قانون', contract: 'عقد', post: 'مقال' };
  var SECTION_LABELS = {
    'civil': 'الدعاوى المدنية',
    'personal-status': 'الأحوال الشخصية',
    'litigation-procedures': 'إجراءات التقاضي',
    'criminal': 'الجرائم الجنائية',
    'labor': 'العمل',
    'yemeni-laws': 'القوانين اليمنية',
    'legal-procedure-deadlines': 'مواعيد الإجراءات القانونية',
    'urgent': 'الدعاوى المستعجلة',
    'commercial': 'الدعاوى التجارية'
  };

  function escapeHtml(value){
    return String(value || '').replace(/[&<>"']/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function normalizeArabic(value){
    return String(value || '')
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ـ/g, '')
      .replace(/[٠-٩]/g, function(d){ return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[^\u0600-\u06ff0-9a-z\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(value){
    var text = normalizeArabic(value);
    if(!text) return [];
    return text.split(' ').filter(function(token){ return token && token.length > 1; });
  }

  function summarize(value, limit){
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if(text.length <= limit) return text;
    return text.slice(0, limit).trim() + '...';
  }

  function uniqueTokens(tokens){
    var seen = {};
    var out = [];
    for(var i=0;i<tokens.length;i++){
      if(!seen[tokens[i]]){
        seen[tokens[i]] = true;
        out.push(tokens[i]);
      }
    }
    return out;
  }

  function buildIndex(catalog){
    var index = [];
    if(!catalog) return index;

    var sections = Object.keys(catalog.laws || {});
    for(var i=0;i<sections.length;i++){
      var section = sections[i];
      var items = catalog.laws[section] || [];
      for(var j=0;j<items.length;j++){
        index.push(prepareItem(items[j], 'law', section));
      }
    }

    var contracts = catalog.contracts || [];
    for(var c=0;c<contracts.length;c++) index.push(prepareItem(contracts[c], 'contract', ''));

    var posts = catalog.posts || [];
    for(var p=0;p<posts.length;p++) index.push(prepareItem(posts[p], 'post', ''));

    return index;
  }

  function prepareItem(item, type, section){
    var title = item.title || '';
    var description = item.description || '';
    var searchText = item.searchText || description || '';
    return {
      type: type,
      typeLabel: TYPE_LABELS[type] || 'محتوى',
      section: section || item.section || '',
      sectionLabel: item.sectionLabel || SECTION_LABELS[section] || '',
      url: item.url || '',
      slug: item.slug || '',
      title: title,
      description: description,
      searchText: searchText,
      articleCount: item.articleCount || 0,
      category: item.category || '',
      normalizedTitle: normalizeArabic(title),
      normalizedDescription: normalizeArabic(description),
      normalizedText: normalizeArabic(searchText)
    };
  }

  function scoreItem(entry, normalizedQuery, tokens){
    var score = 0;
    var title = entry.normalizedTitle;
    var desc = entry.normalizedDescription;
    var text = entry.normalizedText;

    if(!title && !desc && !text) return 0;
    if(title === normalizedQuery) score += 2000;
    if(title.indexOf(normalizedQuery) === 0) score += 1100;
    if(title.indexOf(normalizedQuery) !== -1) score += 700;
    if(desc.indexOf(normalizedQuery) !== -1) score += 260;
    if(text.indexOf(normalizedQuery) !== -1) score += 120;

    var matchedTokens = 0;
    for(var i=0;i<tokens.length;i++){
      var token = tokens[i];
      var tokenScore = 0;
      if(title === token) tokenScore += 240;
      if(title.indexOf(token) === 0) tokenScore += 170;
      else if(title.indexOf(token) !== -1) tokenScore += 105;
      if(desc.indexOf(token) !== -1) tokenScore += 48;
      if(text.indexOf(token) !== -1) tokenScore += 24;
      if(tokenScore > 0) matchedTokens++;
      score += tokenScore;
    }

    if(tokens.length && matchedTokens === tokens.length) score += 260;
    else if(tokens.length > 1 && matchedTokens >= Math.max(1, tokens.length - 1)) score += 80;

    if(entry.type === 'law') score += 10;
    score += Math.min(entry.articleCount || 0, 80);
    score -= Math.min((entry.title || '').length, 120) / 50;
    return score;
  }

  function extractSnippet(entry, tokens){
    var source = entry.searchText || entry.description || entry.title || '';
    if(!source) return '';
    var parts = String(source).split(/\n+/);
    for(var i=0;i<parts.length;i++){
      var part = parts[i].trim();
      if(!part) continue;
      var normalizedPart = normalizeArabic(part);
      for(var j=0;j<tokens.length;j++){
        if(tokens[j] && normalizedPart.indexOf(tokens[j]) !== -1){
          return summarize(part, 180);
        }
      }
    }
    return summarize(entry.description || source, 180);
  }

  function search(catalog, query, options){
    options = options || {};
    var normalizedQuery = normalizeArabic(query);
    if(!normalizedQuery) return [];

    var tokens = uniqueTokens(tokenize(normalizedQuery));
    var limit = options.limit || 20;
    var filterTypes = options.types || null;
    var section = options.section || '';
    var index = options.index || buildIndex(catalog);
    var results = [];

    for(var i=0;i<index.length;i++){
      var entry = index[i];
      if(filterTypes && filterTypes.indexOf(entry.type) === -1) continue;
      if(section && entry.section !== section) continue;
      var score = scoreItem(entry, normalizedQuery, tokens);
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
        item: entry,
        snippet: extractSnippet(entry, tokens)
      });
    }

    results.sort(function(a, b){
      if(b.score !== a.score) return b.score - a.score;
      if((b.articleCount || 0) !== (a.articleCount || 0)) return (b.articleCount || 0) - (a.articleCount || 0);
      return (a.title || '').localeCompare((b.title || ''), 'ar');
    });

    return results.slice(0, limit);
  }

  function flattenLaws(catalog, section){
    var result = [];
    var sections = Object.keys(catalog.laws || {});
    for(var i=0;i<sections.length;i++){
      if(section && section !== 'all' && sections[i] !== section) continue;
      var items = catalog.laws[sections[i]] || [];
      for(var j=0;j<items.length;j++) result.push(items[j]);
    }
    return result;
  }

  global.LawbookSearch = {
    TYPE_LABELS: TYPE_LABELS,
    SECTION_LABELS: SECTION_LABELS,
    escapeHtml: escapeHtml,
    normalizeArabic: normalizeArabic,
    tokenize: tokenize,
    summarize: summarize,
    buildIndex: buildIndex,
    search: search,
    flattenLaws: flattenLaws,
    sectionLabel: function(key){ return SECTION_LABELS[key] || key || ''; }
  };
})(window);
