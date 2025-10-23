// app.boot.js
// Namespace + HTTP helpers (CORS-safe text/plain), event bus, and small utilities.
// Expects React & ReactDOM to be loaded globally.

window.App = window.App || {};
(function(App){
  'use strict';

  // --- Event Bus (tiny) ---
  const listeners = {};
  App.on = (evt, fn) => {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return () => App.off(evt, fn);
  };
  App.off = (evt, fn) => {
    const arr = listeners[evt] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i,1);
  };
  App.emit = (evt, payload) => (listeners[evt]||[]).forEach(fn => fn(payload));

  // --- Config (replace with your own) ---
  App.API_BASE = App.API_BASE || ''; // e.g. '' when path-based on GAS
  App.USER = App.USER || { name: 'Maxi' }; // will be set by login

  // --- HTTP helpers ---
  async function http(method, path, body) {
    const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    const res = await fetch(App.API_BASE + path, {
      method,
      headers,
      body: body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return txt; }
  }
  App.httpGet  = (path) => http('GET',  path);
  App.httpPost = (path, body) => http('POST', path, body);

  // --- Utility: debounce ---
  App.debounce = (fn, wait=300) => {
    let t; 
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  // --- CSS class join ---
  App.cx = (...parts) => parts.filter(Boolean).join(' ');

})(window.App);
