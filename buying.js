let settings={},staffMode=false,orderPage=0,shownOrders=[];
const statusNames={new:'नयाँ — पुष्टि बाँकी',confirmed:'पुष्टि भयो',out_for_delivery:'डेलिभरीमा',delivered:'डेलिभर भयो',cancelled:'रद्द'};
const paymentNames={pending:'बाँकी',paid:'भुक्तानी भयो',test_paid:'परीक्षण मात्र — वास्तविक रकम प्राप्त छैन'};
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(action,body,query=''){
 if(!navigator.onLine)throw new Error('इन्टरनेट जडान छैन। फेरि जडान भएपछि प्रयास गर्नुहोस्।');
 let response;
 try{response=await fetch('/api/shop?action='+action+query,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});}
 catch{throw new Error(body?'जवाफ प्राप्त भएन। अर्डर सूची जाँच्नुहोस्; फेरि पठाउँदा उही अनुरोध नम्बर प्रयोग हुन्छ।':'सेवाको जवाफ आएन। जडान जाँचेर फेरि प्रयास गर्नुहोस्।');}
 let result;try{result=await response.json()}catch{throw new Error('सेवाबाट सही जवाफ आएन। अर्डर सूची जाँचेर फेरि प्रयास गर्नुहोस्।')}
 if(!response.ok){const error=new Error(result.error||'सेवा उपलब्ध भएन।');error.status=response.status;throw error;}return result;
}
const methodNames={cod:'डेलिभरीमा नगद',bank:'बैंक ट्रान्सफर',khalti:'Khalti',esewa:'eSewa'};
function orderProgress(o){
 if(o.status==='cancelled')return '<p class="note">यो अर्डर रद्द गरिएको छ।</p>';
 const stages=['new','confirmed','out_for_delivery','delivered'],current=stages.indexOf(o.status);
 return '<ol class="order-progress" aria-label="अर्डर प्रगति">'+stages.map((stage,i)=>`<li class="${i<=current?'complete':''}" ${i===current?'aria-current="step"':''}>${i<current?'✓ ':''}${statusNames[stage]}</li>`).join('')+'</ol>';
}
function renderAccount(error){
 const area=document.getElementById('accountContent');
 if(error){document.getElementById('adminOperations').hidden=true;area.innerHTML=error.status===401?'<p>आफ्नो इमेल र पासवर्डबाट लगइन गर्नुहोस् वा नयाँ ग्राहक खाता बनाउनुहोस्।</p><a class="btn" target="_top" href="/auth.html">साइन इन / खाता बनाउनुहोस्</a>':'<p>खाता लोड हुन सकेन। केही समयपछि फेरि प्रयास गर्नुहोस्।</p><button class="btn" id="retryAccount">फेरि प्रयास गर्नुहोस्</button>';document.getElementById('retryAccount')?.addEventListener('click',getSettings);return;}
 area.innerHTML=`<p class="kicker">${settings.admin?'प्रशासक · Admin':'ग्राहक · Customer'}</p><h2>${escapeHTML(settings.account.email||'मेरो खाता')}</h2><p>तपाईंको इमेल खाता पुष्टि गरिएको छ।</p><div class="actions"><a class="btn" href="#products">किनमेल गर्नुहोस्</a><a class="btn alt" id="accountOrders" href="#orders">मेरा अर्डर र स्थिति</a>${settings.admin?'<button class="btn" id="openAdmin">सबै अर्डर र ग्राहक विवरण</button><button class="btn alt" id="openStock">स्टक व्यवस्थापन</button>':''}<a class="btn alt" href="/auth.html?mode=recover">पासवर्ड बदल्नुहोस्</a><button class="btn alt" id="logoutAccount">साइन आउट</button></div><p class="note">${settings.admin?'सबै अर्डर खोज्नुहोस्, डेलिभरी शुल्क पुष्टि गर्नुहोस् र अर्डर स्थिति परिवर्तन गर्नुहोस्।':'आफ्ना अर्डरको विवरण, डेलिभरी र भुक्तानी स्थिति हेर्नुहोस्।'}</p>`;
 document.getElementById('logoutAccount').onclick=async()=>{try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error('साइन आउट भएन। फेरि प्रयास गर्नुहोस्।');sessionStorage.removeItem('dudhghar-order-retry');location.assign('/auth.html');}catch(e){toast(e.message)}};
 document.getElementById('accountOrders').addEventListener('click',()=>{staffMode=false;orderPage=0;});
 document.getElementById('openStock')?.addEventListener('click',async()=>{await loadOperations();const section=document.getElementById('simpleStock');section.open=true;section.scrollIntoView({block:'start',behavior:'smooth'});});
 document.getElementById('openAdmin')?.addEventListener('click',()=>{staffMode=true;orderPage=0;location.hash='orders';});
}
async function getSettings(){try{
 settings=await api('config');
 const date=document.querySelector('[name=deliveryDate]');date.min=settings.schedule.earliest;date.max=settings.schedule.latest;document.getElementById('cutoffNotice').textContent='कटअफ: '+settings.schedule.cutoff+' (नेपाल समय) · सबैभन्दा चाँडो डेलिभरी: '+settings.schedule.earliest+' · चाहिएको मिति कर्मचारीले पुष्टि गर्नेछन्।';
 if(!date.value||date.value<date.min||date.value>date.max)date.value=date.min;const shopping=document.getElementById('shoppingDate');shopping.min=date.min;shopping.max=date.max;if(typeof refreshAvailability==='function')await refreshAvailability();
if(!settings.admin)staffMode=false;populateDeliveryAreas();document.getElementById('staffOrders').hidden=!settings.admin;renderAccount();if(typeof loadAddresses==='function'){await loadAddresses();await loadDeliverySlots();}
 document.querySelectorAll('input[name=payment]').forEach(r=>{r.disabled=r.value!=='cod'&&!settings[r.value];if(r.disabled&&r.checked)document.querySelector('input[value=cod]').checked=true;});return true;
 }catch(error){shopAvailability={status:'error',inventory:[],remainingOrders:null};renderProducts();renderCart();renderCheckout();settings={};staffMode=false;document.getElementById('staffOrders').hidden=true;document.getElementById('adminOverview').hidden=true;document.getElementById('ordersList').replaceChildren();shownOrders=[];renderAccount(error);if(error.status===401){document.getElementById('availabilityNote').textContent='स्टक र अर्डरका लागि आफ्नो खातामा लगइन गर्नुहोस्।';const link=document.createElement('a');link.href='/auth.html?next=checkout';link.textContent='लगइन / नयाँ खाता →';document.getElementById('checkoutIssues').append(link);}return false;}}
