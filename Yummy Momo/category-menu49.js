/* Category-led menu. Banner nodes stay mounted while quantities change. */
window.CategoryMenu49=(()=>{
 'use strict';
 const cfg=()=>window.Custom48?.get()||{},e=v=>Cloud.esc(String(v??''));
 const enabled=()=>cfg().menuLayout!=='cards';
 const id=category=>'menu-category-'+encodeURIComponent(category).replaceAll('%','_');
 const label=category=>cfg().categoryLabels?.[category]||category;
 function nav(items){
  const settings=cfg(),bar=document.getElementById('categoriesBar'),browse=document.getElementById('browseMenu'),dropdown=document.getElementById('menuSort');
  const categories=Cloud.categories.slice(1).filter(cat=>items.some(i=>i.category===cat)&&settings.categoryOptions?.[cat]?.showLink!==false);
  const show=settings.showCategoryLinks!==false;
  if(browse)browse.hidden=!show;if(dropdown)dropdown.hidden=!show;if(!bar)return;
  const signature=JSON.stringify([categories,settings.categoryLabels,show]);if(bar.dataset.signature49===signature)return;bar.dataset.signature49=signature;bar.replaceChildren();
  if(dropdown){dropdown.replaceChildren(new Option('Jump to category','All'),...categories.map(cat=>new Option(label(cat),cat)));dropdown.setAttribute('aria-label','Jump to category');}
  if(!show)return;
  for(const category of categories){const link=document.createElement('a');link.className='cat-btn category-jump49';link.href='#'+id(category);link.textContent=label(category);link.onclick=event=>{event.preventDefault();jump(category);};bar.append(link);}
 }
 function jump(category){
  activeCategory='All';document.getElementById('searchInput').value='';document.getElementById('menuDiet').value='all';renderCategories();renderMenuItems();
  const target=document.getElementById(id(category));if(target){target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});const heading=target.querySelector('h2');heading?.focus({preventScroll:true});}
  for(const link of document.querySelectorAll('.category-jump49')){const active=link.getAttribute('href')==='#'+id(category);link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}
  const dropdown=document.getElementById('menuSort');if(dropdown)dropdown.value=category;
 }
 function row(item){
  const settings=cfg(),options=offeredSizes(item),catOptions=settings.categoryOptions?.[item.category]||{};
  if(item.sizes_enabled&&!options.includes(selectedSizes[item.id]))selectedSizes[item.id]=options[0];
  const size=item.sizes_enabled?selectedSizes[item.id]:null,key=cartKey(item.id,size),qty=cart[key]?.qty||0,price=size?Number(item.size_prices[size]):item.price,attr=size?' data-size="'+e(size)+'"':'';
  return `<article class="dish-row49 item-card" data-menu-id="${e(item.id)}"><div class="dish-row49-copy"><h3 class="item-title">${e(item.name)}</h3>${catOptions.showDescription===true?`<p class="item-desc">${e(item.description)}</p>`:''}${options.length?`<div class="dish-sizes49" role="group" aria-label="Choose size for ${e(item.name)}">${options.map(option=>`<button type="button" class="pizza-size-button${option===size?' selected':''}" data-pick-size="${e(option)}" data-item="${e(item.id)}" aria-pressed="${option===size}">${e(sizeLabel(option,item))} <small>${priceText(item.size_prices[option])}</small></button>`).join('')}</div>`:''}</div><div class="dish-row49-purchase"><strong class="item-price">${priceText(price)}</strong>${qty?`<div class="qty-counter"><button class="qty-btn" aria-label="Remove one ${e(item.name)}" data-qty="-1" data-item="${e(item.id)}"${attr}>−</button><span>${qty}</span><button class="qty-btn" aria-label="Add one ${e(item.name)}" data-qty="1" data-item="${e(item.id)}"${attr}>+</button></div>`:`<button class="btn-add" aria-label="Add ${e(item.name)}" data-qty="1" data-item="${e(item.id)}"${attr}>+ Add</button>`}</div></article>`;
 }
 function render(items){
  const container=document.getElementById('menuContainer'),settings=cfg();container.classList.add('category-menu49');container._menuMarkup=null;
  const groups=new Map();for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item);}
  const old=new Map([...container.querySelectorAll(':scope > .category-section49')].map(el=>[el.dataset.category49,el]));
  const next=[];for(const [category,dishes]of groups){let section=old.get(category);if(!section){section=document.createElement('section');section.className='category-section49';section.dataset.category49=category;section.id=id(category);section.innerHTML='<div class="category-header49"></div><div class="category-rows49"></div>';}
   const url=settings.photoMode!=='none'&&settings.showCategoryImages!==false&&settings.categoryOptions?.[category]?.showImage!==false?Cloud.safeImage(settings.categoryPhotos?.[category]):'';
   const head=section.querySelector('.category-header49'),header=`${url?`<figure class="category-banner49 category-photo48"><img src="${e(url)}" alt="${e(label(category))} dishes" width="1600" height="300" loading="lazy" decoding="async"></figure>`:''}<div class="category-title49"><h2 tabindex="-1">${e(label(category))}</h2><small>${dishes.length} ${dishes.length===1?'dish':'dishes'}</small></div>`;
   if(head._markup!==header){head.innerHTML=header;head._markup=header;}
   const root=section.querySelector('.category-rows49'),rows=new Map([...root.children].map(el=>[el.dataset.menuId,el])),wanted=[];
   for(const item of dishes){const html=row(item);let node=rows.get(String(item.id));if(!node||node._markup!==html){const template=document.createElement('template');template.innerHTML=html;const replacement=template.content.firstElementChild;if(node)node.replaceWith(replacement);node=replacement;node._markup=html;}wanted.push(node);}
   for(const child of [...root.children])if(!wanted.includes(child))child.remove();for(const [i,node]of wanted.entries())if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);next.push(section);
  }
  for(const child of [...container.children])if(!next.includes(child))child.remove();for(const [i,node]of next.entries())if(container.children[i]!==node)container.insertBefore(node,container.children[i]||null);
 }
 return {enabled,nav,jump,render};
})();
