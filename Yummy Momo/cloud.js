/* Shared cloud API. No n8n, no local-only order fallback, no service-role keys. */
'use strict';
const Cloud = (() => {
 const cfg=typeof RESTAURANT_CONFIG==='undefined'?{}:RESTAURANT_CONFIG;
 const url=String(cfg.supabaseUrl||'').replace(/\/$/,'');
 const key=String(cfg.supabaseAnonKey||'');
 let publicKey=key.startsWith('sb_publishable_');
 if(key.startsWith('eyJ')){try{publicKey=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{}}
 const configured=publicKey && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length>20 && !/YOUR_|PASTE_/i.test(key+url);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeImage=v=>typeof v==='string' && (/^https:\/\//i.test(v)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v))?v:'';
 // Release58: true deferred public menu images. `data-low-src` never starts a
 // network request; the real `src` is assigned only as the image approaches
 // the viewport. This is stricter than native loading=lazy and keeps unseen
 // category/dish photos at zero image egress for that visit.
 let lowImageObserver=null;
 function deferImages(root=document){
  if(!root)return;
  const images=[];
  if(root.matches?.('img[data-low-src]'))images.push(root);
  if(root.querySelectorAll)images.push(...root.querySelectorAll('img[data-low-src]'));
  if(!images.length)return;
  const load=img=>{
   const source=safeImage(img.dataset.lowSrc||'');
   if(!source){img.removeAttribute('data-low-src');return;}
   img.loading='lazy';img.decoding='async';try{img.fetchPriority='low';}catch{}
   if(img.getAttribute('src')!==source)img.setAttribute('src',source);
   img.removeAttribute('data-low-src');img.removeAttribute('data-low-observed');
   lowImageObserver?.unobserve(img);
  };
  if(!('IntersectionObserver' in window)){images.forEach(load);return;}
  if(!lowImageObserver)lowImageObserver=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting)load(entry.target);
  },{root:null,rootMargin:'160px 0px',threshold:0.01});
  for(const img of images){
   img.loading='lazy';img.decoding='async';try{img.fetchPriority='low';}catch{}
   if(img.dataset.lowObserved==='1')continue;
   img.dataset.lowObserved='1';lowImageObserver.observe(img);
  }
 }
 // Schema46 persistent journals are project-scoped. Adopt legacy state only for the
 // first project using this origin; keep legacy copies for old tabs and rollback.
 let legacyProject='';try{legacyProject=localStorage.getItem('YUMMY46_LEGACY_PROJECT')||url;if(url&&!localStorage.getItem('YUMMY46_LEGACY_PROJECT'))localStorage.setItem('YUMMY46_LEGACY_PROJECT',url);}catch{}
 const privateKey=(k,staff=false)=>'YUMMY46:'+url+':'+(staff?'staff:'+String(session?.user?.id||'signed-out'):'public-device')+':'+k;
 const localKey=k=>'YUMMY46:'+url+':device:'+k;
 const read=(k,f)=>{try{const saved=localStorage.getItem(localKey(k))??(legacyProject===url?localStorage.getItem(k):null);return JSON.parse(saved||'null')??f;}catch{return f;}};
 const write=(k,v)=>{try{const text=JSON.stringify(v);localStorage.setItem(localKey(k),text);if(legacyProject===url)localStorage.setItem(k,text);}catch{throw Error('Browser storage is unavailable. Enable storage before ordering.');}};
 const remove=k=>{localStorage.removeItem(localKey(k));if(legacyProject===url)localStorage.removeItem(k);};
 let session=null,legacyStaffOwner='';
 try{session=JSON.parse(sessionStorage.getItem(privateKey('RESTAURANT_STAFF_SESSION_v3'))||(legacyProject===url?sessionStorage.getItem('RESTAURANT_STAFF_SESSION_v3'):null)||'null');legacyStaffOwner=localStorage.getItem('YUMMY46_LEGACY_STAFF:'+url)||session?.user?.id||'';if(legacyStaffOwner)localStorage.setItem('YUMMY46_LEGACY_STAFF:'+url,legacyStaffOwner);}catch{}
 const canAdoptSession=staff=>legacyProject===url&&(!staff||session?.user?.id===legacyStaffOwner);
 function sessionRead(k,f=null,staff=false){try{return JSON.parse(sessionStorage.getItem(privateKey(k,staff))||(canAdoptSession(staff)?sessionStorage.getItem(k):null)||'null')??f;}catch{return f;}}
 function sessionWrite(k,v,staff=false){const text=JSON.stringify(v);sessionStorage.setItem(privateKey(k,staff),text);if(canAdoptSession(staff))sessionStorage.setItem(k,text);}
 function sessionRemove(k,staff=false){sessionStorage.removeItem(privateKey(k,staff));if(canAdoptSession(staff))sessionStorage.removeItem(k);}
 try{localStorage.removeItem('RESTAURANT_STAFF_SESSION_v2');}catch{}
 let refreshPromise=null;
 function requireConfig(){if(!configured)throw Error('Cloud not configured. The owner must upload config.js with the Supabase Project URL and PUBLIC key.');}
 async function transport(path,{method='GET',body,staff=false,headers={},raw=false}={}) {
  requireConfig();
  if(staff){if(!session)throw Error('Please sign in as staff.');if(session.expires_at*1000<Date.now()+60000)await refresh();}
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
   const res=await fetch(url+path,{method,headers:{apikey:key,...(staff?{Authorization:'Bearer '+session.access_token}:key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...headers},body:body===undefined?undefined:(raw?body:JSON.stringify(body)),signal:controller.signal,cache:'no-store'});
   const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
   if(!res.ok){const error=Error(data?.message||data?.msg||data?.error_description||data?.error||('Cloud request failed (HTTP '+res.status+').'));error.httpStatus=res.status;const retry=res.headers.get('Retry-After');error.retryAt=retry?(isNaN(Number(retry))?Date.parse(retry):Date.now()+Number(retry)*1000):0;throw error;}
   return data;
  }catch(e){if(e.name==='AbortError'){const timeout=Error('Cloud request timed out. Check your connection and retry.');timeout.code='ETIMEDOUT';throw timeout;}throw e;}finally{clearTimeout(timer);}
 }
 function saveSession(s){if(session?.user?.id!==s.user?.id)clearPrivate();session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};sessionWrite('RESTAURANT_STAFF_SESSION_v3',session);return session;}
 async function refresh(){if(!refreshPromise)refreshPromise=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(saveSession).catch(e=>{clearPrivate();session=null;try{sessionRemove('RESTAURANT_STAFF_SESSION_v3');}catch{}throw e;}).finally(()=>refreshPromise=null);return refreshPromise;}
 async function login(email,password){return saveSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));}
 async function logout(){try{if(session)await request('/auth/v1/logout',{method:'POST',staff:true});}finally{session=null;sessionRemove('RESTAURANT_STAFF_SESSION_v3');clearPrivate();}}
 // Caches are memory-only and partitioned by project, account and capability scope.
 // No receipt tokens or staff responses enter public HTTP/Service Worker caches.
 const menuCache=new Map();let orderCache=null;let cacheEpoch=0;
 const pendingReads=new Map(),failures=new Map();
 const readRPC=new Set(['restaurant_menu_sync47','restaurant_active_sync47','restaurant_receipt_sync47','restaurant_staff_pulse47','restaurant_waiter_sync47','restaurant_table_names','restaurant_get_device_orders','restaurant_order_loyalty','restaurant_staff_menu','restaurant_customer_menu','restaurant_open_device_visit','restaurant_requests_page47','restaurant_manual_menu','restaurant_sales_analytics','restaurant_recent_cancelled','restaurant_dish_sales','restaurant_filtered_records','restaurant_records','restaurant_waiter_public56','restaurant_staff_menu_page63','restaurant_staff_menu_item63','restaurant_manual_menu_page63','restaurant_sales_analytics_section63']);
 function scope(){return url+'|'+(session?.user?.id||'customer');}
 function clearPrivate(){cacheEpoch++;menuCache.clear();orderCache=null;pendingReads.clear();failures.clear();tableNames.clear();tableNamesAt.clear();}
 function request(path,options={}){
  const endpoint=path.split('/').at(-1),args=options.body||{};
  const configRead=['restaurant_manager_permissions','restaurant_alert_settings','restaurant_stock_visibility'].includes(endpoint)&&Object.values(args).every(v=>v===null);
  const listRead=['restaurant_notifications','restaurant_stock_alerts','restaurant_categories','restaurant_admin_devices'].includes(endpoint)&&(!args.p_action||args.p_action==='list');
  const isRead=(options.method||'GET')==='GET'||readRPC.has(endpoint)||configRead||listRead;
  if(!isRead)return transport(path,options); // Writes are NEVER automatically retried or deduplicated.
  const id=scope()+'|'+path+'|'+JSON.stringify(options.body||{}),failure=failures.get(id);
  if(pendingReads.has(id))return pendingReads.get(id);
  if(failure?.until>Date.now())return Promise.reject(failure.error);
  const epoch=cacheEpoch;
  const job=transport(path,options).then(data=>{
   if(epoch!==cacheEpoch)throw Error('Account changed during refresh. Please retry.');
   failures.delete(id);return data;
  }).catch(error=>{
   const tries=(failure?.tries||0)+1;
   const retryable=error.code==='ETIMEDOUT'||error.name==='TypeError'||[408,425,429].includes(error.httpStatus)||error.httpStatus>=500;
   const delay=retryable?Math.min(60000,1000*2**Math.min(tries,6))*(.75+Math.random()*.5):30000;
   if(epoch===cacheEpoch){if(failures.size>200)failures.clear();failures.set(id,{tries,error,until:Math.max(Date.now()+delay,error.retryAt||0)});}
   throw error;
  }).finally(()=>{if(pendingReads.get(id)===job)pendingReads.delete(id);});pendingReads.set(id,job);return job;
 }
 // One completion-based network scheduler per page. No catch-up ticks after suspension.
 const jobs=new Map();let scheduleTimer=null;
 function plan(){clearTimeout(scheduleTimer);if(document.hidden||navigator.onLine===false)return;
  const due=[...jobs.values()].filter(j=>!j.busy).map(j=>j.next);if(!due.length)return;
  scheduleTimer=setTimeout(tick,Math.max(50,Math.min(...due)-Date.now()));
 }
 function tick(){for(const job of jobs.values())if(!job.busy&&job.next<=Date.now()){
  job.busy=true;Promise.resolve().then(job.work).catch(()=>{}).finally(()=>{job.busy=false;job.next=Date.now()+job.ms;plan();});
 }plan();}
 function schedule(name,ms,work){jobs.set(name,{ms,work,busy:false,next:Date.now()+ms});plan();return ()=>{jobs.delete(name);plan();};}
 function resume(){if(!document.hidden&&navigator.onLine!==false)for(const job of jobs.values())job.next=Date.now()+Math.random()*500;plan();}
 document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('offline',plan);
 async function orders(){
  const epoch=cacheEpoch;const data=await rpc('restaurant_active_sync47',{p_known:orderCache?.revision||null},true);
  if(epoch!==cacheEpoch)throw Error('Account changed.');
  if(data.orders!==null)orderCache={revision:data.revision,rows:data.orders};
  if(!orderCache)throw Error('Order snapshot missing. Reload the page.');return orderCache.rows;
 }
 async function syncMenu(staff,access=null){
  const credentials=staff?{}:(access||await TableAccess.credentials(false));
  const id=scope()+'|'+(staff?'staff':currentTable+'|'+credentials.p_visit_id);
  let cached=menuCache.get(id);const epoch=cacheEpoch;
  const data=await rpc('restaurant_menu_sync47',{p_known:cached?.revisions||{},p_staff:!!staff,...credentials,...(!staff?{p_table:currentTable}:{})},!!staff);
  if(epoch!==cacheEpoch)throw Error('Account changed.');
  cached={catalog:data.catalog??cached?.catalog,state:data.state??cached?.state,commerce:data.commerce??cached?.commerce,revisions:data.revisions};
  if(!cached.catalog||!cached.state)throw Error('Menu snapshot missing. Reload the page.');
  const states=new Map(cached.state.map(row=>[row.id,row]));
  cached.rows=cached.catalog.map(item=>({...item,...states.get(item.id)}));menuCache.set(id,cached);
  if(data.tables)setTableNames(data.tables);if(data.categories)setCategories(data.categories);
  return cached;
 }
 async function menu(staff,access=null){return (await syncMenu(staff,access)).rows;}
 async function uploadMenuImage(data){
  if(!data||!data.startsWith('data:'))return data||'';
  const match=/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if(!match)throw Error('Unsupported image. Choose WebP, PNG or JPEG.');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>1048576)throw Error('Photo must be under 1 MB.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const path='thumbs/'+hash+'.'+match[1],publicURL=url+'/storage/v1/object/public/menu-images/'+path;
  let check=await fetch(publicURL,{method:'HEAD',cache:'no-store'});
  if(!check.ok){
   try{await request('/storage/v1/object/menu-images/'+path,{method:'POST',body:bytes,raw:true,staff:true,headers:{'Content-Type':'image/'+match[1],'Cache-Control':'max-age=31536000','x-upsert':'false'}});}
   catch(e){if(e.httpStatus!==409)throw e;}
   check=await fetch(publicURL,{method:'HEAD',cache:'no-store'});
  }
  if(!check.ok)throw Error('Uploaded photo could not be verified. Original photo has been preserved.');return publicURL;
 }
 const rpc=(name,body,staff=false)=>request('/rest/v1/rpc/'+name,{method:'POST',body,staff});
 const categories=[...(cfg.categories||['All','Steamed Momos','Fried Momos','Kurkure Momos','Tandoori Momos','Chutney & Dips','Drinks','Desserts'])];
 const normalizeCategory=v=>String(v||'').trim();
 const setCategories=names=>{categories.splice(0,categories.length,'All',...names);};
 function menuRow(item){return {id:String(item.id??crypto.randomUUID()),name:String(item.name||'').slice(0,120),price:Number(item.price)||0,category:normalizeCategory(item.category),description:String(item.description??item.desc??'').slice(0,1000),image:safeImage(item.photo||item.image||''),veg:item.veg!==false,available:item.available!==false,recommended:item.recommended===true,best_seller:item.best_seller===true,updated_at:new Date().toISOString()};}
 const tableNames=new Map(),tableNamesAt=new Map(),tableNamesBusy=new Map();
 const tableName=code=>{const id=String(code??'');return tableNames.get(id)||(['COUNTER','Counter','RECEPTION'].includes(id)?'Counter':id?'Table '+id:'Table');};
 function setTableNames(rows){let changed=false;for(const row of rows||[]){const name=String(row.display_name||('Table '+row.table_number));if(tableNames.get(row.table_number)!==name){tableNames.set(row.table_number,name);changed=true;}}if(changed)document.dispatchEvent(new Event('restaurant-table-names'));return changed;}
 async function refreshTableNames({staff=false,table=null,key=null,force=false}={}){
  const id=scope()+'|'+staff+'|'+table+'|'+key;
  if(!force&&Date.now()-(tableNamesAt.get(id)||0)<60000)return;
  if(tableNamesBusy.has(id))return tableNamesBusy.get(id);
  const epoch=cacheEpoch;const job=rpc('restaurant_table_names',{p_table:table,p_waiter_key:key},staff).then(rows=>{if(epoch===cacheEpoch){setTableNames(rows);tableNamesAt.set(id,Date.now());}return rows;}).finally(()=>tableNamesBusy.delete(id));tableNamesBusy.set(id,job);return job;
 }
 const orderLabel=o=>Number.isSafeInteger(Number(o?.daily_number))&&Number(o.daily_number)>0?'Order no. '+Number(o.daily_number):'Order number pending sync';
 return {cfg,configured,tableName,setTableNames,refreshTableNames,orderLabel,esc,safeImage,deferImages,read,write,remove,privateKey,sessionRead,sessionWrite,sessionRemove,categories,setCategories,normalizeCategory,menuRow,rpc,request,login,logout,hasSession:()=>!!session,
  mfaFactors:async()=>{const user=await request('/auth/v1/user',{staff:true});return (user.factors||[]).filter(f=>f.factor_type==='totp');},
  mfaEnroll:()=>request('/auth/v1/factors',{method:'POST',body:{factor_type:'totp',friendly_name:'Yummy Momo admin '+new Date().toISOString(),issuer:'Yummy Momo'},staff:true}),
  mfaUnenrollPending:id=>request('/auth/v1/factors/'+encodeURIComponent(id),{method:'DELETE',staff:true}),
  mfaVerify:async(id,code)=>{
   if(!/^[0-9]{6}$/.test(code))throw Error('Enter the six-digit code from your authenticator app.');
   const challenge=await request('/auth/v1/factors/'+encodeURIComponent(id)+'/challenge',{method:'POST',body:{},staff:true});
   const tokens=await request('/auth/v1/factors/'+encodeURIComponent(id)+'/verify',{method:'POST',body:{challenge_id:challenge.id,code},staff:true});
   if(!tokens.access_token||!tokens.refresh_token)throw Error('Verification did not return a valid session. Sign in again.');
   saveSession(tokens);
  },
  role:async()=>{const data=await request('/rest/v1/staff_users?select=role&user_id=eq.'+session.user.id,{staff:true});if(!data[0])throw Error('This account has no staff access. Ask the owner to add it to staff_users.');return data[0].role;},
  menu,syncMenu,schedule,uploadMenuImage,clearPrivate,
  saveMenu:async rows=>{const prepared=[];for(const row of rows)prepared.push({...row,image:await uploadMenuImage(row.image)});return request('/rest/v1/menu_items?on_conflict=id',{method:'POST',body:prepared,staff:true,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});},
  patchMenu:async(id,body)=>{if(Object.hasOwn(body,'image'))body={...body,image:await uploadMenuImage(body.image)};return request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'PATCH',body,staff:true,headers:{Prefer:'return=minimal'}});},
  deleteMenu:id=>request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'DELETE',staff:true}),
  orders,invalidateOrders:()=>{orderCache=null;},
  records:(period,reference,offset=0,limit=50)=>rpc('restaurant_records',{p_period:period,p_reference:reference||null,p_offset:offset,p_limit:limit},true),
  songs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,updated_at,table_number,title,artist,song_url,status&status=in.(Queued,Playing)&order=queue_no.asc&limit=500',{staff:true}),
  playedSongs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,finished_at,table_number,title,artist,status&status=eq.Played&order=finished_at.desc&limit=20',{staff:true})
 };
})();
