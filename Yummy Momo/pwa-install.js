/* Register the existing worker without requesting notification permission.
 * Keep the same URL used by background-alerts.js; do not replace push handlers.
 * No orders, menu data, credentials or API responses are cached here.
 */
(() => {
  'use strict';
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js?v=yummy-39', location.href), {
      scope: new URL('./', location.href).pathname
    }).catch(error => console.warn('Yummy Momo service worker registration failed:', error));
  }, { once: true });
})();
