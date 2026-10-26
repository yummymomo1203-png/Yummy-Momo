'use strict';
function renderOrderSidebar(){
 const root=document.getElementById('desktopOrderItems');if(!root)return;const entries=Object.values(cart);
 const html=entries.length?entries.map(line=>`<div class="sidebar-order-line"><strong>${Cloud.esc(lineName(line))}</strong><span>${line.qty} × ${priceText(line.item.price)}</span><b>${priceText(line.qty*line.item.price)}</b></div>`).join(''):'<div class="empty-order"><svg class="ui-icon" aria-hidden="true"><use href="icons.svg#clipboard"></use></svg><strong>No items yet</strong><p>Add dishes to your order.</p></div>';
 if(root._html!==html){root.innerHTML=html;root._html=html;}
 document.getElementById('desktopOrderTotal').textContent=priceText(cartTotal());document.getElementById('desktopOrderCheckout').hidden=!entries.length&&!pendingAttempt;document.getElementById('desktopOrderBill').hidden=!entries.length;
}
function syncNoteChips(){const parts=document.getElementById('custNotesInput').value.split(';').map(x=>x.trim().toLowerCase());document.querySelectorAll('[data-note-chip]').forEach(b=>b.setAttribute('aria-pressed',String(parts.includes(b.dataset.noteChip.toLowerCase()))));}
document.addEventListener('click',event=>{const b=event.target.closest('[data-note-chip]');if(!b)return;const input=document.getElementById('custNotesInput'),label=b.dataset.noteChip,parts=input.value.split(';').map(s=>s.trim()).filter(Boolean),at=parts.findIndex(p=>p.toLowerCase()===label.toLowerCase());if(at<0)parts.push(label);else parts.splice(at,1);const next=parts.join('; ');if(next.length>1000){message('Notes can contain at most 1000 characters.',true);return;}input.value=next;syncNoteChips();});
document.getElementById('custNotesInput').addEventListener('input',syncNoteChips);

// Keyed menu reconciliation keeps decoded photographs mounted across quantity changes.
function patchMenuCards(root,markup,onlyId=null){
 if(onlyId===null&&root._menuMarkup===markup)return;
 const template=document.createElement('template');template.innerHTML=markup;
 const previous=new Map([...root.querySelectorAll(':scope > [data-menu-id]')].map(n=>[n.dataset.menuId,n])),nodes=[],ids=new Set();
 for(const next of [...template.content.children]){
  const id=next.dataset.menuId,html=next.outerHTML,old=previous.get(id);let node=next;ids.add(id);
  if(old&&old._markup===html)node=old;
  else if(old){const oldPhoto=old.querySelector('.item-img-container'),newPhoto=next.querySelector('.item-img-container');if(oldPhoto&&newPhoto&&oldPhoto.innerHTML===newPhoto.innerHTML)newPhoto.replaceWith(oldPhoto);old.replaceWith(next);}
  node._markup=html;nodes.push(node);
 }
 if(onlyId===null){for(const child of [...root.children])if(!ids.has(child.dataset.menuId))child.remove();nodes.forEach((node,i)=>{if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);});root._menuMarkup=markup;}
 else root._menuMarkup=null;
}
