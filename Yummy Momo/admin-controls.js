'use strict';
let categorySignature='';
async function loadStaffCategories(){
 const list=await Cloud.rpc('restaurant_categories',{p_action:'list',p_name:null,p_replacement:null,p_item:null},true);Cloud.setCategories(list.map(c=>c.name));
 const signature=JSON.stringify(list);if(signature!==categorySignature){categorySignature=signature;
  const select=document.getElementById('newItemCategory'),previous=select.value;select.replaceChildren(...list.map(c=>new Option(c.name,c.name)));if(list.some(c=>c.name===previous))select.value=previous;
  if(staffRole==='admin')document.getElementById('categoryList').innerHTML=list.map(c=>`<article class="table-management-card"><h4>${Cloud.esc(c.name)}</h4><p>${Number(c.dish_count)} dishes</p><label>Move dishes to (if removing)<select data-category-replacement>${list.filter(x=>x.name!==c.name).map(x=>`<option value="${Cloud.esc(x.name)}">${Cloud.esc(x.name)}</option>`).join('')}</select></label><button class="danger-btn" data-category-remove="${Cloud.esc(c.name)}">Remove category</button></article>`).join('');
 }
 return list;
}
async function addDishCategory(e){e.preventDefault();const b=document.getElementById('categoryAdd');b.disabled=true;try{await Cloud.rpc('restaurant_categories',{p_action:'add',p_name:document.getElementById('newCategoryName').value,p_replacement:null,p_item:null},true);document.getElementById('newCategoryName').value='';await loadStaffCategories();renderAdminMenu();document.getElementById('categoryStatus').textContent='Category added.';}catch(e){document.getElementById('categoryStatus').textContent=e.message;}finally{b.disabled=false;}}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-category-remove]');if(!b)return;const name=b.dataset.categoryRemove,replacement=b.closest('article').querySelector('select').value;
 if(!confirm('Remove category “'+name+'”? Its existing dishes will move to “'+replacement+'”. No dishes or bills will be deleted.'))return;
 b.disabled=true;try{await Cloud.rpc('restaurant_categories',{p_action:'remove',p_name:name,p_replacement:replacement||null,p_item:null},true);await loadStaffCategories();await refreshCloud();document.getElementById('categoryStatus').textContent='Category removed.';}catch(e){document.getElementById('categoryStatus').textContent=e.message;}finally{b.disabled=false;}
});
document.addEventListener('change',async e=>{const select=e.target.closest('[data-dish-category]');if(!select)return;select.disabled=true;try{await Cloud.rpc('restaurant_categories',{p_action:'assign',p_name:null,p_replacement:select.value,p_item:select.dataset.dishCategory},true);await refreshCloud();showToast('Dish category updated.');}catch(e){showToast(e.message);renderAdminMenu();}finally{select.disabled=false;}});
async function loadTaxSettings(){if(staffRole!=='admin')return;const form=document.getElementById('taxForm');for(const input of form.elements)input.disabled=true;try{const s=await Cloud.rpc('restaurant_commerce_settings',{p_enabled:null,p_mode:null,p_value:null},true);document.getElementById('taxEnabled').checked=s.tax_enabled;document.getElementById('taxMode').value=s.tax_mode;document.getElementById('taxValue').value=s.tax_value;document.getElementById('taxStatus').textContent='';for(const input of form.elements)input.disabled=false;}catch(e){document.getElementById('taxStatus').textContent=e.message;}}
async function saveTaxSettings(e){e.preventDefault();const b=document.getElementById('taxSave'),value=Number(document.getElementById('taxValue').value),mode=document.getElementById('taxMode').value;if(!Number.isFinite(value)||value<0||value>100000||(mode==='percent'&&value>100)||Math.abs(value*100-Math.round(value*100))>0.00001){document.getElementById('taxStatus').textContent='Enter a valid amount with up to two decimals (percentage: 0–100).';return;}b.disabled=true;try{await Cloud.rpc('restaurant_commerce_settings',{p_enabled:document.getElementById('taxEnabled').checked,p_mode:mode,p_value:value},true);document.getElementById('taxStatus').textContent='Tax settings saved. Existing bills are unchanged.';}catch(e){document.getElementById('taxStatus').textContent=e.message;}finally{b.disabled=false;}}
function billTaxRows(o){if(!o.tax_enabled&&!(Number(o.tax_amount)>0))return '';return `<div class="receipt-row"><span>Items subtotal</span><span>${money(o.items_subtotal)}</span></div><div class="receipt-row"><span>${o.tax_mode==='percent'?'Tax ('+Number(o.tax_value)+'%)':'Tax (fixed)'}</span><span>${money(o.tax_amount)}</span></div>`;}

let footerSettingsBusy=false;
function footerWebUrl(value){
 const raw=value.trim();if(!raw)return '';
 if(raw.length>2048||/[\s<>"\\]/.test(raw))throw Error('Enter a valid http:// or https:// website link.');
 let url;try{url=new URL(raw);}catch{throw Error('Enter a valid http:// or https:// website link.');}
 if(!['http:','https:'].includes(url.protocol)||!/^https?:\/\//i.test(raw)||url.username||url.password||!url.hostname)throw Error('Enter a valid http:// or https:// website link without login details.');
 return raw;
}
function fillFooterSettings(s){document.getElementById('footerShowCredit').checked=!!s.show_credit;document.getElementById('footerShowLink').checked=!!s.show_link;document.getElementById('footerRedirectUrl').value=s.url||'';}
async function loadFooterSettings(){
 if(staffRole!=='admin'||footerSettingsBusy)return;footerSettingsBusy=true;
 const form=document.getElementById('footerSettingsForm'),status=document.getElementById('footerSettingsStatus');for(const input of form.elements)input.disabled=true;
 try{const s=await Cloud.rpc('restaurant_footer_settings',{p_show_credit:null,p_show_link:null,p_url:null},true);fillFooterSettings(s);status.textContent='';for(const input of form.elements)input.disabled=false;}
 catch(e){status.textContent=/restaurant_footer_settings|schema cache/.test(e.message)?'Footer setup missing: run SUPABASE/FIX-CURRENT-INSTALL.sql, then refresh.':e.message;}
 finally{footerSettingsBusy=false;}
}
async function saveFooterSettings(event){
 event.preventDefault();if(staffRole!=='admin'||footerSettingsBusy)return;
 const form=document.getElementById('footerSettingsForm'),status=document.getElementById('footerSettingsStatus');let url;
 try{url=footerWebUrl(document.getElementById('footerRedirectUrl').value);if(document.getElementById('footerShowLink').checked&&!url)throw Error('Add a website link before showing Click here.');}catch(e){status.textContent=e.message;return;}
 const args={p_show_credit:document.getElementById('footerShowCredit').checked,p_show_link:document.getElementById('footerShowLink').checked,p_url:url};footerSettingsBusy=true;for(const input of form.elements)input.disabled=true;
 try{fillFooterSettings(await Cloud.rpc('restaurant_footer_settings',args,true));status.textContent='Footer settings saved. Online menus update on their next refresh (normally within 30 seconds).';}
 catch(e){status.textContent=e.message;}
 finally{footerSettingsBusy=false;for(const input of form.elements)input.disabled=false;}
}
