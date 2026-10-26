/* Launch food only AFTER a confirmed cloud order. Optional presentation, never order logic. */
'use strict';
window.OrderCelebration=(()=>{
 const seen=new Set();let timer=null,onDone=null,tracked=false;
 const storageKey='RESTAURANT_ORDER_CELEBRATIONS_v1';
 try{const rows=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(rows))rows.slice(-100).forEach(id=>seen.add(id));}catch{}
 const dialog=()=>document.getElementById('orderCelebration');
 const safely=fn=>{try{fn?.();}catch{}};
 function finish(){
  clearTimeout(timer);timer=null;
  document.getElementById('celebrationParticles')?.replaceChildren();
  const callback=onDone;onDone=null;
  if(document.getElementById('trackingModal')?.classList.contains('open'))document.querySelector('#trackingModal .btn-close-drawer')?.focus({preventScroll:true});
  safely(()=>callback?.(tracked));
 }
 function close(){const d=dialog();if(d?.open)d.close();}
 function launch(){document.getElementById('celebrationParticles')?.replaceChildren();}
 function show(orderId,callback){
  const d=dialog();
  if(!orderId||seen.has(orderId)||!d||typeof d.showModal!=='function'){safely(()=>callback?.(false));return false;}
  try{
   clearTimeout(timer);tracked=false;onDone=callback;if(!d.open)d.showModal();launch();
   seen.add(orderId);try{sessionStorage.setItem(storageKey,JSON.stringify([...seen].slice(-100)));}catch{}
   // Wait for Track my order or dismissal; animation itself remains brief.
   return true;
  }catch{if(d.open)d.close();else finish();return false;}
 }
 const d=dialog();
 if(d){d.addEventListener('close',()=>{if(!d.open)finish();});d.addEventListener('click',e=>{if(e.target===d)close();});document.getElementById('celebrationTrackButton')?.addEventListener('click',()=>{tracked=true;close();});}
 return {show,close};
})();
