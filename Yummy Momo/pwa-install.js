/* PWA registration + install prompt helper. Never requests notification permission. */
(() => {
  'use strict';
  let deferredPrompt=null;
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches===true||window.navigator.standalone===true;
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();deferredPrompt=event;
    window.dispatchEvent(new CustomEvent('yummy-pwa-install-ready'));
  });
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;window.dispatchEvent(new CustomEvent('yummy-pwa-installed'));});
  window.YummyPWAInstall={
    isStandalone:standalone,
    canPrompt:()=>!!deferredPrompt,
    async prompt(){
      if(standalone())return {installed:true,outcome:'standalone'};
      if(!deferredPrompt)return {installed:false,outcome:'unavailable'};
      const prompt=deferredPrompt;deferredPrompt=null;await prompt.prompt();const choice=await prompt.userChoice;
      return {installed:choice.outcome==='accepted',outcome:choice.outcome};
    }
  };
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js?v=yummy-64', location.href), {
      scope: new URL('./', location.href).pathname
    }).catch(error => console.warn('Waiter service worker registration failed:', error));
  }, { once: true });
})();
