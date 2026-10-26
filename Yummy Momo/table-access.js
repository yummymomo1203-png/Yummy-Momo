'use strict';
const TableAccess=(()=>{
 let visit=null,state=null,offset=0,busy=null,initialized=false,error='',qrKey=null,device=null,validatedAt=0;
 function browserInfo(){return {user_agent:navigator.userAgent,platform:navigator.userAgentData?.platform||navigator.platform||'',language:navigator.language||'',time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone||''};}
 function loadDevice(){const saved=Cloud.read('RESTAURANT_CUSTOMER_DEVICE_v1',null),valid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);if(saved&&valid(saved.id)&&valid(saved.token))return saved;const next={id:crypto.randomUUID(),token:crypto.randomUUID()};Cloud.write('RESTAURANT_CUSTOMER_DEVICE_v1',next);return next;}
 const el=id=>document.getElementById(id),key=()=> 'RESTAURANT_TABLE_VISIT_v2_'+currentTable;
 function read(){try{return Cloud.sessionRead(key());}catch{return null;}}
 function save(){Cloud.sessionWrite(key(),visit);}
 function expired(){return !!visit?.expires_at&&Date.parse(visit.expires_at)<=Date.now()+offset;}
 function canCall(){return !!state?.active&&!state.expired&&!expired()&&!error;}
 function render(){if(!el('scanExpired'))return;const timedOut=expired()||state?.expired===true,locked=!canCall();el('scanExpired').hidden=!locked;
  const blocked=/browser device has been blocked/i.test(error);el('scanExpiredTitle').textContent=blocked?'Device access blocked':timedOut?'Please scan your table QR again':'Please scan your table QR';
  el('scanAccessText').textContent=timedOut?'Your 1-hour table access has expired. Scan the QR printed on your table to continue.':error||'Scan the QR printed on your table to open the menu.';
  el('tableAccessNotice').textContent=state?.status==='Reserved'?'This table is reserved. Please ask a waiter.':'';el('tableAccessNotice').hidden=!el('tableAccessNotice').textContent;
  if(locked){window.OrderCelebration?.close();const d=el('reviewDialog');if(d?.open)d.close();}
 }
 async function refresh(force=false){if(busy)return busy;if(!force&&state&&Date.now()-validatedAt<10000&&!expired())return state;if(!visit||!currentTable||!device){render();return null;}
  busy=(async()=>{try{state=await Cloud.rpc('restaurant_open_device_visit',{p_visit_id:visit.id,p_visit_token:visit.token,p_table:currentTable,p_qr_key:qrKey,p_device_id:device.id,p_device_token:device.token,p_info:browserInfo()});await Cloud.refreshTableNames({table:currentTable}).catch(()=>{});validatedAt=Date.now();offset=Date.parse(state.server_now)-Date.now();visit.expires_at=state.expires_at;save();error=state.blocked?(state.error||'This browser device has been blocked. Please contact restaurant staff.'):'';if(typeof applyCustomerRetention==='function')applyCustomerRetention(state.retention,state.server_now);
   if(qrKey){qrKey=null;const u=new URL(location.href);u.searchParams.delete('qr');u.searchParams.delete('entry');history.replaceState(null,'',u);}
   render();if(canCall()&&typeof resumeReviewPrompt==='function')resumeReviewPrompt();return state;
  }catch(e){error=e.message;render();throw e;}finally{busy=null;}})();return busy;
 }
 async function init(){if(initialized)return busy||state;initialized=true;qrKey=new URL(location.href).searchParams.get('qr');visit=read();
  if(!currentTable){error='Scan the QR printed on your table to open the menu.';render();return null;}
  if(qrKey){visit={id:crypto.randomUUID(),token:crypto.randomUUID()};}
  if(!visit){error='Scan the QR printed on your table to open the menu.';render();return null;}
  try{device=loadDevice();save();return await refresh();}catch(e){error=e.message;render();return null;}
 }
 async function credentials(ordering=true){if(!initialized)await init();else await refresh();if(!canCall())throw Error(expired()||state?.expired?'Scan expired. Please scan your table QR again.':error||'Please scan the table QR to open the menu.');if(ordering&&state.status==='Reserved')throw Error('This table is reserved. Please ask a waiter.');return {p_visit_id:visit.id,p_visit_token:visit.token};}
 setInterval(()=>{if(initialized&&!document.hidden)render();},1000);
 Cloud.schedule('visit',10000,()=>{if(initialized&&visit&&!expired())return refresh();});
 document.addEventListener('visibilitychange',()=>{if(initialized&&!document.hidden){render();if(visit&&!expired())refresh().catch(()=>{});}});
 return {init,credentials,canCall,expired};
})();
