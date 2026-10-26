/* Presentation preference only. Hiding stock never disables inventory. */
'use strict';
const YummyStocksSettings=(()=>{
 let stocksHidden=false,busy=false,saving=false,loaded=false;
 const el=id=>document.getElementById(id);
 function paint(){if(el('tabStocksBtn'))el('tabStocksBtn').hidden=stocksHidden;const b=el('toggleStocksVisibility');if(b){b.textContent=stocksHidden?'Show stocks':'Hide stocks';b.setAttribute('aria-pressed',String(stocksHidden));b.disabled=saving||!loaded;}if(el('stockVisibilityStatus')&&loaded)el('stockVisibilityStatus').textContent=stocksHidden?'Stocks section hidden. Deductions and saved loops are still active.':'Stocks section visible.';if(stocksHidden&&typeof currentTab!=='undefined'&&currentTab==='stocks')switchTab('billing');}
 async function sync(){if(busy||saving)return;busy=true;try{const s=await Cloud.rpc('restaurant_stock_visibility',{},true);if(typeof s.stocks_hidden!=='boolean')throw Error('Install the Release35 database update.');stocksHidden=s.stocks_hidden;loaded=true;paint();}catch(e){if(el('stockVisibilityStatus'))el('stockVisibilityStatus').textContent='Stock visibility could not load: '+e.message;paint();}finally{busy=false;}}
 async function toggle(){if(saving||!loaded||staffRole!=='admin')return;saving=true;paint();try{const s=await Cloud.rpc('restaurant_stock_visibility',{p_hidden:!stocksHidden},true);stocksHidden=s.stocks_hidden;loaded=true;}catch(e){showToast('Stock visibility was not saved: '+e.message);}finally{saving=false;paint();}}
 return {sync,toggle,hidden:()=>stocksHidden};
})();
