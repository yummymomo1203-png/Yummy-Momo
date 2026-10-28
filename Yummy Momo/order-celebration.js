/* Launch food only AFTER a confirmed cloud order. Optional presentation, never order logic. */
'use strict';
window.OrderCelebration=(()=>{
 const seen=new Set();let timer=null,onDone=null,tracked=false;
 const storageKey='RESTAURANT_ORDER_CELEBRATIONS_v1';
 try{const rows=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(rows))rows.slice(-100).forEach(id=>seen.add(id));}catch{}
 const dialog=()=>document.getElementById('orderCelebration');
 const safely=fn=>{try{fn?.();}catch{}};
 function finish(){
  clearTimeout(timer);timer=null;
  document.getElementById('celebrationParticles')?.replaceChildren();
  const callback=onDone;onDone=null;
  if(document.getElementById('trackingModal')?.classList.contains('open'))document.querySelector('#trackingModal .btn-close-drawer')?.focus({preventScroll:true});
  safely(()=>callback?.(tracked));
 }
 function close(){const d=dialog();if(d?.open)d.close();}
 function foodEmoji(name){
  const n=String(name||'').toLowerCase();
  if(/momo|dumpling/.test(n))return '🥟';
  if(/burger/.test(n))return '🍔';
  if(/chicken/.test(n))return '🍗';
  if(/noodle|ramen/.test(n))return '🍜';
  if(/pizza/.test(n))return '🍕';
  if(/fries|potato/.test(n))return '🍟';
  if(/drink|juice|water|soda/.test(n))return '🥤';
  if(/rice/.test(n))return '🍚';
  if(/cake|dessert|sweet/.test(n))return '🍰';
  return '🍽️';
 }
 function launch(items=[]){
  const root=document.getElementById('celebrationParticles');if(!root)return;root.replaceChildren();
  const foods=[];
  for(const item of Array.isArray(items)?items:[]){
   const count=Math.max(1,Math.min(4,Number(item.qty)||1));
   for(let i=0;i<count;i++)foods.push(foodEmoji(item.name));
  }
  (foods.length?foods:Array(8).fill('🍽️')).slice(0,18).forEach((emoji,i)=>{
   const node=document.createElement('span');node.className='food-flight';node.textContent=emoji;
   node.style.setProperty('--from-x',`${Math.random()*100-50}vw`);node.style.setProperty('--mid-x',`${Math.random()*90-45}vw`);
   node.style.setProperty('--to-x',`${Math.random()*130-65}vw`);node.style.setProperty('--from-turn',`${Math.random()*50-25}deg`);
   node.style.setProperty('--mid-turn',`${Math.random()*220-110}deg`);node.style.setProperty('--to-turn',`${Math.random()*360-180}deg`);
   node.style.setProperty('--duration',`${1900+Math.random()*900}ms`);node.style.setProperty('--delay',`${Math.random()*260}ms`);root.append(node);
  });
  ['🎉','🎊','🎉','✨'].forEach((emoji,i)=>{
   const node=document.createElement('span');node.className='party-pop';node.textContent=emoji;
   node.style.setProperty('--burst-x',`${(i-1.5)*34}vw`);node.style.setProperty('--burst-y',`${-28-Math.random()*34}vh`);
   node.style.setProperty('--burst-turn',`${Math.random()*100-50}deg`);node.style.setProperty('--delay',`${i*70}ms`);root.append(node);
  });
  const colors=['#e23744','#f59e0b','#10b981','#3b82f6','#a855f7','#fb7185'];
  for(let i=0;i<34;i++){
   const bit=document.createElement('i');bit.className='party-confetti';bit.style.setProperty('--x',`${Math.random()*100}vw`);
   bit.style.setProperty('--y',`${45+Math.random()*45}vh`);bit.style.setProperty('--turn',`${Math.random()*720-360}deg`);
   bit.style.setProperty('--color',colors[i%colors.length]);bit.style.setProperty('--delay',`${Math.random()*220}ms`);root.append(bit);
  }
 }
 function show(orderId,callback,items=[]){
  const d=dialog();
  if(!orderId||seen.has(orderId)||!d||typeof d.showModal!=='function'){safely(()=>callback?.(false));return false;}
  try{
   clearTimeout(timer);tracked=false;onDone=callback;if(!d.open)d.showModal();launch(items);
   seen.add(orderId);try{sessionStorage.setItem(storageKey,JSON.stringify([...seen].slice(-100)));}catch{}
   // Wait for Track my order or dismissal; animation itself remains brief.
   return true;
  }catch{if(d.open)d.close();else finish();return false;}
 }
 const d=dialog();
 if(d){d.addEventListener('close',()=>{if(!d.open)finish();});d.addEventListener('click',e=>{if(e.target===d)close();});document.getElementById('celebrationTrackButton')?.addEventListener('click',()=>{tracked=true;close();});}
 return {show,close};
})();
