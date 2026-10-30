/* Foreground doorbell and per-device silencing. Never marks a request handled. */
'use strict';
const RequestRing=(()=>{
 function mount({scope,button,kind='request',suppressed=()=>false,onActive=()=>{}}){
  let enabled=AlertDevice.enabled(scope),allowed=true,unlocking=false,prepared=false,context=null,nodes=[],rows=[],active=[],lastRing=0;
  const hapticSeen=new Set();
  const storage='RESTAURANT_REQUEST_RING_v1_'+scope;let state=Cloud.read(storage,{});if(!state||typeof state!=='object'||Array.isArray(state))state={};
  const dialog=document.createElement('dialog');dialog.className='request-ring '+(scope.startsWith('kitchen')?'ring-dark':'');dialog.setAttribute('aria-label',kind==='order'?'New order placed':'Waiter requested');dialog.dataset.ringKind=kind;
  dialog.innerHTML='<div class="ring-icon" aria-hidden="true">🔔</div><h2>Waiter requested</h2><p class="ring-locations"></p><p class="ring-help">Dismiss silences these calls on this device only. Snooze rings again in 2 minutes if still pending. Neither marks the request handled.</p><div class="ring-actions"><button type="button" data-ring-dismiss>Dismiss</button><button type="button" data-ring-snooze>Snooze 2 min</button></div>';
  if(kind==='order'){dialog.querySelector('h2').textContent='New order placed';dialog.querySelector('.ring-icon').textContent='🍽️';dialog.querySelector('.ring-help').textContent='An order is waiting for acceptance. Dismiss silences it on this device; Snooze rings again in 2 minutes if still pending. Neither accepts nor cancels the order.';}
  document.body.append(dialog);
  function stop(){nodes.forEach(n=>{try{n.stop();n.disconnect();}catch{}});nodes=[];}
  function vibrateStrong(){try{navigator.vibrate?.([900,180,900,180,900]);}catch{}}
  function save(){const cutoff=Date.now()-86400000;state=Object.fromEntries(Object.entries(state).filter(([,v])=>v&&v.changed>cutoff).slice(-500));try{Cloud.write(storage,state);}catch{}}
  function silence(snooze){active.forEach(id=>state[id]={dismissed:!snooze,until:snooze?Date.now()+120000:0,changed:Date.now()});save();stop();if(dialog.open)dialog.close();active=[];}
  dialog.querySelector('[data-ring-dismiss]').addEventListener('click',()=>silence(false));dialog.querySelector('[data-ring-snooze]').addEventListener('click',()=>silence(true));dialog.addEventListener('cancel',e=>{e.preventDefault();silence(false);});
  function play(){
   if(!enabled||context?.state!=='running'||document.hidden)return;stop();const custom=window.RestaurantAlerts?.play(kind==='order'?'orders':'waiter',context);if(custom){nodes.push(...custom);return;}const now=context.currentTime;
   if(kind==='order'){
    // Bright rising three-note melody; unlike the lower two-note call doorbell.
    for(let repeat=0;repeat<2;repeat++)for(const [i,hz] of [783.99,987.77,1318.51].entries()){
     const at=now+repeat*1.2+i*.22,oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='triangle';oscillator.frequency.value=hz;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.6,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+.35);oscillator.connect(gain);gain.connect(AlertDevice.output(context));oscillator.start(at);oscillator.stop(at+.36);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};nodes.push(oscillator);
    }
    return;
   }
   // Warm ding-dong pairs for waiter/customer/counter calls only.
   for(let pair=0;pair<3;pair++)for(let note=0;note<2;note++){
    const start=now+pair*1.4+note*.42;
    for(const [harmonic,level] of [[1,.24],[2,.045]]){const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=(note?523.25:659.25)*harmonic;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(level,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.8);oscillator.connect(gain);gain.connect(AlertDevice.output(context));oscillator.start(start);oscillator.stop(start+.82);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};nodes.push(oscillator);}
   }
   vibrateStrong();
  }
  function tick(){
   const eligible=rows.filter(r=>r.status==='Pending'&&!r.on_the_way_at&&!state[r.id]?.dismissed&&Number(state[r.id]?.until||0)<=Date.now());
   if(!enabled||!allowed||context?.state!=='running'||document.hidden||window.RestaurantAlerts?.testing||suppressed()||!eligible.length){stop();if(dialog.open)dialog.close();active=[];return;}
   const old=new Set(active);active=eligible.map(r=>r.id);dialog.querySelector('.ring-locations').textContent=eligible.map(r=>kind==='order'?Cloud.orderLabel(r)+' · '+Cloud.tableName(r.table_number):r.request_kind==='Reception'?'Counter':r.request_kind==='Song'?Cloud.tableName(r.table_number)+' · 🎵 '+String(r.request_text||'Song request'):Cloud.tableName(r.table_number)+(r.request_kind==='ReservedScan'?' · reserved table QR opened':'')).join(' • ');dialog.querySelector('h2').textContent=kind==='order'?'New order placed':eligible.every(r=>r.request_kind==='Song')?'Song requested':'Waiter requested';
   if(!dialog.open){onActive();dialog.showModal();}if(Date.now()-lastRing>=2000||active.some(id=>!old.has(id))){lastRing=Date.now();play();}
  }
  function update(next,access=true){
   allowed=access;
   if(kind==='order'&&access&&scope==='kitchen-orders'){
    const incoming=next.filter(r=>r.status==='Pending'),fresh=incoming.filter(r=>!hapticSeen.has(r.id));
    for(const r of incoming){hapticSeen.add(r.id);if(hapticSeen.size>1000)hapticSeen.delete(hapticSeen.values().next().value);}
    if(fresh.length)vibrateStrong();
   }
   rows=access?next.filter(r=>!(scope.startsWith('kitchen')&&kind==='request'&&(r.request_kind==='Reception'||['COUNTER','RECEPTION'].includes(r.table_number)||r.request_origin==='staff_dashboard'))):[];
   if(access){BackgroundAlerts.notifyRows(kind,rows);resume();}tick();
  }
  function disable(){allowed=false;stop();if(dialog.open)dialog.close();active=[];paint();}
  function paint(){button.textContent=enabled?(context?.state==='running'?(kind==='order'?'Order sound on · mute':'Call sound on · mute'):'Sound on · tap to activate'):(kind==='order'?'Order sound muted · enable':'Call sound muted · enable');button.setAttribute('aria-pressed',String(enabled));}
  async function resume(){if(!enabled||!allowed)return;try{context ||= new (window.AudioContext||window.webkitAudioContext)();if(context.state!=='running')await context.resume();paint();if(context.state!=='running')return;if(!prepared&&!unlocking){unlocking=true;try{if(window.RestaurantAlerts)await RestaurantAlerts.prepareAudio(context);prepared=true;}finally{unlocking=false;}}tick();}catch{paint();}}
  async function toggle(){if(enabled&&context?.state!=='running'){await resume();paint();return;}enabled=!enabled;AlertDevice.set(scope,enabled);if(enabled){allowed=true;await resume();}else{stop();if(dialog.open)dialog.close();active=[];}paint();}
  AlertDevice.onGesture(resume);document.addEventListener('yummy-enable-audio',()=>{enabled=AlertDevice.enabled(scope);resume();});
  setInterval(tick,100);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&enabled&&context?.state==='suspended')context.resume().catch(()=>{});tick();});
  paint();queueMicrotask(resume);return {update,toggle,disable,pause(){stop();if(dialog.open)dialog.close();active=[];},get enabled(){return enabled;},dialog};
 }
 return {mount};
})();
