/* Category-led menu. Banner nodes stay mounted while quantities change. */
window.CategoryMenu49=(()=>{
 'use strict';
 const cfg=()=>window.Custom48?.get()||{},e=v=>Cloud.esc(String(v??''));
 const enabled=()=>cfg().menuLayout!=='cards';
 const id=category=>'menu-category-'+encodeURIComponent(category).replaceAll('%','_');
 const label=category=>cfg().categoryLabels?.[category]||category;
 const imageTransform=category=>{const raw=cfg().categoryImageTransforms?.[category]||{},z=Number(raw.zoom),x=Number(raw.x),y=Number(raw.y);return {zoom:Number.isFinite(z)?Math.max(1,Math.min(2.5,z)):1,x:Number.isFinite(x)?Math.max(0,Math.min(100,x)):50,y:Number.isFinite(y)?Math.max(0,Math.min(100,y)):50};};
 function nav(items){
  const settings=cfg(),bar=document.getElementById('categoriesBar'),browse=document.getElementById('browseMenu'),dropdown=document.getElementById('menuSort');
  const categories=Cloud.categories.slice(1).filter(cat=>items.some(i=>i.category===cat)&&settings.categoryOptions?.[cat]?.showLink!==false);
  const specials=[
   {name:'Best Sellers',count:items.filter(i=>i.best_seller===true).length,symbol:'star'},
   {name:'Recommended',count:items.filter(i=>i.recommended===true).length,symbol:'check'}
  ].filter(x=>x.count>0);
  if(['Best Sellers','Recommended'].includes(activeCategory)&&!specials.some(x=>x.name===activeCategory)){activeCategory='All';const title=document.getElementById('menuListTitle');if(title)title.textContent='Our menu';}
  const show=settings.showCategoryLinks!==false;
  if(browse)browse.hidden=!show;if(dropdown)dropdown.hidden=!show;if(!bar)return;
  const signature=JSON.stringify([categories,specials,settings.categoryLabels,show,activeCategory]);if(bar.dataset.signature49===signature)return;bar.dataset.signature49=signature;bar.replaceChildren();
  if(dropdown){dropdown.replaceChildren(new Option('All categories','All'),...specials.map(x=>new Option(x.name,x.name)),...categories.map(cat=>new Option(label(cat),cat)));dropdown.setAttribute('aria-label','Filter or jump to category');dropdown.value=['Best Sellers','Recommended'].includes(activeCategory)?activeCategory:'All';}
  if(!show)return;
  for(const special of specials){const button=document.createElement('button');button.type='button';button.className='cat-btn category-special49'+(activeCategory===special.name?' active':'');button.setAttribute('aria-pressed',String(activeCategory===special.name));button.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="icons.svg#'+special.symbol+'"></use></svg><span>'+e(special.name)+'</span><small class="category-count">'+special.count+'</small>';button.onclick=()=>jump(special.name);bar.append(button);}
  for(const category of categories){const link=document.createElement('a');link.className='cat-btn category-jump49';link.href='#'+id(category);link.textContent=label(category);link.onclick=event=>{event.preventDefault();jump(category);};bar.append(link);}
 }
 function jump(category){
  const special=['Best Sellers','Recommended'].includes(category);
  const heading=document.getElementById('menuListTitle'),dropdown=document.getElementById('menuSort');
  if(special){
   activeCategory=category;if(heading)heading.textContent=category;renderCategories();renderMenuItems();
   document.getElementById('menuContainer')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
   if(dropdown)dropdown.value=category;return;
  }
  activeCategory='All';if(heading)heading.textContent='Our menu';document.getElementById('searchInput').value='';document.getElementById('menuDiet').value='all';renderCategories();renderMenuItems();
  if(category!=='All'){
   const target=document.getElementById(id(category));if(target){target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});const categoryHeading=target.querySelector('h2');categoryHeading?.focus({preventScroll:true});}
  }
  for(const link of document.querySelectorAll('.category-jump49')){const active=category!=='All'&&link.getAttribute('href')==='#'+id(category);link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}
  if(dropdown)dropdown.value=category==='All'?'All':category;
 }
 function row(item){
  const settings=cfg(),options=offeredSizes(item),catOptions=settings.categoryOptions?.[item.category]||{};
  if(item.sizes_enabled&&!options.includes(selectedSizes[item.id]))selectedSizes[item.id]=options[0];
  const size=item.sizes_enabled?selectedSizes[item.id]:null,key=cartKey(item.id,size),qty=cart[key]?.qty||0,price=size?Number(item.size_prices[size]):item.price,attr=size?' data-size="'+e(size)+'"':'';
  const labels=`${item.recommended===true?'<span class="menu-label">Recommended</span>':''}${item.best_seller===true?'<span class="menu-label">Best seller</span>':''}`;
  const diet=`<span class="badge-veg-nonveg ${item.veg?'badge-veg':'badge-nonveg'}" title="${item.veg?'Vegetarian':'Non-vegetarian'}" aria-label="${item.veg?'Vegetarian':'Non-vegetarian'}"><span class="dot"></span></span>`;
  return `<article class="dish-row49 item-card" data-menu-id="${e(item.id)}"><div class="dish-row49-copy"><div class="dish-title-line49">${diet}<h3 class="item-title">${e(item.name)}</h3></div>${labels?`<div class="dish-labels49">${labels}</div>`:''}${catOptions.showDescription===true?`<p class="item-desc">${e(item.description)}</p>`:''}${options.length?`<div class="dish-sizes49" role="group" aria-label="Choose size for ${e(item.name)}">${options.map(option=>`<button type="button" class="pizza-size-button${option===size?' selected':''}" data-pick-size="${e(option)}" data-item="${e(item.id)}" aria-pressed="${option===size}">${e(sizeLabel(option,item))} <small>${priceText(item.size_prices[option])}</small></button>`).join('')}</div>`:''}</div><div class="dish-row49-purchase"><strong class="item-price">${priceText(price)}</strong>${qty?`<div class="qty-counter"><button class="qty-btn" aria-label="Remove one ${e(item.name)}" data-qty="-1" data-item="${e(item.id)}"${attr}>−</button><span>${qty}</span><button class="qty-btn" aria-label="Add one ${e(item.name)}" data-qty="1" data-item="${e(item.id)}"${attr}>+</button></div>`:`<button class="btn-add" aria-label="Add ${e(item.name)}" data-qty="1" data-item="${e(item.id)}"${attr}>+ Add</button>`}</div></article>`;
 }
 function render(items){
  const container=document.getElementById('menuContainer'),settings=cfg();container.classList.add('category-menu49');container._menuMarkup=null;
  const groups=new Map();for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item);}
  const old=new Map([...container.querySelectorAll(':scope > .category-section49')].map(el=>[el.dataset.category49,el]));
  const next=[];let bannerCount=0;for(const [category,dishes]of groups){let section=old.get(category);if(!section){section=document.createElement('section');section.className='category-section49';section.dataset.category49=category;section.id=id(category);section.innerHTML='<div class="category-header49"></div><div class="category-rows49"></div>';}
   const candidate=settings.photoMode!=='none'&&settings.showCategoryImages!==false&&settings.categoryOptions?.[category]?.showImage!==false?Cloud.safeImage(settings.categoryPhotos?.[category]):'';const url=candidate&&bannerCount<20?(bannerCount++,candidate):'';
   const transform=imageTransform(category),head=section.querySelector('.category-header49'),header=`${url?`<figure class="category-banner49 category-photo48"><img data-low-src="${e(url)}" alt="${e(label(category))} dishes" width="1600" height="300" loading="lazy" decoding="async" fetchpriority="low" style="object-position:${transform.x}% ${transform.y}%;transform:scale(${transform.zoom});transform-origin:${transform.x}% ${transform.y}%"></figure>`:''}<div class="category-title49"><h2 tabindex="-1">${e(label(category))}</h2><small>${dishes.length} ${dishes.length===1?'dish':'dishes'}</small></div>`;
   if(head._markup!==header){head.innerHTML=header;head._markup=header;}
   const root=section.querySelector('.category-rows49'),rows=new Map([...root.children].map(el=>[el.dataset.menuId,el])),wanted=[];
   for(const item of dishes){const html=row(item);let node=rows.get(String(item.id));if(!node||node._markup!==html){const template=document.createElement('template');template.innerHTML=html;const replacement=template.content.firstElementChild;if(node)node.replaceWith(replacement);node=replacement;node._markup=html;}wanted.push(node);}
   for(const child of [...root.children])if(!wanted.includes(child))child.remove();for(const [i,node]of wanted.entries())if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);next.push(section);
  }
  for(const child of [...container.children])if(!next.includes(child))child.remove();for(const [i,node]of next.entries())if(container.children[i]!==node)container.insertBefore(node,container.children[i]||null);
  Cloud.deferImages?.(container);
 }
 return {enabled,nav,jump,render};
})();
