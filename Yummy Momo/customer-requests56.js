/* Release56: optional table-authenticated customer song requests. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 let config={song_requests_enabled:false},busy=false,attempt=null;
 const attemptKey=()=>`SONG_REQUEST_ATTEMPT56_${currentTable||'table'}`;
 function paint(){const b=$('requestSongButton');if(!b)return;b.hidden=config.song_requests_enabled!==true;b.disabled=busy||!TableAccess.canCall();}
 async function load(){try{config=await Cloud.rpc('restaurant_waiter_public56',{});paint();}catch{config={song_requests_enabled:false};paint();}}
 function open(){if(!config.song_requests_enabled)return;if(!TableAccess.canCall()){const s=$('songRequestStatus');if(s)s.textContent='Please scan your table QR again before sending a song request.';return;}$('songRequestStatus').textContent='';$('songRequestText').value='';$('songModal').showModal();$('songRequestText').focus();}
 function close(){if($('songModal').open)$('songModal').close();}
 async function send(event){event.preventDefault();if(busy)return;const text=$('songRequestText').value.trim(),status=$('songRequestStatus'),button=$('songRequestSend');if(!text){status.textContent='Enter a song name or artist.';return;}busy=true;button.disabled=true;paint();status.textContent='Sending song request…';
  try{
   attempt=attempt||Cloud.read(attemptKey(),null)||crypto.randomUUID();Cloud.write(attemptKey(),attempt);
   const access=await TableAccess.credentials(false);
   const result=await Cloud.rpc('restaurant_customer_song_request',{p_request_id:attempt,p_table:currentTable,p_song:text,...access});
   Cloud.remove(attemptKey());attempt=null;status.textContent=result.already_pending?'This song request is already pending.':'Song request sent ✓ · Staff can see it in Requests.';
   setTimeout(()=>{if($('songModal').open)close();},1300);
  }catch(error){status.textContent='Could not send song request: '+error.message;}
  finally{busy=false;button.disabled=false;paint();}
 }
 window.addEventListener('DOMContentLoaded',()=>{$('requestSongButton')?.addEventListener('click',open);$('songRequestForm')?.addEventListener('submit',send);$('songRequestClose')?.addEventListener('click',close);$('songRequestCancel')?.addEventListener('click',close);load();paint();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 Cloud.schedule('customer-features56',30000,load);
 window.CustomerRequests56={reload:load};
})();
