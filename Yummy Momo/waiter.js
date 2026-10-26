/* Private waiter capability. Server permission checks are authoritative. */
'use strict';
let waiterOrders=[],waiterCalls=[],waiterBusy=false,waiterConnected=false,waiterRequestBoard=null,waiterPermissions={},waiterRevisions46={},waiterClock46=0;
let waiterView='requests',waiterViewChosen=false;
const wEl=id=>document.getElementById(id),wEsc=Cloud.esc;
const scannedWaiterKey=new URLSearchParams(location.hash.slice(1)).get('key');
let waiterKey=scannedWaiterKey||Cloud.read('RESTAURANT_WAITER_DEVICE_KEY_v1','');
const waiterRing=RequestRing.mount({scope:'waiter',button:wEl('waiterSoundButton')});
function setWaiterView(view){if(!['orders','requests'].includes(view))return;const can=view==='orders'?waiterPermissions.view_orders:waiterPermissions.view_requests;if(!waiterPermissions.enabled||!can)return;waiterView=view;waiterViewChosen=true;paintWaiterNavigation();if(view==='requests')waiterRequestBoard?.refresh();}
function paintWaiterNavigation(){
 if(!wEl('waiterMobileNav'))return;
 const requests=waiterPermissions.enabled&&waiterPermissions.view_requests,orders=waiterPermissions.enabled&&waiterPermissions.view_orders;
 wEl('waiterMobileNav').hidden=!requests&&!orders;wEl('waiterRequestsView').hidden=!requests;wEl('waiterOrdersView').hidden=!orders;
 if(!waiterViewChosen){waiterView=requests&&waiterCalls.length?'requests':orders?'orders':'requests';if(requests||orders)waiterViewChosen=true;}
 if(waiterView==='requests'&&!requests&&orders)waiterView='orders';if(waiterView==='orders'&&!orders&&requests)waiterView='requests';
 document.body.classList.toggle('waiter-view-orders',waiterView==='orders');document.body.classList.toggle('waiter-view-requests',waiterView==='requests');
 wEl('waiterRequestsView').setAttribute('aria-pressed',String(waiterView==='requests'));wEl('waiterOrdersView').setAttribute('aria-pressed',String(waiterView==='orders'));
 wEl('waiterRequestsViewCount').textContent=waiterCalls.length;wEl('waiterOrdersViewCount').textContent=waiterOrders.length;
}
function moneyWaiter(v){return (Cloud.cfg.currency||'₹')+Number(v||0).toFixed(2);}
function renderWaiterOrders(){
 wEl('waiterCount').textContent=String(waiterOrders.length);paintWaiterNavigation();
 wEl('waiterOrders').innerHTML=waiterOrders.length?waiterOrders.map(o=>`<article class="order-card ${MonthlyLoyalty.star(o.id)?'monthly-regular':''}">${MonthlyLoyalty.badge(o.id)}<div class="card-heading"><h3>${wEsc(Cloud.tableName(o.table_number))}</h3><span class="status">${wEsc(o.status)}</span></div><p class="muted order-time">${wEsc(Cloud.orderLabel(o))} · ${new Date(o.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p><ul class="items">${o.items.map(i=>`<li><span><b>${Number(i.qty)}×</b> ${wEsc(i.name)}</span><b>${moneyWaiter(i.subtotal)}</b></li>`).join('')}</ul><div class="waiter-order-footer"><p><b>Total: ${moneyWaiter(o.total)}</b></p>${(o.status==='Pending'&&waiterPermissions.accept_orders||['Cooking','Ready'].includes(o.status)&&waiterPermissions.serve_orders)?`<button class="waiter-button" data-waiter-order="${wEsc(o.id)}" data-next="${o.status==='Pending'?'Cooking':'Served'}">${o.status==='Pending'?'Accept order':'Mark served'}</button>`:''}</div></article>`).join(''):'<p class="empty">No active orders right now.</p>';
}
function renderWaiterCalls(){
 const reserved=waiterCalls.filter(c=>c.request_kind==='ReservedScan');wEl('reservedWaiterAlert').hidden=!reserved.length;wEl('reservedWaiterAlert').textContent=reserved.map(c=>'Reserved table QR opened · '+Cloud.tableName(c.table_number)+' — please check seating.').join(' ');wEl('waiterCallCount').textContent=waiterCalls.length;paintWaiterNavigation();
 document.title=waiterCalls.length?'('+waiterCalls.length+') Waiter requested':'Waiter orders & calls';
 waiterRing.update(waiterCalls,waiterPermissions.enabled&&waiterPermissions.view_requests&&waiterPermissions.alerts);
}
function applyWaiterPermissions(s){
 waiterPermissions=s;YummyBilling.waiterAccess(s.enabled===true&&s.manual_billing===true);const enabled=s.enabled===true;if(!enabled||!s.handle_requests)wEl('waiterCalls').querySelectorAll('[data-request-handle]').forEach(b=>b.remove());
 wEl('waiterOrdersSection').hidden=!enabled||!s.view_orders;
 wEl('waiterCallPanel').hidden=!enabled||!s.view_requests;
 wEl('waiterSoundButton').hidden=!enabled||!s.view_requests||!s.alerts;
 if(!enabled||!s.view_requests||!s.alerts){wEl('backgroundAlertPanel').hidden=true;BackgroundAlerts.suspend();waiterRing.disable();}
 else{BackgroundAlerts.init('waiter',waiterKey);wEl('backgroundAlertPanel').hidden=false;}
}
async function loadWaiterOrders(){
 if(waiterBusy)return;
 if(!/^[a-f0-9]{64}$/.test(waiterKey)){wEl('waiterConnection').textContent='Scan QR';wEl('waiterError').textContent='Scan the private waiter QR from the admin. No sign-in is needed.';return;}
 waiterBusy=true;
 try{
  const reconcile=Date.now()-waiterClock46>30000;const result=await Cloud.rpc('restaurant_waiter_sync47',{p_key:waiterKey,p_known:reconcile?{...waiterRevisions46,calls:null}:waiterRevisions46});if(!result.permissions)throw Error('Install the Release14 database update first.');
  if(result.tables)Cloud.setTableNames(result.tables);
  applyWaiterPermissions(result.permissions);if(result.orders!==null)waiterOrders=result.orders;await MonthlyLoyalty.refresh(waiterOrders,waiterKey);if(result.calls!==null)waiterCalls=result.calls;waiterConnected=true;renderWaiterOrders();renderWaiterCalls();
  try{Cloud.write('RESTAURANT_WAITER_DEVICE_KEY_v1',waiterKey);}catch{}
  if(waiterPermissions.enabled&&waiterPermissions.view_requests){
   if(!waiterRequestBoard)waiterRequestBoard=CallRequests.mount({root:wEl('waiterCalls'),kind:'waiter',key:waiterKey,canHandle:()=>waiterPermissions.enabled&&waiterPermissions.view_requests&&waiterPermissions.handle_requests,onUpdate:data=>{if(!waiterPermissions.enabled||!waiterPermissions.view_requests)return;waiterCalls=data.pending_calls;renderWaiterCalls();}});
   if(result.calls!==null)waiterRequestBoard.setPending(waiterCalls);if(waiterView==='requests'&&(waiterRevisions46.calls!==result.revisions.calls||reconcile))await waiterRequestBoard.refresh();
  }
  waiterRevisions46=result.revisions;if(reconcile)waiterClock46=Date.now();wEl('waiterConnection').textContent=waiterPermissions.enabled?'Live':'Disabled';wEl('waiterConnection').classList.toggle('live',waiterPermissions.enabled);wEl('waiterError').textContent=waiterPermissions.enabled?'':'Waiter access is turned off by the admin.';renderWaiterOrders();renderWaiterCalls();
 }catch(e){
  waiterConnected=false;waiterRing.disable();wEl('waiterConnection').textContent='Offline';wEl('waiterConnection').classList.remove('live');
  // Fail closed: do not keep operational sections visible when access cannot be verified.
  waiterRevisions46={};applyWaiterPermissions({enabled:false});waiterOrders=[];waiterCalls=[];wEl('waiterOrders').innerHTML='';wEl('waiterCalls').innerHTML='';renderWaiterCalls();
  wEl('waiterError').textContent='Waiter access could not update: '+e.message;
 }finally{waiterBusy=false;}
}
function paintWaiterTheme(){const dark=Cloud.read('RESTAURANT_DARK_WAITER_v27',false)===true;document.body.classList.toggle('dark-site',dark);wEl('waiterThemeToggle').textContent=dark?'Use light theme':'Use dark theme';}
function toggleWaiterTheme(){Cloud.write('RESTAURANT_DARK_WAITER_v27',!document.body.classList.contains('dark-site'));paintWaiterTheme();}
paintWaiterTheme();
wEl('waiterRestaurant').textContent=Cloud.cfg.restaurantName||'';
wEl('waiterSoundButton').addEventListener('click',()=>waiterRing.toggle());
loadWaiterOrders();Cloud.schedule('waiter',8000,loadWaiterOrders);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadWaiterOrders();});
navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='restaurant-push-open')loadWaiterOrders();});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-waiter-order]');if(!b)return;const o=waiterOrders.find(x=>x.id===b.dataset.waiterOrder);if(!o)return;b.disabled=true;try{await Cloud.rpc('restaurant_waiter_status',{p_key:waiterKey,p_id:o.id,p_expected:o.status,p_next:b.dataset.next});await loadWaiterOrders();}catch(err){await loadWaiterOrders();wEl('waiterError').textContent=err.message;}finally{b.disabled=false;}});
window.addEventListener('offline',()=>{wEl('waiterConnection').textContent='Offline';wEl('waiterConnection').classList.remove('live');wEl('waiterError').textContent='Offline — reconnect to receive new orders and requests. Last fetched cards may be out of date.';});
