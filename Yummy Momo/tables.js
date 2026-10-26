'use strict';
let tableBusy=false;
const tableNode=id=>document.getElementById(id);
function tableNameForm(t){return `<form class="table-name-form" data-table-name="${Cloud.esc(t.table_number)}"><fieldset data-table-rename51 ${window.Custom48?.canRenameTables()===false?'disabled':''}><label>Table name<input name="display_name" aria-label="Table name for ${Cloud.esc(t.table_number)}" value="${Cloud.esc(t.display_name||Cloud.tableName(t.table_number))}" maxlength="60" required></label><button class="primary-btn" type="submit">Save name</button></fieldset><p class="hint" data-table-rename-hint51 ${window.Custom48?.canRenameTables()===false?'':'hidden'}>Table name editing is disabled by the administrator.</p><small>Stable ID: ${Cloud.esc(t.table_number)} · QR link stays the same</small></form>`;}
async function refreshTables(){
 if(tableBusy)return;tableBusy=true;
 try{
  const data=await Cloud.rpc('restaurant_manage_tables',{p_action:'list',p_table:null,p_status:null},true);
  Cloud.setTableNames(data);const root=tableNode('tablesGrid');
  root.innerHTML=data.map(t=>{
   const name=Cloud.esc(Cloud.tableName(t.table_number));
   const status=`<label>Availability <select data-table-status="${Cloud.esc(t.table_number)}"><option value="Available" ${t.status==='Available'?'selected':''}>Available</option><option value="Reserved" ${t.status==='Reserved'?'selected':''}>Reserved</option></select></label>`;
   let ownerTools='';
   if(staffRole==='admin'){
    const url=new URL(Cloud.cfg.publicMenuUrl||'./',location.href);url.searchParams.set('table',t.table_number);url.searchParams.set('qr',t.qr_key);url.hash='';
    ownerTools=`<label>Customer link<input data-table-link readonly aria-label="Customer link for ${name}" value="${Cloud.esc(url.href)}"></label><div class="table-qr">${makeQr(url.href)}</div><div class="toolbar"><a class="secondary-btn" href="${Cloud.esc(url.href)}" target="_blank" rel="noopener">Open menu</a><button class="secondary-btn" data-table-copy="${Cloud.esc(t.table_number)}">Copy link</button><button class="secondary-btn" data-table-share="${Cloud.esc(t.table_number)}">Share link</button><button class="danger-btn" data-table-rotate="${Cloud.esc(t.table_number)}">Revoke link &amp; generate new</button><button class="secondary-btn" data-table-qr="${Cloud.esc(t.table_number)}">Download QR</button><button class="danger-btn" data-table-remove="${Cloud.esc(t.table_number)}">Remove table</button></div>`;
   }
   return `<article class="table-management-card" data-table-card="${Cloud.esc(t.table_number)}"><h3>${name}</h3>${tableNameForm(t)}${status}${ownerTools}</article>`;
  }).join('')||'<p>No active tables. Add one above.</p>';
  tableNode('tableMessage').textContent='';
 }catch(e){tableNode('tableMessage').textContent='Tables could not load: '+e.message;}finally{tableBusy=false;}
}
async function changeManagedTable(action,table,status=null){try{await Cloud.rpc('restaurant_manage_tables',{p_action:action,p_table:table,p_status:status},true);await refreshTables();showToast(action==='remove'?'Table removed. Existing order records are preserved.':'Table saved.');return true;}catch(e){tableNode('tableMessage').textContent=e.message;return false;}}
async function saveNamedTable(table,name){
 if(staffRole==='manager'&&window.Custom48?.canRenameTables()===false){tableNode('tableMessage').textContent='Table name editing is disabled by the administrator.';return false;}
 const clean=name.trim().replace(/\s+/gu,' ');
 if(!clean||[...clean].length>60||/[\x00-\x1f\x7f]/.test(name)){tableNode('tableMessage').textContent='Enter a table name with 1–60 characters and no control characters.';return false;}
 try{
  const saved=await Cloud.rpc('restaurant_save_table_name',{p_table:table,p_name:clean},true);
  Cloud.setTableNames([saved]);await refreshTables();
  showToast(table?'Table name saved across connected screens. Existing QR links still work.':'Table added.');return true;
 }catch(e){tableNode('tableMessage').textContent=/restaurant_save_table_name|schema cache/.test(e.message)?'Install SUPABASE/YUMMY-MOMO-45-TABLE-NAMES.sql, then refresh this page.':e.message;return false;}
}
document.addEventListener('input',e=>{if(e.target.matches('.table-name-form input'))e.target.dataset.dirty='true';});
document.addEventListener('submit',async e=>{
 const form=e.target;if(form.id!=='tableAddForm'&&!form.matches('.table-name-form'))return;e.preventDefault();
 const adding=form.id==='tableAddForm',input=adding?tableNode('newTableNumber'):form.elements.display_name,b=form.querySelector('button');
 if(!input.reportValidity())return;b.disabled=true;
 try{if(await saveNamedTable(adding?null:form.dataset.tableName,input.value)){if(adding)input.value='';else delete input.dataset.dirty;}}finally{b.disabled=false;}
});
document.addEventListener('change',async e=>{if(e.target.matches('[data-table-status]')){e.target.disabled=true;await changeManagedTable('status',e.target.dataset.tableStatus,e.target.value);e.target.disabled=false;}});
function namedQrSvg(card,code){
 const svg=card.querySelector('.table-qr svg').cloneNode(true),box=svg.getAttribute('viewBox').split(/\s+/).map(Number),size=box[2],name=Cloud.tableName(code),height=Math.max(12,size*.12),ns='http://www.w3.org/2000/svg';
 svg.setAttribute('viewBox',`0 0 ${size} ${size+height}`);svg.setAttribute('width','600');svg.setAttribute('height',String(Math.round(600*(size+height)/size)));
 const bg=document.createElementNS(ns,'rect');bg.setAttribute('width',String(size));bg.setAttribute('height',String(size+height));bg.setAttribute('fill','white');svg.prepend(bg);
 const label=document.createElementNS(ns,'text');label.setAttribute('x',String(size/2));label.setAttribute('y',String(size+height*.65));label.setAttribute('text-anchor','middle');label.setAttribute('font-family','Arial, sans-serif');label.setAttribute('font-size',String(Math.min(size*.055,size*1.5/Math.max(1,[...name].length))));label.setAttribute('fill','#241a12');label.textContent=name;svg.append(label);
 return new XMLSerializer().serializeToString(svg);
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-table-remove],[data-table-copy],[data-table-share],[data-table-rotate],[data-table-qr]');if(!b)return;
 const card=b.closest('article'),t=b.dataset.tableRemove||b.dataset.tableCopy||b.dataset.tableShare||b.dataset.tableRotate||b.dataset.tableQr,name=Cloud.tableName(t),link=card.querySelector('[data-table-link]');
 if(staffRole!=='admin'){showToast('Admin access required.');return;}
 if(b.dataset.tableRotate){if(confirm('Revoke the link for '+name+'? The old link and printed QR will stop working, and current table scan sessions will expire. Existing orders remain. Print the NEW QR before customers scan again.')){b.disabled=true;try{if(await changeManagedTable('rotate',t))showToast('Old link revoked. Copy or print the new QR.');}finally{b.disabled=false;}}}
 else if(b.dataset.tableShare){try{if(navigator.share)await navigator.share({title:'Yummy Momo · '+name,url:link.value});else{await navigator.clipboard.writeText(link.value);showToast('Sharing is unavailable here. Table link copied.');}}catch(e){if(e.name!=='AbortError'){link.select();showToast('Select and copy this table link.');}}}
 else if(b.dataset.tableRemove){if(confirm('Remove '+name+'? Its QR will no longer allow new orders or calls. Records will be kept.')){b.disabled=true;try{await changeManagedTable('remove',t);}finally{b.disabled=false;}}}
 else if(b.dataset.tableCopy){try{await navigator.clipboard.writeText(link.value);showToast('Table link copied.');}catch{link.select();showToast('Copy the selected link.');}}
 else download('table-'+t+'-qr.svg',namedQrSvg(card,t),'image/svg+xml');
});
