/**
 * المستشار اليمني القانوني — Monitoring & Error Tracking
 * Lightweight client-side monitoring
 */
(function(global){
  'use strict';

  var MONITOR_KEY = 'advisor_monitor';
  var MAX_ERRORS = 50;
  var MAX_PERF = 100;

  /* ===== Error Tracking ===== */
  function logError(type, message, source, lineno){
    var errors = getErrors();
    errors.push({
      type: type,
      message: String(message || '').slice(0, 500),
      source: String(source || '').slice(0, 200),
      line: lineno || 0,
      url: location.href,
      ts: Date.now()
    });
    if(errors.length > MAX_ERRORS) errors = errors.slice(-MAX_ERRORS);
    saveData('errors', errors);
  }

  function getErrors(){
    return getData('errors') || [];
  }

  /* ===== Performance Tracking ===== */
  function logPerformance(metric, value){
    var perf = getData('perf') || [];
    perf.push({
      metric: metric,
      value: value,
      url: location.href,
      ts: Date.now()
    });
    if(perf.length > MAX_PERF) perf = perf.slice(-MAX_PERF);
    saveData('perf', perf);
  }

  function getPerformance(){
    return getData('perf') || [];
  }

  /* ===== Page Load Metrics ===== */
  function capturePageLoad(){
    if(!window.performance || !window.performance.timing) return;
    var t = window.performance.timing;
    var metrics = {
      dns: t.domainLookupEnd - t.domainLookupStart,
      tcp: t.connectEnd - t.connectStart,
      ttfb: t.responseStart - t.requestStart,
      download: t.responseEnd - t.responseStart,
      domReady: t.domContentLoadedEventEnd - t.navigationStart,
      fullLoad: t.loadEventEnd - t.navigationStart
    };
    logPerformance('pageLoad', metrics);
    return metrics;
  }

  /* ===== Storage ===== */
  function saveData(key, data){
    try {
      var stored = JSON.parse(localStorage.getItem(MONITOR_KEY) || '{}');
      stored[key] = data;
      localStorage.setItem(MONITOR_KEY, JSON.stringify(stored));
    } catch(e){}
  }

  function getData(key){
    try {
      var stored = JSON.parse(localStorage.getItem(MONITOR_KEY) || '{}');
      return stored[key];
    } catch(e){ return null; }
  }

  /* ===== Global Error Handler ===== */
  function init(){
    window.addEventListener('error', function(e){
      logError('js_error', e.message, e.filename, e.lineno);
    });

    window.addEventListener('unhandledrejection', function(e){
      logError('promise_rejection', String(e.reason), '', 0);
    });

    /* Capture page load metrics after load */
    if(document.readyState === 'complete'){
      setTimeout(capturePageLoad, 100);
    } else {
      window.addEventListener('load', function(){ setTimeout(capturePageLoad, 100); });
    }
  }

  /* ===== Public API ===== */
  global.Monitor = {
    logError: logError,
    getErrors: getErrors,
    logPerformance: logPerformance,
    getPerformance: getPerformance,
    capturePageLoad: capturePageLoad,
    getSummary: function(){
      return {
        errors: getErrors().length,
        recentErrors: getErrors().slice(-5),
        perf: getPerformance().slice(-10)
      };
    }
  };

  init();

})(window);
