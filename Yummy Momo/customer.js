'use strict';
let sharedMenu=[], receipts=[], pendingAttempt=null, serverOffset=0, menuBusy=false, trackingBusy=false,placingOrder=false;
let receiptSyncPromise=null,receiptSyncError='',historyReturnFocus=null,trackingHistoryMode=false;
let CURRENT_VISIT_MS=2*60*60*1000,HISTORY_KEEP_MS=3*60*60*1000,retentionLoaded=false;
function applyCustomerRetention(settings,serverNow){if(Number.isFinite(Date.parse(serverNow)))serverOffset=Date.parse(serverNow)-Date.now();if(!settings||!Number.isInteger(settings.current_minutes)||!Number.isInteger(settings.history_minutes))return;const current=settings.current_minutes*60000,history=settings.history_minutes*60000,changed=!retentionLoaded||current!==CURRENT_VISIT_MS||history!==HISTORY_KEEP_MS;CURRENT_VISIT_MS=current;HISTORY_KEEP_MS=history;retentionLoaded=true;if(changed){pruneReceipts();renderOrderLists();if(activeOrder)renderTracking();}}

function receiptAge(r){const t=Date.parse(r?.created_at);return Number.isFinite(t)?Math.max(0,Date.now()+serverOffset-t):Infinity;}
function pruneReceipts(){if(!retentionLoaded)return;const kept=receipts.filter(r=>receiptAge(r)<HISTORY_KEEP_MS);if(kept.length!==receipts.length){receipts=kept;saveReceipts();if(activeOrder&&!receipts.some(r=>r.id===activeOrder.id))activeOrder=null;}}
const CURRENT_ORDER_STATUSES=new Set(['Pending','Accepted','Cooking','Ready']);
const RECEIPT_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let activeCategory = "All";
    let cart = {}; // item + size -> { item, size, qty }
    const selectedSizes=Object.create(null);
    const sizeLabel=(size,item)=>MenuOptions.label(item,size);
    const cartKey=(id,size)=>size?JSON.stringify([String(id),size]):String(id);
    const offeredSizes=item=>item.sizes_enabled?MenuOptions.keys(item).filter(size=>Object.prototype.hasOwnProperty.call(item.size_prices||{},size)&&Number.isFinite(Number(item.size_prices[size]))&&!(item.size_stock?.[size]?.tracked&&Number(item.size_stock[size].remaining)<=0)):[];
    const remainingStock=(item,size)=>{const stock=size?item?.size_stock?.[size]:item?.stock;return stock?.tracked?Math.max(0,Number(stock.remaining)||0):Infinity;};
    const lineName=line=>line.item.name+(line.size?' — '+sizeLabel(line.size,line.item):'');
    const priceText=price=>(RESTAURANT_CONFIG.currency||'₹')+Number(price).toFixed(2);
    let currentTable = "T1";
    let activeOrder = null; // { orderId, table, items, total, status }

    // Init from URL Query Params (e.g. ?table=T1 or ?table=2)
    function initTable() {
      const tableParam=new URL(location.href).searchParams.get('table');
      currentTable=tableParam&&/^T[1-9][0-9]{0,3}$/i.test(tableParam)?tableParam.toUpperCase():'';
      document.getElementById('tableText').innerText = Cloud.tableName(currentTable);
      document.getElementById('custTableInput').value = Cloud.tableName(currentTable);
      document.getElementById('cartTableLabel').textContent = Cloud.tableName(currentTable);
    }

    // Load branding
    function initBranding() {
      document.getElementById('restaurantName').innerText = RESTAURANT_CONFIG.restaurantName || 'Yummy Momo';
      document.getElementById('restaurantTagline').innerText = 'Made for your cravings.';
      document.getElementById('googleReviewBtn').href = RESTAURANT_CONFIG.googleReviewUrl;
    }

    // Render Categories
    function renderCategories() {
      if(window.CategoryMenu49?.enabled()){CategoryMenu49.nav(getActiveMenuItems());return;}
      const bar = document.getElementById('categoriesBar');bar.removeAttribute('data-signature49');document.getElementById('browseMenu').hidden=window.Custom48?.get().showCategoryLinks===false;document.getElementById('menuSort').hidden=window.Custom48?.get().showCategoryLinks===false;
      const scroll=bar.scrollLeft,hadFocus=bar.contains(document.activeElement);bar.replaceChildren();
      const categories=[...new Set(['All','Best Sellers','Recommended',...Cloud.categories.slice(1)])];
      if(!categories.includes(activeCategory))activeCategory='All';
      const dropdown=document.getElementById('menuSort');if(dropdown){dropdown.replaceChildren(...categories.map(cat=>{const o=document.createElement('option');o.value=cat;o.textContent=cat==='All'?'All categories':cat;return o;}));dropdown.value=activeCategory;}
      for(const cat of categories){
        const button=document.createElement('button');button.className='cat-btn'+(cat===activeCategory?' active':'');const sym=cat==='All'?'grid':cat==='Best Sellers'?'star':cat==='Recommended'?'check':/drinks/i.test(cat)?'cup':/dessert/i.test(cat)?'cake':'momo';button.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="icons.svg#'+sym+'"></use></svg><span>'+Cloud.esc(cat)+'</span>';const count=getActiveMenuItems().filter(i=>cat==='All'||cat==='Best Sellers'&&i.best_seller||cat==='Recommended'&&i.recommended||i.category===cat).length;const badge=document.createElement('small');badge.className='category-count';badge.textContent=count;button.append(badge);button.setAttribute('aria-pressed',String(cat===activeCategory));button.addEventListener('click',()=>selectCategory(cat));bar.append(button);
      }
      bar.scrollLeft=scroll;if(hadFocus)bar.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    }

    function selectCategory(cat) {
      if(window.CategoryMenu49?.enabled()){CategoryMenu49.jump(cat);return;}
      activeCategory = cat;
      const heading=document.getElementById('menuListTitle');if(heading)heading.textContent=cat==='All'?'Our menu':cat;
      renderCategories();
      renderMenuItems();
      const rail=document.getElementById('categoriesBar'),active=rail.querySelector('[aria-pressed="true"]');if(active){const b=active.getBoundingClientRect(),r=rail.getBoundingClientRect();if(b.left<r.left)rail.scrollLeft-=r.left-b.left;else if(b.right>r.right)rail.scrollLeft+=b.right-r.right;}
    }

    // Helper to normalize category matching
    function normalizeCategory(cat){return Cloud.normalizeCategory(cat);}

    function getActiveMenuItems(){return sharedMenu.filter(i=>i.available!==false);}

    // Render Menu Items
    function renderMenuItems(filteredList = null,changedId = null) {
      const container = document.getElementById('menuContainer');
      const allItems = getActiveMenuItems();
      const q=document.getElementById('searchInput').value.toLowerCase().trim();
      let list=(filteredList||allItems).filter(i=>activeCategory==='All'||activeCategory==='Best Sellers'&&i.best_seller===true||activeCategory==='Recommended'&&i.recommended||normalizeCategory(i.category)===activeCategory).filter(i=>!q||[i.name,i.description,i.category].some(v=>String(v).toLowerCase().includes(q)));

      const diet=$('menuDiet')?.value||'all';list=list.filter(i=>diet==='all'||(diet==='veg'?i.veg:!i.veg));
      if(window.CategoryMenu49?.enabled()){if(!list.length){container.innerHTML='<p class="empty">No dishes match your search.</p>';return;}CategoryMenu49.render(list);return;}
      container.classList.remove('category-menu49');
      const categoryPhotoItems48=[...list];
      if(changedId!==null)list=list.filter(i=>String(i.id)===String(changedId));
      if (list.length === 0) {
        if(changedId!==null)return;
        container._menuMarkup=null;container.innerHTML = `<div style="text-align:center; padding:40px; color:#71717a;">No dishes found in ${Cloud.esc(activeCategory)}.</div>`;
        return;
      }

      const markup = list.map(item => {
        const options=offeredSizes(item);if(item.sizes_enabled&&!options.includes(selectedSizes[item.id]))selectedSizes[item.id]=options[0];
        const size=item.sizes_enabled?selectedSizes[item.id]:null,key=cartKey(item.id,size),unitPrice=size?Number(item.size_prices[size]):item.price;
        const inCartQty=cart[key]?.qty||0;const sizeAttr=size?' data-size="'+size+'"':'';
        const imgHtml = (window.Custom48?.photoMode()==='dish' && item.image)
          ? `<img class="item-img" src="${Cloud.esc(Cloud.safeImage(item.image))}" alt="${Cloud.esc(item.name)}" loading="lazy" decoding="async">`
          : `<div class="item-img" style="display:flex;align-items:center;justify-content:center;font-size:2.8rem;background:var(--soft);border-radius:12px;"><svg class="ui-icon" aria-hidden="true" style="width:42px;height:42px;color:var(--red)"><use href="icons.svg#momo"></use></svg></div>`;

        return `
          <div class="item-card" data-menu-id="${Cloud.esc(item.id)}">
            <div class="item-info">
              <div>
                <div class="badge-veg-nonveg ${item.veg ? 'badge-veg' : 'badge-nonveg'}">
                  <span class="dot"></span>
                </div>
                <h3 class="item-title">${Cloud.esc(item.name)}</h3>${item.recommended?'<span class="menu-label">Recommended</span>':''}${item.best_seller===true?'<span class="menu-label">Best seller</span>':''}
                <p class="item-desc">${Cloud.esc(item.description)}</p>
              </div>
            </div>
            <div class="item-img-container">
              ${imgHtml}
            </div>
            ${options.length?`<div class="item-size-options" role="group" aria-label="Choose size for ${Cloud.esc(item.name)}">${options.map(option=>`<button type="button" class="pizza-size-button${option===size?' selected':''}" data-pick-size="${option}" data-item="${Cloud.esc(item.id)}" aria-pressed="${option===size}"><span>${Cloud.esc(sizeLabel(option,item))}</span><small>${priceText(item.size_prices[option])}</small></button>`).join('')}</div>`:''}
            <div class="item-purchase-row"><div><div class="item-price">${priceText(unitPrice)}${size?`<span>${Cloud.esc(sizeLabel(size,item))}</span>`:''}</div></div>
              <div class="action-btn-wrapper">
                ${inCartQty === 0 ? `
                  <button class="btn-add" data-qty="1" data-item="${Cloud.esc(item.id)}"${sizeAttr}>+ Add</button>
                ` : `
                  <div class="qty-counter">
                    <button class="qty-btn" data-qty="-1" data-item="${Cloud.esc(item.id)}"${sizeAttr}>−</button>
                    <span>${inCartQty}</span>
                    <button class="qty-btn" data-qty="1" data-item="${Cloud.esc(item.id)}"${sizeAttr}>+</button>
                  </div>
                `}
              </div>
            </div>
          </div>
        `;
      }).join('');
      patchMenuCards(container,markup,changedId);
      window.Custom48?.renderCategoryPhotos(categoryPhotoItems48);
    }

    function handleSearch(){renderMenuItems();}

    // Cart Operations
    function updateQty(itemId,delta,size=null) {
      const key=cartKey(itemId,size),base=getActiveMenuItems().find(i=>String(i.id)===String(itemId));
      if(delta>0&&(!base||(base.sizes_enabled?!offeredSizes(base).includes(size):!!size)))return;
      const item=base?{...base,price:size?Number(base.size_prices[size]):base.price}:cart[key]?.item;
      if(!item)return;const next=(cart[key]?.qty||0)+delta;
      if(next<=0)delete cart[key];
      else {const left=remainingStock(base,size);if(delta>0&&next>left){message('Only '+left+' left for this item or size. Please check your cart.',true);return;}if(!cart[key]&&Object.keys(cart).length>=50){message('Cart must contain at most 50 item/size lines.',true);return;}cart[key]={item,size,qty:Math.min(50,next)};}
      renderMenuItems(null,itemId);updateCartUI();
    }

    function updateCartUI() {
      renderOrderSidebar();
      const items = Object.values(cart);
      const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
      const subtotal = Math.round(items.reduce((sum, i) => sum + (i.qty * i.item.price), 0)*100)/100;
      const tax=cartTax(subtotal),totalPrice=Math.round((subtotal+tax)*100)/100;

      const bar = document.getElementById('floatingCartBar');
      if (totalCount > 0) {
        bar.style.display = 'flex';
        document.getElementById('cartItemsCount').innerText = `${totalCount} ITEM${totalCount > 1 ? 'S' : ''}`;
        document.getElementById('cartTotalPrice').innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;
      } else {
        bar.style.display = 'none';
      }

      // Drawer updates
      const placeOrderSpan = document.getElementById('placeOrderAmount');
      if (placeOrderSpan) placeOrderSpan.innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;
      const subtotalEl = document.getElementById('billSubtotal');
      if (subtotalEl) subtotalEl.innerText = `${RESTAURANT_CONFIG.currency}${subtotal.toFixed(2)}`;
      document.getElementById('billTaxRow').hidden=!customerTax.tax_enabled;document.getElementById('billTaxLabel').textContent=customerTax.tax_mode==='percent'?'Tax ('+Number(customerTax.tax_value)+'%)':'Tax (fixed per order)';document.getElementById('billTaxAmount').textContent=RESTAURANT_CONFIG.currency+tax.toFixed(2);
      const totalEl = document.getElementById('billTotal');
      if (totalEl) totalEl.innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;

      const listContainer = document.getElementById('cartItemsList');
      if (items.length === 0) {
        listContainer._cartMarkup=null;listContainer.innerHTML = `<p style="text-align:center; color:#71717a; padding:20px;">Your cart is empty.</p>`;
      } else {
        const cartHTML = items.map(c => `
          <div class="cart-item-row">
            <div class="cart-item-info">
              <h4>${Cloud.esc(lineName(c))}</h4>
              <p>${RESTAURANT_CONFIG.currency}${c.item.price} × ${c.qty} = ${RESTAURANT_CONFIG.currency}${c.item.price * c.qty}</p>
            </div>
            <div class="cart-item-stepper">
              <button data-qty="-1" data-item="${Cloud.esc(c.item.id)}"${c.size?` data-size="${c.size}"`:""}>−</button>
              <span style="font-weight:700;">${c.qty}</span>
              <button data-qty="1" data-item="${Cloud.esc(c.item.id)}"${c.size?` data-size="${c.size}"`:""}>+</button>
            </div>
          </div>
        `).join('');if(listContainer._cartMarkup!==cartHTML){listContainer.innerHTML=cartHTML;listContainer._cartMarkup=cartHTML;}
      }
    }

    function openCartDrawer() {
      document.getElementById('drawerOverlay').classList.add('open');
      document.getElementById('cartDrawer').classList.add('open');syncCustomerLayerLock();
    }

    function closeCartDrawer() {
      document.getElementById('drawerOverlay').classList.remove('open');
      document.getElementById('cartDrawer').classList.remove('open');
    }

