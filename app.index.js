// app.index.js
(function(){
  if (window.__APP_MOUNTED__) return;
  window.__APP_MOUNTED__ = true;

  function start(){ window.App.mount(window.App.AppRoot); }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
