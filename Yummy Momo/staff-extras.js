'use strict';
async function openCategoryArrangement(){if(!['admin','manager'].includes(staffRole))return;if(layoutDirty&&!confirm('Discard unsaved arrangement changes?'))return;layoutDirty=false;layoutGroup='';setMenuView('arrangement');if(layoutBusy)return;await reloadMenuArrangement();}

// Per-category ordering is saved atomically, with a revision check against other staff.
let menuLayoutData=null,layoutGroup='',layoutDraft=[],layoutDirty=false,layoutBusy=false;
let menuView='items';
function setMenuView(view){
 const next=view==='arrangement'?'arrangement':'items';const catTab=document.getElementById('orderCategoriesTab');if(catTab){catTab.className='secondary-btn';catTab.setAttribute('aria-pressed','false');}
 if(next!==menuView&&menuView==='arrangement'&&layoutDirty&&!confirm('Discard unsaved category order?'))return;
 if(next!==menuView&&next==='items')layoutDirty=false;
 menuView=next;document.getElementById('menuItemsView').hidden=next!=='items';document.getElementById('categoryArrangementView').hidden=next!=='arrangement';
 for(const [id,value] of [['menuItemsTab','items']]){const el=document.getElementById(id);el.className=next===value?'primary-btn':'secondary-btn';el.setAttribute('aria-pressed',String(next===value));}
 if(next==='arrangement'&&!layoutDirty)reloadMenuArrangement();
}
async function openMenuArrangement(){if(['admin','manager'].includes(staffRole))setMenuView('arrangement');}
async function reloadMenuArrangement(){
 if(layoutBusy)return;layoutBusy=true;document.getElementById('layoutStatus').textContent='Loading…';
 try{menuLayoutData=await Cloud.rpc('restaurant_menu_layout',{},true);const select=document.getElementById('layoutGroup');select.replaceChildren(new Option('Order of categories',''));layoutGroup='';select.value=layoutGroup;loadArrangementDraft();document.getElementById('layoutStatus').textContent='';}
 catch(e){document.getElementById('layoutStatus').textContent=e.message;menuLayoutData=null;document.getElementById('layoutRows').replaceChildren();}finally{layoutBusy=false;paintArrangement();}
}
function loadArrangementDraft(){layoutGroup='';document.getElementById('layoutTitle').textContent='Order of categories';const tab=document.getElementById('orderCategoriesTab');tab.className='primary-btn';tab.setAttribute('aria-pressed','true');layoutDraft=menuLayoutData.categories.map(c=>({id:c.name,name:c.name}));layoutDirty=false;paintArrangement();}
function changeArrangementGroup(){const select=document.getElementById('layoutGroup');if(layoutDirty&&!confirm('Discard unsaved arrangement changes?')){select.value=layoutGroup;return;}layoutGroup=select.value;loadArrangementDraft();}
function paintArrangement(){
 document.getElementById('layoutSave').disabled=layoutBusy||!menuLayoutData||!layoutDirty;
 document.getElementById('layoutGroup').disabled=layoutBusy||!menuLayoutData;
 document.getElementById('layoutRows').innerHTML=layoutDraft.map((r,i)=>`<li><span>${Cloud.esc(r.name)}</span><div><input type="number" class="dish-position" min="1" max="${layoutDraft.length}" value="${i+1}" data-layout-position="${i}" aria-label="Position for ${Cloud.esc(r.name)}" ${layoutBusy?'disabled':''}><button class="secondary-btn" type="button" data-layout-move="${i}" data-layout-direction="-1" ${i===0||layoutBusy?'disabled':''} aria-label="Move ${Cloud.esc(r.name)} up">↑</button><button class="secondary-btn" type="button" data-layout-move="${i}" data-layout-direction="1" ${i===layoutDraft.length-1||layoutBusy?'disabled':''} aria-label="Move ${Cloud.esc(r.name)} down">↓</button></div></li>`).join('')||'<li>No dishes in this category.</li>';
}
async function saveMenuArrangement(){
 if(layoutBusy||!layoutDirty||!menuLayoutData)return;layoutBusy=true;paintArrangement();
 try{menuLayoutData=await Cloud.rpc('restaurant_menu_layout',{p_category:layoutGroup||null,p_ids:layoutDraft.map(r=>r.id),p_revision:menuLayoutData.revision},true);loadArrangementDraft();document.getElementById('layoutStatus').textContent='Saved. Customer and kitchen menus use this order on their next refresh.';await loadStaffCategories();await refreshCloud();}
 catch(e){document.getElementById('layoutStatus').textContent=e.message+' Your draft is retained; use Reload to get the latest menu.';}finally{layoutBusy=false;paintArrangement();}
}
document.addEventListener('click',event=>{const b=event.target.closest('[data-layout-move]');if(!b||layoutBusy)return;const i=Number(b.dataset.layoutMove),j=i+Number(b.dataset.layoutDirection);if(j<0||j>=layoutDraft.length)return;[layoutDraft[i],layoutDraft[j]]=[layoutDraft[j],layoutDraft[i]];layoutDirty=true;paintArrangement();});

