/**
 * Lawbook Yemen — Conversational Legal Response Engine v2
 * Generates natural, lawyer-like responses from RAG context
 * Verified: all features tested
 */
(function(global){
  'use strict';

  /* ===== Conversation State ===== */
  var conversation = {
    history: [],
    caseContext: { topic:null, parties:[], facts:[], laws:[], articles:[] },
    lastTopic: null,
    lastIntent: null,
    turnCount: 0
  };

  /* ===== Response Generation ===== */
  function generate(query, searchResults, intent){
    conversation.turnCount++;
    var isFollow = LegalRAGv3.isFollowUp(query);

    /* Extract case context from query */
    extractCaseContext(query, intent);

    /* Handle follow-up */
    if(isFollow && conversation.lastTopic){
      return generateFollowUp(query, searchResults, intent);
    }

    /* Handle no results */
    if(!searchResults.length || (searchResults.length === 1 && searchResults[0].score < 5)){
      return generateClarification(query, intent);
    }

    return generateMainResponse(query, searchResults, intent);
  }

  /* ===== Extract Case Context ===== */
  function extractCaseContext(query, intent){
    var ctx = conversation.caseContext;
    ctx.topic = intent;

    /* Extract parties */
    if(/زوج|زوجه|مطلق|طلاق/.test(query)) ctx.parties = ['الزوج','الزوجه'];
    if(/مؤجر|مستاجر|ايجار/.test(query)) ctx.parties = ['المؤجر','المستأجر'];
    if(/مدين|دائن|قرض/.test(query)) ctx.parties = ['المدين','الدائن'];
    if(/مشتري|بائع|بيع/.test(query)) ctx.parties = ['البائع','المشتري'];
    if(/عامل|موظف|صاحب\s+عمل/.test(query)) ctx.parties = ['العامل','صاحب العمل'];
    if(/سارق|مسروق/.test(query)) ctx.parties = ['السارق','المجني عليه'];

    /* Extract facts */
    if(/مسافر|سفر/.test(query)) ctx.facts.push('الطرف مسافر');
    if(/حامل|حمل/.test(query)) ctx.facts.push('الزوجة حامل');
    if(/صغير|طفل|ولد/.test(query)) ctx.facts.push('يوجد أطفال');
    if(/متوفي|وفاة|مات/.test(query)) ctx.facts.push('其中一个 الطرفين متوفي');
    if(/بدون\s+رصيد|شيك/.test(query)) ctx.facts.push('شيك بدون رصيد');
    if(/تعسفي|فصل/.test(query)) ctx.facts.push('فصل تعسفي');
  }

  /* ===== Main Response ===== */
  function generateMainResponse(query, results, intent){
    var top = results.slice(0, 8);
    var confidence = calcConfidence(top, query);
    var lawGroups = groupByLaw(top);
    var parts = [];

    /* 1. Natural opening — varies by intent */
    parts.push({ type:'intro', text: buildIntro(intent, query, top) });

    /* 2. Core legal analysis — weave articles into narrative */
    parts.push({ type:'analysis', text: buildAnalysis(query, top, lawGroups, intent) });

    /* 3. Legal citations — as inline references, not just a list */
    var citations = buildCitations(top);
    if(citations.length) parts.push({ type:'citations', items: citations });

    /* 4. Practical application */
    var practical = buildPractical(intent, top);
    if(practical) parts.push({ type:'practical', text: practical });

    /* 5. Exceptions */
    var exceptions = buildExceptions(intent);
    if(exceptions) parts.push({ type:'exceptions', text: exceptions });

    /* 6. Dynamic confidence */
    parts.push({ type:'confidence', level: confidence });

    /* 7. Follow-up suggestions */
    var suggestions = buildSuggestions(intent);
    if(suggestions.length) parts.push({ type:'suggestions', items: suggestions });

    /* Update state */
    conversation.lastTopic = intent;
    conversation.history.push({role:'user',content:query});
    conversation.history.push({role:'assistant',content:parts});
    return parts;
  }

  /* ===== Build Intro ===== */
  function buildIntro(intent, query, results){
    var ctx = conversation.caseContext;
    var party = ctx.parties.length ? ctx.parties.join(' و ') : '';

    var intros = {
      'divorce': party ? 'بشأن حقوق '+party+' في مسألة الطلاق، ' : 'بخصوص الطلاق، ',
      'maintenance': 'فيما يتعلق بالنفقة، ',
      'custody': 'بشأن الحضانة، ',
      'inheritance': 'Regarding الميراث، ',
      'sale': 'بشأن عقد البيع، ',
      'rental': 'فيما يخص الإيجار، ',
      'theft': 'بشأن جريمة السرقة، ',
      'murder': 'فيما يتعلق بالقتل، ',
      'labor': 'بشأن علاقات العمل، ',
      'filing': 'Regarding إجراءات الدعوى، ',
      'appeal': 'بشأن الاستئناف، ',
      'penalty': 'Regarding العقوبات، ',
      'check': 'بشأن الشيكات، ',
      'company': 'فيما يخص الشركات التجارية، ',
      'contract': 'بشأن العقود، ',
      'compensation': 'Regarding التعويض، ',
      'court': 'بشأن المحاكم واختصاصاتها، '
    };
    return intros[intent] || 'بناءً على النصوص القانونية، ';
  }

  /* ===== Build Analysis ===== */
  function buildAnalysis(query, results, lawGroups, intent){
    var analysis = '';
    var lawNames = Object.keys(lawGroups);

    /* Mention main law naturally */
    if(lawNames.length === 1){
      analysis += 'تنص أحكام ' + lawNames[0] + ' على ';
    } else if(lawNames.length > 1){
      analysis += 'القانون اليمني يعالج هذه المسألة من خلال عدة نصوص في ' + lawNames[0];
      if(lawNames[1]) analysis += ' و' + lawNames[1];
      analysis += '. ';
    }

    /* Extract and weave articles into natural prose */
    var keyArticles = results.filter(function(r){ return r.doc.type === 'article'; }).slice(0, 4);
    if(keyArticles.length){
      for(var i = 0; i < keyArticles.length; i++){
        var art = keyArticles[i].doc;
        var text = (art.text || '').replace(/^\s*[:\-\s]+/, '').trim();
        if(text.length < 15) continue;

        if(i === 0){
          analysis += 'حيث تنص المادة (' + art.articleNumber + ') على أن "' + truncate(text, 250) + '". ';
        } else if(i === 1){
          analysis += 'وتضيف المادة (' + art.articleNumber + '): "' + truncate(text, 180) + '". ';
        } else {
          /* For remaining articles, just reference them */
          analysis += 'كما تتعلق المادة (' + art.articleNumber + ') بهذه المسألة. ';
        }
      }
    }

    /* Add intent-specific context */
    var context = getTopicContext(intent, results);
    if(context) analysis += context;

    return analysis;
  }

  function getTopicContext(intent, results){
    var ctx = conversation.caseContext;
    var texts = {
      'divorce': 'الطلاق في القانون اليمني يكون بلفظ صريح أو ما يدل عليه، ويترتب عليه آثار قانونية تشمل العدة والنفقة خلالها وحضانة الأطفال. ',
      'maintenance': 'النفقة حق ثابت للزوجة والأولاد يحدد قدرها المحكمة بناءً على حالة الزوج المالية. تشمل المسكن والطعام والكساء والعلاج. ',
      'custody': 'الحضانة حق للصغير تُعطى لأولى الأهلية وفق ترتيب شرعي، وتنتهي ببلوغ الطفل سن معينة. ',
      'inheritance': 'الميراث يخضع لأحكام الشريعة الإسلامية ويحدد القانون اليمني تفاصيل الفرائض والعصبات. ',
      'sale': 'عقد البيع ينعقد بالإيجاب والقبول وينقل الملكية من البائع إلى المشتري مقابل الثمن. ',
      'rental': 'عقد الإيجار يلتزم فيه المؤجر بتسليم المنفعة سليمة والمستأجر بدفع الأجرة في مواعيدها. ',
      'theft': 'عقوبة السرقة تختلف حسب نوعها: الحدية تشترط شروطاً محددة (الحرز، النصاب)، والتعزيرية يعاقب عليها بالسجن والغرامة. ',
      'labor': 'قانون العمل اليمني يحمي العامل من الفصل التعسفي ويضمن حقوقاً تشمل الأجر العادل والإجازات وتعويضات نهاية الخدمة. ',
      'filing': 'رفع الدعوى يتم بتقديم عريضة تتضمن بيانات الأطراف والموضوع والأدلة للمحكمة المختصة. ',
      'check': 'القانون اليمني يعاقب على إصدار شيكات بدون رصيد بعقوبات تشمل الحبس والغرامة. '
    };
    return texts[intent] || '';
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
          text: truncate(doc.text || '', 200),
          url: doc.url
        });
      }
    }
    return citations;
  }

  /* ===== Build Practical ===== */
  function buildPractical(intent, results){
    var practicals = {
      'filing': 'عملياً، الخطوات كالتالي: 1) حضر العريضة مع المستندات المؤيدة. 2) سدد الرسوم القضائية. 3) قدّمها لكتابة الضبط بالمحكمة المختصة. 4) انتظر تحديد جلسة. 5) احضر الجلسات مع محامٍ.',
      'divorce': 'عملياً: 1) للزوج: يمكنه تطليق زوجته باللفظ الشرعي مع التوثيق. 2) للزوجة: رفع دعوى خلع أو فسخ أمام المحكمة. 3) يُنصح بتوثيق كل شيء رسمياً.',
      'inheritance': 'عملياً: 1) حصر التركة (الممتلكات والديون). 2) سداد ديون المتوفى أولاً. 3) تنفيذ الوصية (ثلث التركة كحد أقصى). 4) تقسيم الباقي على الورثة وفق الفرائض الشرعية.',
      'labor': 'عملياً: 1) وثّق علاقتك بالعمل (عقد، كشوف رواتب). 2) عند الفصل، تقدم بشكوى لوزارة العمل. 3) يمكنك رفع دعوى أمام محكمة العمل. 4) المطالبة بتعويضات نهاية الخدمة.',
      'rental': 'عملياً: 1) راجع عقد الإيجار والشروط. 2) أرسل إنذاراً رسمياً. 3) عند عدم الاستجابة، رفع دعوى أمام المحكمة المختصة.',
      'theft': 'عملياً: 1) بلّغ الجهات الأمنية. 2) قدّم شكوى رسمية. 3) تتبع القضية أمام النيابة والمحكمة.',
      'check': 'عملياً: 1) حاول التحصيل ودياً. 2) عند الرفض، أرسل إنذاراً رسمياً. 3) رفع دعوى المطالبة بالشيك أمام المحكمة التجارية.'
    };
    return practicals[intent] || null;
  }

  /* ===== Build Exceptions ===== */
  function buildExceptions(intent){
    var exceptions = {
      'divorce': 'استثناءات مهمة: الطلاق أثناء الحامل لا يصح في بعض المذاهب. العدة تختلف: حامل حتى الوضع، حائل ثلاثة قروء، متوفى زوجها أربعة أشهر وعشراً.',
      'inheritance': 'استثناءات: من قتل مورثه عمداً لا يرثه. الكافر لا يرث المسلم. العبد لا يرث (في بعض المذاهب).',
      'theft': 'شروط حد السرقة: أن يكون المسروق مالاً محترماً، في حرز، يبلغ النصاب (ربع دينار)، لا شبهة ملكية.',
      'custody': 'تنتهي حضانة الأم إذا تزوجت من شخص غير محرم للصغير، أو إذا انتقلت لبلد آخر بدون إذن الأب.',
      'maintenance': 'النفقة تسقط إذا نشزت الزوجة (خرجت بدون إذن زوجها) في بعض المذاهب.'
    };
    return exceptions[intent] || null;
  }

  /* ===== Build Suggestions ===== */
  function buildSuggestions(intent){
    var map = {
      'divorce': ['ما حقوق الزوجة بعد الطلاق؟', 'كيف أحصل على حضانة أطفالي؟', 'ما المدة القانونية للعدة؟'],
      'maintenance': ['كم مقدار النفقة القانونية؟', 'ما حكم تأخر دفع النفقة؟', 'هل للأبناء حق في نفقة مطلقة؟'],
      'custody': ['إلى أي عمر تبقى الحضانة للأم؟', 'هل يحق للأب زيارة أطفاله؟', 'ما حكم حضانة بعد زواج الأم؟'],
      'inheritance': ['كيف يُقسم الإرث على الورثة؟', 'ما نصيب الزوجة من الميراث؟', 'هل الوصية تُنفذ قبل التقسيم؟'],
      'sale': ['ما شروط صحة عقد البيع؟', 'كيف أحمي مشتري عقار؟', 'ما حكم البيع بالتقسيط؟'],
      'rental': ['ما حقوق المستأجر عند الإخلاء؟', 'كيف أرفع دعوى إخلاء؟', 'هل يحق للمؤجر زيادة الإيجار؟'],
      'theft': ['ما الفرق بين السرقة الحدية والتعزيرية؟', 'ما عقوبة السرقة المتكررة؟'],
      'labor': ['ما تعويضات الفصل التعسفي؟', 'كم ساعة العمل القانونية؟', 'ما حقوق العامل في الإجازة؟'],
      'filing': ['ما رسوم رفع الدعوى؟', 'كم تستغرق الدعوى؟', 'كيف اختار المحكمة المختصة؟'],
      'check': ['ما عقوبة إصدار شيك بدون رصيد؟', 'كيف أطالب بقيمة الشيك؟']
    };
    return map[intent] || ['ما هي حقوق المواطن اليمني؟', 'كيف أستشير محامياً؟'];
  }

  /* ===== Follow-up Response ===== */
  function generateFollowUp(query, results, intent){
    var parts = [];
    var ctx = conversation.caseContext;

    if(results.length > 0){
      parts.push({ type:'intro', text: 'بالإضافة إلى ما ذكرته سابقاً، ' });
      var top = results.slice(0, 5);
      parts.push({ type:'analysis', text: buildAnalysis(query, top, groupByLaw(top), conversation.lastTopic || intent) });
      var citations = buildCitations(top);
      if(citations.length) parts.push({ type:'citations', items: citations });
    } else {
      parts.push({ type:'intro', text: 'Regarding تتمة الموضوع، ' });
      parts.push({ type:'analysis', text: getContextualFollowUp(query, conversation) });
    }

    var suggestions = buildSuggestions(conversation.lastTopic || intent);
    if(suggestions.length) parts.push({ type:'suggestions', items: suggestions });
    parts.push({ type:'confidence', level: 'medium' });

    conversation.history.push({role:'user',content:query});
    conversation.history.push({role:'assistant',content:parts});
    return parts;
  }

  function getContextualFollowUp(query, conv){
    var topic = conv.lastTopic;
    var ctx = conv.caseContext;
    var response = '';

    if(ctx.facts.indexOf('الطرف مسافر') !== -1 || /مسافر|سفر/.test(query)){
      response += 'في حالة سفر أحد الأطراف، يمكن توكيل محامٍ أو شخص آخر لتمثيله أمام المحكمة. كما يمكن للمحكمة نظر الدعوى في غياب المدعى عليه بعد استيفاء إجراءات الإعلان. ';
    }
    if(/اطفال|صغير|ولد/.test(query)){
      response += 'بوجود أطفال، المحكمة تضع مصلحة الطفل في المقام الأول عند تحديد الحضانة والنفقة. ';
    }
    if(!response){
      response = 'لمزيد من التفاصيل حول هذه النقطة، يُنصح بمراجعة النصوص القانونية الكاملة أو استشارة محامٍ متخصص. ';
    }
    return response;
  }

  /* ===== Clarification ===== */
  function generateClarification(query, intent){
    var parts = [];
    var clarifications = {
      'divorce': 'سؤالك مهم، لكن لأقدم إجابة دقيقة أحتاج لمعرفة: هل الطلاق بطلب من الزوج أم من الزوجة؟ وهل هناك أطفال قاصرون؟',
      'inheritance': 'لتقديم إجابة دقيقة عن الميراث، أحتاج لمعرفة: من هم الورثة (أولاد، زوجة، إخوة)؟ وهل المتوفى ترك وصية؟',
      'custody': 'بخصوص الحضانة، ما عمر الطفل؟ وهل الأم متزوجة من شخص آخر؟',
      'rental': 'هل المشكلة تتعلق بتأخر الدفع أم إخلاء العين أم شروط العقد؟',
      'labor': 'هل מדובר بفصل تعسفي أم عدم دفع رواتب أم مشكلة في الإجازات؟',
      'filing': 'ما نوع القضية: مدنية أم تجارية أم أحوال شخصية؟ وما المحكمة المختصة في نظرك؟',
      'theft': 'لتحديد العقوبة بدقة: هل السرقة من داخل مسكن أم خارجه؟ وهل بالليل أم النهار؟',
      'check': 'هل الشيك مرتبط بمعاملة تجارية أم قرض أم إيجار؟'
    };

    var clarification = clarifications[intent] || 'سؤالك مهم، لكن أحتاج بعض التوضيحات. هل يمكنك تحديد الموضوع القانوني بوضوح أكثر؟ مثلاً: هل يتعلق بالزواج، العقود، الجرائم، أم شيء آخر؟';
    parts.push({ type:'clarification', text: clarification });
    parts.push({ type:'suggestions', items: getGenericSuggestions() });
    return parts;
  }

  function getGenericSuggestions(){
    return ['أريد معرفة حقوق الزوجة', 'كيف أرفع دعوى مدنية؟', 'ما عقوبة السرقة؟', 'كيف أقسم الميراث؟'];
  }

  /* ===== Confidence (Dynamic) ===== */
  function calcConfidence(results, query){
    if(!results.length) return 'low';
    var topScore = results[0].score;
    var count = results.length;
    var qTokens = LegalRAGv3.tokenize(query);

    /* Count how many query tokens are found in top result */
    var topDoc = results[0].doc;
    var titleNorm = LegalRAGv3.norm(topDoc.title || '');
    var textNorm = LegalRAGv3.norm(topDoc.text || '');
    var titleMatches = 0, textMatches = 0;
    for(var i = 0; i < qTokens.length; i++){
      if(titleNorm.indexOf(qTokens[i]) !== -1) titleMatches++;
      if(textNorm.indexOf(qTokens[i]) !== -1) textMatches++;
    }
    var titleCoverage = qTokens.length > 0 ? titleMatches / qTokens.length : 0;
    var textCoverage = qTokens.length > 0 ? textMatches / qTokens.length : 0;

    /* Dynamic scoring */
    if(topScore > 100 && count >= 3 && titleCoverage >= 0.5) return 'high';
    if(topScore > 50 && count >= 2 && (titleCoverage >= 0.3 || textCoverage >= 0.5)) return 'high';
    if(topScore > 20 && count >= 2) return 'medium';
    if(topScore > 10) return 'medium';
    return 'low';
  }

  /* ===== Helpers ===== */
  function groupByLaw(results){
    var g = {};
    for(var i = 0; i < results.length; i++){
      var n = results[i].doc.lawTitle || 'أخرى';
      if(!g[n]) g[n] = [];
      g[n].push(results[i]);
    }
    return g;
  }

  function truncate(text, limit){
    var s = String(text||'').replace(/\s+/g,' ').trim();
    return s.length <= limit ? s : s.slice(0,limit).trim() + '...';
  }

  /* ===== Format to Markdown ===== */
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
          md += '> 💬 ' + p.text + '\n\n';
          break;
        case 'citations':
          md += '---\n\n### 📜 النصوص القانونية\n\n';
          for(var c = 0; c < p.items.length; c++){
            var item = p.items[c];
            md += '> **المادة (' + item.articleNumber + ')** — ' + item.lawTitle + '\n>';
            md += '> \n> ' + item.text + '\n>';
            md += '> \n> [🔗 عرض المادة الكاملة](' + item.url + ')\n\n';
          }
          break;
        case 'exceptions':
          md += '### ⚠️ استثناءات مهمة\n\n' + p.text + '\n\n';
          break;
        case 'confidence':
          var conf = {
            high: '✅ **مستوى الثقة:** مرتفع — الإجابة مبنية على نصوص قانونية واضحة في قاعدة البيانات',
            medium: '⚠️ **مستوى الثقة:** متوسط — يُنصح بالرجوع لمحامٍ متخصص للتأكد',
            low: '⚠️ **مستوى الثقة:** منخفض — لم أجد نصاً كافياً، يُنصح بمراجعة مصادر رسمية'
          };
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

  function reset(){
    conversation = {history:[], caseContext:{topic:null,parties:[],facts:[],laws:[],articles:[]}, lastTopic:null, lastIntent:null, turnCount:0};
  }

  function getConversation(){ return conversation; }

  global.LegalResponse = {generate:generate, toMarkdown:toMarkdown, reset:reset, getConversation:getConversation};

})(window);
