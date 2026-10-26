/* Persistent device preferences. Browser/OS permission and autoplay rules still apply. */
'use strict';
const AlertDevice=(()=>{
 const key='YUMMY_ALERT_DEVICE_v38';let prefs=Cloud.read(key,{});if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))prefs={};
 const listeners=new Set(),outputs=new WeakMap();
 function enabled(kind){return prefs[kind]!==false;}
 function set(kind,value){prefs[kind]=!!value;try{Cloud.write(key,prefs);}catch{}listeners.forEach(f=>f());}
 function output(ctx){if(!outputs.has(ctx)){const boost=ctx.createGain(),limiter=ctx.createDynamicsCompressor();boost.gain.value=3;limiter.threshold.value=-3;limiter.knee.value=3;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.15;boost.connect(limiter);limiter.connect(ctx.destination);outputs.set(ctx,boost);}return outputs.get(ctx);}
 function onGesture(f){document.addEventListener('pointerdown',f,{passive:true});document.addEventListener('keydown',e=>{if(['Enter',' ','Tab'].includes(e.key))f();});}
 return {enabled,set,output,onGesture,onChange:f=>listeners.add(f)};
})();
