/* Retry-safe waiter calls, with a private random call receipt for status tracking. */
'use strict';
(()=>{
 let sending=false,checking=false,until=0,receipt=null,handledTimer=null;
 const el=id=>document.getElementById(id),storageKey=prefix=>prefix+currentTable;
 function note(text,error=false){for(const id of ['callWaiterStatus','waiterConfirmationText'])el(id).textContent=text;el('callWaiterStatus').dataset.error=String(error);el('waiterConfirmation').hidden=!text;el('waiterConfirmation').dataset.error=String(error);}
 function showStatus(){
  clearTimeout(handledTimer);if(!receipt)return;
  if(receipt.status==='Handled'){if(!receipt.handled_seen_at){receipt.handled_seen_at=Date.now();Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);}const left=7000-(Date.now()-receipt.handled_seen_at);if(left<=0){note('');return;}handledTimer=setTimeout(()=>note(''),left);}
  if(Date.now()-Date.parse(receipt.created_at)>3600000){receipt=null;note('');return;}
  const label={Pending:receipt.on_the_way_at?'Waiter is coming ✓':'Call sent ✓ · Waiting for waiter confirmation',Handled:'Waiter call handled ✓',Expired:'Waiter request expired. Please call again if you still need help.'}[receipt.status]||'Waiter request saved';
  note(label+(receipt.status==='Pending'?' · '+Cloud.tableName(receipt.table_number):''));
 }
 document.addEventListener('restaurant-table-names',showStatus);
 function update(){
  if(document.hidden)return;
  const left=Math.max(0,Math.ceil((until-Date.now())/1000));
  el('callWaiterButton').disabled=sending||left>0||!TableAccess.canCall();
  const button=el('callWaiterButton');let label=button.querySelector('span');
  if(!button.querySelector('svg path')){button.innerHTML='<svg class="ui-icon waiter-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 4h4M12 2v2"/></svg><span></span>';label=button.querySelector('span');}
  const text=sending?'Sending…':left?'Call sent · '+left+'s':'Call waiter';if(label.textContent!==text)label.textContent=text;
  button.dataset.pending=String(receipt?.status==='Pending');

 }
 async function checkStatus(){
  if(checking||sending||!receipt?.request_id||receipt.status!=='Pending'||document.hidden)return;
  checking=true;const request=receipt.request_id;
  try{
   const row=await Cloud.rpc('restaurant_waiter_call_status',{p_request_id:request});
   if(receipt?.request_id!==request)return;
   receipt={...row,request_id:request};Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);showStatus();
  }catch(e){note('Call status could not update. '+e.message,true);}
  finally{checking=false;}
 }
 async function send(){
  if(sending||until>Date.now())return;sending=true;update();note('Sending your request…');
  try{
   if(typeof Cloud==='undefined')throw Error('Connection unavailable. Please ask a staff member.');
   let attempt=Cloud.read(storageKey('WAITER_CALL_ATTEMPT_'),null);
   if(!attempt){attempt=crypto.randomUUID();Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),attempt);}
   const access=await TableAccess.credentials(false);
   const result=await Cloud.rpc('restaurant_customer_call',{p_request_id:attempt,p_table:currentTable,...access});
   until=Date.now()+Math.max(0,new Date(result.next_allowed_at)-new Date(result.server_now));
   receipt={...result,request_id:attempt};
   Cloud.write(storageKey('WAITER_CALL_UNTIL_'),until);
   Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);
   Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),null);showStatus();
  }catch(e){note('Could not send: '+e.message,true);}
  finally{sending=false;update();}
 }
 window.addEventListener('DOMContentLoaded',()=>{
  if(typeof Cloud!=='undefined'){
   until=Number(Cloud.read(storageKey('WAITER_CALL_UNTIL_'),0))||0;
   receipt=Cloud.read(storageKey('WAITER_CALL_RECEIPT_'),null);showStatus();checkStatus();
  }
  el('callWaiterButton').addEventListener('click',send);update();
  setInterval(update,1000);Cloud.schedule('customer-call',10000,checkStatus);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkStatus();});
})();