window.RestaurantAlerts=(()=>{
 let settings=null,settingsBusy=false,fillRequested=false,formRevision=null,notificationArmed=AlertDevice.enabled('notification'),ctx=null,seenOrders=null,seenNotifications=new Set(),notificationInitialized=false;
 const el=id=>document.getElementById(id);
 const audioContexts=new Set();
 const presets={chime:[784,988,1319],doorbell:[659,523],bell:[880,1175,880]};
 function paint(){const n=el('notificationSoundButton');if(n){n.textContent=notificationArmed?'Notification sound on · mute':'Enable notification sound';n.setAttribute('aria-pressed',String(notificationArmed));}}
 async function sync(fillForm=false){
  if(fillForm)fillRequested=true;if(settingsBusy||!['admin','manager'].includes(staffRole))return;fillForm=fillRequested;fillRequested=false;settingsBusy=true;if(el('alertSettingsSave'))el('alertSettingsSave').disabled=true;
  try{settings=await Cloud.rpc('restaurant_alert_settings',{},true);paint();if(fillForm&&staffRole==='admin'){formRevision=settings.revision;for(const key of ['orders','waiter','notification'])el(key+'SoundPreset').value=settings[key+'_sound'];el('alertSettingsStatus').textContent='';AlertAudio.fill();}}
  catch(e){if(fillForm)el('alertSettingsStatus').textContent=e.message;}finally{settingsBusy=false;if(el('alertSettingsSave'))el('alertSettingsSave').disabled=formRevision===null;if(fillRequested)sync(true);}
 }
 async function save(event){event.preventDefault();if(staffRole!=='admin'||settingsBusy)return;settingsBusy=true;el('alertSettingsSave').disabled=true;
  try{const next={voice_enabled:false};for(const key of ['orders','waiter','notification'])next[key+'_sound']=el(key+'SoundPreset').value;settings=await Cloud.rpc('restaurant_alert_settings',{p_settings:next,p_revision:formRevision},true);formRevision=settings.revision;paint();el('alertSettingsStatus').textContent='Alert preferences saved for all kitchen staff. Device choices are remembered. A first tap may be required by the browser.';}
  catch(e){el('alertSettingsStatus').textContent=e.message;}finally{settingsBusy=false;el('alertSettingsSave').disabled=false;}
 }
 function play(kind,context,override){
  if(!settings&&!override)return null;if(!context||context.state!=='running'||document.hidden)return [];
  const preset=override||settings[kind+'_sound'];if(preset==='none')return [];if(!override){const custom=window.AlertAudio?.alarm(kind,context);if(custom)return custom;}
  if(!context||context.state!=='running'||document.hidden)return [];
  const nodes=[],notes=presets[preset]||presets.chime,t=context.currentTime;
  notes.forEach((hz,i)=>{const o=context.createOscillator(),g=context.createGain(),at=t+i*.28;o.type=preset==='doorbell'?'sine':'triangle';o.frequency.value=hz;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.18,at+.02);g.gain.exponentialRampToValueAtTime(.0001,at+.55);o.connect(g);g.connect(AlertDevice.output(context));o.start(at);o.stop(at+.56);o.onended=()=>{o.disconnect();g.disconnect();};nodes.push(o);});return nodes;
 }
 async function prepareAudio(context){audioContexts.add(context);await AlertAudio.warm(context);return context;}
 async function reloadAudio(){for(const c of audioContexts)try{await AlertAudio.warm(c);}catch(e){showToast('Audio could not load: '+e.message);}}
 async function unlock(){ctx ||= new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();if(ctx.state!=='running')throw Error('Tap again to allow audio.');await prepareAudio(ctx);return ctx;}
 async function test(kind){try{await unlock();const custom=AlertAudio.alarm(kind,ctx);if(!custom)play(kind,ctx,el(kind+'SoundPreset').value);el('alertSettingsStatus').textContent='Preview: '+(AlertAudio.isCustom(kind)?'uploaded custom alarm':el(kind+'SoundPreset').selectedOptions[0].textContent);}catch(e){el('alertSettingsStatus').textContent=e.message;}}
 async function toggleNotifications(){notificationArmed=!notificationArmed;AlertDevice.set('notification',notificationArmed);if(notificationArmed)try{await unlock();play('notification',ctx);}catch(e){notificationArmed=false;showToast(e.message);}paint();}
 AlertDevice.onGesture(()=>{if(typeof loggedIn!=='undefined'&&loggedIn&&AlertDevice.enabled('notification')){notificationArmed=AlertDevice.enabled('notification');unlock().then(paint).catch(()=>{});}});
 document.addEventListener('yummy-enable-audio',()=>{notificationArmed=AlertDevice.enabled('notification');unlock().then(paint).catch(()=>{});});
 function observeOrders(rows){/* Repeating tones are handled by RequestRing. */}
 function observeNotifications(rows){const fresh=rows.some(n=>!n.read_at&&!seenNotifications.has(n.id));rows.forEach(n=>seenNotifications.add(n.id));if(seenNotifications.size>2000)seenNotifications=new Set(rows.map(n=>n.id));if(notificationInitialized&&fresh&&notificationArmed)play('notification',ctx);notificationInitialized=true;}
 function stop(){notificationArmed=false;paint();}
 let diagnosticStopped=false,diagnosticNodes=[],diagnosticRunning=false;
 function stopVolumeTest(){diagnosticStopped=true;diagnosticRunning=false;diagnosticNodes.forEach(n=>{try{n.stop();}catch{}});diagnosticNodes=[];}
 async function volumeTest(onStep){
  if(document.hidden)throw Error('Keep the dashboard visible during the volume test.');diagnosticRunning=true;try{
  diagnosticStopped=false;await unlock();if(!settings)await sync();
  for(const [i,kind,label] of [[1,'orders','Incoming orders'],[2,'waiter','Waiter requests'],[3,'notification','Notification alerts']]){
   if(diagnosticStopped){onStep('Volume test stopped.');return;}
   const chosen=settings?.[kind+'_sound']||'chime',preset=chosen==='none'?(kind==='waiter'?'doorbell':'bell'):chosen;
   onStep(i+'/3 · '+label+' — test tone requested'+(chosen==='none'?' (live setting is muted; diagnostic preview only)':''));diagnosticNodes=AlertAudio.alarm(kind,ctx)||play(kind,ctx,preset)||[];await new Promise(r=>setTimeout(r,2000));
  }
  if(diagnosticStopped){onStep('Volume test stopped.');return;}
  if(diagnosticStopped){onStep('Volume test stopped.');return;}
  if(typeof Notification!=='undefined'&&Notification.permission==='granted'){await BackgroundAlerts.test();onStep('System notification test requested if a service worker is installed. Check the device; this does not verify server push delivery.');}
  else onStep('Alarm test complete. System notification skipped: enable Staff alerts and notification permission to test it.');
 }finally{diagnosticRunning=false;diagnosticNodes=[];}
 }
 return {sync,save,test,play,prepareAudio,reloadAudio,toggleNotifications,observeOrders,observeNotifications,stop,volumeTest,stopVolumeTest,get testing(){return diagnosticRunning;}};
})();