function receipt(o){const p=o.payload;return `हाम्रो नेपाली डेरी — अर्डर रसिद\n${o.id}\n${statusNames[o.status]} · ${paymentNames[o.payment]}\n\n${p.business}\n${p.contact} · ${p.phone}\n${p.address}\nडेलिभरी क्षेत्र: ${p.deliveryAreaLabel||'पहिलेको अर्डर'}\nचाहिएको मिति: ${nep(p.deliveryDate||'—')}\nसमय: ${p.deliverySlot==='morning'?'7–11 AM':p.deliverySlot==='afternoon'?'1–5 PM':'पहिलेको अर्डर — समय पुष्टि बाँकी'} (नेपाल)\n${p.notes||''}\n\n`+p.items.map(i=>`${i.name} — ${nep(i.qty)} ${i.unit} × ${money(i.price)} = ${money(i.subtotal)}`).join('\n')+`\n\nउत्पादन: ${money(o.subtotal)}\nडेलिभरी: ${o.delivery===null?'पुष्टि हुन बाँकी':money(o.delivery)}\n${o.delivery===null?'हालको उपजम्मा':'अन्तिम जम्मा'}: ${money(o.total)}\nभुक्तानी: ${methodNames[o.method]||o.method}\nकारोबार: ${o.reference||'—'}`;}
function adminOrderDetails(o){
 const p=o.payload;
 const fields=[['सम्पर्क व्यक्ति',p.contact],['फोन नम्बर',p.phone],['डेलिभरी ठेगाना',p.address],['डेलिभरी क्षेत्र',p.deliveryAreaLabel||'पुष्टि बाँकी'],['डेलिभरी मिति',p.deliveryDate||'पुष्टि बाँकी'],['समय',p.deliverySlot==='morning'?'7–11 AM (नेपाल)':p.deliverySlot==='afternoon'?'1–5 PM (नेपाल)':'पुष्टि बाँकी'],['ग्राहकको नोट',p.notes||'—']];
 return `<section class="customer-details"><h3>ग्राहक र डेलिभरी विवरण</h3><dl>${fields.map(([label,value])=>`<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl><h3>अर्डरका सामान</h3><ul>${p.items.map(i=>`<li>${escapeHTML(i.name)} · ${nep(i.qty)} ${escapeHTML(i.unit)} — ${money(i.subtotal)}</li>`).join('')}</ul><p><strong>जम्मा: ${money(o.total)}</strong> · ${escapeHTML(paymentNames[o.payment])}</p><details><summary>पूरा रसिद हेर्नुहोस्</summary><pre>${escapeHTML(receipt(o))}</pre></details></section>`;
}
async function loadOrders(){
 const message=document.getElementById('orderMessage');message.classList.remove('order-success');message.textContent='अर्डर लोड हुँदैछ…';
 try{if(!await getSettings())throw new Error('खाता खोल्नुहोस् र साइन इन स्थिति जाँच्नुहोस्।');const data=await api('list',null,'&admin='+(staffMode?'1':'0')+'&page='+orderPage+'&status='+encodeURIComponent(document.getElementById('orderStatus').value)+'&search='+encodeURIComponent(document.getElementById('orderSearch').value));shownOrders=data.orders;
 const overview=document.getElementById('adminOverview');overview.hidden=!staffMode;if(staffMode){const summary=await api('overview');overview.innerHTML='<h2>सबै अर्डरको सारांश</h2><p>'+Object.entries(statusNames).map(([key,label])=>escapeHTML(label)+': '+nep(summary.counts.find(x=>x.status===key)?.count||0)).join(' · ')+'</p>';}

 document.getElementById('ordersList').innerHTML=data.orders.map(o=>`<article class="saved-order"><h2>${escapeHTML(o.payload.business)}</h2><p class="receipt-no">${escapeHTML(o.id)}</p>${orderProgress(o)}${staffMode?adminOrderDetails(o):`<pre>${escapeHTML(receipt(o))}</pre>`}<div class="actions">${!staffMode?`<button class="btn" data-reorder="${o.id}">फेरि अर्डर</button><button class="btn alt" data-standing="${o.id}">नियमित योजना</button><button class="btn alt" data-support="${o.id}">समस्या / रद्द / फिर्ता अनुरोध</button>`:''}<button class="btn alt" data-print="${o.id}">रसिद / PDF</button><button class="btn alt" data-download="${o.id}">रसिद डाउनलोड</button>${o.method!=='cod'&&o.delivery!==null&&o.payment==='pending'&&o.status!=='cancelled'?`<button class="btn" data-pay="${o.id}" ${o.method==='bank'?!settings.bank?'disabled':'':!settings[o.method]?'disabled':''}>${o.method==='bank'?'बैंक विवरण':'भुक्तानीमा जानुहोस्'}</button>`:''}${!['bank','cod'].includes(o.method)&&settings[o.method]&&o.payment==='pending'?`<button class="btn alt" data-verify="${o.id}">भुक्तानी जाँच्नुहोस्</button>`:''}</div><p class="note">${o.delivery===null?'डेलिभरी मिति, क्षेत्र र शुल्क पुष्टि हुन बाँकी छ।':o.method==='cod'?(o.payment==='paid'?'नगद प्राप्ति पुष्टि भयो।':'डेलिभरीमा नगद तिर्नुहोस्। नगद प्राप्त भएपछि कर्मचारीले भुक्तानी पुष्टि गर्नुहुन्छ।'):o.method==='bank'&&!settings.bank?'बैंक विवरण जोड्न बाँकी छ। अहिले पैसा नपठाउनुहोस्।':o.method!=='bank'&&!settings[o.method]?'व्यापारी खाता जोड्न बाँकी छ। भुक्तानी उपलब्ध छैन।':settings.mode==='sandbox'&&o.method!=='bank'?'Sandbox परीक्षण हो। वास्तविक पैसा नतिर्नुहोस्।':'भुक्तानीपछि स्थिति जाँच्नुहोस्।'}</p>${staffMode?`<form data-update="${o.id}"><label>डेलिभरी शुल्क (रू)<input name="delivery" type="number" min="0" max="100000" step="1" value="${o.delivery??''}" placeholder="पुष्टि गर्नुहोस्"></label><label>अर्डर स्थिति<select name="status">${Object.entries(statusNames).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}</select></label>${['bank','cod'].includes(o.method)&&o.payment==='pending'?'<label><input name="markPaid" type="checkbox"> रकम प्राप्त भएको पुष्टि गर्छु</label><label>कारोबार / नगद रसिद नम्बर<input name="reference" maxlength="120"></label><p class="note">नगद पुष्टि गर्दा स्थिति डेलिभर भयो छान्नुहोस्।</p>':''}<button class="btn">सेभ गर्नुहोस्</button></form>`:''}</article>`).join('')||'<p class="note">अर्डर भेटिएन।</p>';
 document.getElementById('prevOrders').disabled=orderPage===0;document.getElementById('nextOrders').disabled=!data.hasMore;document.getElementById('pageNumber').textContent='पृष्ठ '+nep(orderPage+1);
 document.getElementById('setupInfo').hidden=!staffMode;
 document.getElementById('setupInfo').textContent='भुक्तानी सेटअप: Bank '+(settings.bank?'तयार':'बाँकी')+' · Khalti '+(settings.khalti?'तयार':'बाँकी')+' · eSewa '+(settings.esewa?'तयार':'बाँकी')+'। क्षेत्रअनुसार शुल्क स्वतः जोडिएको छ। अन्य क्षेत्रको शुल्क ग्राहकसँग पुष्टि गरी सेभ गर्नुहोस्। बैंक कारोबार जाँचेर मात्र भुक्तानी पुष्टि गर्नुहोस्।';
 message.textContent='';
 }catch(e){shownOrders=[];document.getElementById('ordersList').replaceChildren();document.getElementById('adminOverview').hidden=true;message.textContent=e.message;}
}
let retry=null;try{retry=JSON.parse(sessionStorage.getItem('dudhghar-order-retry')||'null');}catch{}
document.getElementById('checkoutForm').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting)return;if(shopRules.cartIssues(products,cart,shopAvailability).length){renderCheckoutIssues();return;}const form=e.currentTarget;if(!form.reportValidity())return;
 const f=new FormData(form),payload={business:f.get('business'),contact:f.get('contact'),phone:f.get('phone'),address:f.get('address'),deliveryDate:f.get('deliveryDate'),deliverySlot:f.get('deliverySlot'),deliveryArea:f.get('deliveryArea'),notes:f.get('notes'),method:f.get('payment'),cart:{...cart}};
 submitting=true;renderCheckoutIssues();const buttons=[...form.querySelectorAll('button,input,textarea,select')];buttons.forEach(b=>b.disabled=true);
 try{
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(!retry||retry.hash!==hash)retry={hash,id:crypto.randomUUID()};
  try{sessionStorage.setItem('dudhghar-order-retry',JSON.stringify(retry));}catch{}
  const result=await api('create',{...payload,requestId:retry.id});staffMode=false;orderPage=0;
  cart={};save();try{sessionStorage.removeItem('dudhghar-order-retry');}catch{}retry=null;
  toast('अर्डर सुरक्षित भयो।');location.hash='orders';await loadOrders();const message=document.getElementById('orderMessage');message.classList.add('order-success');message.textContent='अर्डर सुरक्षित भयो: '+result.order.id+' · कर्मचारीको पुष्टि बाँकी छ।';message.scrollIntoView({block:'center',behavior:'smooth'});
 }catch(error){toast(error.message);document.getElementById('paymentHelp').textContent=error.message;}finally{submitting=false;buttons.forEach(b=>b.disabled=false);document.querySelectorAll('input[name=payment]').forEach(r=>r.disabled=r.value!=='cod'&&!settings[r.value]);renderCheckoutIssues();}
});
document.getElementById('ordersList').addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button)return;
 const id=button.dataset.print||button.dataset.download||button.dataset.pay||button.dataset.verify;if(!id)return;
 const o=shownOrders.find(x=>x.id===id);if(!o)return;const text=receipt(o);
 if(button.dataset.print){let area=document.getElementById('printReceipt');if(!area){area=document.createElement('pre');area.id='printReceipt';area.hidden=true;document.body.append(area);}area.textContent=text;window.print();return;}
 if(button.dataset.download){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=o.id+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 button.disabled=true;
 try{const result=await api(button.dataset.verify?'verify':'pay',{id});
 if(result.url)location.assign(result.url);
 else if(result.form){const form=document.createElement('form');form.method='POST';form.action=result.form.url;for(const [name,value]of Object.entries(result.form.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}document.body.append(form);form.submit();}
 else if(result.bank){const p=document.createElement('pre');p.textContent=`बैंक: ${result.bank.name}\nखातावाला: ${result.bank.accountName}\nखाता नम्बर: ${result.bank.number}\nरकम: ${money(o.total)}\nसन्दर्भ: ${o.id}\nरकम प्राप्त भएपछि कर्मचारीले पुष्टि गर्नुहुन्छ।`;button.closest('article').append(p);}
 else {await loadOrders();document.getElementById('orderMessage').textContent=result.message||'स्थिति ताजा भयो।';}
 }catch(error){document.getElementById('orderMessage').textContent=error.message;}finally{button.disabled=false;}
});
document.getElementById('ordersList').addEventListener('submit',async e=>{e.preventDefault();const form=e.target;if(!form.dataset.update)return;const o=shownOrders.find(x=>x.id===form.dataset.update),f=new FormData(form);const button=form.querySelector('button');button.disabled=true;try{await api('update',{id:o.id,revision:o.revision,status:f.get('status'),...(f.get('delivery')!==''?{delivery:Number(f.get('delivery'))}:{}),markPaid:f.get('markPaid')==='on',reference:f.get('reference')||''});await loadOrders();document.getElementById('orderMessage').textContent='सेभ भयो।';}catch(error){document.getElementById('orderMessage').textContent=error.message;}finally{button.disabled=false;}});
document.getElementById('myOrders').onclick=()=>{staffMode=false;orderPage=0;loadOrders();};document.getElementById('staffOrders').onclick=()=>{staffMode=true;orderPage=0;loadOrders();};document.getElementById('refreshOrders').onclick=loadOrders;document.getElementById('prevOrders').onclick=()=>{orderPage=Math.max(0,orderPage-1);loadOrders();};document.getElementById('nextOrders').onclick=()=>{orderPage++;loadOrders();};
document.getElementById('orderFilters').onsubmit=e=>{e.preventDefault();orderPage=0;loadOrders();};
getSettings();showPage();

function populateDeliveryAreas(){
 const select=document.getElementById('deliveryArea'),previous=select.value;
 select.innerHTML='<option value="">डेलिभरी क्षेत्र छान्नुहोस्</option>'+(settings.deliveryAreas||[]).map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.label)}${a.fee===null?'':' — '+money(a.fee)}</option>`).join('');
 select.value=previous;updateDeliverySummary();
}
function updateDeliverySummary(){
 const area=(settings.deliveryAreas||[]).find(a=>a.id===document.getElementById('deliveryArea').value);
 document.getElementById('checkoutSubtotal').textContent=money(total());
 document.getElementById('deliveryFee').textContent=!area?'क्षेत्र छान्नुहोस्':area.fee===null?'छुट्टै शुल्क पुष्टि आवश्यक':money(area.fee);
 document.getElementById('checkoutTotalLabel').textContent=area&&area.fee!==null?'डेलिभरीसहित जम्मा':'उपजम्मा — डेलिभरी शुल्क बाँकी';
 document.getElementById('checkoutTotal').textContent=money(total()+(area?.fee??0));
}
document.getElementById('deliveryArea').addEventListener('change',updateDeliverySummary);
