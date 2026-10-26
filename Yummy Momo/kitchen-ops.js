'use strict';
window.KitchenOps=(()=>{
 let desired=false,requesting=false,volumeBusy=false;
 const el=id=>document.getElementById(id),safe=Cloud.esc;
 function init(){
  document.body.classList.toggle('dark-site',Cloud.read('RESTAURANT_DARK_KITCHEN_v26',false)===true);
  el('themeToggle').textContent=document.body.classList.contains('dark-site')?'Use light theme':'Use dark theme';el('staffAccount').hidden=false;el('staffAccountRole').textContent=staffRole==='admin'?'Admin':'Manager';el('kitchenDeviceTools').hidden=false;
  desired=Cloud.read('RESTAURANT_WAKE_DESIRED_v26',false)===true;paintWake();ensureAwake();
 }
 function theme(){const dark=document.body.classList.toggle('dark-site');Cloud.write('RESTAURANT_DARK_KITCHEN_v26',dark);el('themeToggle').textContent=dark?'Use light theme':'Use dark theme';}
 function paintWake(message){const supported='wakeLock' in navigator;el('wakeLockButton').disabled=!supported||requesting;el('wakeLockButton').setAttribute('aria-pressed',String(!!wakeLock&&!wakeLock.released));el('wakeLockButton').textContent=!supported?'Keep awake: unsupported':wakeLock&&!wakeLock.released?'Keep awake: on':desired?'Keep awake: retry':'Keep screen awake';if(message)el('deviceToolsStatus').textContent=message;}
 async function ensureAwake(){
  if(!desired||!loggedIn||requesting||document.visibilityState!=='visible'||!('wakeLock' in navigator)||wakeLock&&!wakeLock.released)return;
  requesting=true;paintWake();
  try{const handle=await navigator.wakeLock.request('screen');if(!desired||!loggedIn){await handle.release();return;}wakeLock=handle;handle.addEventListener('release',()=>{if(wakeLock===handle)wakeLock=null;paintWake(desired?'Wake lock released. Retry when visible.':'Screen wake lock off.');});paintWake('Screen awake: on while visible.');}
  catch(e){paintWake('Keep awake unavailable. Check browser and battery settings.');}finally{requesting=false;paintWake();}
 }
 async function toggleWake(){if(wakeLock&&!wakeLock.released){desired=false;Cloud.write('RESTAURANT_WAKE_DESIRED_v26',false);await wakeLock.release();wakeLock=null;paintWake('Keep-screen-awake disabled.');return;}desired=true;Cloud.write('RESTAURANT_WAKE_DESIRED_v26',true);await ensureAwake();}
 async function stop(){desired=false;Cloud.write('RESTAURANT_WAKE_DESIRED_v26',false);if(wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null;}paintWake();}
 function compactTestStatus(text){
  if(text.includes('Incoming orders'))return 'Testing incoming-order alarm…';
  if(text.includes('Waiter requests'))return 'Testing waiter-request alarm…';
  if(text.includes('Notification alerts'))return 'Testing notification alarm…';
  if(text.includes('stopped'))return 'Alarm test stopped.';
  return 'Alarm test running…';
 }
 async function volumeTest(){
  if(volumeBusy)return;volumeBusy=true;el('volumeTestButton').disabled=true;el('volumeStopButton').hidden=false;
  try{requestRing.pause();orderRing.pause();await RestaurantAlerts.volumeTest(text=>el('deviceToolsStatus').textContent=compactTestStatus(text));if(!document.hidden&&!el('deviceToolsStatus').textContent.includes('stopped'))el('deviceToolsStatus').textContent='Alarm test finished. Check audibility.';}
  catch(e){el('deviceToolsStatus').textContent='Alarm test unavailable. Try again.';}finally{volumeBusy=false;el('volumeTestButton').disabled=false;el('volumeStopButton').hidden=true;}
 }
 return {init,theme,ensureAwake,toggleWake,stop,volumeTest};
})();
