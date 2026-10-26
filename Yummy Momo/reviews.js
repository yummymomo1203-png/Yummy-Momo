'use strict';
let reviewTimer=null,reviewUrl='',reviewReturnFocus=null;
function safeReviewUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(/^(g\.page|maps\.app\.goo\.gl|([a-z0-9-]+\.)?google\.com|www\.google\.[a-z.]{2,12})$/i.test(u.hostname))?u.href:'';}catch{return '';}}
async function loadPublicReviewSettings(){try{const r=await Cloud.rpc('restaurant_review_settings',{p_url:null});reviewUrl=safeReviewUrl(r.url);}catch{reviewUrl=safeReviewUrl(RESTAURANT_CONFIG.googleReviewUrl);}renderReviewLink();}
function renderReviewLink(){const a=document.getElementById('googleReviewBtn');a.hidden=!reviewUrl;if(reviewUrl)a.href=reviewUrl;else a.removeAttribute('href');document.getElementById('reviewLinkStatus').textContent=reviewUrl?'':'The restaurant has not added its Google review link yet. You can review later.';}
const REVIEW_PENDING_KEY='RESTAURANT_REVIEW_PENDING_v2',REVIEW_TTL=3*60*60*1000;
function pendingReviews(){const rows=Cloud.read(REVIEW_PENDING_KEY,[]);return (Array.isArray(rows)?rows:[]).filter(r=>r&&typeof r.id==='string'&&Number.isFinite(r.due)&&Date.now()-r.due<REVIEW_TTL&&!Cloud.read('REVIEW_SHOWN_'+r.id,false)).slice(-20);}
function promptOrderReview(id){if(!id||Cloud.read('REVIEW_SHOWN_'+id,false))return;const rows=pendingReviews();if(!rows.some(r=>r.id===id))rows.push({id,due:Date.now()+5000});Cloud.write(REVIEW_PENDING_KEY,rows.slice(-20));loadPublicReviewSettings();resumeReviewPrompt();}
function resumeReviewPrompt(){clearTimeout(reviewTimer);reviewTimer=null;const rows=pendingReviews().sort((a,b)=>a.due-b.due);Cloud.write(REVIEW_PENDING_KEY,rows);if(!rows.length||document.hidden||(typeof TableAccess!=='undefined'&&!TableAccess.canCall())||document.getElementById('reviewDialog').open)return;const next=rows[0],left=next.due-Date.now();if(left>0){reviewTimer=setTimeout(resumeReviewPrompt,Math.min(left,2147483647));return;}try{showGoogleReviewModal();Cloud.write('REVIEW_SHOWN_'+next.id,true);Cloud.write(REVIEW_PENDING_KEY,rows.filter(r=>r.id!==next.id));}catch{reviewTimer=setTimeout(resumeReviewPrompt,1000);}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeReviewPrompt();});
window.addEventListener('pageshow',()=>resumeReviewPrompt());
window.addEventListener('storage',e=>{if(e.key===REVIEW_PENDING_KEY||e.key?.startsWith('REVIEW_SHOWN_'))resumeReviewPrompt();});
function showGoogleReviewModal(){const d=document.getElementById('reviewDialog');if(d.open)return;window.OrderCelebration?.close();reviewReturnFocus=document.activeElement;renderReviewLink();d.showModal();}
function closeReviewModal(){document.getElementById('reviewDialog').close();if(reviewReturnFocus?.isConnected)reviewReturnFocus.focus({preventScroll:true});}
window.addEventListener('DOMContentLoaded',()=>{document.getElementById('reviewDialog').addEventListener('close',()=>{setTimeout(resumeReviewPrompt,0);});resumeReviewPrompt();});
