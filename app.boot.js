// app.boot.js (Query-Path + POST-only)
window.App = window.App || {};
(function(App){
  'use strict';

  // --- Event Bus (tiny) ---
  const listeners = {};
  App.on  = (evt, fn) => ((listeners[evt] = listeners[evt] || []).push(fn), () => App.off(evt, fn));
  App.off = (evt, fn) => { const a = listeners[evt] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i,1); };
  App.emit= (evt, payload) => (listeners[evt]||[]).forEach(fn => fn(payload));

  // --- Config ---
  App.API_BASE = App.API_BASE || ''; // exakt die /exec-URL

  // Pfad als Query anhängen: /exec?path=/api/templates
  function buildUrl(path){
    const base = App.API_BASE.replace(/\/$/,'');
    const query = '?path=' + encodeURIComponent(path || '/');
    return base + query;
  }

  // --- HTTP helper: IMMER POST (CORS-safe), text/plain ---
  async function httpPostOnly(path, body){
    const url = buildUrl(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body)),
      redirect: 'manual', // damit 302 sofort sichtbar wird
    });
    // 3xx auf Login erkennen
    if (res.type === 'opaqueredirect' || res.status === 0 || (res.status >= 300 && res.status < 400)) {
      throw new Error('GAS redirect (Check: Web-App öffentlich? Pfadrouting serverseitig?)');
    }
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return txt; }
  }

  App.httpPost = (path, body) => httpPostOnly(path, body);
  App.httpGet  = (path)       => httpPostOnly(path, ''); // Backend ist POST-only

  // Utilities
  App.debounce = (fn, wait=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };
  App.cx = (...parts) => parts.filter(Boolean).join(' ');
})(window.App);