let stockNotificationsData=null,stockNotificationsBusy=false,stockNotificationsOffset=0,stockKnownIds=null;
function paintNotificationsBadge(){const e=document.getElementById('securityUnread');if(e)e.textContent=Number(typeof backgroundUnread46!=='undefined'?backgroundUnread46.security:securityData?.unread||0)+Number(typeof backgroundUnread46!=='undefined'?backgroundUnread46.stock:stockNotificationsData?.unread||0);}
async function refreshStockNotifications(){
 if(!loggedIn||stockNotificationsBusy)return;stockNotificationsBusy=true;
 try{const data=await Cloud.rpc('restaurant_stock_alerts',{p_offset:stockNotificationsOffset},true);stockNotificationsData=data;if(typeof backgroundUnread46!=='undefined')backgroundUnread46.stock=data.unread;BackgroundAlerts.notifyRows('stock',data.notifications);RestaurantAlerts.observeNotifications(data.notifications);if(stockKnownIds){const fresh=data.notifications.find(n=>!n.read_at&&!stockKnownIds.has(n.id));if(fresh)showToast('Low stock: '+fresh.dish_name+(fresh.variant==='single'?'':' — '+(fresh.size_label||MenuOptions.label(menuItems.find(m=>m.id===fresh.menu_id),fresh.variant)))+' · '+fresh.remaining+' of '+fresh.baseline+' left.');}stockKnownIds=new Set(data.notifications.map(n=>n.id));paintNotificationsBadge();
  document.getElementById('stockNotificationsList').innerHTML=data.notifications.map(n=>`<article class="device-card"><h3>${Cloud.esc(n.dish_name)}${n.variant==='single'?'':' — '+Cloud.esc(n.size_label||MenuOptions.label(menuItems.find(m=>m.id===n.menu_id),n.variant))}</h3><p><b>At alert: ${n.remaining} of ${n.baseline} left · ${(100*n.remaining/n.baseline).toFixed(1)}%</b></p><p>${Cloud.esc(n.category)} · ${Cloud.esc(new Date(n.created_at).toLocaleString())}</p>${n.read_at?'<span>Read</span>':`<button class="secondary-btn" type="button" data-stock-notice="${Cloud.esc(n.id)}">Mark read</button>`}</article>`).join('')||'<p class="empty">No low-stock notifications.</p>';
  document.getElementById('stockNotificationsPage').textContent=data.total?`${data.offset+1}–${data.offset+data.notifications.length} of ${data.total}`:'0 alerts';document.getElementById('stockNotificationsPrevious').disabled=stockNotificationsOffset===0;document.getElementById('stockNotificationsNext').disabled=data.offset+data.notifications.length>=data.total;document.getElementById('stockNotificationsStatus').textContent='';
 }catch(e){document.getElementById('stockNotificationsStatus').textContent='Stock alerts: '+e.message;}finally{stockNotificationsBusy=false;}
}
async function markStockNotification(id){try{await Cloud.rpc('restaurant_stock_alerts',{p_action:id?'read':'read_all',p_id:id},true);await refreshStockNotifications();}catch(e){document.getElementById('stockNotificationsStatus').textContent=e.message;}}
function pageStockNotifications(direction){stockNotificationsOffset=Math.max(0,stockNotificationsOffset+50*direction);refreshStockNotifications();}
document.addEventListener('click',e=>{const b=e.target.closest('[data-stock-notice]');if(b)markStockNotification(b.dataset.stockNotice);});

