/**
 * Lawbook Yemen — Legal AI Integration Layer
 * Provides AI-enhanced responses using RAG context
 * Supports: template responses (free) + optional API enhancement
 */
(function(global){
  'use strict';

  /* ===== Conversation Memory ===== */
  var conversationHistory = [];
  var maxHistory = 10;

  /* ===== Generate AI-Enhanced Response ===== */
  function generateAIResponse(query, ragResponse, callback){
    /* Build context from RAG results */
    var context = buildContext(ragResponse);

    /* Try API enhancement if available */
    var apiKey = getApiKey();
    if(apiKey){
      callAPI(query, context, apiKey, function(apiResponse){
        if(apiResponse){
          callback({
            enhanced: true,
            text: apiResponse,
            ragResponse: ragResponse
          });
        } else {
          /* Fallback to template response */
          callback({
            enhanced: false,
            text: null,
            ragResponse: ragResponse
          });
        }
      });
    } else {
      /* Use template-based response */
      callback({
        enhanced: false,
        text: null,
        ragResponse: ragResponse
      });
    }
  }

  /* ===== Build Context for API ===== */
  function buildContext(ragResponse){
    var context = '';
    if(ragResponse.legalTexts.length){
      context += 'النصوص القانونية relevant:\n';
      for(var i = 0; i < ragResponse.legalTexts.length; i++){
        var lt = ragResponse.legalTexts[i];
        context += '- المادة (' + lt.articleNumber + ') من ' + lt.lawTitle + ': ' + lt.text + '\n';
      }
    }
    if(ragResponse.analysis){
      context += '\nالتحليل: ' + ragResponse.analysis + '\n';
    }
    return context;
  }

  /* ===== API Call ===== */
  function callAPI(query, context, apiKey, callback){
    var systemPrompt = buildSystemPrompt();
    var userMessage = 'السؤال: ' + query + '\n\nالسياق القانوني من قاعدة البيانات:\n' + context;

    /* Add conversation history */
    var messages = [{ role: 'system', content: systemPrompt }];
    for(var i = 0; i < conversationHistory.length; i++){
      messages.push(conversationHistory[i]);
    }
    messages.push({ role: 'user', content: userMessage });

    var apiUrl = 'https://api.openai.com/v1/chat/completions';
    var payload = {
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 1500,
      temperature: 0.3
    };

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(payload)
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data.choices && data.choices[0]){
        var response = data.choices[0].message.content;
        /* Update conversation history */
        conversationHistory.push({ role: 'user', content: userMessage });
        conversationHistory.push({ role: 'assistant', content: response });
        if(conversationHistory.length > maxHistory * 2){
          conversationHistory = conversationHistory.slice(-maxHistory * 2);
        }
        callback(response);
      } else {
        callback(null);
      }
    })
    .catch(function(e){
      console.warn('API call failed:', e);
      callback(null);
    });
  }

  /* ===== System Prompt ===== */
  function buildSystemPrompt(){
    return 'أنت المستشار القانوني اليمني، مساعد ذكي متخصص في القانون اليمني.\n\n' +
      'قواعد الإلزامية:\n' +
      '1. استخدم فقط النصوص القانونية المقدمة في السياق.\n' +
      '2. لا تختلق مواد قانونية أو أرقام قوانين.\n' +
      '3. اذكر دائماً رقم المادة واسم القانون.\n' +
      '4. إذا لم تجد نصاً قانونياً، قل ذلك بوضوح.\n' +
      '5. قدم إجابة واضحة ومفصلة.\n' +
      '6. استخدم التنسيق: ملخص، النص القانوني، التحليل، المواد ذات الصلة.\n' +
      '7. أضف مستوى الثقة (مرتفع/متوسط/منخفض).\n' +
      '8. أضف تنبيه أن الإجابة لا تغني عن محامٍ متخصص.\n\n' +
      'الإجابة بالعربية اليمنية المبسطة.';
  }

  /* ===== Get API Key ===== */
  function getApiKey(){
    try {
      return localStorage.getItem('lawbook_api_key') || '';
    } catch(e){
      return '';
    }
  }

  /* ===== Set API Key ===== */
  function setApiKey(key){
    try {
      localStorage.setItem('lawbook_api_key', key);
    } catch(e){}
  }

  /* ===== Clear History ===== */
  function clearHistory(){
    conversationHistory = [];
  }

  /* ===== Get History ===== */
  function getHistory(){
    return conversationHistory.slice();
  }

  /* ===== Public API ===== */
  global.LegalAI = {
    generateAIResponse: generateAIResponse,
    getApiKey: getApiKey,
    setApiKey: setApiKey,
    clearHistory: clearHistory,
    getHistory: getHistory
  };

})(window);
