/* Shared status/history UI. Staff login or a private waiter key is required by the server. */
'use strict';
const CallRequests=(()=>{
 function mount({root,kind,key='',onUpdate=()=>{},onError=()=>{},canHandle=()=>true}){
  let filter='Pending',offset=0,pendingRows=[],data=null,busy=false,again=false,error='',handling=new Set();
  const e=Cloud.esc,date=v=>new Date(v).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}),title=c=>c.request_kind==='Reception'?'Counter':(c.request_kind==='Song'?'🎵 '+Cloud.tableName(c.table_number):Cloud.tableName(c.table_number)),description=c=>c.request_kind==='Reception'?'Waiter requested at counter.':c.request_kind==='ReservedScan'?'Reserved table QR opened — please check seating.':c.request_kind==='Song'?`Song requested: ${c.request_text||'Untitled song'}`:c.request_origin==='staff_dashboard'?'Staff requested a waiter.':'Customer requested assistance.';
  function render(){
   const rows=data?.calls||[];
   const html=`<div class="request-filters" role="group" aria-label="Request status">${['All','Pending','Handled','Expired'].map(s=>`<button type="button" class="request-filter ${filter===s?'selected':''}" data-request-filter="${s}" aria-pressed="${filter===s}">${s}</button>`).join('')}</div><p class="request-error" role="status" ${error?'':'hidden'}>${e(error)}</p><div class="request-cards">${rows.length?rows.map(c=>`<article class="request-card ${c.status==='Handled'?'request-handled':''}"><div class="request-card-heading"><h3>${e(title(c))}</h3><span class="request-state">${e(c.status)}</span></div><p>${e(description(c))}</p><p>${c.request_kind==='ReservedScan'?'QR opened':c.request_kind==='Song'?'Requested':'Called'} ${e(date(c.created_at))}</p>${c.on_the_way_at&&c.request_kind!=='Song'?'<p class="on-way-state">Waiter is on the way ✓</p>':''}${c.handled_at?`<p>Handled ${e(date(c.handled_at))}</p>`:''}${c.status==='Pending'&&canHandle()&&!c.on_the_way_at&&c.request_kind!=='Song'?`<button type="button" class="request-on-way" data-request-on-way="${e(c.id)}" ${handling.has(c.id)?'disabled':''}>On the way</button>`:''}${c.status==='Pending'&&canHandle()?`<button type="button" class="request-handle" data-request-handle="${e(c.id)}" ${handling.has(c.id)?'disabled':''}>${handling.has(c.id)?'Saving…':'Mark handled ✓'}</button>`:''}</article>`).join(''):`<p class="request-empty">${busy&&!data?'Loading requests…':'No '+(filter==='All'?'':filter.toLowerCase()+' ')+'requests.'}</p>`}</div><div class="request-pagination"><button type="button" data-request-page="-1" ${offset===0||busy?'disabled':''}>Previous</button><span>${data?.total?`${offset+1}–${offset+rows.length} of ${data.total}`:'0 requests'}</span><button type="button" data-request-page="1" ${!data||offset+rows.length>=data.total||busy?'disabled':''}>Next</button></div>`;
   if(root.innerHTML!==html)root.innerHTML=html;
  }
  async function refresh(){
   if(filter==='Pending'&&offset===0){data={calls:pendingRows,pending_calls:pendingRows,pending_count:pendingRows.length,total:pendingRows.length};onUpdate(data);render();return;}
   if(busy){again=true;return;}busy=true;
   const signature=filter+'|'+offset;
   try{
    const result=await Cloud.rpc('restaurant_requests_page47',{p_key:kind==='waiter'?key:null,p_status:filter,p_offset:offset,p_limit:50},kind==='kitchen');
    if(signature!==filter+'|'+offset){again=true;return;}
    result.pending_calls=pendingRows;if(!Array.isArray(result.calls))throw Error('Invalid request response.');
    if(offset>0&&!result.calls.length){offset=Math.max(0,offset-50);again=true;return;}
    data=result;error='';onUpdate(result);
   }catch(err){error='Requests could not update: '+err.message;onError(err);}
   finally{busy=false;render();if(again){again=false;refresh();}}
  }
  root.classList.add('requests-board');root.dataset.theme=kind==='kitchen'?'dark':'light';
  root.addEventListener('click',async event=>{
   const button=event.target.closest('button');if(!button)return;
   if(button.dataset.requestFilter){filter=button.dataset.requestFilter;offset=0;data=null;render();refresh();return;}
   if(button.dataset.requestPage){offset=Math.max(0,offset+Number(button.dataset.requestPage)*50);data=null;refresh();return;}
   const onWay=button.dataset.requestOnWay;const id=onWay||button.dataset.requestHandle;if(!id||handling.has(id)||!canHandle())return;
   handling.add(id);render();
   try{
    await Cloud.rpc(onWay?'restaurant_waiter_on_way':'restaurant_handle_waiter_call',{p_key:kind==='waiter'?key:null,p_id:id},kind==='kitchen');
    if(!onWay)pendingRows=pendingRows.filter(row=>row.id!==id);else pendingRows=pendingRows.map(row=>row.id===id?{...row,on_the_way_at:new Date().toISOString()}:row);await refresh();
   }catch(err){error='Could not mark handled: '+err.message;onError(err);}
   finally{handling.delete(id);render();}
  });
  document.addEventListener('restaurant-table-names',render);
  render();return {refresh,setPending:rows=>{pendingRows=rows;if(filter==='Pending'&&offset===0)data={calls:rows,pending_calls:rows,pending_count:rows.length,total:rows.length};if(!data)data={calls:rows,pending_calls:rows,pending_count:rows.length,total:rows.length};else data={...data,pending_calls:rows,pending_count:rows.length};onUpdate(data);render();}};
 }
 return {mount};
})();