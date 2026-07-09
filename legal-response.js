/**
 * Lawbook Yemen — Conversational Legal Response Engine
 * Generates natural, ChatGPT-like lawyer responses from RAG context
 */
(function(global){
  'use strict';

  /* ===== Conversation State ===== */
  var conversation = {
    history: [],
    lastTopic: null,
    lastLaw: null,
    lastArticles: [],
    lastIntent: null,
    turnCount: 0
  };

  /* ===== Response Templates by Intent ===== */
  var INTRO_TEMPLATES = {
    'divorce': [
      'مسألة الطلاق من المواضيع المهمة في القانون اليمني. ',
      'بخصوص موضوع الطلاق، القانون اليمني ينظم ذلك بشكل مفصل. ',
      'دعني أوضح لك أحكام الطلاق وفقاً للقانون اليمني. '
    ],
    'maintenance': [
      'النفقة من الحقوق الأساسية التي يكفلها القانون اليمني. ',
      'فيما يتعلق بالنفقة، هناك أحكام محددة يوضحها القانون. ',
    ],
    'custody': [
      'الحضانة مسألة ينظمها القانون اليمني بشكل دقيق. ',
      'بخصوص الحضانة، القانون يحدد شروطها وضوابطها. ',
    ],
    'inheritance': [
      'الميراث من المسائل التي حددتها الشريعة الإسلامية والقانون اليمني بدقة. ',
      'فيما يخص الإرث والتوريث، هناك أحكام مفصلة. ',
    ],
    'sale': [
      'عقد البيع والشراء يخضع لأحكام محددة في القانون اليمني. ',
    ],
    'rental': [
      'الإيجار من العقود الشائعة التي ينظمها القانون اليمني. ',
      'بخصوص الإيجار، هناك حقوق والتزامات على كل طرف. ',
    ],
    'theft': [
      'السرقة من الجرائم التي يعاقب عليها القانون اليمني بعقوبات صارمة. ',
      'فيما يتعلق بجريمة السرقة، القانون يحدد عقوبات محددة. ',
    ],
    'murder': [
      'جريمة القتل من أخطر الجرائم التي يعالجها القانون اليمني. ',
    ],
    'labor': [
      'قانون العمل اليمني يحمي حقوق العاملين بشكل شامل. ',
      'بخصوص علاقات العمل، هناك أحكام مفصلة في قانون العمل. ',
    ],
    'filing': [
      'إجراءات رفع الدعوى القضائية في اليمن تخضع لقواعد محددة. ',
      'لرفع دعوى في اليمن، يجب اتباع إجراءات معينة. ',
    ],
    'penalty': [
      'العقوبات في القانون اليمني تختلف حسب نوع الجريمة وظروفها. ',
    ],
    'yesno': [
      'بناءً على النصوص القانونية المتاحة، ',
    ],
    'what': [
      'وفقاً للتشريعات اليمنية، ',
    ],
    'how': [
      'الإجراء المطلوب وفقاً للقانون اليمني هو كالتالي: ',
    ],
    'general': [
      'بناءً على قاعدة المعرفة القانونية لدينا، ',
      'وفقاً للقانون اليمني، ',
    ]
  };

  var CLARIFICATION_TEMPLATES = {
    'divorce': 'قبل أن أعطيك إجابة دقيقة، أحتاج أوضح بعض النقاط: هل الطلاق بطلب من الزوج أم من الزوجة؟ وهل هناك أطفال؟',
    'inheritance': 'لتقديم إجابة دقيقة عن الميراث، أحتاج لمعرفة: من هم الورثة؟ وهل المتوفى ترك وصية؟',
    'custody': 'بخصوص الحضانة، أحتاج لمعرفة: عمر الطفل؟ وهل الأم متزوجة من شخص آخر؟',
    'rental': 'لإجابة أدق، هل المشكلة تتعلق بتأخر الدفع أم إخلاء العين أم شروط العقد؟',
    'labor': 'بخصوص مشكلة العمل، هل מדובר بفصل تعسفي أم عدم دفع رواتب أم إجازات؟',
    'filing': 'لكي أوجهك بشكل أفضل، ما نوع القضية: مدنية أم تجارية أم أحوال شخصية؟ وما المحكمة المختصة؟',
    'theft': 'لتحديد العقوبة بدقة، هل السرقة من داخل مسكن أم خارجه؟ وهل كانت بالليل أم النهار؟'
  };

  /* ===== Generate Response ===== */
  function generate(query, searchResults, intent){
    var isFollow = LegalRAGv2.isFollowUp(query);
    conversation.turnCount++;

    /* Handle follow-up questions */
    if(isFollow && conversation.lastTopic){
      return generateFollowUp(query, searchResults, intent);
    }

    /* Handle clarification needed */
    if(!searchResults.length || (searchResults.length === 1 && searchResults[0].score < 5)){
      return generateClarification(query, intent);
    }

    /* Handle normal response */
    return generateMainResponse(query, searchResults, intent);
  }

  /* ===== Main Response Generation ===== */
  function generateMainResponse(query, results, intent){
    var topResults = results.slice(0, 8);
    var confidence = calcConfidence(topResults);

    /* Group articles by law */
    var lawGroups = groupByLaw(topResults);

    /* Build response parts */
    var parts = [];

    /* 1. Natural intro */
    var intros = INTRO_TEMPLATES[intent] || INTRO_TEMPLATES['general'];
    parts.push({ type: 'intro', text: pickRandom(intros) });

    /* 2. Main analysis — combine related articles */
    var analysis = buildAnalysis(query, topResults, lawGroups, intent);
    parts.push({ type: 'analysis', text: analysis });

    /* 3. Legal citations — embedded naturally */
    var citations = buildCitations(topResults);
    if(citations.length) parts.push({ type: 'citations', items: citations });

    /* 4. Practical application */
    var practical = buildPractical(query, intent, topResults);
    if(practical) parts.push({ type: 'practical', text: practical });

    /* 5. Exceptions and notes */
    var exceptions = buildExceptions(topResults, intent);
    if(exceptions) parts.push({ type: 'exceptions', text: exceptions });

    /* 6. Confidence & disclaimer */
    parts.push({ type: 'confidence', level: confidence });

    /* 7. Follow-up suggestions */
    var suggestions = buildSuggestions(intent, query);
    if(suggestions.length) parts.push({ type: 'suggestions', items: suggestions });

    /* Update conversation state */
    conversation.lastTopic = intent;
    conversation.lastLaw = topResults[0] ? topResults[0].doc.lawTitle : null;
    conversation.lastArticles = topResults.slice(0,3).map(function(r){ return r.doc.articleNumber; }).filter(Boolean);
    conversation.lastIntent = intent;
    conversation.history.push({ role: 'user', content: query });
    conversation.history.push({ role: 'assistant', content: parts });

    return parts;
  }

  /* ===== Follow-up Response ===== */
  function generateFollowUp(query, results, intent){
    var parts = [];

    if(results.length > 0){
      var topResults = results.slice(0, 5);
      parts.push({ type: 'intro', text: 'بالإضافة إلى ما ذكرته سابقاً، ' });
      var analysis = buildAnalysis(query, topResults, groupByLaw(topResults), conversation.lastTopic || intent);
      parts.push({ type: 'analysis', text: analysis });
      var citations = buildCitations(topResults);
      if(citations.length) parts.push({ type: 'citations', items: citations });
    } else {
      /* Contextual follow-up without new search results */
      parts.push({ type: 'intro', text: 'بالنسبة لسؤالك هذا، ' });
      parts.push({ type: 'analysis', text: generateContextualFollowUp(query, conversation) });
    }

    var suggestions = buildSuggestions(conversation.lastTopic || intent, query);
    if(suggestions.length) parts.push({ type: 'suggestions', items: suggestions });
    parts.push({ type: 'confidence', level: 'medium' });

    conversation.history.push({ role: 'user', content: query });
    conversation.history.push({ role: 'assistant', content: parts });
    return parts;
  }

  function generateContextualFollowUp(query, conv){
    var topic = conv.lastTopic;
    if(topic === 'divorce'){
      return 'في حالة الطلاق، إذا كان الزوج مسافراً، يمكن توكيل محامٍ أو شخص آخر لإتمام إجراءات الطلاق. كما يمكن للزوجة رفع دعوى أمام المحكمة المختصة. ';
    }
    if(topic === 'inheritance'){
      return 'Regarding متابعة موضوع الميراث، يمكن للورثة الاتفاق على تقسيم التركة ودياً أو recour للمحكمة للتقسيم القضائي. ';
    }
    if(topic === 'custody'){
      return 'Regarding متابعة موضوع الحضانة، يمكن للمحكمة تعديل أمر الحضانة إذا تغيرت الظروف. ';
    }
    return 'لمزيد من التفاصيل حول هذه النقطة، يُنصح بمراجعة النصوص القانونية الكاملة أو استشارة محامٍ متخصص. ';
  }

  /* ===== Clarification ===== */
  function generateClarification(query, intent){
    var parts = [];
    var template = CLARIFICATION_TEMPLATES[intent];

    if(template){
      parts.push({ type: 'clarification', text: template });
    } else {
      parts.push({ type: 'clarification', text: 'سؤالك مهم، لكن أحتاج بعض التوضيحات لأتمكن من تقديم إجابة دقيقة. هل يمكنك تحديد الموضوع القانوني بوضوح أكثر؟ مثلاً: هل يتعلق الأمر بالزواج، العقود، الجرائم، أم شيء آخر؟' });
    }

    parts.push({ type: 'suggestions', items: getGenericSuggestions() });
    return parts;
  }

  /* ===== Build Analysis ===== */
  function buildAnalysis(query, results, lawGroups, intent){
    var analysis = '';
    var lawNames = Object.keys(lawGroups);

    /* Mention the main law */
    if(lawNames.length === 1){
      analysis += 'وفقاً لـ' + lawNames[0] + '، ';
    } else if(lawNames.length > 1){
      analysis += 'القانون اليمني يعالج هذه المسألة من عدة جوانب، ';
    }

    /* Extract key article texts and weave them into analysis */
    var keyArticles = results.filter(function(r){ return r.doc.type === 'article'; }).slice(0, 4);
    if(keyArticles.length){
      for(var i = 0; i < keyArticles.length; i++){
        var art = keyArticles[i].doc;
        var text = (art.text || '').replace(/^\s*[:\-\s]+/, '').trim();
        if(text.length > 20){
          if(i === 0){
            analysis += 'تنص المادة (' + art.articleNumber + ') على أن "' + truncate(text, 200) + '". ';
          } else {
            analysis += 'كما توضح المادة (' + art.articleNumber + ') أن "' + truncate(text, 150) + '". ';
          }
        }
      }
    }

    /* Add intent-specific analysis */
    var topicAnalysis = getTopicAnalysis(intent, results);
    if(topicAnalysis) analysis += topicAnalysis;

    return analysis;
  }

  function getTopicAnalysis(intent, results){
    var analyses = {
      'divorce': 'الطلاق في القانون اليمني يكون إما بطلب من الزوج (الطلاق الرجعي أو البائن) أو بطلب من الزوجة (الخلع أو التفويض). يترتب على الطلاق آثار قانونية تشمل العدة والنفقة خلالها وحضانة الأطفال.',
      'maintenance': 'النفقة حق ثابت للزوجة والأولاد، يحدد قدرها المحكمة بناءً على حالة الزوج المالية ومستوى المعيشة. تشمل النفقة: المسكن والطعام والكساء والعلاج.',
      'custody': 'الحضانة حق للصغير وليس حقاً للأم أو الأب، وتُعطى لأولى الأهلية وفق ترتيب شرعي. تنتهي الحضانة ببلوغ الطفل سن معينة.',
      'inheritance': 'الميراث يخضع لأحكام الشريعة الإسلامية مع تفصيلات دقيقة في القانون اليمني. يشترط لاستحقاق الإرث: حياة المورث عند موت المورث، ووجود سبب الإرث (قرابة أو زواج أو ولاء).',
      'sale': 'عقد البيع ينعقد بالإيجاب والقبول شريطة توفر الأهلية وخلو المحل من العيوب. يترتب عليه نقل الملكية من البائع إلى المشتري.',
      'rental': 'عقد الإيجار يلتزم فيه المؤجر بتسليم المنفعة سليمة والمستأجر بدفع الأجرة في مواعيدها. يحدد القانون حالات الفسخ والإخلاء.',
      'theft': 'عقوبة السرقة في القانون اليمني تختلف حسب نوعها: السرقة الحدية (قطع اليد) تشترط شروطاً محددة، والسرقة التعزيرية يعاقب عليها بالسجن والغرامة.',
      'labor': 'قانون العمل يحمي العامل من الفصل التعسفي ويضمن له حقوقاً تشمل: الأجر العادل، الإجازات، التأمين، وتعويضات نهاية الخدمة.',
      'filing': 'رفع الدعوى يتم بتقديم عريضة تتضمن بيانات الأطراف و موضوع الدعوى والأدلة، ثم تُحال للمحكمة المختصة لتحديد جلسة.',
      'penalty': 'عقوبات القانون اليمني تشمل الحدود الشرعية (القصاص، الحدود) والتعزير (السجن، الغرامة). تختلف حسب الجريمة وظروفها.'
    };
    return analyses[intent] || '';
  }

  /* ===== Build Citations ===== */
  function buildCitations(results){
    var citations = [];
    var seen = {};
    var articles = results.filter(function(r){ return r.doc.type === 'article'; });
    for(var i = 0; i < articles.length && citations.length < 5; i++){
      var doc = articles[i].doc;
      var key = doc.lawSlug + ':' + doc.articleNumber;
      if(!seen[key]){
        seen[key] = true;
        citations.push({
          lawTitle: doc.lawTitle,
          articleNumber: doc.articleNumber,
          text: truncate(doc.text || '', 180),
          url: doc.url
        });
      }
    }
    return citations;
  }

  /* ===== Build Practical ===== */
  function buildPractical(query, intent, results){
    var practicals = {
      'filing': 'عملياً، لرفع دعوى في اليمن: 1) حضر العريضة مع المستندات. 2) سدد الرسوم القضائية. 3) قدّمها لكتابة الضبط. 4) حدد المحكمة المختصة. 5) احضر الجلسات.',
      'divorce': 'عملياً: 1) يمكن للزوج تطليق زوجته باللفظ الشرعي. 2) للزوجة رفع دعوى خلع أو فسخ. 3) يُنصح بتوثيق الطلاق رسمياً. 4) راجع محامٍ لتحديد الحقوق.',
      'inheritance': 'عملياً: 1) حصر التركة. 2) سداد ديون المتوفى. 3) تنفيذ الوصية (ثلث التركة). 4) تقسيم الباقي على الورثة وفق الفرائض.',
      'labor': 'عملياً: 1) وثّق علاقتك بالعمل (عقد، كشوف رواتب). 2) عند الفصل، تقدم بشكوى لوزارة العمل. 3) يمكنك رفع دعوى أمام محكمة العمل.',
      'rental': 'عملياً: 1) راجع عقد الإيجار. 2) أرسل إنذاراً رسمياً. 3) عند عدم الاستجابة، رفع دعوى أمام المحكمة.'
    };
    return practicals[intent] || null;
  }

  /* ===== Build Exceptions ===== */
  function buildExceptions(results, intent){
    var exceptions = {
      'divorce': '\Exceptions: الطلاق أثناء الحامل لا يصح في بعض المذاهب. العدة تختلف حسب الحالة (حامل، حائل، متوفى زوجها).',
      'inheritance': 'استثناءات: من قتل مورثه عمداً لا يرثه. الكافر لا يرث المسلم. العبد لا يرث.',
      'theft': 'شروط حد السرقة: أن يكون المسروق مالاً محترماً، وأن يكون في حرز، وأن يبلغ النصاب، وأن لا يكون هناك شبهة.',
      'custody': 'Exceptions: تنتهي حضانة الأم إذا تزوجت من شخص غير محرم للصغير، أو إذا انتقلت إلى بلد آخر.'
    };
    return exceptions[intent] || null;
  }

  /* ===== Build Suggestions ===== */
  function buildSuggestions(intent, query){
    var suggestionMap = {
      'divorce': ['ما حقوق الزوجة بعد الطلاق؟', 'كيف أحصل على حضانة أطفالي؟', 'ما المدة القانونية للعدة؟'],
      'maintenance': ['كم مقدار النفقة القانونية؟', 'ما حكم تأخر الزوج عن دفع النفقة؟', 'هل للأبناء حق في نفقة مطلقة؟'],
      'custody': ['إلى أي عمر تبقى الحضانة للأم؟', 'هل يحق للأب زيارة أطفاله؟', 'ما حكم حضانة الطفل بعد زواج الأم؟'],
      'inheritance': ['كيف يُقسم الإرث على الورثة؟', 'ما نصيب الزوجة من الميراث؟', 'هل الوصية تُنفذ قبل التقسيم؟'],
      'sale': ['ما شروط صحة عقد البيع؟', 'كيف أحمي مشتري عقار؟', 'ما حكم البيع بالتقسيط؟'],
      'rental': ['ما حقوق المستأجر عند الإخلاء؟', 'كيف أرفع دعوى إخلاء؟', 'هل يحق للمؤجر زيادة الإيجار؟'],
      'theft': ['ما الفرق بين السرقة الحدية والتعزيرية؟', 'ما عقوبة السرقة المتكررة؟', 'كيف أثبت جريمة السرقة؟'],
      'labor': ['ما تعويضات الفصل التعسفي؟', 'كم ساعة العمل القانونية؟', 'ما حقوق العامل في الإجازة؟'],
      'filing': ['ما رسوم رفع الدعوى؟', 'كم تستغرق الدعوى القضائية؟', 'كيف اختار المحكمة المختصة؟'],
      'penalty': ['ما الفرق بين الحد والتعزير؟', 'هل يمكن العفو عن العقوبة؟', 'ما شروط القصاص؟']
    };
    return suggestionMap[intent] || ['ما هي حقوق المواطن اليمني؟', 'كيف أستشير محامياً؟', 'ما أحدث التعديلات القانونية؟'];
  }

  function getGenericSuggestions(){
    return ['أريد معرفة حقوق الزوجة', 'كيف أرفع دعوى مدنية؟', 'ما عقوبة السرقة؟', 'كيف أقسم الميراث؟'];
  }

  /* ===== Helpers ===== */
  function groupByLaw(results){
    var groups = {};
    for(var i = 0; i < results.length; i++){
      var name = results[i].doc.lawTitle || 'أخرى';
      if(!groups[name]) groups[name] = [];
      groups[name].push(results[i]);
    }
    return groups;
  }

  function calcConfidence(results){
    if(!results.length) return 'low';
    var top = results[0].score;
    if(top > 30 && results.length >= 3) return 'high';
    if(top > 10) return 'medium';
    return 'low';
  }

  function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }
  function truncate(text, limit){ var s = String(text||'').replace(/\s+/g,' ').trim(); return s.length <= limit ? s : s.slice(0,limit).trim() + '...'; }

  /* ===== Format for Display (Markdown) ===== */
  function toMarkdown(parts){
    var md = '';
    for(var i = 0; i < parts.length; i++){
      var p = parts[i];
      switch(p.type){
        case 'intro':
        case 'analysis':
        case 'practical':
          md += p.text + '\n\n';
          break;
        case 'clarification':
          md += '> 💬 **سؤال توضيحي:** ' + p.text + '\n\n';
          break;
        case 'citations':
          md += '---\n\n### 📜 النصوص القانونية\n\n';
          for(var c = 0; c < p.items.length; c++){
            var item = p.items[c];
            md += '> **المادة (' + item.articleNumber + ')** — ' + item.lawTitle + '\n>';
            md += '> \n> ' + item.text + '\n>';
            md += '> \n> [🔗 عرض المادة](' + item.url + ')\n\n';
          }
          break;
        case 'exceptions':
          md += '### ⚠️ استثناءات مهمة\n\n' + p.text + '\n\n';
          break;
        case 'confidence':
          var conf = { high: '✅ **مستوى الثقة:** مرتفع — الإجابة مبنية على نصوص قانونية واضحة', medium: '⚠️ **مستوى الثقة:** متوسط — يُنصح بالرجوع لمحامٍ متخصص', low: '⚠️ **مستوى الثقة:** منخفض — لم أجد نصاً كافياً، يُنصح بمراجعة مصادر رسمية' };
          md += '---\n\n' + conf[p.level] + '\n\n';
          md += '*⚖️ تنبيه: هذه الاستشارة لأغراض إعلامية ولا تغني عن محامٍ متخصص.*\n\n';
          break;
        case 'suggestions':
          md += '### 💡 أسئلة مقترحة\n\n';
          for(var s = 0; s < p.items.length; s++){
            md += '- ' + p.items[s] + '\n';
          }
          md += '\n';
          break;
      }
    }
    return md;
  }

  /* ===== Reset ===== */
  function reset(){
    conversation = { history: [], lastTopic: null, lastLaw: null, lastArticles: [], lastIntent: null, turnCount: 0 };
  }

  function getConversation(){ return conversation; }

  /* ===== Public API ===== */
  global.LegalResponse = {
    generate: generate,
    toMarkdown: toMarkdown,
    reset: reset,
    getConversation: getConversation
  };

})(window);
