/* Device-local audio assets. No files or executable pack content are uploaded to a server. */
'use strict';
window.AlertAudio=(()=>{
 const kinds=['orders','waiter','notification'];
 let prefs=Cloud.read('RESTAURANT_AUDIO_DEVICE_v1',{}),dbPromise,assetRevision=0;
 if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))prefs={};
 const cache=new Map();let contextCache=new WeakMap();
 const el=id=>document.getElementById(id);
 function db(){return dbPromise ||= new Promise((resolve,reject)=>{const q=indexedDB.open('restaurant-alert-audio-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('assets');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('Audio storage unavailable.'));});}
 async function store(key,value){const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('assets','readwrite');if(value===null)t.objectStore('assets').delete(key);else t.objectStore('assets').put(value,key);t.oncomplete=resolve;t.onerror=()=>reject(Error('Audio storage is full or unavailable.'));});cache.delete(key);assetRevision++;contextCache=new WeakMap();}
 async function asset(key){if(cache.has(key))return cache.get(key);const d=await db();const value=await new Promise((resolve,reject)=>{const r=d.transaction('assets').objectStore('assets').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});cache.set(key,value||null);return value||null;}
 function save(){Cloud.write('RESTAURANT_AUDIO_DEVICE_v1',prefs);}
 function customAlarm(kind){return prefs[kind+'_custom']===true;}
 async function decode(ctx,key,url){let m=contextCache.get(ctx);if(!m){m=new Map();contextCache.set(ctx,m);}const k=assetRevision+':'+key;if(m.has(k))return m.get(k);const b=await(await fetch(url)).arrayBuffer();const audio=await ctx.decodeAudioData(b);m.set(k,audio);return audio;}
 async function warm(ctx){const revision=assetRevision;for(const kind of kinds)if(customAlarm(kind)){const a=await asset(kind);if(a)await decode(ctx,kind,a.audio);}return revision===assetRevision;}
 function ready(ctx,key){return contextCache.get(ctx)?.get(assetRevision+':'+key);}
 function node(ctx,buffer,at,offset,duration,rate=1,volume=.9){const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buffer;s.playbackRate.value=rate;g.gain.value=volume;s.connect(g);g.connect(AlertDevice.output(ctx));s.onended=()=>{s.disconnect();g.disconnect();};s.start(at,offset,duration);return s;}
 function alarm(kind,ctx){if(!customAlarm(kind))return null;const b=ready(ctx,kind);if(!b)return null;return [node(ctx,b,ctx.currentTime,0,Math.min(b.duration,1.8),1,kind==='orders'?1.35:.45)];}
 async function uploadAlarm(kind,input){try{const f=input.files[0];if(!f)return;if(f.size>2*1024*1024)throw Error('Choose an audio file under 2 MB.');const ctx=new(window.AudioContext||window.webkitAudioContext)();let audio;try{audio=await ctx.decodeAudioData(await f.arrayBuffer());if(audio.duration>15||audio.duration<.1)throw Error('Alarm must be 0.1–15 seconds. Only the first 1.8 seconds repeat.');}finally{await ctx.close();}const data=await dataURL(f);await store(kind,{name:f.name,audio:data});prefs[kind+'_custom']=true;save();await fill();RestaurantAlerts.reloadAudio();}catch(e){el('alertSettingsStatus').textContent=e.message;}finally{input.value='';}}
 function dataURL(f){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});}
 async function reset(kind){try{await store(kind,null);prefs[kind+'_custom']=false;save();await fill();RestaurantAlerts.reloadAudio();}catch(e){el('alertSettingsStatus').textContent=e.message;}}
 async function fill(){try{for(const kind of kinds){const a=await asset(kind);if(el(kind+'CustomStatus'))el(kind+'CustomStatus').textContent=a&&customAlarm(kind)?'Using: '+a.name+' (first 1.8s)':'Using selected built-in alarm';}}catch(e){if(el('alertSettingsStatus'))el('alertSettingsStatus').textContent=e.message;}}
 return {warm,alarm,fill,isCustom:customAlarm,uploadAlarm,reset};
})();