const $=id=>document.getElementById(id);
function message(text,error=false){$('cloudMessage').textContent=text;$('cloudMessage').dataset.error=String(error);$('cloudMessage').style.color=error?'#b91c1c':'#71717a';}
function mapMenu(row){return {...row,price:Number(row.price),image:Cloud.safeImage(row.image),description:row.description||''};}
async function loadSharedMenu(){
 if(!TableAccess.canCall()){renderSystemFooter(null);return;}if(menuBusy)return;menuBusy=true;
 try{
  const access=await TableAccess.credentials(false);const snapshot=await Cloud.syncMenu(false,access);const rows=snapshot.rows;applyCommerce(snapshot.commerce);const signature=JSON.stringify(rows);
  if(signature!==loadSharedMenu.signature){sharedMenu=rows.map(mapMenu);renderCategories();loadSharedMenu.signature=signature;
   let removed=false,pricesChanged=false,stockChanged=false;Object.keys(cart).forEach(key=>{const line=cart[key],item=sharedMenu.find(m=>m.id===line.item.id);if(!item||(item.sizes_enabled?!offeredSizes(item).includes(line.size):!!line.size)){delete cart[key];removed=true;}else{const price=line.size?Number(item.size_prices[line.size]):item.price;pricesChanged=pricesChanged||price!==line.item.price;line.item={...item,price};const left=remainingStock(item,line.size);if(line.qty>left){line.qty=left;stockChanged=true;if(!left){delete cart[key];removed=true;}}}});
   handleSearch();updateCartUI();if(removed)message('An unavailable item or size was removed from your cart. Please review it.');else if(stockChanged)message('Stock changed. Your cart quantities were reduced to the remaining stock. Please review them.');else if(pricesChanged)message('Menu prices changed. Please review your cart.');else message(rows.length?'Live restaurant menu':'No dishes are available right now. Please ask a waiter.');
  }else if(rows.length)message('Live restaurant menu');
 }catch(e){renderSystemFooter(null);message('Menu connection error: '+e.message+' Please retry or ask a waiter.',true);if(!sharedMenu.length)$('menuContainer').textContent='The menu could not be loaded. No order will be sent without a cloud connection.';}
 finally{menuBusy=false;}
}
function attemptKey(){return 'RESTAURANT_PENDING_v2_'+currentTable;}
function saveReceipts(){Cloud.write('RESTAURANT_RECEIPTS_v2',receipts);}
function rememberOrder(row,token){
 if(row.server_now)serverOffset=new Date(row.server_now).getTime()-Date.now();
 const receipt={...row,token,_statusChecked:Date.now()}, index=receipts.findIndex(r=>r.id===row.id);
 if(index<0)receipts.push(receipt);else receipts[index]=receipt;
 receipts=receipts.slice(-100);saveReceipts();activeOrder=receipt;
 Cloud.write('RESTAURANT_ACTIVE_v2',row.id);
}
function currentTableReceipts(){
 pruneReceipts();return receipts.filter(r=>r&&r.table_number===currentTable&&r.id)
  .slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
}
function isCurrentOrder(r){return !!r&&!r.tracking_unavailable&&CURRENT_ORDER_STATUSES.has(r.status)&&receiptAge(r)<CURRENT_VISIT_MS;}
function currentOrders(){return currentTableReceipts().filter(isCurrentOrder);}
function pastOrders(){return currentTableReceipts().filter(r=>!isCurrentOrder(r)).reverse();}
function receiptStatus(r){return r.tracking_unavailable?'Unavailable on this project':r.status;}
function receiptDate(r){return new Date(r.created_at).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});}
function renderOrderLists(){
 const current=currentOrders(),past=pastOrders(),latest=current.at(-1);
 $('customerOrdersBar').hidden=!current.length&&!past.length;
 $('currentOrdersButton').textContent=`Order status (${current.length})`;
 $('currentOrdersButton').disabled=!current.length;
 $('orderHistoryButton').textContent=`Order history (${past.length})`;
 $('activeOrderBanner').style.display=latest?'flex':'none';
 if(latest)$('bannerStatusText').textContent=`${current.length===1?'Order in progress':current.length+' current orders'} · ${latest.status}`;
 $('orderSyncMessage').textContent=receiptSyncError;
 $('historySyncMessage').textContent=receiptSyncError;
 $('orderHistorySubtitle').textContent=`${Cloud.tableName(currentTable)} · History from the last ${Math.round(HISTORY_KEEP_MS/60000)} minutes on this device`;
 const html=past.length?past.map(r=>`<button type="button" class="history-order-card" data-order-status="${Cloud.esc(r.status)}" data-history-order="${Cloud.esc(r.id)}"><span class="history-card-top"><strong>${Cloud.esc(Cloud.orderLabel(r))}</strong><span class="history-card-status">${Cloud.esc(receiptStatus(r))}</span></span><span class="history-card-date">${Cloud.esc(receiptDate(r))}</span><span class="history-card-items">${Cloud.esc((Array.isArray(r.items)?r.items:[]).slice(0,2).map(i=>`${Number(i.qty)||0} × ${i.name||'Item'}`).join(' · ')||'Open to view order details')}${Array.isArray(r.items)&&r.items.length>2?` · +${r.items.length-2} more`: ''}</span>${r.payment_method?`<span class="history-card-payment">Paid through: ${Cloud.esc(r.payment_method)}</span>`:''}${r.rejection_reason?`<span class="history-card-reason">${Cloud.esc(r.rejection_reason)}</span>`:''}<span class="history-card-bottom"><span>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(r.total||0).toFixed(2)}</span><span>View order →</span></span></button>`).join(''):'<p class="history-empty">No past orders for this table on this device yet. Served, cancelled and rejected orders will appear here.</p>';
 if($('orderHistoryList').innerHTML!==html)$('orderHistoryList').innerHTML=html;
}
function openOrderHistory(){
 historyReturnFocus=document.activeElement;
 renderOrderLists();$('orderHistoryModal').hidden=false;
 $('orderHistoryModal').scrollTo({top:0,behavior:'instant'});
 $('orderHistoryModal').querySelector('.btn-close-drawer').focus();
 syncDeviceOrders(true);
}
function closeOrderHistory(){
 $('orderHistoryModal').hidden=true;
 if(historyReturnFocus?.isConnected)historyReturnFocus.focus();
}
async function syncDeviceOrders(forceAll=false){
 if(receiptSyncPromise){
  await receiptSyncPromise;
  if(forceAll)return syncDeviceOrders(true);
  return;
 }
 const submitted=currentTableReceipts().filter(r=>RECEIPT_UUID.test(r.id)&&RECEIPT_UUID.test(r.token||''))
  .filter(r=>forceAll||isCurrentOrder(r))
  .slice(-100).map(r=>({id:r.id,token:r.token}));
 if(!submitted.length){renderOrderLists();return;}
 receiptSyncPromise=(async()=>{
  try{
   const data=await Cloud.rpc('restaurant_receipt_sync47',{p_receipts:submitted});
   if(!data||!Array.isArray(data.orders)||!Array.isArray(data.unavailable_ids))throw Error('Invalid saved-order response. Please retry.');
   if(data.server_now)serverOffset=new Date(data.server_now).getTime()-Date.now();
   const sent=new Map(submitted.map(r=>[r.id,r])),rows=new Map(data.orders.filter(r=>sent.has(r.id)).map(r=>[r.id,r]));
   const unavailable=new Set(data.unavailable_ids.filter(id=>sent.has(id)));
   receipts=receipts.filter(r=>!unavailable.has(r.id)).map(r=>rows.has(r.id)?(new Date(r.updated_at||0)>new Date(rows.get(r.id).updated_at||0)?r:{...r,...rows.get(r.id),token:sent.get(r.id).token,_statusChecked:Date.now()}):r);
   saveReceipts();
   if(activeOrder)activeOrder=receipts.find(r=>r.id===activeOrder.id)||null;
   receiptSyncError='';
   renderOrderLists();if(activeOrder||$('trackingModal').classList.contains('open'))renderTracking();
   $('trackingError').textContent='';
  }catch(e){
   receiptSyncError='Saved order statuses may be out of date. '+(/restaurant_get_device_orders|schema cache|Could not find the function/i.test(e.message)?'Install the order-history database upgrade first.':e.message);
   renderOrderLists();if($('trackingModal').classList.contains('open'))$('trackingError').textContent=receiptSyncError;
  }
 })();
 try{await receiptSyncPromise;}finally{receiptSyncPromise=null;}
}
async function placeOrder(){
 const btn=$('btnPlaceOrder');if(placingOrder||btn.disabled)return;
 const entries=Object.values(cart);if(!entries.length&&!pendingAttempt)return;placingOrder=true;btn.disabled=true;
 try{
  $('cartOrderError').textContent='';
  if(!pendingAttempt){pendingAttempt={request_id:crypto.randomUUID(),token:crypto.randomUUID(),table:currentTable,name:$('custNameInput').value.trim().slice(0,80)||'Guest',notes:$('custNotesInput').value.trim().slice(0,1000),items:entries.map(c=>({id:c.item.id,qty:c.qty,...(c.size?{size:c.size}:{})})),expected_total:cartTotal()};Cloud.write(attemptKey(),pendingAttempt);}
  btn.disabled=true;btn.textContent='Saving order to kitchen…';
  const a=pendingAttempt;
  const access=await TableAccess.credentials(true);
  const row=await Cloud.rpc('restaurant_place_order_v13',{p_request_id:a.request_id,p_token:a.token,p_table:a.table,p_name:a.name,p_notes:a.notes,p_items:a.items,p_expected_total:a.expected_total,...access});
  rememberOrder(row,a.token);Cloud.remove(attemptKey());pendingAttempt=null;
  $('pendingRetry').hidden=true;cart={};$('custNotesInput').value='';syncNoteChips();handleSearch();updateCartUI();closeCartDrawer();openTrackingModal();message('Order saved. Waiting for kitchen acceptance.');
  if(!['Cancelled','Rejected'].includes(row.status)){promptOrderReview(row.id);if(window.OrderCelebration)OrderCelebration.show(row.id);}

 }catch(e){$('cartOrderError').textContent=e.message;message('Order not confirmed: '+e.message+' Use “Retry original order” to safely retry the same submission.',true);
  // A definite database validation error is safe to edit/retry with a new request.
  if(/Insufficient stock|Stock changed|sold out|Total changed|unavailable|Invalid|Quantity|Cart must|Name or notes|Two orders are already pending|This table is reserved|Scan expired|scan your table QR/.test(e.message)){pendingAttempt=null;$('pendingRetry').hidden=true;Cloud.remove(attemptKey());await loadSharedMenu();}
 }finally{placingOrder=false;$('pendingRetry').hidden=!pendingAttempt;btn.disabled=false;btn.innerHTML=pendingAttempt?'Retry original order':`<span>Place Order</span><span id="placeOrderAmount">${Cloud.esc(RESTAURANT_CONFIG.currency)}${cartTotal()}</span>`;updateCartUI();}
}
function chooseOrder(id){const receipt=receipts.find(r=>r.id===id&&r.table_number===currentTable);if(receipt){trackingHistoryMode=!isCurrentOrder(receipt);activeOrder=receipt;Cloud.write('RESTAURANT_ACTIVE_v2',id);$('orderHistoryModal').hidden=true;$('trackingModal').classList.add('open');renderTracking();if(trackingHistoryMode)syncDeviceOrders(true);else pollActiveOrder();$('trackingModal').scrollTo({top:0,behavior:'instant'});}}
function openTrackingModal(){trackingHistoryMode=false;activeOrder=currentOrders().at(-1)||null;$('trackingModal').classList.add('open');renderTracking();pollActiveOrder();}
function closeTrackingModal(){$('trackingModal').classList.remove('open');syncCustomerLayerLock();}
function renderTracking(){
 renderOrderLists();
 if(!trackingHistoryMode&&!isCurrentOrder(activeOrder))activeOrder=currentOrders().at(-1)||null;
 const empty=!activeOrder;
 $('trackingEmpty').hidden=!empty;
 ['trackingStepper','trackingItemsSection','trackingActions','trackingCancelPanel'].forEach(id=>$(id).hidden=empty);
 $('trackingModal').querySelector('.tracking-status-hero').hidden=empty;
 if(empty){$('trackingTitle').textContent='Order status';$('trackingOrderIdentity').textContent=Cloud.tableName(currentTable);$('otherOrdersPanel').hidden=true;return;}
 $('trackingTableLabel').textContent=Cloud.tableName(activeOrder.table_number);
 const tableOrders=currentOrders();
 const currentNumber=tableOrders.findIndex(r=>r.id===activeOrder.id)+1;
 $('trackingTitle').textContent=isCurrentOrder(activeOrder)?'Order Status':'Past order';
 $('trackingOrderIdentity').textContent=Cloud.orderLabel(activeOrder)+' · '+Cloud.tableName(activeOrder.table_number);
 const others=tableOrders.map((r,i)=>({r,number:i+1})).filter(o=>o.r.id!==activeOrder.id);
 $('otherOrdersPanel').hidden=others.length===0;
 const tabs=others.map(({r,number})=>`<button type="button" class="other-order-tab" data-switch-order="${Cloud.esc(r.id)}" aria-label="View ${Cloud.esc(Cloud.orderLabel(r))}, ${Cloud.esc(r.status)}"><span class="other-order-tab-top"><strong>${Cloud.esc(Cloud.orderLabel(r))}</strong><span aria-hidden="true">→</span></span><span class="other-order-state">${Cloud.esc(r.status)} · ${new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><span class="other-order-id">${Cloud.esc(r.order_day||new Date(r.created_at).toLocaleDateString())}</span></button>`).join('');
 if($('otherOrderTabs').innerHTML!==tabs)$('otherOrderTabs').innerHTML=tabs;
 const trackingItemsHTML=activeOrder.items.map(i=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:4px 0;"><span>${Cloud.esc(i.name)} × ${i.qty}</span><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(i.subtotal).toFixed(2)}</b></div>`).join('')+receiptTaxRows(activeOrder)+`<div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:8px;padding-top:8px;"><b>Total</b><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(activeOrder.total).toFixed(2)}</b></div>`;
 if($('trackingItemsList').innerHTML!==trackingItemsHTML)$('trackingItemsList').innerHTML=trackingItemsHTML;
 updateTrackingStatusDisplay(activeOrder.status);updateCancelTimer();
}
function updateTrackingStatusDisplay(status){
 const copy={Pending:['⏳','Waiting for kitchen acceptance','Your order is safely saved. A staff member will accept it shortly.'],Accepted:['🔥','Cooking in the kitchen','The kitchen is preparing your food.'],Cooking:['🔥','Cooking in the kitchen','Cooking has started. Online cancellation is now closed.'],Ready:['🔔','Ready for your table','Please ask a waiter to bring your dishes.'],Served:['✨','Served & complete','Enjoy your meal! This order is saved in your order history.'],Cancelled:['×','Order cancelled',activeOrder?.rejection_reason||'This order was cancelled and is saved in your order history.'],Rejected:['×','Order unavailable',activeOrder?.rejection_reason||'The kitchen could not accept this order. Please ask a waiter.']};
 const [icon,title,sub]=activeOrder?.tracking_unavailable?['?','Saved order unavailable','This receipt could not be verified on the current shop database. Ask a waiter. Its previous details are retained below.']:(copy[status]||['?','Saved order','Please ask a waiter for an update.']);
 $('trackingStatusIcon').textContent=icon;$('trackingStatusTitle').textContent=title;$('trackingStatusSub').textContent=sub;
 $('trackingStepper').hidden=!!activeOrder?.tracking_unavailable||['Cancelled','Rejected'].includes(status);
 const step=status==='Served'?3:['Accepted','Cooking','Ready'].includes(status)?2:1;
 for(let i=1;i<=3;i++)$('step'+i).className='stepper-step '+(status==='Served'||i<step?'completed':i===step?'active':'');

}
function updateCancelTimer(){
 if(!activeOrder)return;
 const remaining=Math.max(0,Math.min((Date.parse(activeOrder.cancel_deadline)||Infinity),new Date(activeOrder.created_at).getTime()+60000)-(Date.now()+serverOffset));
 const allowed=!activeOrder.tracking_unavailable&&['Pending','Accepted'].includes(activeOrder.status)&&!activeOrder.cooking_started_at&&remaining>0;
 $('cancelOrderButton').disabled=!allowed;
 $('cancelOrderButton').hidden=!isCurrentOrder(activeOrder);
 $('cancelCountdown').textContent=activeOrder.tracking_unavailable?'Receipt unavailable on this shop database.':allowed?`Cancel within ${Math.floor(remaining/60000)}:${String(Math.floor(remaining/1000)%60).padStart(2,'0')} — only before cooking starts.`:activeOrder.status==='Cancelled'?'Cancelled · saved in order history.':activeOrder.status==='Served'?'Completed · saved in order history.':activeOrder.status==='Rejected'?'Rejected · saved in order history.':['Cooking','Ready'].includes(activeOrder.status)?'Cancellation closed: cooking has already started.':'Cancellation window is closed.';
}
function pollActiveOrder(){return syncDeviceOrders();}
async function cancelCustomerOrder(){
 if(!activeOrder||$('cancelOrderButton').disabled||!confirm('Cancel this order? This cannot be undone.'))return;
 $('cancelOrderButton').disabled=true;
 try{const row=await Cloud.rpc('restaurant_cancel_order',{p_id:activeOrder.id,p_token:activeOrder.token});rememberOrder(row,activeOrder.token);renderTracking();$('trackingError').textContent='';}
 catch(e){$('trackingError').textContent=e.message;await pollActiveOrder();}finally{updateCancelTimer();}
}
function addMoreItems(){closeTrackingModal();window.scrollTo({top:0,behavior:'smooth'});}
document.addEventListener('click',e=>{const history=e.target.closest('[data-history-order]');if(history){chooseOrder(history.dataset.historyOrder);return;}const tab=e.target.closest('[data-switch-order]');if(tab){chooseOrder(tab.dataset.switchOrder);return;}const choice=e.target.closest('[data-pick-size]');if(choice){selectedSizes[choice.dataset.item]=choice.dataset.pickSize;renderMenuItems(null,choice.dataset.item);document.querySelector('[data-pick-size="'+choice.dataset.pickSize+'"][data-item="'+CSS.escape(choice.dataset.item)+'"]')?.focus({preventScroll:true});return;}const b=e.target.closest('[data-qty]');if(b)updateQty(b.dataset.item,Number(b.dataset.qty),b.dataset.size||null);});
document.addEventListener('keydown',e=>{
 if($('orderHistoryModal').hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeOrderHistory();return;}
 if(e.key==='Tab'){
  const buttons=[...$('orderHistoryModal').querySelectorAll('button:not([disabled])')];
  const first=buttons[0],last=buttons.at(-1);
  if(!$('orderHistoryModal').contains(document.activeElement)){e.preventDefault();first.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
});
window.addEventListener('DOMContentLoaded',()=>{
 try{initTable();initBranding();renderCategories();updateCartUI();
  const saved=Cloud.read('RESTAURANT_RECEIPTS_v2',[]);receipts=Array.isArray(saved)?saved.filter(r=>r&&typeof r==='object'):[];
  const id=Cloud.read('RESTAURANT_ACTIVE_v2',null);activeOrder=currentOrders().find(r=>r.id===id)||currentOrders().at(-1)||null;
  pendingAttempt=Cloud.read(attemptKey(),null);
  if(pendingAttempt){$('pendingRetry').hidden=false;$('btnPlaceOrder').textContent='Retry original order';message('A previous order was not confirmed. Open your cart and retry the original submission.');$('floatingCartBar').style.display='flex';$('cartItemsCount').textContent='ORDER NEEDS CONFIRMATION';}
  renderOrderLists();if(activeOrder)renderTracking();TableAccess.init().then(()=>{if(TableAccess.canCall()){pollActiveOrder();loadSharedMenu();loadPublicReviewSettings();}});
 }catch(e){message(e.message,true);}
});
Cloud.schedule('customer-menu',30000,loadSharedMenu);Cloud.schedule('customer-receipts',10000,pollActiveOrder);
setInterval(()=>{if(!document.hidden){pruneReceipts();renderOrderLists();updateCancelTimer();}},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadSharedMenu();pollActiveOrder();}});




let customerTax={tax_enabled:false,tax_mode:'percent',tax_value:0};
function cartTax(subtotal){return customerTax.tax_enabled?(customerTax.tax_mode==='percent'?Math.round(Math.round(subtotal*100)*Math.round(Number(customerTax.tax_value)*100)/10000)/100:Math.round(Number(customerTax.tax_value)*100)/100):0;}
function cartTotal(){const subtotal=Math.round(Object.values(cart).reduce((s,c)=>s+c.qty*c.item.price,0)*100)/100;return Math.round((subtotal+cartTax(subtotal))*100)/100;}
function applyCommerce(data){renderSystemFooter(data.footer);customerTax=data.tax;const signature=JSON.stringify(data.categories);if(signature!==applyCommerce.signature){applyCommerce.signature=signature;Cloud.setCategories(data.categories);if(!['All','Best Sellers','Recommended',...data.categories].includes(activeCategory))activeCategory='All';renderCategories();renderMenuItems();}updateCartUI();}
function receiptTaxRows(o){if(!o.tax_enabled&&!(Number(o.tax_amount)>0))return '';const row=(l,v)=>`<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${Cloud.esc(l)}</span><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(v).toFixed(2)}</b></div>`;return row('Items subtotal',o.items_subtotal)+row(o.tax_mode==='percent'?'Tax ('+Number(o.tax_value)+'%)':'Tax (fixed)',o.tax_amount);}

function renderSystemFooter(settings){
 const footer=document.getElementById('systemFooter'),credit=document.getElementById('systemFooterCredit'),link=document.getElementById('systemFooterLink');
 let url=null;try{const raw=String(settings?.url||'');const parsed=new URL(raw);if(/^https?:\/\//i.test(raw)&&['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password&&!/[\s<>"\\]/.test(raw))url=parsed.href;}catch{}
 credit.hidden=settings?.show_credit!==true;
 link.hidden=!(settings?.show_link===true&&url);if(link.hidden)link.removeAttribute('href');else link.href=url;
 footer.hidden=credit.hidden&&link.hidden;
}

function syncCustomerLayerLock(){document.body.classList.toggle('customer-layer-open',!!document.querySelector('#cartDrawer.open,#trackingModal.open,#orderHistoryModal:not([hidden])'));}
new MutationObserver(syncCustomerLayerLock).observe(document.getElementById('cartDrawer'),{attributes:true,attributeFilter:['class']});
new MutationObserver(syncCustomerLayerLock).observe(document.getElementById('trackingModal'),{attributes:true,attributeFilter:['class']});
new MutationObserver(syncCustomerLayerLock).observe(document.getElementById('orderHistoryModal'),{attributes:true,attributeFilter:['hidden']});

document.addEventListener('keydown',e=>{
 if(document.getElementById('orderCelebration').open||!document.getElementById('orderHistoryModal').hidden)return;
 const root=document.querySelector('#cartDrawer.open')||document.querySelector('#trackingModal.open');if(!root)return;
 if(e.key==='Escape'){e.preventDefault();if(root.id==='cartDrawer')closeCartDrawer();else closeTrackingModal();return;}
 if(e.key==='Tab'){const controls=[...root.querySelectorAll('button:not([disabled]),input:not([type=hidden]),textarea,select,a[href]')].filter(x=>x.getClientRects().length);const first=controls[0],last=controls.at(-1);if(!first)return;if(!root.contains(document.activeElement)||e.shiftKey&&document.activeElement===first){e.preventDefault();(e.shiftKey?last:first).focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});

// A renamed table keeps the same QR/session identity and updates its visible label.
document.addEventListener('restaurant-table-names',()=>{
 for(const id of ['tableText','cartTableLabel']){const node=document.getElementById(id);if(node)node.textContent=Cloud.tableName(currentTable);}
 const field=document.getElementById('custTableInput');if(field)field.value=Cloud.tableName(currentTable);
 renderOrderLists();if(activeOrder)renderTracking();
});
window.addEventListener('offline',()=>{message('Offline — the menu may be out of date. Reconnect before ordering.',true);$('btnPlaceOrder').disabled=true;});
window.addEventListener('online',()=>{updateCartUI();loadSharedMenu();pollActiveOrder();});