// Immediate changes; Undo uses a server-issued token and never rewrites stale state.
let savedUndo=[];try{savedUndo=Cloud.sessionRead('RESTAURANT_ORDER_UNDO_v1',[],true);}catch{}
const orderUndoReceipts=new Map(Array.isArray(savedUndo)?savedUndo:[]);const orderActionsBusy=new Set();
// Rejected cards stay visible for four minutes from the SERVER action time.
// Never restart this deadline after refresh; no cloud order/history is deleted.
const REJECTED_CARD_LIFETIME_MS=4*60*1000;
function rejectedCardRemaining(o,now=Date.now()){
 if(o.status!=='Rejected')return Infinity;
 const rejectedAt=Date.parse(o.updated_at);
 return Number.isFinite(rejectedAt)?Math.max(0,rejectedAt+REJECTED_CARD_LIFETIME_MS-now):0;
}
function pruneRejectedUndoActions(now=Date.now()){
 let changed=false;
 for(const [id,o] of orderUndoReceipts){
  if(o.status==='Rejected'&&rejectedCardRemaining(o,now)<=0&&!orderActionsBusy.has(id)){
   orderUndoReceipts.delete(id);changed=true;
  }
 }
 if(changed)persistUndoActions();
}
function persistUndoActions(){try{Cloud.sessionWrite('RESTAURANT_ORDER_UNDO_v1',[...orderUndoReceipts].slice(-500),true);}catch{}}
function undoButton(o){const r=orderUndoReceipts.get(o.id);return r?`<button class="secondary-btn order-corner-undo" type="button" data-undo-order="${Cloud.esc(o.id)}" ${orderActionsBusy.has(o.id)?'disabled':''}>${orderActionsBusy.has(o.id)?'Saving…':'↶ Undo '+(r.status==='Rejected'?'reject':'accept')}</button>`:'';}
function observeUndoActions(rows){pruneRejectedUndoActions();for(const [id,r] of orderUndoReceipts){const current=rows.find(o=>o.id===id);if((!current&&r.status!=='Rejected')||(current&&(current.status!==r.status||Date.parse(current.updated_at)!==Date.parse(r.updated_at))))orderUndoReceipts.delete(id);}persistUndoActions();}
async function undoOrderAction(id){pruneRejectedUndoActions();const r=orderUndoReceipts.get(id);if(!r||orderActionsBusy.has(id))return;orderActionsBusy.add(id);renderOrders();try{await Cloud.rpc('restaurant_undo_staff_action',{p_id:id,p_token:r.undo_token},true);orderUndoReceipts.delete(id);Cloud.invalidateOrders();showToast('Undone. Order is pending again.');}catch(e){showToast('Cannot undo: '+e.message);if(!/network|fetch|connection/i.test(e.message))orderUndoReceipts.delete(id);}finally{persistUndoActions();orderActionsBusy.delete(id);await refreshCloud();renderOrders();}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-undo-order]');if(b)undoOrderAction(b.dataset.undoOrder);});


function closeMenuArrangement(){if(!layoutBusy)setMenuView('items');}
document.addEventListener('change',event=>{const e=event.target.closest('[data-layout-position]');if(!e||layoutBusy)return;const from=Number(e.dataset.layoutPosition),to=Number(e.value)-1;if(!Number.isInteger(to)||to<0||to>=layoutDraft.length){paintArrangement();return;}const [row]=layoutDraft.splice(from,1);layoutDraft.splice(to,0,row);layoutDirty=true;paintArrangement();});
