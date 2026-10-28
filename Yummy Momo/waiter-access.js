'use strict';
const waiterPermissionKeys=['enabled','view_orders','accept_orders','serve_orders','view_requests','handle_requests','alerts'];
async function loadWaiterPermissions(){if(staffRole!=='admin')return;const form=document.getElementById('waiterPermissionsForm');for(const input of form.elements)input.disabled=true;try{const s=await Cloud.rpc('restaurant_waiter_permissions',{},true);waiterPermissionKeys.forEach(key=>document.getElementById('waiterPermission_'+key).checked=s[key]);document.getElementById('waiterPermissionsStatus').textContent='';for(const input of form.elements)input.disabled=false;}catch(e){document.getElementById('waiterPermissionsStatus').textContent=e.message;}}
async function saveWaiterPermissions(e){e.preventDefault();const button=document.getElementById('waiterPermissionsSave');button.disabled=true;try{const args={};waiterPermissionKeys.forEach(key=>args['p_'+key]=document.getElementById('waiterPermission_'+key).checked);await Cloud.rpc('restaurant_waiter_permissions',args,true);document.getElementById('waiterPermissionsStatus').textContent='Waiter capability permissions saved.';}catch(e){document.getElementById('waiterPermissionsStatus').textContent=e.message;}finally{button.disabled=false;}}
async function loadWaiterAccessSettings(){
 if(!['admin','manager'].includes(staffRole))return;
 const input=document.getElementById('waiterAccessHours'),name=document.getElementById('waiterAppName'),song=document.getElementById('songRequestsEnabled'),button=document.getElementById('waiterAccessHoursSave'),status=document.getElementById('waiterAccessHoursStatus');
 if(!input||!name||!button)return;
 input.disabled=name.disabled=button.disabled=true;if(song)song.disabled=true;
 try{
  const [access,cfg]=await Promise.all([Cloud.rpc('restaurant_waiter_access_settings',{p_hours:null},true),Cloud.rpc('restaurant_waiter_config56',{p_app_name:null,p_song_requests:null},true)]);
  if(cfg?.error)throw Error(cfg.error);
  input.value=String(access.access_hours||18);name.value=cfg.app_name||'Waiter';
  if(song&&staffRole==='admin')song.checked=cfg.song_requests_enabled!==false;
  status.textContent='';
 }catch(e){status.textContent=/restaurant_waiter_config56|restaurant_waiter_public56|schema cache|PGRST202/i.test(e.message)?'Run SUPABASE/UPDATE-62-ADMIN-ONLY-SONG-SETTING.sql, then refresh this page.':e.message;}
 finally{input.disabled=name.disabled=button.disabled=false;if(song)song.disabled=staffRole!=='admin';}
}
async function saveWaiterAccessSettings(e){
 e.preventDefault();
 const input=document.getElementById('waiterAccessHours'),name=document.getElementById('waiterAppName'),song=document.getElementById('songRequestsEnabled'),button=document.getElementById('waiterAccessHoursSave'),status=document.getElementById('waiterAccessHoursStatus');
 const hours=Number(input.value),appName=name.value.trim();
 if(!Number.isInteger(hours)||hours<1||hours>24){status.textContent='Choose a whole number from 1 to 24 hours.';input.focus();return;}
 if(!appName||appName.length>40){status.textContent='Enter a waiter app name from 1 to 40 characters.';name.focus();return;}
 button.disabled=true;status.textContent='';
 try{
  const cfg=await Cloud.rpc('restaurant_waiter_config56',{p_app_name:appName,p_song_requests:staffRole==='admin'&&song?song.checked:null},true);
  if(cfg?.error)throw Error(cfg.error);
  const access=await Cloud.rpc('restaurant_waiter_access_settings',{p_hours:hours},true);
  input.value=String(access.access_hours);name.value=cfg.app_name||appName;
  if(song&&staffRole==='admin')song.checked=cfg.song_requests_enabled!==false;
  status.textContent='';
  if(typeof showToast==='function')showToast('Waiter settings saved.');
 }catch(err){status.textContent=/restaurant_waiter_config56|restaurant_waiter_public56|schema cache|PGRST202/i.test(err.message)?'Run SUPABASE/UPDATE-62-ADMIN-ONLY-SONG-SETTING.sql, then refresh this page.':err.message;}
 finally{button.disabled=false;}
}
