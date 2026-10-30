'use strict';
const $=id=>document.getElementById(id), esc=Cloud.esc, config=Cloud.cfg;
const money=n=>(config.currency||'₹')+Number(n||0).toFixed(2);
const timeText=v=>new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const dateText=v=>new Date(v).toLocaleDateString();
let kitchenRequests=null;
let staffMenuQuery='',staffMenuCategory='All',staffMenuAvailability='all',pricingMenuId=null;
const staffSizeLabel=(size,item)=>MenuOptions.label(item,size);
const staffDisplayedPrice=item=>{if(!item.sizes_enabled)return item.price;const offered=MenuOptions.keys(item).filter(size=>Object.prototype.hasOwnProperty.call(item.size_prices||{},size)&&!(item.size_stock?.[size]?.tracked&&item.size_stock[size].remaining<=0));return offered.length?Math.min(...offered.map(size=>Number(item.size_prices[size]))):item.price;};
let staffRole=null,orders=[],menuItems=[],currentTab='live',currentFilter='active',currentBillOrderId=null,currentTableId=null;
const photoSelections={new:0,edit:0};
let state=Cloud.read('KITCHEN_ADMIN_STATE_v1',{}),tables=[],photoDrafts={new:{data:''},edit:{data:''}},editingPhotoItemId=null;
let soundEnabled=false,audioContext=null,alarmNodes=[],alarmIds=[],alarmState=Cloud.read('RESTAURANT_ALARMS_v2',{}),toastTimer,pollTimer=null,summaryPollTimer=null;
let scannerStream=null,scannerFrame=null,wakeLock=null,loggedIn=false,orderSyncPromise=null,summarySyncPromise=null;
let lastSyncHost='app';try{lastSyncHost=new URL(config.supabaseUrl||location.href).host||'app';}catch{}
const lastSyncStorageKey='YUMMY_KITCHEN_LAST_ORDER_SYNC:'+lastSyncHost;
let lastSuccessfulSync=0;try{lastSuccessfulSync=Number(sessionStorage.getItem(lastSyncStorageKey))||0;}catch{}
const terminal=s=>['Served','Cancelled','Rejected'].includes(s);
function showToast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function cloudError(text){$('cloudError').textContent=text;$('cloudError').hidden=!text;}
function download(name,text,type='application/json'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function enterStaff(){
 staffRole=await Cloud.role();
 if(!['admin','manager'].includes(staffRole))throw Error('Admin or manager access required. Waiters should scan the private waiter QR.');
 $('tabManagementBtn').hidden=!['admin','manager'].includes(staffRole);$('tabDevicesBtn').hidden=staffRole!=='admin';$('managerDeviceAccessPanel').hidden=staffRole!=='admin';$('tableAdminSetup').hidden=staffRole!=='admin';$('tablesSection').querySelector('h2').textContent=staffRole==='admin'?'Table setup & QR codes':'Tables';$('tabMenuBtn').hidden=false;$('tabStocksBtn').hidden=false;$('adminMenuPanel').hidden=staffRole!=='admin';$('managerMenuPanel').hidden=staffRole!=='manager';$('rotateWaiterButton').hidden=!['admin','manager'].includes(staffRole);$('resetControls').hidden=staffRole!=='admin';$('orderDevicePermissionPanel').hidden=staffRole!=='admin';configureManagementAccess();
 BackgroundAlerts.init('kitchen');loggedIn=true;$('loginPanel').hidden=true;$('managerNav').hidden=false;$('staffMain').hidden=false;$('staffSession').hidden=false;
 void window.Custom48?.sync(true);
 $('staffIdentity').textContent=(staffRole==='admin'?'Admin':'Manager')+' · signed in';KitchenOps.init();$('headerCallWaiter').hidden=false;
 kitchenRequests=CallRequests.mount({root:$('kitchenRequests'),kind:'kitchen',onUpdate:data=>{$('requestsBadge').textContent=data.pending_count;renderRequestAlerts(data.pending_calls);},onError:()=>{$('requestsBadge').textContent='!';requestRows=[];requestRing.update([]);}});
 setConnection('Connecting');switchTab(location.hash==='#notifications'?'notifications':location.hash==='#requests'?'requests':'live');await refreshCloud();await refreshStaffPulse46();
 if(typeof pollTimer==='function')pollTimer();if(typeof summaryPollTimer==='function')summaryPollTimer();
 pollTimer=Cloud.schedule('staff-pulse',5000,()=>{if(loggedIn)return refreshStaffPulse46();});
 summaryPollTimer=Cloud.schedule('staff-screen',30000,()=>{if(loggedIn)return refreshBackgroundData();});
}
function setConnection(label){
 const badge=$('syncBadge'),box=badge.parentElement,live=label==='Live',when=lastSuccessfulSync?new Date(lastSuccessfulSync).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'';
 badge.textContent=(live?'Live':label==='Connecting'?'Connecting…':'Reconnecting…')+(when?' · Last successful sync '+when:'');
 badge.title=lastSuccessfulSync?'Last successful order sync: '+new Date(lastSuccessfulSync).toLocaleString():label;
 const color=live?'#245c37':'#71717a';box.style.color=color;box.style.borderColor=color;box.style.background=live?'rgba(16,185,129,.12)':'rgba(148,163,184,.08)';box.querySelector('span').style.background=color;
}
async function signOutStaff(){
 if(orderActionsBusy.size){showToast('Wait for the saving action to finish.');return;}RestaurantAlerts.stop();await KitchenOps.stop();RestaurantAlerts.stopVolumeTest();
 try{await BackgroundAlerts.disableForSignOut();}catch(e){if(!confirm('Could not disable background alerts on this device. If you sign out now, alerts may continue. Turn off this site’s notifications in browser settings to stop them. Sign out anyway?'))return;}
 requestRing.disable();orderRing.disable();loggedIn=false;if(typeof pollTimer==='function')pollTimer();if(typeof summaryPollTimer==='function')summaryPollTimer();stopAlarmSound();closeAlarm();soundEnabled=false;$('soundButton').textContent='Enable request sound';orders=[];menuItems=[];
 if(wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null;}
 try{await Cloud.logout();}catch{}location.reload();
}
function isTemporaryCloudFailure(error){return error?.code==='ETIMEDOUT'||error?.name==='TypeError'||[408,425,429].includes(Number(error?.httpStatus))||Number(error?.httpStatus)>=500||/timed out|network|failed to fetch/i.test(String(error?.message||''));}
async function retryCloudRequest(work,onRetry=()=>{},attempts=3){
 let delay=500;
 for(let attempt=1;;attempt++){
  try{return await work();}
  catch(error){if(attempt>=attempts||!isTemporaryCloudFailure(error))throw error;onRetry();await new Promise(resolve=>setTimeout(resolve,delay));delay=Math.min(delay*2,2000);}
 }
}
function refreshCloud(){if(!loggedIn)return Promise.resolve();return Promise.allSettled([refreshBackgroundData(),refreshOrders()]).then(()=>undefined);}
function refreshOrders(){
 if(!loggedIn)return Promise.resolve();
 if(orderSyncPromise)return orderSyncPromise;
 orderSyncPromise=(async()=>{
  try{
   await Cloud.refreshTableNames({staff:true}).catch(()=>{});
   const rows=await Cloud.orders();
   if(!loggedIn)return;
   orders=rows;lastSuccessfulSync=Date.now();try{sessionStorage.setItem(lastSyncStorageKey,String(lastSuccessfulSync));}catch{}
   setConnection('Live');cloudError('');
   RestaurantAlerts.observeOrders(rows);orderRing.update(rows.filter(o=>o.status==='Pending'));
   renderOrders();renderDashboard();checkAlarm();
   void MonthlyLoyalty.refresh(rows).then(()=>{if(loggedIn)renderOrders();});
   void refreshOrderDeviceStates().then(()=>{if(loggedIn){renderOrders();if(recordsData)renderHistory();}});
  }catch(error){
   if(!loggedIn)return;
   setConnection('Reconnecting…');
   if(isTemporaryCloudFailure(error))cloudError('');
   else cloudError('Orders could not refresh: '+error.message);
  }
 })().finally(()=>{orderSyncPromise=null;});
 return orderSyncPromise;
}
function refreshBackgroundData(){
 if(!loggedIn||window.Custom48?.sectionHidden(currentTab))return Promise.resolve();
 if(summarySyncPromise)return summarySyncPromise;
 summarySyncPromise=(async()=>{
  const [menuResult,summaryResult,categoriesResult]=await Promise.allSettled([
   ['menu','billing','stocks'].includes(currentTab)?Cloud.menu(true):Promise.resolve(null),currentTab==='dashboard'?Cloud.records('day',null,0,1):Promise.resolve(null),currentTab==='menu'?loadStaffCategories():Promise.resolve(null)
  ]);
  if(!loggedIn)return;
  if(menuResult.status==='fulfilled'&&menuResult.value){
   menuItems=menuResult.value;
   const signature=JSON.stringify([menuItems,Cloud.categories]);
   if(signature!==refreshBackgroundData.menuSignature){refreshBackgroundData.menuSignature=signature;renderAdminMenu();}
  }
  if(summaryResult.status==='fulfilled'&&summaryResult.value)daySummary=summaryResult.value;
  if(categoriesResult.status==='fulfilled'){
   const signature=JSON.stringify([menuItems,Cloud.categories]);
   if(signature!==refreshBackgroundData.menuSignature){refreshBackgroundData.menuSignature=signature;renderAdminMenu();}
  }
  renderDashboard();
  if(currentTab==='stocks')refreshStocks();
  if(currentTab==='management')void YummyStocksSettings.sync();
 })().finally(()=>{summarySyncPromise=null;});
 return summarySyncPromise;
}

function configureManagementAccess(){
 const section=$('managementSection'),waiter=$('waiterAccessPanel');if(!section||!waiter)return;
 const manager=staffRole==='manager';
 for(const child of section.children){if(child.tagName==='H2'||child===waiter)continue;child.hidden=manager;}
 const permissions=$('waiterPermissionsForm'),songSetting=$('songRequestsSetting');
 if(permissions)permissions.hidden=manager;
 if(songSetting)songSetting.hidden=staffRole!=='admin';
}

function switchTab(tab){
 const tabs=['live','history','dashboard','requests','tables','menu','stocks','management','devices','notifications','billing'];if(!tabs.includes(tab))return;
 if(tab==='management'&&!['admin','manager'].includes(staffRole)||tab==='devices'&&!canManageCustomerDevices()||tab==='notifications'&&!['admin','manager'].includes(staffRole))return;
 const blocked=$('hiddenByAdminSection');
 if(window.Custom48?.sectionHidden(tab)){
  currentTab=tab;
  tabs.forEach(t=>{const section=$(t+'Section');if(section){section.hidden=true;section.style.display='none';}const button=$('tab'+t[0].toUpperCase()+t.slice(1)+'Btn');if(button)button.classList.toggle('active',t===tab);});
  if(blocked){const label=$('tab'+tab[0].toUpperCase()+tab.slice(1)+'Btn')?.innerText?.replace(/\s*\(\d+\)\s*$/,'').trim()||'This tab';$('hiddenByAdminTabName').textContent=label;blocked.hidden=false;blocked.style.display='grid';}
  return;
 }
 if(blocked){blocked.hidden=true;blocked.style.display='none';}
 if(tab==='stocks'&&YummyStocksSettings.hidden()){showToast('Stocks are hidden. An admin can show them in Management.');return;}
 currentTab=tab;tabs.forEach(t=>{const section=$(t+'Section');if(section){section.hidden=t!==tab;section.style.display=t===tab?'block':'none';}const button=$('tab'+t[0].toUpperCase()+t.slice(1)+'Btn');if(button)button.classList.toggle('active',t===tab);});
 if(tab==='billing')YummyBilling.open();if(tab==='management'&&staffRole==='admin'){window.Custom48?.open();YummyContact.loadSettings();YummyStocksSettings.sync();}if(tab==='dashboard')refreshSalesAnalytics(false);if(tab==='live'&&currentFilter==='Cancelled')refreshCancelledOrders();if(tab==='management'){configureManagementAccess();loadWaiterAccessSettings();if(staffRole==='admin'){RestaurantAlerts.sync(true);loadFooterSettings();loadActivityRetention();loadManagerDeviceAccess();loadReviewSettings();renderAdminMenu();loadRetentionSettings();loadTaxSettings();loadWaiterPermissions();}}if(tab==='notifications'){refreshStockNotifications();refreshSecurityNotifications();}if(tab==='devices')refreshCustomerDevices();if(tab==='tables')refreshTables();if(tab==='history')refreshRecords();if(tab==='requests')kitchenRequests?.refresh();if(tab==='menu'){renderAdminMenu();void refreshBackgroundData();}if(tab==='stocks')refreshStocks();if(tab==='dashboard')void refreshBackgroundData();
}
function setFilter(f){if(['all','Served'].includes(f)){recordStatusFilter=f==='all'?'All':f;recordOffset=0;$('recordStatusFilter').value=recordStatusFilter;switchTab('history');return;}currentFilter=['active','Pending','Cancelled'].includes(f)?f:'active';if(currentFilter==='Cancelled'){cancelledOffset=0;refreshCancelledOrders();}renderOrders();}
function statusPill(o){return `<span class="status-pill ${esc(o.status.toLowerCase())}">${esc(o.status)}</span>`;}
function actionButtons(o,withDevice=true){
 if(orderActionsBusy.has(o.id))return `<button class="secondary-btn" disabled>Saving…</button>`;
 let next={Pending:'Cooking',Cooking:'Served',Ready:'Served'}[o.status];

 return (next?`<button class="primary-btn" data-next="${next}" data-id="${esc(o.id)}">${(o.status==='Pending'?'Accept order':'Mark served')}</button>`:'')+
 (['admin','manager'].includes(staffRole)&&o.status==='Pending'?`<button class="danger-btn" data-next="Rejected" data-id="${esc(o.id)}">Reject / unavailable</button>`:'')+`<button class="secondary-btn" data-bill="${esc(o.id)}">Bill</button>`+(withDevice?orderDeviceButton(o):" ");
}
function shortId(o){return Cloud.orderLabel(o);}
function renderOrders(){
 pruneRejectedUndoActions();
 const active=orders.filter(o=>!terminal(o.status));$('activeOrdersBadge').textContent=active.filter(o=>o.status==='Pending').length;
 const filters=[['active','All open'],['Pending','Pending orders'],['Cancelled','Cancelled']];
 const filterHTML=filters.map(([k,v])=>`<button class="nav-tab-btn ${currentFilter===k?'active':''}" data-filter="${k}">${v}</button>`).join('');if($('orderFilters').innerHTML!==filterHTML)$('orderFilters').innerHTML=filterHTML;
 paintCancelledView();const filtered=currentFilter==='Cancelled'?cancelledRows():currentFilter==='active'?active:orders.filter(o=>o.status===currentFilter);const shown=filtered;
 const ordersHTML=shown.length?shown.map(o=>`<article class="order-card status-${esc(o.status.toLowerCase())} ${MonthlyLoyalty.star(o.id)?'monthly-regular':''}">
 <div class="order-header"><div><div class="table-title">${esc(Cloud.tableName(o.table_number))}</div><div class="order-time" title="${esc(o.order_id)}">${esc(shortId(o))} · ${timeText(o.created_at)}</div></div><div class="order-card-tools">${statusPill(o)}</div></div>
 <div class="order-body"><div class="cust-info">${MonthlyLoyalty.badge(o.id)}Guest: <b>${esc(o.customer_name||'Guest')}</b></div>
 <ul class="items-list">${o.items.map(i=>`<li class="item-entry"><span><b class="item-qty">${Number(i.qty)}×</b> ${esc(i.name)}</span><span>${money(i.subtotal)}</span></li>`).join('')}</ul>
 ${o.kitchen_notes?`<div class="kitchen-notes-box">${esc(o.kitchen_notes)}</div>`:''}
 ${o.rejection_reason?`<p class="hint">Reason: ${esc(o.rejection_reason)}</p>`:''}
 ${o.status==='Cancelled'?`<p class="hint">Cancelled ${esc(new Date(o.cancelled_at||o.updated_at||o.created_at).toLocaleString())} · leaves this view ${esc(new Date(o.cancelled_expires_at).toLocaleTimeString())}</p>`:''}<p class="hint">${o.status==='Pending'?'Waiting for acceptance':o.cooking_started_at?'Cooking started '+timeText(o.cooking_started_at):esc(o.status)}</p></div>
 <div class="order-footer"><b class="order-total">${money(o.total)}</b><div class="toolbar">${actionButtons(o)}</div></div></article>`).join(''):`<div class="empty empty-orders"><img src="order-empty.svg" alt="" width="210" height="170"><p>${currentFilter==='Cancelled'?'No cancelled orders in the last 6 hours. Full history remains in Order Records.':'No orders in this view. New customer orders appear here automatically.'}</p></div>`;if(renderOrders.html!==ordersHTML){$('ordersGrid').innerHTML=ordersHTML;renderOrders.html=ordersHTML;}
}
async function setOrderStatus(id,next,button){
 const o=findOrder(id);if(!o)return;
 let reason='';if(next==='Rejected'){reason=prompt('Reason shown to the customer:','Items unavailable');if(reason===null)return;}
 if(orderActionsBusy.has(id))return;orderActionsBusy.add(id);renderOrders();
 if(button)button.disabled=true;
 try{const saved=await Cloud.rpc('restaurant_staff_status',{p_id:id,p_expected:o.status,p_next:next,p_reason:reason},true);Cloud.invalidateOrders();showToast('Order '+saved.status.toLowerCase()+'.');await refreshCloud();}
 catch(e){showToast(/This status change is not allowed/.test(e.message)?'Database upgrade required: run SUPABASE/UPGRADE-EXISTING-PROJECT.sql, then refresh kitchen.':e.message);await refreshCloud();}finally{orderActionsBusy.delete(id);if(button)button.disabled=false;renderOrders();}
}
let recordStatusFilter='All';
function selectRecordStatus(){recordStatusFilter=$('recordStatusFilter').value;recordOffset=0;refreshRecords();}
function fetchRecordPage(period,reference,offset,limit,status=recordStatusFilter){return Cloud.rpc('restaurant_filtered_records',{p_period:period,p_reference:reference||null,p_offset:offset,p_limit:limit,p_status:status},true);}
let recordPeriod='day',recordReference=null,recordOffset=0,recordsData=null,recordsBusy=false,recordsPending=false,daySummary=null,recordsServerOffset61=0,recordPaymentExpiryTimer61=null;
function calendarLabel(value){return new Date(value+'T12:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'});}
function setRecordPeriod(period){if(!['day','month'].includes(period))return;recordPeriod=period;recordReference=null;recordOffset=0;$('recordDate').type=period==='day'?'date':period==='month'?'month':'number';$('recordDate').value='';if(period==='year'){$('recordDate').min='2000';$('recordDate').max='2100';$('recordDate').placeholder='2026';}['day','month'].forEach(p=>$('period'+p[0].toUpperCase()+p.slice(1)).className=p===period?'primary-btn':'secondary-btn');refreshRecords();}
function selectRecordDate(){const value=$('recordDate').value;if(recordPeriod==='year'&&value&&!/^(20[0-9]{2}|2100)$/.test(value)){showToast('Choose a year from 2000 to 2100.');return;}recordReference=value?(recordPeriod==='day'?value:recordPeriod==='month'?value+'-01':value+'-01-01'):null;recordOffset=0;refreshRecords();}
function followCurrentPeriod(){$('recordDate').value='';recordReference=null;recordOffset=0;refreshRecords();}
function changeRecordPage(delta){recordOffset=Math.max(0,recordOffset+delta*50);refreshRecords();}
async function refreshRecords(){
 if(!loggedIn)return;if(recordsBusy){recordsPending=true;return;}recordsBusy=true;
 const key=[recordPeriod,recordReference,recordOffset,recordStatusFilter].join('|');
 try{const result=await fetchRecordPage(recordPeriod,recordReference,recordOffset,50);if(key!==[recordPeriod,recordReference,recordOffset,recordStatusFilter].join('|'))return;recordsData=result;const serverMs=Date.parse(result?.server_now);recordsServerOffset61=Number.isFinite(serverMs)?serverMs-Date.now():0;await refreshOrderDeviceStates();renderHistory();if(recordsView==='dishes')await refreshDishSales();}
 catch(e){showToast('Records could not load: '+e.message);}
 finally{recordsBusy=false;if(recordsPending){recordsPending=false;refreshRecords();}}
}
function recordPaymentEditingEnabled(){return window.Custom48?.get?.()?.orderRecordPaymentEdit!==false;}
function recordPaymentWindowMinutes61(){const raw=Number(window.Custom48?.get?.()?.orderRecordPaymentEditMinutes);return Number.isFinite(raw)?Math.max(5,Math.min(1440,Math.round(raw))):120;}
function recordPaymentNow61(){return Date.now()+recordsServerOffset61;}
function recordPaymentIsQr61(o){return o?.order_source!=='manual'&&!String(o?.order_id||'').startsWith('MAN-');}
function recordPaymentExpiresAt61(o){const created=Date.parse(o?.created_at);return Number.isFinite(created)?created+recordPaymentWindowMinutes61()*60000:NaN;}
function recordPaymentCell(o){
 const saved=o.payment_method||'';
 if(!recordPaymentIsQr61(o)||!recordPaymentEditingEnabled()||saved)return `<span class="record-payment-readonly61">${esc(saved||'Not recorded')}</span>`;
 const expires=recordPaymentExpiresAt61(o);
 if(!Number.isFinite(expires)||recordPaymentNow61()>=expires)return '<span class="record-payment-readonly61">Not recorded</span>';
 const id=esc(o.id),name='recordPayment_'+String(o.id).replace(/[^a-zA-Z0-9_-]/g,'');
 return `<div class="record-payment59" role="group" aria-label="Set payment method for ${esc(Cloud.orderLabel(o))}"><label><input type="radio" name="${name}" value="Cash" data-record-payment="${id}"> Cash</label><label><input type="radio" name="${name}" value="Online" data-record-payment="${id}"> Online</label></div>`;
}
function scheduleRecordPaymentExpiry61(){
 clearTimeout(recordPaymentExpiryTimer61);recordPaymentExpiryTimer61=null;
 if(!recordPaymentEditingEnabled()||!recordsData?.records?.length)return;
 const now=recordPaymentNow61(),future=recordsData.records.filter(o=>recordPaymentIsQr61(o)&&!o.payment_method).map(recordPaymentExpiresAt61).filter(t=>Number.isFinite(t)&&t>now);
 if(!future.length)return;
 const wait=Math.min(2147480000,Math.max(50,Math.min(...future)-now+50));
 recordPaymentExpiryTimer61=setTimeout(()=>{recordPaymentExpiryTimer61=null;if(recordsData)renderHistory();},wait);
}
const recordPaymentBusy59=new Set();
document.addEventListener('change',async event=>{
 const input=event.target.closest?.('input[data-record-payment]');if(!input||!loggedIn||!recordPaymentEditingEnabled())return;
 const id=input.dataset.recordPayment;if(recordPaymentBusy59.has(id))return;
 const row=(recordsData?.records||[]).find(o=>o.id===id);if(!row||!recordPaymentIsQr61(row)||row.payment_method)return;
 const expires=recordPaymentExpiresAt61(row);if(!Number.isFinite(expires)||recordPaymentNow61()>=expires){renderHistory();showToast('The payment edit window for this QR order has expired.');return;}
 const next=input.value;recordPaymentBusy59.add(id);
 for(const el of document.querySelectorAll(`input[data-record-payment="${CSS.escape(id)}"]`))el.disabled=true;
 try{
  const saved=await Cloud.rpc('restaurant_set_record_payment59',{p_order:id,p_payment_method:next},true);
  if(!saved?.id)throw Error('Payment method was not saved. Run SUPABASE/UPDATE-61-QR-PAYMENT-LOCK.sql.');
  row.payment_method=saved.payment_method||next;
  const live=orders.find(o=>o.id===id);if(live)live.payment_method=row.payment_method;
  if(analyticsData?.recent){const recent=analyticsData.recent.find(o=>o.id===id);if(recent)recent.payment_method=row.payment_method;}
  showToast('Payment method saved permanently as '+row.payment_method+'.');
 }catch(error){showToast(error.message);}finally{recordPaymentBusy59.delete(id);renderHistory();}
});
function renderHistory(){
 if(!recordsData)return;const d=recordsData;
 $('statTotalOrders').textContent=d.total_orders;$('statTotalRevenue').textContent=money(d.total_value);$('statCompletedOrders').textContent=d.completed_orders;
 $('recordPeriodLabel').textContent=(recordReference?'Selected ':'Current ')+recordPeriod+' · '+calendarLabel(d.period_start)+' to '+calendarLabel(new Date(new Date(d.period_stop+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10))+' · India time';
 const expandedItems=new Set([...$('historyTableBody').querySelectorAll('[data-order-items][open]')].map(el=>el.dataset.orderItems));
 $('historyTableBody').innerHTML=d.records.length?d.records.map(o=>`<tr><td data-label="Time">${dateText(o.created_at)}<br>${timeText(o.created_at)}</td><td data-label="Order ID" title="${esc(o.order_id)}">${esc(shortId(o))}</td><td data-label="Table">${esc(Cloud.tableName(o.table_number))}</td><td data-label="Dish amounts">${orderItemBreakdown(o)}</td><td data-label="Notes">${esc(o.kitchen_notes||'—')}</td><td data-label="Order total">${money(o.total)}</td><td data-label="Payment">${recordPaymentCell(o)}</td><td data-label="Status">${statusPill(o)}</td><td data-label="Actions"><div class="toolbar">${actionButtons(o,true)}</div></td></tr>`).join(''):'<tr><td colspan="9" class="empty">No orders in this calendar period.</td></tr>';
 $('historyTableBody').querySelectorAll('[data-order-items]').forEach(el=>el.open=expandedItems.has(el.dataset.orderItems));
 $('recordsPrevious').disabled=d.offset===0;$('recordsNext').disabled=d.offset+d.records.length>=(d.retained_orders??d.total_orders);
 $('recordsPageLabel').textContent=(d.retained_orders??d.total_orders)?`${d.offset+1}–${d.offset+d.records.length} of ${d.retained_orders??d.total_orders} retained orders`:'0 retained orders';
 scheduleRecordPaymentExpiry61();
}
function renderDashboard(){
 $('statActiveOrders').textContent=orders.filter(o=>o.status==='Pending').length;$('statInKitchen').textContent=orders.filter(o=>['Accepted','Cooking','Ready'].includes(o.status)).length;
 $('adminDate').textContent=dateText(new Date());$('adminTime').textContent=timeText(new Date());if(currentTab==='dashboard'&&!window.Custom48?.sectionHidden('dashboard'))refreshSalesAnalytics();
}
function renderAdminMenu(){
 const category=$('staffMenuCategory');if(category){const names=['All',...Cloud.categories.slice(1)];if(!names.includes(staffMenuCategory))staffMenuCategory='All';category.replaceChildren(...names.map(c=>new Option(c==='All'?'All categories':c,c)));category.value=staffMenuCategory;}
 const root=staffRole==='admin'?$('adminMenuList'):$('managerMenuList'),other=staffRole==='admin'?$('managerMenuList'):$('adminMenuList');
 const expanded=new Set([...root.querySelectorAll('details[open]')].map(e=>e.dataset.itemSettings));other.innerHTML='';
 const q=staffMenuQuery.toLowerCase().trim(),list=menuItems.filter(i=>(staffMenuCategory==='All'||i.category===staffMenuCategory)&&(staffMenuAvailability==='all'||(staffMenuAvailability==='available'?i.available:!i.available))&&(!q||[i.name,i.category,i.description].some(v=>String(v||'').toLowerCase().includes(q))));
 $('staffMenuCount').textContent=list.length+' of '+menuItems.length+' dishes';
 root.innerHTML=list.length?list.map(i=>`<article class="menu-row organized-menu-row" data-menu-id="${esc(i.id)}">
 <div class="staff-dish-header"><div class="menu-emoji">${window.Custom48?.photoMode()==='dish'&&Cloud.safeImage(i.image)?`<img class="menu-photo" src="${esc(Cloud.safeImage(i.image))}" alt="${esc(i.name)}" loading="lazy">`:'🍽️'}</div><div class="menu-copy"><h4>${esc(i.name)}</h4><p class="muted">${esc(i.category)}</p></div><div class="staff-dish-price"><b>${i.sizes_enabled?'From ':''}${money(staffDisplayedPrice(i))}</b><span class="staff-availability">${i.stock_sold_out?'Sold out':i.available?'Available':'Unavailable · hidden'}</span></div></div>
 ${i.description?`<p class="staff-dish-description">${esc(i.description)}</p>`:''}
 ${i.sizes_enabled?`<div class="staff-size-summary">${MenuOptions.keys(i).map(size=>`<span>${esc(staffSizeLabel(size,i))} <b>${money(i.size_prices[size])}</b>${i.size_stock?.[size]?.tracked?' · '+(i.size_stock[size].remaining===0?'Sold out':i.size_stock[size].remaining+' left'):''}</span>`).join('')}</div>`:''}
 <div class="staff-menu-actions"><button class="primary-btn" data-pricing="${esc(i.id)}">Prices &amp; sizes</button>${staffRole==='manager'&&!i.sizes_enabled?`<button class="secondary-btn" data-price-only="${esc(i.id)}">Change price</button>`:''}<button class="secondary-btn availability" data-availability="${esc(i.id)}" aria-pressed="${i.manual_available??i.available}">${(i.manual_available??i.available)?(i.stock_sold_out?'Listed · hide manually':'Available ✓ · set unavailable'):'Hidden · show manually'}</button><button class="secondary-btn" data-recommended="${esc(i.id)}" aria-pressed="${i.recommended===true}">${i.recommended?'Recommended ✓ · remove':'Mark recommended'}</button><button class="secondary-btn" data-best-seller="${esc(i.id)}" aria-pressed="${i.best_seller===true}">${i.best_seller?'Best seller ✓ · remove':'Mark best seller'}</button></div>
 ${staffRole==='admin'?`<details class="staff-item-settings" data-item-settings="${esc(i.id)}"${expanded.has(i.id)?' open':''}><summary>Item settings · category, details &amp; photo</summary><div class="staff-item-settings-body"><label>Category<select data-dish-category="${esc(i.id)}">${Cloud.categories.slice(1).map(c=>`<option value="${esc(c)}" ${c===i.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><div class="staff-detail-actions"><button class="secondary-btn" data-edit="${esc(i.id)}">Edit details</button><button class="secondary-btn" data-item-photo="${esc(i.id)}">Change photo</button><button class="danger-btn" data-delete-item="${esc(i.id)}">Delete</button></div></div></details>`:''}</article>`).join(''):'<p class="empty">'+(menuItems.length?'No dishes match these filters.':'Your menu is empty. Admin can use + Add Item to add dishes.')+'</p>';
}
function filterStaffMenu(){staffMenuQuery=$('staffMenuSearch').value;staffMenuCategory=$('staffMenuCategory').value;staffMenuAvailability=$('staffMenuAvailability').value;renderAdminMenu();}
function clearStaffMenuFilters(){staffMenuQuery='';staffMenuCategory='All';staffMenuAvailability='all';$('staffMenuSearch').value='';$('staffMenuAvailability').value='all';renderAdminMenu();}
let pricingVersion=null,pricingSnapshot=null;
function addPricingSize(key='',label='',price=''){
 const root=$('pricingSizeRows');
 if(root.children.length>=20){$('pricingStatus').textContent='A dish can have up to 20 sizes.';return;}
 const row=document.createElement('div');row.className='custom-size-row';row.dataset.variant=key||'v_'+crypto.randomUUID().replaceAll('-','');
 row.innerHTML=`<label>Size name<input data-size-label maxlength="40" required placeholder="e.g. Half · 6 pieces" value="${esc(label)}"></label><label>Price (₹)<input data-size-price type="number" min="0" max="100000" step="0.01" inputmode="decimal" required value="${esc(price)}"></label><button class="danger-btn" type="button" data-remove-size aria-label="Remove this size">Remove</button>`;
 row.querySelector('[data-remove-size]').onclick=()=>{row.remove();$('pricingStatus').textContent='Size removed from this draft. Save changes to publish.';};root.append(row);updatePricingMode();
 if(!key)row.querySelector('input').focus();
}
function openMenuPricing(id){
 const item=menuItems.find(i=>i.id===id);if(!item)return;pricingMenuId=id;pricingVersion=item.updated_at;pricingSnapshot={name:item.name,description:item.description||'',category:item.category,veg:item.veg!==false,sizes_enabled:item.sizes_enabled===true,price:Number(item.price),size_prices:item.size_prices||{},size_labels:item.size_labels||{}};
 $('pricingItemName').textContent=item.name;$('pricingUseSizes').checked=item.sizes_enabled===true;$('pricingBasePrice').value=Number(item.price).toFixed(2);
 $('pricingDishName').value=item.name;$('pricingDescription').value=item.description||'';$('pricingVeg').checked=item.veg!==false;
 $('pricingCategory').replaceChildren(...Cloud.categories.slice(1).map(c=>new Option(c,c)));$('pricingCategory').value=item.category;
 $('pricingDetails').hidden=staffRole!=='admin';$('pricingDetails').disabled=staffRole!=='admin';
 $('pricingSizeRows').replaceChildren();for(const key of MenuOptions.keys(item))addPricingSize(key,MenuOptions.label(item,key),Number(item.size_prices[key]).toFixed(2));
 $('pricingStatus').textContent='';updatePricingMode();$('menuPricingModal').showModal();
}
function updatePricingMode(){
 const mode=$('pricingUseSizes').checked;$('pricingSizes').hidden=!mode;$('pricingSingle').hidden=mode;$('pricingBasePrice').required=!mode;$('pricingBasePrice').disabled=mode;
 $('pricingSizeRows').querySelectorAll('input').forEach(input=>{input.disabled=!mode;input.required=mode;});
}
async function saveMenuPricing(event){
 event.preventDefault();const mode=$('pricingUseSizes').checked,prices={},labels={},seen=new Set();
 if(mode){for(const row of $('pricingSizeRows').children){const key=row.dataset.variant,label=row.querySelector('[data-size-label]').value.trim(),raw=row.querySelector('[data-size-price]').value,price=Number(raw);
 if(!label||label.length>40||seen.has(label.toLocaleLowerCase())||raw===''||!MenuOptions.validPrice(price)){$('pricingStatus').textContent='Use unique size names (up to 40 characters) and prices from 0 to 100000 with up to two decimals.';return;}
 seen.add(label.toLocaleLowerCase());prices[key]=price;labels[key]=label;}}
 const base=mode?Math.min(...Object.values(prices)):Number($('pricingBasePrice').value);
 if(!MenuOptions.validPrice(base)||(mode&&!Object.keys(prices).length)){$('pricingStatus').textContent='Add at least one size, or turn off portion sizes to use a single price.';return;}
 const metadata=staffRole==='admin'?{name:$('pricingDishName').value.trim(),description:$('pricingDescription').value.trim(),category:$('pricingCategory').value,veg:$('pricingVeg').checked}:null;
 if(metadata&&(!metadata.name||metadata.name.length>120)){$('pricingStatus').textContent='Enter a dish name (up to 120 characters).';return;}
 const button=$('pricingSave');button.disabled=true;
 try{
  // Re-read just before saving. Ignore unrelated dish changes (photo, availability, badges, stock),
  // but preserve conflict protection if another manager changed fields this editor controls.
  const latest=await Cloud.rpc('restaurant_staff_menu_item63',{p_id:pricingMenuId},true);
  if(!latest)throw Error('Menu item not found. Reload the menu.');
  const latestEditable={name:latest.name,description:latest.description||'',category:latest.category,veg:latest.veg!==false,sizes_enabled:latest.sizes_enabled===true,price:Number(latest.price),size_prices:latest.size_prices||{},size_labels:latest.size_labels||{}};
  if(JSON.stringify(latestEditable)!==JSON.stringify(pricingSnapshot))throw Error('This dish changed on another device. Close the editor, refresh, then try again.');
  pricingVersion=latest.updated_at;
  await Cloud.rpc('restaurant_menu_customize',{p_id:pricingMenuId,p_sizes_enabled:mode,p_base_price:base,p_size_prices:prices,p_size_labels:labels,p_details:metadata,p_expected_updated_at:pricingVersion},true);pricingSnapshot=null;$('menuPricingModal').close();await refreshCloud();await window.Custom48?.refreshManagementDishes();showToast('Menu changes saved. Customer menus and waiter billing use the shared menu.');}
 catch(e){$('pricingStatus').textContent=/restaurant_menu_customize|schema cache/.test(e.message)?'Install SUPABASE/YUMMY-MOMO-36.sql, then refresh this page.':e.message;}
 finally{button.disabled=false;}
}
async function toggleAvailability(id,b){const item=menuItems.find(i=>i.id===id);if(!item)return;b.disabled=true;try{await patchMenuOptions(id,{available:!(item.manual_available??item.available),updated_at:new Date().toISOString()});await refreshCloud();showToast((item.manual_available??item.available)?'Item hidden from all customer menus.':'Item is available again.');}catch(e){showToast(e.message);}finally{b.disabled=false;}}
async function editMenuDetails(id){
 const i=menuItems.find(x=>x.id===id);if(!i)return;
 const name=prompt('Item name',i.name);if(name===null)return;const price=i.sizes_enabled?String(i.price):prompt('Price',i.price);if(price===null)return;const description=prompt('Description',i.description);if(description===null)return;
 if(!name.trim()||name.length>120||!Number.isFinite(Number(price))||Number(price)<0||Number(price)>100000||description.length>1000){showToast('Enter a valid name, price and description.');return;}
 try{await Cloud.patchMenu(id,{name:name.trim(),price:Number(price),description,updated_at:new Date().toISOString()});await refreshCloud();}catch(e){showToast(e.message);}
}
async function showAddItemModal(){try{await loadStaffCategories();if(!$('addItemModal').open)$('addItemModal').showModal();}catch(e){showToast('Categories could not load: '+e.message);}}
function closeAddItemModal(){$('addItemModal').close();}
async function addMenuItem(){
 const b=$('addItemSaveButton');b.disabled=true;
 try{const row=Cloud.menuRow({id:crypto.randomUUID(),name:$('newItemName').value.trim(),price:$('newItemPrice').value,category:$('newItemCategory').value,description:$('newItemDesc').value,image:photoDrafts.new.data,veg:$('newItemVeg').checked,available:true});await Cloud.saveMenu([row]);closeAddItemModal();$('addItemModal').querySelector('form').reset();photoDrafts.new={data:''};$('newItemPhotoPreview').hidden=true;await refreshCloud();showToast('Item added to the shared menu.');}catch(e){showToast(e.message);}finally{b.disabled=false;}
}
async function deleteMenuItem(id){if(!confirm('Delete this dish from every customer menu? Existing order records are kept.'))return;try{await Cloud.deleteMenu(id);await refreshCloud();}catch(e){showToast(e.message);}}
async function chooseMenuPhoto(kind,input){
 const f=input.files?.[0];if(!f)return;const selection=++photoSelections[kind],target=kind==='new'?'newItem':'editItem';
 if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>10*1024*1024){showToast('Use a JPG, PNG or WebP under 10 MB.');input.value='';return;}
 const button=$(kind==='new'?'addItemSaveButton':'saveItemPhotoButton');button.disabled=true;
 try{const image=await YummyCrop.open(f);if(image&&selection===photoSelections[kind]){photoDrafts[kind]={data:image};$(target+'PhotoImage').src=image;$(target+'PhotoPreview').hidden=false;showToast('Square photo ready · save to publish.');}}
 catch(e){showToast(e.message);}finally{input.value='';if(selection===photoSelections[kind])button.disabled=false;}
}
function removePhotoDraft(kind){photoSelections[kind]++;$(kind==='new'?'addItemSaveButton':'saveItemPhotoButton').disabled=false;photoDrafts[kind]={data:''};$(kind==='new'?'newItemPhotoPreview':'editItemPhotoPreview').hidden=true;}
function showItemPhotoModal(id){photoSelections.edit++;$('saveItemPhotoButton').disabled=false;const i=menuItems.find(x=>x.id===id);if(!i)return;editingPhotoItemId=id;photoDrafts.edit={data:i.image};$('photoModalItemName').textContent=i.name;$('editItemPhotoPreview').hidden=!i.image;if(i.image)$('editItemPhotoImage').src=Cloud.safeImage(i.image);$('itemPhotoModal').showModal();}
function closeItemPhotoModal(){$('itemPhotoModal').close();}
async function saveItemPhoto(){const b=$('saveItemPhotoButton');b.disabled=true;try{await Cloud.patchMenu(editingPhotoItemId,{image:photoDrafts.edit.data||'',updated_at:new Date().toISOString()});closeItemPhotoModal();await refreshCloud();}catch(e){showToast(e.message);}finally{b.disabled=false;}}
function stopAlarmSound(){alarmNodes.forEach(n=>{try{n.stop();n.disconnect();}catch{}});alarmNodes=[];}
function playLoudAlarm(){
 stopAlarmSound();if(!soundEnabled||audioContext?.state!=='running')return;
 const start=audioContext.currentTime;
 // 12-second two-tone alarm; volume still depends on the device's media volume.
 for(let j=0;j<24;j++){
  const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=start+j*.5;
  osc.type='triangle';osc.frequency.setValueAtTime(j%2?1046:784,at);
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.42,at+.02);gain.gain.setValueAtTime(.42,at+.28);gain.gain.linearRampToValueAtTime(0,at+.4);
  osc.connect(gain);gain.connect(AlertDevice.output(audioContext));osc.start(at);osc.stop(at+.42);alarmNodes.push(osc);
 }
 try{navigator.vibrate?.([300,150,300]);}catch{}
}
async function keepScreenAwake(){await KitchenOps.ensureAwake();}
async function toggleSound(){await requestRing.toggle();soundEnabled=requestRing.enabled;}

function persistAlarms(){try{Cloud.write('RESTAURANT_ALARMS_v2',alarmState);}catch{}}
function closeAlarm(){if($('alarmModal').open)$('alarmModal').close();alarmIds=[];}
function checkAlarm(){requestRing.update(requestRows);orderRing.update(orders.filter(o=>o.status==='Pending'));}
async function toggleOrderSound(){await orderRing.toggle();}
function snoozeAlarm(){const now=Date.now();alarmIds.forEach(id=>{alarmState[id]={dismissed:false,snoozedUntil:now+120000,nextAt:now+120000};});persistAlarms();stopAlarmSound();closeAlarm();showToast('Alarm snoozed for 2 minutes on this device. Orders are still pending.');}
function dismissAlarm(){alarmIds.forEach(id=>{alarmState[id]={dismissed:true};});persistAlarms();stopAlarmSound();closeAlarm();showToast('Alarm dismissed on this device. The orders are NOT cancelled.');}
function viewAlarmOrders(){stopAlarmSound();closeAlarm();setFilter('Pending');switchTab('live');}
$('alarmModal').addEventListener('cancel',e=>{e.preventDefault();dismissAlarm();});

function makeQr(url){try{const qr=qrcode(0,'M');qr.addData(url);qr.make();return qr.createSvgTag({cellSize:4,margin:16,scalable:true});}catch{return '<p>Use the shared link instead.</p>';}}
let privateWaiterUrl='';
function waiterUrl(){return privateWaiterUrl;}
async function shareWaiterLink(rotate=false){
 if(rotate&&!confirm('Revoke all current waiter sessions and replace the pairing QR? Waiters will have to scan the new QR.'))return;
 if(!$('waiterModal').open)$('waiterModal').showModal();
 $('waiterLink').value='';$('waiterQr').hidden=true;$('waiterQr').innerHTML='';$('waiterLinkStatus').textContent='Preparing the waiter pairing QR…';
 $('waiterShareButtons').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{const result=await Cloud.rpc('restaurant_waiter_link',{p_rotate:rotate},true);const link=new URL('waiter.html',location.href);link.hash='pair='+result.token;privateWaiterUrl=link.href;$('waiterLink').value=privateWaiterUrl;$('waiterQr').innerHTML=makeQr(privateWaiterUrl);$('waiterQr').hidden=false;const hours=result.access_hours||18;$('waiterLinkStatus').textContent=rotate?`New pairing QR ready. Existing waiter sessions and previous QR codes are revoked. New scans get ${hours} hours.`:`Open the installed Waiter PWA and scan this QR. Each scan grants ${hours} hours of access.`;}
 catch(e){privateWaiterUrl='';$('waiterLinkStatus').textContent='Could not prepare QR: '+e.message;}
 finally{$('waiterShareButtons').querySelectorAll('button').forEach(b=>b.disabled=!privateWaiterUrl);}
}
async function copyWaiterLink(){if(!privateWaiterUrl)return;try{await navigator.clipboard.writeText(privateWaiterUrl);showToast('Waiter pairing link copied.');}catch{$('waiterLink').select();showToast('Copy the selected link manually.');}}
async function shareLinkNative(){if(!privateWaiterUrl)return;try{if(navigator.share)await navigator.share({title:config.restaurantName?config.restaurantName+' · waiter pairing QR':'Waiter pairing QR',url:privateWaiterUrl});else await copyWaiterLink();}catch(e){if(e.name!=='AbortError')showToast('Use Copy link instead.');}}
function findOrder(id){return orders.find(x=>x.id===id)||cancelledOrdersData?.records.find(x=>x.id===id)||analyticsData?.recent?.find(x=>x.id===id)||recordsData?.records.find(x=>x.id===id);}
let currentBillSnapshot=null;
function receiptHtml(o){return YummyReceipt.html(o);}
function showBillPreview(id){const o=findOrder(id);if(!o){showToast('Bill not found. Refresh records and try again.');return;}currentBillOrderId=id;currentBillSnapshot=structuredClone(o);$('billPreview').innerHTML=receiptHtml(currentBillSnapshot);if(!$('billModal').open)$('billModal').showModal();}
function closeBillModal(){$('billModal').close();}
async function printBill(){try{await window.Custom48?.sync();}catch(error){showToast('Bill settings could not load: '+error.message);return;}const o=currentBillSnapshot||findOrder(currentBillOrderId);if(!o){showToast('Open a bill before printing.');return;}$('printReceipt').innerHTML=receiptHtml(o);await YummyReceipt.ready($('printReceipt'));closeBillModal();window.print();}
let exportBusy=false;
async function exportRecords(){
 if(exportBusy)return;exportBusy=true;showToast('Preparing the selected period export…');
 const period=recordPeriod,reference=recordReference||recordsData?.period_start,status=recordStatusFilter;
 try{const all=[];let offset=0;for(;;){const page=await fetchRecordPage(period,reference,offset,200,status);all.push(...page.records);offset+=page.records.length;if(offset>=page.total_orders||!page.records.length)break;}
 const quote=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"',rows=[['Time','Order number','Table','Customer','Items','Items subtotal','Tax','Total','Payment method','Status'],...all.map(o=>[o.created_at,Cloud.orderLabel(o),Cloud.tableName(o.table_number),o.customer_name,o.items.map(i=>i.qty+'x '+i.name+' @ '+money(i.price)+' = '+money(i.subtotal??Number(i.qty)*Number(i.price))).join('; '),o.items_subtotal??o.total,o.tax_amount??0,o.total,o.payment_method||'',o.status])];download('restaurant-orders-'+period+'.csv','\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv');showToast('Exported '+all.length+' orders from the selected period.');}
 catch(e){showToast('Export failed: '+e.message);}finally{exportBusy=false;}
}
async function toggleRecommended(id,b){const item=menuItems.find(i=>i.id===id);if(!item)return;const next=!item.recommended;b.disabled=true;try{const saved=await patchMenuOptions(id,{recommended:next});item.recommended=saved?.recommended===true;renderAdminMenu();await refreshCloud();showToast(next?'Marked Recommended. Customer menus update within 30 seconds.':'Recommended label removed. Customer menus update within 30 seconds.');}catch(e){showToast(/restaurant_manager_menu_flags|recommended|schema cache/i.test(e.message)?'Menu flag setup is missing. Run SUPABASE/UPGRADE-EXISTING-PROJECT.sql, then refresh this page.':e.message);}finally{b.disabled=false;}}
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
 if(b.dataset.filter)setFilter(b.dataset.filter);if(b.dataset.next)setOrderStatus(b.dataset.id,b.dataset.next,b);if(b.dataset.bill)showBillPreview(b.dataset.bill);
 if(b.dataset.pricing)openMenuPricing(b.dataset.pricing);if(b.dataset.priceOnly)changePriceOnly(b.dataset.priceOnly);if(b.dataset.bestSeller)toggleBestSeller(b.dataset.bestSeller,b);if(b.dataset.recommended)toggleRecommended(b.dataset.recommended,b);if(b.dataset.availability)toggleAvailability(b.dataset.availability,b);if(b.dataset.edit)editMenuDetails(b.dataset.edit);if(b.dataset.deleteItem)deleteMenuItem(b.dataset.deleteItem);if(b.dataset.itemPhoto)showItemPhotoModal(b.dataset.itemPhoto);

});

// Release63: staff-heavy tabs load only when opened, then fetch small pages near the scroll edge.
const renderAdminMenuBefore63=renderAdminMenu;
let staffMenuTotal63=0,staffMenuHasMore63=false,staffMenuBusy63=false,staffMenuStarted63=false,staffMenuRequest63=0,staffMenuSearchTimer63=null,staffMenuReloadQueued63=false;
function updateStaffMenuSentinel63(){
 const el=$('staffMenuSentinel63');if(!el)return;
 if(staffMenuBusy63)el.textContent='Loading more dishes…';
 else if(!staffMenuStarted63)el.textContent='Open Menu to load dishes.';
 else if(staffMenuHasMore63)el.textContent='Scroll to load more dishes';
 else el.textContent=staffMenuTotal63?'All matching dishes loaded':'No matching dishes';
}
async function loadStaffMenuPage63(reset=false){
 if(!loggedIn||currentTab!=='menu')return;if(staffMenuBusy63){if(reset)staffMenuReloadQueued63=true;return;}
 const request=++staffMenuRequest63;if(reset){menuItems=[];staffMenuTotal63=0;staffMenuHasMore63=false;staffMenuStarted63=true;renderAdminMenuBefore63();}
 staffMenuBusy63=true;updateStaffMenuSentinel63();
 try{
  const data=await Cloud.rpc('restaurant_staff_menu_page63',{p_query:staffMenuQuery,p_category:staffMenuCategory,p_availability:staffMenuAvailability,p_offset:reset?0:menuItems.length,p_limit:15},true);
  if(request!==staffMenuRequest63||currentTab!=='menu'||!data)return;
  if(Array.isArray(data.categories))Cloud.setCategories(data.categories);
  const incoming=Array.isArray(data.items)?data.items:[];
  if(reset)menuItems=incoming;else{const ids=new Set(menuItems.map(i=>i.id));for(const item of incoming)if(!ids.has(item.id)){ids.add(item.id);menuItems.push(item);}}
  staffMenuTotal63=Number(data.total)||0;staffMenuHasMore63=menuItems.length<staffMenuTotal63&&incoming.length>0;staffMenuStarted63=true;renderAdminMenu();
 }catch(e){if(reset&&!menuItems.length)staffMenuStarted63=false;showToast(/restaurant_staff_menu_page63|schema cache/i.test(e.message)?'Run RUN-THIS-RELEASE63.sql in Supabase, then refresh.':e.message);}
 finally{staffMenuBusy63=false;updateStaffMenuSentinel63();if(staffMenuReloadQueued63){staffMenuReloadQueued63=false;void loadStaffMenuPage63(true);}}
}
function loadMoreStaffMenu63(){if(currentTab==='menu'&&staffMenuHasMore63&&!staffMenuBusy63)void loadStaffMenuPage63(false);}
renderAdminMenu=function(){
 renderAdminMenuBefore63();
 if($('staffMenuCount'))$('staffMenuCount').textContent=staffMenuStarted63?`${menuItems.length} of ${staffMenuTotal63} matching dishes loaded`:'Dishes load when this tab opens.';
 updateStaffMenuSentinel63();
};
filterStaffMenu=function(){
 staffMenuQuery=$('staffMenuSearch').value;staffMenuCategory=$('staffMenuCategory').value;staffMenuAvailability=$('staffMenuAvailability').value;
 clearTimeout(staffMenuSearchTimer63);$('staffMenuCount').textContent='Searching…';staffMenuSearchTimer63=setTimeout(()=>void loadStaffMenuPage63(true),250);
};
clearStaffMenuFilters=function(){
 staffMenuQuery='';staffMenuCategory='All';staffMenuAvailability='all';$('staffMenuSearch').value='';$('staffMenuAvailability').value='all';$('staffMenuCategory').value='All';clearTimeout(staffMenuSearchTimer63);void loadStaffMenuPage63(true);
};

let recordsHasMore63=false,recordsGeneration63=0;
function updateRecordsSentinel63(){
 const el=$('recordsSentinel63');if(!el)return;
 if(recordsBusy)el.textContent='Loading more order records…';
 else if(!recordsData)el.textContent='Open Order Records to load recent records.';
 else if(recordsHasMore63)el.textContent='Scroll to load more order records';
 else el.textContent=recordsData.records?.length?'All matching order records loaded':'No order records in this period';
}
async function loadRecordPage63(reset=false){
 if(!loggedIn||currentTab!=='history'||recordsView!=='orders')return;
 if(recordsBusy){recordsPending=reset||recordsPending;return;}
 if(reset){recordsGeneration63++;recordsData=null;recordOffset=0;recordsHasMore63=false;$('historyTableBody').innerHTML='<tr><td colspan="9" class="empty">Loading order records…</td></tr>';}
 const generation=recordsGeneration63,offset=reset?0:(recordsData?.records?.length||0),queryKey=[recordPeriod,recordReference,recordStatusFilter,generation].join('|');recordsBusy=true;updateRecordsSentinel63();
 try{
  const page=await fetchRecordPage(recordPeriod,recordReference,offset,15);
  if(generation!==recordsGeneration63||queryKey!==[recordPeriod,recordReference,recordStatusFilter,generation].join('|'))return;
  const previous=reset?[]:(recordsData?.records||[]),seen=new Set(previous.map(o=>o.id)),merged=[...previous];for(const row of page.records||[])if(!seen.has(row.id)){seen.add(row.id);merged.push(row);}
  recordsData={...page,offset:0,records:merged};recordOffset=merged.length;const total=Number(page.retained_orders??page.total_orders??0);recordsHasMore63=merged.length<total&&(page.records||[]).length>0;
  const serverMs=Date.parse(page?.server_now);recordsServerOffset61=Number.isFinite(serverMs)?serverMs-Date.now():0;await refreshOrderDeviceStates();renderHistory();
 }catch(e){showToast(/restaurant_filtered_records|schema cache/i.test(e.message)?'Order Records setup is missing. Run the supplied database updates.':'Records could not load: '+e.message);}
 finally{recordsBusy=false;updateRecordsSentinel63();if(recordsPending){recordsPending=false;void loadRecordPage63(true);}}
}
refreshRecords=function(){return recordsView==='dishes'?refreshDishSales():loadRecordPage63(true);};
changeRecordPage=function(delta){if(delta>0)return loadRecordPage63(false);if(delta<0)return loadRecordPage63(true);};
function loadMoreRecords63(){if(currentTab==='history'&&recordsView==='orders'&&recordsHasMore63&&!recordsBusy)void loadRecordPage63(false);}

// Replace the old background screen sync. Heavy tabs now own their lazy reads.
refreshBackgroundData=function(){
 if(!loggedIn||window.Custom48?.sectionHidden(currentTab))return Promise.resolve();
 if(summarySyncPromise)return summarySyncPromise;
 summarySyncPromise=(async()=>{
  if(currentTab==='menu'&&!staffMenuStarted63)await loadStaffMenuPage63(true);
  if(currentTab==='dashboard')await refreshSalesAnalytics(false);
  if(currentTab==='stocks')await refreshStocks();
  if(currentTab==='management')void YummyStocksSettings.sync();
 })().finally(()=>{summarySyncPromise=null;});
 return summarySyncPromise;
};
refreshCloud=function(){
 if(!loggedIn)return Promise.resolve();
 const jobs=[refreshOrders()];
 if(currentTab==='menu')jobs.push(loadStaffMenuPage63(true));else jobs.push(refreshBackgroundData());
 return Promise.allSettled(jobs).then(()=>undefined);
};

const lazyObserver63='IntersectionObserver' in window?new IntersectionObserver(entries=>{
 for(const entry of entries)if(entry.isIntersecting){if(entry.target.id==='staffMenuSentinel63')loadMoreStaffMenu63();if(entry.target.id==='recordsSentinel63')loadMoreRecords63();}
},{root:null,rootMargin:'180px 0px',threshold:0}):null;
if(lazyObserver63){if($('staffMenuSentinel63'))lazyObserver63.observe($('staffMenuSentinel63'));if($('recordsSentinel63'))lazyObserver63.observe($('recordsSentinel63'));}

setConnection('Sign in');StaffAuth.start(enterStaff);
setInterval(()=>{checkAlarm();},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&loggedIn)renderOrders();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&loggedIn){refreshCloud();keepScreenAwake();}else stopAlarmSound();});

navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='restaurant-push-open'&&loggedIn){switchTab(e.data.screen==='orders'?'live':e.data.screen==='notifications'?'notifications':'requests');refreshStockNotifications();refreshSecurityNotifications();refreshCloud();}});

async function loadReviewSettings(){$('reviewUrlInput').disabled=true;$('reviewSettingsSave').disabled=true;try{const r=await Cloud.rpc('restaurant_review_settings',{p_url:null});$('reviewUrlInput').value=r.url||'';$('reviewSettingsStatus').textContent='';}catch(e){$('reviewSettingsStatus').textContent=reviewSettingsError(e);}finally{$('reviewUrlInput').disabled=false;$('reviewSettingsSave').disabled=false;}}
async function saveReviewSettings(event){event.preventDefault();const b=$('reviewSettingsSave');b.disabled=true;try{const r=await Cloud.rpc('restaurant_review_settings',{p_url:$('reviewUrlInput').value},true);$('reviewUrlInput').value=r.url;$('reviewSettingsStatus').textContent=r.url?'Google review link saved.':'Review link cleared.';}catch(e){$('reviewSettingsStatus').textContent=reviewSettingsError(e);}finally{b.disabled=false;}}

function reviewSettingsError(e){return /restaurant_review_settings|schema cache/.test(e.message)?'Database setup missing: run SUPABASE/UPGRADE-EXISTING-PROJECT.sql in this shop’s Supabase project, wait a few seconds, then refresh this page.':e.message;}

async function toggleBestSeller(id,b){const item=menuItems.find(i=>i.id===id);if(!item)return;const next=!item.best_seller;b.disabled=true;try{const saved=await patchMenuOptions(id,{best_seller:next});item.best_seller=saved?.best_seller===true;renderAdminMenu();await refreshCloud();showToast(next?'Marked Best seller. Customer menus update within 30 seconds.':'Best seller label removed. Customer menus update within 30 seconds.');}catch(e){showToast(/restaurant_manager_menu_flags|best_seller|schema cache/i.test(e.message)?'Menu flag setup is missing. Run SUPABASE/UPGRADE-EXISTING-PROJECT.sql, then refresh this page.':e.message);}finally{b.disabled=false;}}

let requestRows=[],lastRequestAlarm=0,reservedSeen=new Set();
function renderRequestAlerts(rows){const alertRows=rows.filter(r=>r.request_kind!=='Reception'&&r.table_number!=='COUNTER'&&r.table_number!=='RECEPTION'&&r.request_origin!=='staff_dashboard');requestRows=alertRows;const current=alertRows.filter(r=>r.request_kind==='ReservedScan');const box=$('reservedStaffAlert');box.hidden=!current.length;box.textContent=current.map(r=>'Reserved table QR opened · '+Cloud.tableName(r.table_number)+' — please check seating.').join(' ');if(alertRows.some(r=>!reservedSeen.has(r.id))){if(current.length)showToast(box.textContent);lastRequestAlarm=0;checkAlarm();}if(!alertRows.length)stopAlarmSound();reservedSeen=new Set(alertRows.map(r=>r.id));}
async function changePriceOnly(id){const i=menuItems.find(x=>x.id===id);if(!i)return;const value=prompt('New price for '+i.name,i.price);if(value===null)return;const price=Number(value);if(!value.trim()||!Number.isFinite(price)||price<0||price>100000){showToast('Enter a valid price.');return;}try{await Cloud.rpc('restaurant_manager_price',{p_id:id,p_price:price},true);await refreshCloud();showToast('Price updated.');}catch(e){showToast(e.message);}}
let staffCallAttempt=null;
async function openStaffCall(){try{const data=await Cloud.rpc('restaurant_manage_tables',{p_action:'list',p_table:null,p_status:null},true);Cloud.setTableNames(data);$('staffCallTable').innerHTML='<option value="COUNTER">Counter</option>'+data.map(t=>`<option value="${esc(t.table_number)}">${esc(Cloud.tableName(t.table_number))}</option>`).join('');$('staffCallStatus').textContent='';$('staffCallSend').disabled=false;$('staffCallModal').showModal();}catch(e){showToast(e.message);}}
async function sendStaffCall(event){event.preventDefault();const table=$('staffCallTable').value,b=$('staffCallSend');b.disabled=true;try{if(staffCallAttempt?.table!==table)staffCallAttempt={id:crypto.randomUUID(),table};await Cloud.rpc('restaurant_staff_call',{p_request_id:staffCallAttempt.id,p_table:table},true);staffCallAttempt=null;$('staffCallStatus').textContent=table==='COUNTER'?'Waiter requested at counter.':'Waiter requested for '+Cloud.tableName(table);await kitchenRequests.refresh();}catch(e){$('staffCallStatus').textContent=e.message;}finally{b.disabled=false;}}

function patchMenuOptions(id,patch){return Cloud.rpc('restaurant_manager_menu_flags',{p_id:id,p_available:patch.available??null,p_recommended:patch.recommended??null,p_best_seller:patch.best_seller??null},true);}

const requestRing=RequestRing.mount({scope:'kitchen',button:document.getElementById('soundButton'),onActive:()=>orderRing.pause()});
const orderRing=RequestRing.mount({scope:'kitchen-orders',kind:'order',button:document.getElementById('orderSoundButton'),suppressed:()=>requestRing.enabled&&requestRing.dialog.open});

document.addEventListener('restaurant-table-names',()=>{
 if(!loggedIn)return;
 renderOrders();if(recordsData)renderHistory();if(analyticsData)renderSalesAnalytics();
 if(requestRows)renderRequestAlerts(requestRows);
 if(typeof securityData!=='undefined'&&securityData)renderSecurityNotifications();
 if(typeof deviceData!=='undefined'&&deviceData)renderCustomerDevices();
 if(currentBillSnapshot&&$('billModal').open)$('billPreview').innerHTML=receiptHtml(currentBillSnapshot);
 const select=$('staffCallTable');if(select)for(const option of select.options)if(option.value!=='COUNTER')option.textContent=Cloud.tableName(option.value);
 if(currentTab==='tables'&&!window.Custom48?.sectionHidden('tables')&&!document.querySelector('.table-name-form input[data-dirty="true"]'))void refreshTables();
});

// Release46: one lightweight pulse drives background revisions and alerts.
let staffPulse46={},staffPulseBusy46=null,staffPulseClock46=0,backgroundUnread46={stock:0,security:0};
function refreshStaffPulse46(){
 if(staffPulseBusy46||!loggedIn)return staffPulseBusy46;
 staffPulseBusy46=(async()=>{try{
  const now=Date.now(),reconcile=now-staffPulseClock46>60000;
  const known=reconcile?{...staffPulse46,calls:null,stock_notices:null,security_notices:null}:staffPulse46;
  const pulse=await Cloud.rpc('restaurant_staff_pulse47',{p_known:known},true);if(!loggedIn)return;
  if(pulse.role&&pulse.role!==staffRole){Cloud.clearPrivate();location.reload();return;}const rev=pulse.revisions,old=staffPulse46;
  if(old.config!==rev.config)await Cloud.refreshTableNames({staff:true,force:!!old.config});
  if(old.permissions!==rev.permissions||old.config!==rev.config||reconcile){await loadManagerDeviceAccess();await RestaurantAlerts.sync();await YummyStocksSettings.sync();}
  if(old.active!==rev.active)await refreshOrders();else {lastSuccessfulSync=now;setConnection('Live');}
  if(pulse.calls){$('requestsBadge').textContent=pulse.calls.length;renderRequestAlerts(pulse.calls);kitchenRequests?.setPending(pulse.calls);}
  for(const [key,kind] of [['stock','stock'],['security','security']])if(pulse[key]){
   backgroundUnread46[key]=pulse[key].unread;BackgroundAlerts.notifyRows(kind,pulse[key].notifications);RestaurantAlerts.observeNotifications(pulse[key].notifications);
  }
  paintNotificationsBadge();
  const currentTabHidden=window.Custom48?.sectionHidden(currentTab);
  if(!currentTabHidden&&currentTab==='requests'&&(old.calls!==rev.calls||reconcile))await kitchenRequests?.refresh();
  if(!currentTabHidden&&currentTab==='notifications'){
   if(old.stock_notices!==rev.stock_notices||reconcile)await refreshStockNotifications();
   if(old.security_notices!==rev.security_notices||old.permissions!==rev.permissions||reconcile)await refreshSecurityNotifications();
  }
  if(!currentTabHidden&&currentTab==='history'&&(old.history!==rev.history||reconcile))await refreshRecords();
  if(!currentTabHidden&&currentTab==='live'&&currentFilter==='Cancelled'&&(old.history!==rev.history||reconcile))await refreshCancelledOrders();
  if(!currentTabHidden&&['menu','stocks','billing'].includes(currentTab)&&(old.catalog!==rev.catalog||old.stock!==rev.stock||old.config!==rev.config)){if(currentTab==='menu')await loadStaffMenuPage63(true);else if(currentTab==='billing')await YummyBilling.open();else await refreshBackgroundData();}
  if(old.devices!==rev.devices||old.permissions!==rev.permissions)await refreshOrderDeviceStates();
  staffPulse46=rev;if(reconcile)staffPulseClock46=now;
 }catch(e){setConnection('Reconnecting…');cloudError('Updates could not refresh: '+e.message);if(!isTemporaryCloudFailure(e)){requestRing.disable();orderRing.disable();Cloud.clearPrivate();orders=[];menuItems=[];$('staffMain').hidden=true;$('managerNav').hidden=true;$('loginPanel').hidden=false;$('loginStatus').textContent='Staff access could not be verified. Reload or sign in again. '+e.message;loggedIn=false;}}
 })().finally(()=>staffPulseBusy46=null);return staffPulseBusy46;
}
window.addEventListener('offline',()=>{if(loggedIn){setConnection('Reconnecting…');cloudError('Offline — reconnect to receive new orders and requests. Last fetched cards may be out of date.');}});
