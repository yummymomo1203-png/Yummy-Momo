/* Stable variant IDs keep stock and loops intact when display names change. */
'use strict';
const MenuOptions=Object.freeze({
 keys:item=>Object.keys(item?.size_prices||{}),
 label:(item,key)=>String(item?.size_labels?.[key]||({regular:'Regular',medium:'Medium',large:'Large'}[key])||key),
 validPrice:value=>Number.isFinite(value)&&value>=0&&value<=100000&&Math.abs(value*100-Math.round(value*100))<0.00001
});
