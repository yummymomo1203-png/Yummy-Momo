/* Consent is requested from an explicit setup tap. Remember preferences, never bypass browser rules. */
'use strict';
const BackgroundAlerts=(()=>{
 let role=null,key='',button=null,status=null,busy=false,initialized=false,enabled=false,panel=null,lastCheck=0,suspended=false;
 const seen=new Set(Cloud.read('YUMMY_NOTICE_SEEN_v38',[])),delivered=new Set(),pending=new Set();
 const supported=()=>window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const publicKey=()=>typeof RESTAURANT_PUSH_CONFIG==='undefined'?'':RESTAURANT_PUSH_CONFIG.publicKey||'';
 const preference=()=>AlertDevice.enabled('push-'+role);
 function text(message,error=false){if(status){status.textContent=message;status.dataset.error=String(error);status.hidden=role==='kitchen';}const accountError=document.getElementById('accountAlertError');if(accountError){accountError.textContent=error?message:'';accountError.hidden=!error;}const note=document.getElementById('alertReadyStatus');if(note)note.textContent=message;}
 function paint(){if(!button)return;button.disabled=busy;button.textContent=busy?'Please wait…':enabled?'Notifications on · disable':'Enable notifications';button.setAttribute('aria-pressed',String(enabled));const setup=document.getElementById('enableAllDeviceAlerts');if(setup)setup.disabled=busy;}
 const rpc=(action,subscription)=>Cloud.rpc('restaurant_push_device',{p_kind:role,p_key:role==='waiter'?key:null,p_action:action,p_subscription:subscription},role==='kitchen');
 function decode(v){const raw=atob(v.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
 async function registration(){await navigator.serviceWorker.register(new URL('sw.js?v=yummy-39',location.href),{scope:new URL('./',location.href).pathname});return navigator.serviceWorker.ready;}
 async function existing(){const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href));return reg?await reg.pushManager.getSubscription():null;}
 async function enable(){
  if(!/^[A-Za-z0-9_-]{87}=?$/.test(publicKey()))throw Error('Permission saved. The owner must configure push-config.js and the Supabase push sender for background delivery.');
  const reg=await registration();let sub=await reg.pushManager.getSubscription();
  if(sub){const actual=sub.options.applicationServerKey,expected=decode(publicKey());if(actual&&Array.from(new Uint8Array(actual)).join(',')!==Array.from(expected).join(','))throw Error('The notification key has changed. Reset this site’s notification subscription in browser settings, then enable again.');}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(publicKey())});
  const result=await rpc('enable',sub.toJSON());if(!result.enabled)throw Error('The server did not register this device.');enabled=true;
  await diagnostics();
 }
 async function check(){
  if(busy)return;busy=true;paint();lastCheck=Date.now();
  try{if(!supported())throw Error('Notifications need HTTPS and a supported browser. On iPhone/iPad, install this site on the Home Screen first.');
   if(!preference()){enabled=false;text('Notifications muted on this device. Tap Enable sounds & notifications to turn them back on.');return;}
   if(Notification.permission==='denied')throw Error('Notifications are blocked. Allow this site in browser settings; a website cannot override your decision.');
   if(Notification.permission!=='granted'){text('Alerts are on by default. Tap below to allow notifications and unlock sound. Preferences stay saved; browsers may need a tap after reopening.');return;}
   await enable();
  }catch(e){enabled=false;text(e.message,true);}finally{busy=false;paint();}
 }
 async function setup(){
  if(busy)return;
  for(const k of [role==='waiter'?'waiter':'kitchen',...(role==='kitchen'?['kitchen-orders','notification']:[]),'push-'+role])AlertDevice.set(k,true);
  // Invoke requestPermission before any await: mobile browsers require this direct user gesture.
  let permission;
  try{permission=supported()?Notification.requestPermission():Promise.resolve('unsupported');}catch(e){permission=Promise.reject(e);}
  document.dispatchEvent(new Event('yummy-enable-audio'));busy=true;paint();
  try{const result=await permission;if(result!=='granted')throw Error(result==='denied'?'Notifications blocked. Allow this site in browser settings. Sounds remain enabled.':result==='unsupported'?'Notifications require HTTPS and a supported browser; iOS requires a Home Screen web app.':'Notification permission was not granted. Sounds remain enabled; try again when ready.');await enable();}
  catch(e){enabled=false;text(e.message,true);}finally{busy=false;paint();}
 }
 async function toggle(){if(busy)return;if(!enabled){await setup();return;}busy=true;paint();try{const sub=await existing();if(sub)await rpc('disable',sub.toJSON());AlertDevice.set('push-'+role,false);enabled=false;text('Notifications off on this device. Foreground audio preferences are unchanged.');}catch(e){text('Could not disable notifications: '+e.message,true);}finally{busy=false;paint();}}
 async function disableForSignOut(){suspended=true;if(!supported())return;const sub=await existing();if(sub)await rpc('disable',sub.toJSON());enabled=false;if(panel)panel.hidden=true;paint();}
 function init(kind,privateKey=''){
  suspended=false;if(initialized){key=privateKey;if(panel?.hidden){panel.hidden=false;check();}return;}initialized=true;role=kind;key=privateKey;button=document.getElementById('backgroundAlertButton');status=document.getElementById('backgroundAlertStatus');document.getElementById('backgroundAlertPanel').hidden=false;
  panel=document.createElement('section');panel.setAttribute('aria-label','Device alerts setup');
  if(role==='kitchen'){
   panel.className='account-alert-controls';
   panel.innerHTML='<button id="enableAllDeviceAlerts" type="button" class="primary-btn">Enable sounds & notifications</button><p id="accountAlertError" class="hint" role="status" hidden></p><button class="secondary-btn" type="button" data-open-alert-setup>Alert setup / test</button>';
   document.querySelector('#staffAccount .account-menu').prepend(panel);
  }else{
   panel.className='alert-ready-panel';
   panel.innerHTML='<div><strong>Waiter-call alerts</strong><p id="alertReadyStatus" class="hint" role="status">Sounds are on by default. Allow notifications for background alerts.</p></div><button id="enableAllDeviceAlerts" type="button" class="primary-btn">Enable sounds & notifications</button>';
   document.querySelector('main').prepend(panel);
  }
  panel.querySelector('[data-open-alert-setup]')?.addEventListener('click',()=>document.getElementById('alertSetupModal').showModal());
  button.addEventListener('click',toggle);document.getElementById('enableAllDeviceAlerts').addEventListener('click',setup);check();
 }
 function eventKey(kind,id){return kind+':'+id;}
 function remember(id){seen.add(id);try{Cloud.write('YUMMY_NOTICE_SEEN_v38',[...seen].slice(-500));}catch{}}
 async function diagnostics(){
  try{const d=await Cloud.rpc('restaurant_push_diagnostics',{p_kind:role,p_key:role==='waiter'?key:null},role==='kitchen');
   const h=d.sender;let message='Notifications allowed and this device registered. ';
   if(!d.delivery_configured)message+='Background delivery is NOT configured. Owner: complete PUSH/02-enable-delivery.sql and deploy the Release 39 sender. Foreground fallback remains available.';
   else if(!h?.last_run)message+='Sender configuration found, but no successful Release 39 sender run recorded. Send a real test event and check Edge Function logs.';
   else message+='Last sender run: '+new Date(h.last_run).toLocaleString()+'. Provider accepted: '+h.accepted+'; retry: '+h.retry+'; expired subscriptions: '+h.expired+'. This is not proof of delivery to this device. System volume and Do Not Disturb still apply.';
   text(message,!d.delivery_configured);return d;
  }catch(e){text('Device registered, but delivery diagnostics failed: '+e.message+'. Run YUMMY-MOMO-39.sql and deploy the sender.',true);return null;}
 }
 async function notifyRows(kind,rows){
  if(!initialized||suspended||!preference()||!supported()||Notification.permission!=='granted')return;
  const notices=(rows||[]).filter(r=>kind==='stock'||kind==='security'?!r.read_at:r.status==='Pending'&&!r.on_the_way_at);
  for(const r of notices.slice(-20)){
   if(kind==='request'&&role==='kitchen'&&(r.request_kind==='Reception'||['COUNTER','RECEPTION'].includes(r.table_number)))continue;
   const id=eventKey(kind,r.id);if(seen.has(id)||pending.has(id))continue;pending.add(id);
   // Give the server time to send; SW reports observed pushes to avoid a duplicate fallback.
   setTimeout(async()=>{try{
    if(delivered.has(id)){remember(id);return;}
    if(suspended||!preference()||!supported()||Notification.permission!=='granted')return;
    const reg=await registration();let title,body,screen='requests';
    if(kind==='order'){title='New order · '+Cloud.tableName(r.table_number);body=Cloud.orderLabel(r)+' · Open Pending Orders to accept.';screen='orders';}
    else if(kind==='stock'){title='Low stock · '+r.dish_name;body=r.remaining+' of '+r.baseline+' left. Check Stocks.';screen='notifications';}
    else if(kind==='security'){title='Blocked browser scanned · '+Cloud.tableName(r.table_number);body='Open Notifications to review this QR scan.';screen='notifications';}
    else{title=r.request_kind==='ReservedScan'?'Reserved table QR opened · '+Cloud.tableName(r.table_number):'Waiter requested · '+(r.request_kind==='Reception'?'Counter':Cloud.tableName(r.table_number));body='Open Requests to respond.';}
    await reg.showNotification(title,{body,tag:'restaurant-event-'+kind+'-'+r.id,silent:false,renotify:false,requireInteraction:true,vibrate:[500,150,500],data:{kind:role,screen}});remember(id);
   }catch(e){text('Foreground notification failed: '+e.message,true);}finally{pending.delete(id);}},enabled?6500:0);
  }
 }
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='restaurant-push-delivered'&&e.data.kind===role){const id=e.data.event_key;delivered.add(id);remember(id);if(delivered.size>500)delivered.delete(delivered.values().next().value);}});
 async function test(){const target=document.getElementById('notificationTestStatus');try{if(!supported()||Notification.permission!=='granted')throw Error('Tap Enable sounds & notifications and allow notifications first.');const reg=await registration();await reg.showNotification('Yummy Momo · Alert test',{body:'Local display/sound test only. Background delivery requires the configured server sender.',tag:'restaurant-local-test',renotify:true,silent:false,requireInteraction:true,vibrate:[500,150,500],data:{kind:role,screen:'requests'}});if(target)target.textContent='Test sent. Check OS notification volume and Do Not Disturb if silent. This does not verify server delivery.';}catch(e){if(target)target.textContent=e.message;else text(e.message,true);}}
 document.addEventListener('visibilitychange',()=>{if(initialized&&!document.hidden&&Date.now()-lastCheck>300000)check();});
 return {init,setup,toggle,disableForSignOut,test,notifyRows,diagnostics,suspend(){suspended=true;if(panel)panel.hidden=true;},get enabled(){return enabled;}};
})();
