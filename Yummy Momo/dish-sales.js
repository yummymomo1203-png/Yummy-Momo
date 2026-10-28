'use strict';
let recordsView='orders',dishSalesData=null,dishSalesOffset=0,dishSalesBusy=false,dishSalesPending=false,dishSalesPeriodKey='',dishSalesExporting=false;
function setRecordsView(view){
 recordsView=view==='dishes'?'dishes':'orders';
 $('ordersRecordsView').hidden=recordsView!=='orders';$('dishRecordsView').hidden=recordsView!=='dishes';
 for(const [id,value] of [['ordersViewButton','orders'],['dishViewButton','dishes']]){
  $(id).className=recordsView===value?'primary-btn':'secondary-btn';$(id).setAttribute('aria-pressed',String(recordsView===value));
 }
 $('recordsExportButton').textContent=recordsView==='dishes'?'Export dish sales CSV':'Export orders CSV';
 if(recordsView==='dishes')refreshDishSales();else if(currentTab==='history')refreshRecords();
}
function orderItemBreakdown(order){
 return `<details class="order-item-breakdown" data-order-items="${esc(order.id)}"><summary>${order.items.reduce((n,i)=>n+Number(i.qty||0),0)} items · View dish amounts</summary><div class="order-line-list">${order.items.map(i=>`<div class="order-line"><strong>${esc(i.name)}</strong><span>${Number(i.qty)} × ${money(i.price)}</span><b>${money(i.subtotal??Number(i.qty)*Number(i.price))}</b></div>`).join('')}</div></details>`;
}
function dishSalesQuery(offset=dishSalesOffset,limit=50){return {p_period:recordPeriod,p_reference:recordReference,p_mode:$('dishReportMode').value,p_sort:$('dishReportSort').value,p_offset:offset,p_limit:limit};}
function changeDishReport(){dishSalesOffset=0;dishSalesData=null;refreshDishSales();}
function pageDishSales(direction){dishSalesOffset=Math.max(0,dishSalesOffset+direction*50);refreshDishSales();}
async function refreshDishSales(){
 if(!loggedIn||recordsView!=='dishes')return;
 if(dishSalesBusy){dishSalesPending=true;return;}
 const periodKey=JSON.stringify([recordPeriod,recordReference]);
 if(periodKey!==dishSalesPeriodKey){dishSalesPeriodKey=periodKey;dishSalesOffset=0;dishSalesData=null;$('dishSalesBody').replaceChildren();}
 const query=dishSalesQuery(),key=JSON.stringify(query);dishSalesBusy=true;$('dishSalesStatus').textContent='';$('dishRecordsView').setAttribute('aria-busy','true');
 try{
  const data=await Cloud.rpc('restaurant_dish_sales',query,true);
  if(key!==JSON.stringify(dishSalesQuery())){dishSalesPending=true;return;}
  if(query.p_offset>0&&!data.rows.length){dishSalesOffset=Math.max(0,Math.floor(Math.max(0,data.total_rows-1)/50)*50);dishSalesPending=true;return;}
  dishSalesData=data;renderDishSales();$('dishSalesStatus').textContent='';
 }catch(e){dishSalesData=null;$('dishSalesBody').replaceChildren();$('dishSalesPage').textContent='';$('dishSalesPrevious').disabled=true;$('dishSalesNext').disabled=true;$('dishSalesStatus').textContent='Dish sales could not load: '+e.message;}
 finally{$('dishRecordsView').setAttribute('aria-busy','false');dishSalesBusy=false;if(dishSalesPending){dishSalesPending=false;refreshDishSales();}}
}
function renderDishSales(){
 const data=dishSalesData;if(!data)return;
 
 $('dishSalesBody').innerHTML=data.rows.length?data.rows.map(r=>`<tr><td data-label="Rank">${r.position}</td><td data-label="Date / period">${r.sale_day?esc(calendarLabel(r.sale_day)):'Selected '+esc(recordPeriod)}</td><td data-label="Dish / size"><strong>${esc(r.dish_name)}</strong>${r.size_label?`<span class="dish-size-label">${esc(r.size_label)}</span>`:''}</td><td data-label="Quantity sold">${r.quantity}</td><td data-label="Orders">${r.order_count}</td><td data-label="Item revenue"><strong>${money(r.revenue)}</strong></td></tr>`).join(''):'<tr><td colspan="6" class="empty">No served dish sales in this period.</td></tr>';
 $('dishSalesPage').textContent=data.total_rows?`${data.offset+1}–${data.offset+data.rows.length} of ${data.total_rows}`:'0 dish sales';
 $('dishSalesPrevious').disabled=data.offset===0;$('dishSalesNext').disabled=data.offset+data.rows.length>=data.total_rows;
}
function exportCurrentRecords(){if(recordsView==='dishes')exportDishSales();else exportRecords();}
async function exportDishSales(){
 if(dishSalesExporting)return;dishSalesExporting=true;$('recordsExportButton').disabled=true;
 const args=dishSalesQuery(0,100),rows=[];
 try{
  let page;do{page=await Cloud.rpc('restaurant_dish_sales',{...args,p_offset:rows.length},true);rows.push(...page.rows);args.p_reference=page.period_start;if(!page.rows.length)break;}while(rows.length<page.total_rows);
  const quote=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  const csv=[['Date / period (India)','Dish','Size','Quantity sold','Served orders','Item revenue INR (excluding tax)'],...rows.map(r=>[r.sale_day||page.period_start+' to '+page.period_stop+' (end exclusive)',r.dish_name,r.size_label,r.quantity,r.order_count,r.revenue])].map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='dish-sales-'+args.p_period+'-'+(args.p_reference||'current')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){showToast('Dish sales export failed: '+e.message);}finally{dishSalesExporting=false;$('recordsExportButton').disabled=false;}
}
let dishResetRequest=null,dishResetBusy=false;
function openDishSalesReset(){if(staffRole!=='admin'||dishResetBusy)return;dishResetRequest=crypto.randomUUID();$('dishSalesResetConfirm').value='';$('dishSalesResetStatus').textContent='';$('dishSalesResetModal').showModal();}
function closeDishSalesReset(){if(!dishResetBusy)$('dishSalesResetModal').close();}
async function submitDishSalesReset(event){
 event.preventDefault();if(staffRole!=='admin'||dishResetBusy)return;
 if($('dishSalesResetConfirm').value!=='RESET DISH SALES'){$('dishSalesResetStatus').textContent='Type RESET DISH SALES exactly.';return;}
 dishResetBusy=true;$('dishSalesResetSubmit').disabled=true;
 try{
  const result=await Cloud.rpc('restaurant_reset_dish_sales',{p_confirmation:'RESET DISH SALES',p_request_id:dishResetRequest},true);
  $('dishSalesResetModal').close();dishSalesOffset=0;dishSalesData=null;$('dishSalesBody').replaceChildren();await refreshDishSales();showToast(result.excluded_orders+' served orders cleared from dish sales. Original orders and stock unchanged.');
 }catch(e){$('dishSalesResetStatus').textContent=e.message;}finally{dishResetBusy=false;$('dishSalesResetSubmit').disabled=false;}
}
document.getElementById('dishSalesResetModal').addEventListener('cancel',e=>{if(dishResetBusy)e.preventDefault();});
