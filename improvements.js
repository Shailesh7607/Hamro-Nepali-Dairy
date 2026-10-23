let stockScope='',scopeRows=[],dayState=null,planRows=[],dashboardRows=[],availabilityRequest=0;
const dayInput=document.getElementById('deliveryDay');
const kindLabels={receive:'स्टक प्राप्त',waste:'नोक्सानी / बिग्रिएको',adjust:'गन्ती सच्याइएको',reserve:'अर्डर आरक्षण',cancel:'रद्द भएपछि फिर्ता'};
const weekdays=['आइत','सोम','मंगल','बुध','बिही','शुक्र','शनि'];
function productName(id){return products.find(p=>p.id===id)?.name||id;}
function stockCards(rows,date){
 scopeRows=rows;stockScope=date;
 const alerts=rows.filter(p=>p.enabled&&p.available<=Math.max(p.minimum,p.low_threshold));
 document.getElementById('lowStock').textContent=alerts.length?'कम स्टक: '+alerts.map(p=>p.name+' '+nep(p.available)+' '+p.unit).join(' · '):'कम स्टक चेतावनी छैन। बिक्री बन्द भएका वस्तु तल जाँच्नुहोस्।';
 document.getElementById('stockList').innerHTML=rows.map(p=>`<form class="saved-order" data-movement="${p.id}"><h3>${escapeHTML(p.name)}</h3><p><strong>${nep(p.available)} ${escapeHTML(p.unit)}</strong> उपलब्ध · ${p.enabled?'बिक्री खुला':'बिक्री बन्द'}</p><label>कार्य<select name="kind"><option value="receive">नयाँ स्टक थप्नुहोस्</option><option value="waste">नोक्सानी घटाउनुहोस्</option><option value="adjust">वास्तविक बाँकी गन्ती सेट गर्नुहोस्</option></select></label><label>परिमाण<input name="quantity" type="number" min="0" max="1000000" step="1" required></label><label>कारण / आपूर्तिकर्ता / ब्याच<input name="note" minlength="3" maxlength="200" required></label><label>कम स्टक चेतावनी सीमा<input name="low_threshold" type="number" min="0" max="1000000" step="1" value="${p.low_threshold||0}" required></label><label><input name="enabled" type="checkbox" ${p.enabled?'checked':''}> बिक्री खुला</label><button class="btn">सेभ गर्नुहोस्</button></form>`).join('');
}
async function loadStockScope(){
 if(!settings.admin)return;
 const date=document.getElementById('useDailyStock').checked?dayInput.value:'';
 if(!date&&document.getElementById('useDailyStock').checked)return;
 const data=date?await api('daily-dashboard',null,'&date='+encodeURIComponent(date)):{inventory:operationsState.inventory,plan:null};
 dayState=date?data:null;stockScope=date;
 document.getElementById('dayPlanForm').hidden=!date;
 document.getElementById('dayPlanForm').elements.max_orders.value=data.plan?.max_orders??50;
 document.getElementById('dayPlanNote').textContent=date?(data.plan?'यो मितिको छुट्टै स्टक प्रयोग हुन्छ। बाँकी डेलिभरी ठाउँ: '+nep(data.remainingOrders):'यो मितिको योजना अझै छैन। योजना बनाएपछि छुट्टै स्टक शून्यबाट सुरु हुन्छ; पहिलेका अर्डरको स्टक दोहोर्‍याएर नजोड्नुहोस्।'):'साझा स्टक: छुट्टै योजना नभएका डेलिभरी मितिले यही स्टक प्रयोग गर्छन्।';
 if(date&&!data.plan){scopeRows=[];document.getElementById('stockList').replaceChildren();document.getElementById('lowStock').textContent='पहिले यो मितिको योजना बनाउनुहोस्।';}
 else stockCards(data.inventory,date);
 const history=await api('stock-history',null,'&date='+encodeURIComponent(date));
 document.getElementById('stockHistory').innerHTML=history.movements.map(m=>`<li>${escapeHTML(productName(m.product_id))} · ${m.delta>0?'+':''}${nep(m.delta)} · ${escapeHTML(kindLabels[m.kind]||m.kind)}<br>${escapeHTML(m.note)} · ${escapeHTML(new Date(m.created).toLocaleString('ne-NP',{timeZone:'Asia/Kathmandu'}))}</li>`).join('')||'<li>अहिलेसम्म अभिलेख छैन।</li>';
}
async function refreshAvailability(){
 const date=document.querySelector('[name=deliveryDate]').value||settings.schedule?.earliest;if(!date)return;
 const request=++availabilityRequest;shopAvailability={status:'loading',inventory:[],remainingOrders:null};renderProducts();renderCart();renderCheckout();
 try{
  const data=await api('availability',null,'&date='+encodeURIComponent(date));if(request!==availabilityRequest)return;
  shopAvailability={status:'ready',inventory:data.inventory,remainingOrders:data.remainingOrders};globalThis.shopStock=data.inventory;settings.inventory=data.inventory;
  document.getElementById('shoppingDate').value=date;
  document.getElementById('availabilityNote').textContent=date+' · '+(data.plan?'यो मितिको स्टक':'साझा स्टक')+(data.remainingOrders===null?'':' · बाँकी डेलिभरी ठाउँ: '+nep(data.remainingOrders))+(data.remainingOrders===0?' · अर्को मिति छान्नुहोस्।':'');
 }catch(e){if(request!==availabilityRequest)return;shopAvailability={status:'error',inventory:[],remainingOrders:null};document.getElementById('availabilityNote').textContent=e.message+' मिति फेरि छान्नुहोस् वा पृष्ठ ताजा गर्नुहोस्।';}
 renderProducts();renderCart();renderCheckout();
}
async function reorder(id,date){
 if(Object.keys(cart).length&&!confirm('हालको कार्टलाई यो अर्डरका वस्तुले बदल्ने?'))return;
 const {draft}=await api('reorder',{id});if(!await getSettings())return;
 cart=draft.cart;const form=document.getElementById('checkoutForm');for(const field of ['business','contact','phone','address','notes','deliveryArea'])form.elements[field].value=draft[field]||'';
 const radio=form.querySelector('input[name=payment][value="'+draft.method+'"]');if(radio)radio.checked=true;
 form.elements.deliveryDate.value=date||settings.schedule.earliest;save();await refreshAvailability();await loadDeliverySlots();location.hash='checkout';toast('मूल्य, स्टक र मिति समीक्षा गरेर अर्डर गर्नुहोस्।');
}
async function loadPlans(){
 const data=await api('plans');planRows=data.plans;
 document.getElementById('standingList').innerHTML=planRows.map(p=>`<form class="saved-order" data-plan-update="${p.id}"><h3>${escapeHTML(p.name)}</h3><p>${JSON.parse(p.weekdays).map(d=>weekdays[d]).join(' · ')} · ${p.paused?'रोकिएको':'सक्रिय'}</p><label><input type="checkbox" name="paused" ${p.paused?'checked':''}> योजना रोक्नुहोस्</label><label>छुट्टी मिति (अल्पविरामले छुट्याउनुहोस्)<input name="holidays" value="${escapeHTML(JSON.parse(p.holidays).join(', '))}" placeholder="2026-12-25, 2026-12-26"></label><button class="btn alt">योजना सेभ गर्नुहोस्</button><div class="actions">${p.dates.map(date=>`<button type="button" class="btn alt" data-plan-order="${p.source_id}" data-date="${date}">${date} को अर्डर समीक्षा</button>`).join('')}</div></form>`).join('')||'<p>नियमित योजना छैन। मेरा अर्डरबाट योजना बनाउनुहोस्।</p>';
}
async function loadDashboard(){
 const date=document.getElementById('dashboardDate').value;if(!date)return;const data=await api('daily-dashboard',null,'&date='+encodeURIComponent(date));dashboardRows=data.orders;
 document.getElementById('deliveryTotals').textContent=Object.entries(data.totals).map(([id,qty])=>productName(id)+': '+nep(qty)+' '+(products.find(p=>p.id===id)?.unit||'')).join(' · ')||'अर्डर छैन।';
 document.getElementById('deliveryList').innerHTML=data.orders.map(o=>`<article class="saved-order"><h3>${escapeHTML(o.payload.business)}</h3><p>${escapeHTML(o.id)} · ${escapeHTML(statusNames[o.status])}</p><p>${escapeHTML(o.payload.contact)} · ${escapeHTML(o.payload.phone)}<br>${escapeHTML(o.payload.address)}</p><p>${o.payload.items.map(i=>escapeHTML(i.name)+' '+nep(i.qty)+' '+escapeHTML(i.unit)).join(' · ')}</p><form data-delivery-update="${o.id}"><label>स्थिति<select name="status">${Object.entries(statusNames).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}</select></label><button class="btn">स्थिति सेभ गर्नुहोस्</button></form></article>`).join('')||'<p>यो मितिमा अर्डर छैन।</p>';
}
async function loadReports(){
 const form=document.getElementById('reportForm'),from=form.elements.from.value,to=form.elements.to.value;
 const data=await api('reports',null,'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));
 document.getElementById('reportResults').innerHTML=`<p>डेलिभर भएका अर्डर: ${nep(data.total.orders)} · अर्डर मूल्य (डेलिभरीसहित): ${money(data.total.booked)} · ती अर्डरमा भुक्तानी पुष्टि: ${money(data.total.paid)}</p><p class="note">नाफा होइन। बिक्री छानिएको डेलिभरी मितिअनुसार; नोक्सानी रेकर्ड गरिएको नेपाल मितिअनुसार हो।</p>`+products.map(p=>`<p>${escapeHTML(p.name)} — बिक्री ${nep(data.sales.find(s=>s.product_id===p.id)?.quantity||0)} ${p.unit} · उत्पादन मूल्य ${money(data.sales.find(s=>s.product_id===p.id)?.revenue||0)} · नोक्सानी ${nep(data.waste.find(w=>w.product_id===p.id)?.quantity||0)} ${p.unit}</p>`).join('');
}
function persistentRequest(form,payload){const key=JSON.stringify(payload);if(form.dataset.signature!==key){form.dataset.signature=key;form.dataset.request=crypto.randomUUID();}return {...payload,requestId:form.dataset.request};}
async function enhanceAction(form,action,payload){const button=form.querySelector('button');button.disabled=true;opMessage('सेभ हुँदैछ…');try{await api(action,payload);await getSettings();operationsState=settings.admin?await api('operations'):null;if(settings.admin)await loadStockScope();await loadPlans();delete form.dataset.signature;opMessage('सेभ भयो।');return true;}catch(e){opMessage(e.message);return false;}finally{button.disabled=false;}}
op.addEventListener('submit',async e=>{
 const form=e.target;if(!form.reportValidity())return;const f=new FormData(form);
 if(form.dataset.movement){const p=scopeRows.find(p=>p.id===form.dataset.movement);await enhanceAction(form,'stock-move',persistentRequest(form,{product_id:p.id,stock_date:stockScope,kind:f.get('kind'),quantity:Number(f.get('quantity')),note:f.get('note'),enabled:f.get('enabled')==='on',low_threshold:Number(f.get('low_threshold')),revision:p.revision}));}
 if(form.id==='dayPlanForm')await enhanceAction(form,'day-plan',{date:dayInput.value,max_orders:Number(f.get('max_orders')),revision:dayState?.plan?.revision||0});
 if(form.id==='standingForm'){const payload={source_id:f.get('source_id'),name:f.get('name'),weekdays:f.getAll('weekdays').map(Number),holidays:[]};if(await enhanceAction(form,'plan-save',persistentRequest(form,payload)))form.reset();}
 if(form.dataset.planUpdate){const p=planRows.find(p=>p.id===form.dataset.planUpdate);await enhanceAction(form,'plan-update',{id:p.id,revision:p.revision,paused:f.get('paused')==='on',holidays:f.get('holidays').split(',').map(x=>x.trim()).filter(Boolean)});}
 if(form.id==='reportForm')try{await loadReports();}catch(e){opMessage(e.message);}
 if(form.dataset.deliveryUpdate){const o=dashboardRows.find(o=>o.id===form.dataset.deliveryUpdate);if(await enhanceAction(form,'update',{id:o.id,revision:o.revision,status:f.get('status')}))await loadDashboard();}
});
op.addEventListener('click',async e=>{const button=e.target.closest('[data-plan-order]');if(button){button.disabled=true;try{await reorder(button.dataset.planOrder,button.dataset.date);}catch(e){opMessage(e.message);}finally{button.disabled=false;}}});
document.getElementById('ordersList').addEventListener('click',async e=>{
 const b=e.target.closest('[data-reorder],[data-standing]');if(!b)return;
 if(b.dataset.standing){const form=document.getElementById('standingForm');form.elements.source_id.value=b.dataset.standing;form.closest('details').open=true;location.hash='account';return;}
 b.disabled=true;try{await reorder(b.dataset.reorder);}catch(e){document.getElementById('orderMessage').textContent=e.message;}finally{b.disabled=false;}
});
for(const id of ['useDailyStock','deliveryDay'])document.getElementById(id).addEventListener('change',()=>loadStockScope().catch(e=>opMessage(e.message)));
document.getElementById('loadDeliveryDay').onclick=()=>loadDashboard().catch(e=>opMessage(e.message));
document.getElementById('shoppingDate').onchange=e=>{document.querySelector('[name=deliveryDate]').value=e.target.value;refreshAvailability();};
document.querySelector('[name=deliveryDate]').addEventListener('change',refreshAvailability);
const nepaliToday=new Date(Date.now()+345*60000).toISOString().slice(0,10);dayInput.value=nepaliToday;document.getElementById('dashboardDate').value=nepaliToday;document.querySelector('#reportForm [name=from]').value=nepaliToday.slice(0,8)+'01';document.querySelector('#reportForm [name=to]').value=nepaliToday;

document.getElementById('retryAvailability').onclick=()=>getSettings();
