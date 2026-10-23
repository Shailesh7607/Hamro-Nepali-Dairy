// Address values are rendered with textContent/value; no customer HTML is inserted.
let savedAddresses=[],slotRequest=0;
const checkout=document.getElementById('checkoutForm');
const addressPanel=document.createElement('fieldset');
addressPanel.innerHTML='<legend>सुरक्षित ठेगाना / Saved addresses</legend><label>ठेगाना छान्नुहोस्<select id="savedAddress"><option value="">नयाँ ठेगाना</option></select></label><label>ठेगानाको नाम<input id="addressLabel" maxlength="60" placeholder="घर / पसल"></label><div class="actions"><button type="button" class="btn alt" id="saveAddress">ठेगाना सेभ / अपडेट</button><button type="button" class="btn alt" id="deleteAddress">हटाउनुहोस्</button></div><p id="addressMessage" role="status"></p>';
checkout.prepend(addressPanel);
const slotPanel=document.createElement('fieldset');
slotPanel.innerHTML='<legend>डेलिभरी समय / Delivery slot</legend><label>नेपाल समय<select name="deliverySlot" id="deliverySlot" required><option value="">मिति छानेर समय लोड गर्नुहोस्</option></select></label><button type="button" class="btn alt" id="refreshSlots">समय ताजा गर्नुहोस्</button><p id="slotMessage" role="status">स्लट अर्डर पेश भएपछि मात्र आरक्षित हुन्छ।</p>';
checkout.querySelector('[name=deliveryDate]').closest('label').after(slotPanel);
async function loadAddresses(){
 const select=document.getElementById('savedAddress'),previous=select.value;
 try{savedAddresses=(await api('addresses')).addresses;select.replaceChildren(new Option('नयाँ ठेगाना', ''));for(const a of savedAddresses)select.add(new Option(a.label,a.id));select.value=savedAddresses.some(a=>a.id===previous)?previous:'';}
 catch(e){document.getElementById('addressMessage').textContent=e.message;}
}
document.getElementById('savedAddress').onchange=e=>{
 const a=savedAddresses.find(a=>a.id===e.target.value);document.getElementById('addressLabel').value=a?.label||'';
 if(a){for(const [key,value]of Object.entries(a.details)){if(checkout.elements[key])checkout.elements[key].value=value;}updateDeliverySummary();}
};
document.getElementById('saveAddress').onclick=async e=>{
 e.target.disabled=true;try{
 const a=savedAddresses.find(a=>a.id===document.getElementById('savedAddress').value),payload={label:document.getElementById('addressLabel').value,...(a?{id:a.id,revision:a.revision}:{})};
 for(const key of ['business','contact','phone','address','deliveryArea','notes'])payload[key]=checkout.elements[key].value;
 const r=await api('address-save',payload);await loadAddresses();document.getElementById('savedAddress').value=r.id;document.getElementById('addressMessage').textContent='ठेगाना सेभ भयो। पहिलेका अर्डर बदलिँदैनन्।';
 }catch(e){document.getElementById('addressMessage').textContent=e.message;}finally{e.target.disabled=false;}
};
document.getElementById('deleteAddress').onclick=async e=>{
 const a=savedAddresses.find(a=>a.id===document.getElementById('savedAddress').value);if(!a)return;
 e.target.disabled=true;try{await api('address-delete',{id:a.id,revision:a.revision});await loadAddresses();document.getElementById('addressLabel').value='';document.getElementById('addressMessage').textContent='सेभ गरिएको ठेगाना हटाइयो। पहिलेका अर्डर सुरक्षित छन्।';}catch(e){document.getElementById('addressMessage').textContent=e.message;}finally{e.target.disabled=false;}
};
async function loadDeliverySlots(){
 const select=document.getElementById('deliverySlot'),date=checkout.elements.deliveryDate.value,previous=select.value,request=++slotRequest;
 select.replaceChildren(new Option('समय लोड हुँदैछ…',''));select.setCustomValidity('डेलिभरी समय लोड गर्नुहोस्।');if(!date)return;
 try{const data=await api('slots',null,'&date='+encodeURIComponent(date));if(request!==slotRequest)return;
 select.replaceChildren(new Option('समय छान्नुहोस्',''));for(const slot of data.slots){const option=new Option(slot.label+' · '+slot.remaining+' बाँकी',slot.id);option.disabled=slot.remaining===0;select.add(option);}
 if(data.slots.some(s=>s.id===previous&&s.remaining>0))select.value=previous;
 select.setCustomValidity('');document.getElementById('slotMessage').textContent='नेपाल समय · अर्डर पेश भएपछि मात्र आरक्षित हुन्छ।';
 }catch(e){if(request!==slotRequest)return;select.replaceChildren(new Option('समय लोड भएन — ताजा गर्नुहोस्',''));document.getElementById('slotMessage').textContent=e.message;}
}
document.getElementById('refreshSlots').onclick=loadDeliverySlots;
checkout.elements.deliveryDate.addEventListener('change',loadDeliverySlots);
document.getElementById('shoppingDate').addEventListener('change',()=>queueMicrotask(loadDeliverySlots));
window.addEventListener('hashchange',()=>{if(location.hash==='#checkout'){loadAddresses();loadDeliverySlots();}});
const adminSlots=document.createElement('details');adminSlots.innerHTML='<summary>डेलिभरी समयको क्षमता / Slot capacity</summary><p>हरेक मितिमा बिहान र दिउँसो २० अर्डरको प्रारम्भिक सीमा। ० राख्दा बन्द हुन्छ। दिनको कुल सीमा पनि लागू हुन्छ।</p><label>मिति<input type="date" id="slotAdminDate"></label><button type="button" class="btn alt" id="loadAdminSlots">लोड गर्नुहोस्</button><div id="adminSlotForms"></div><p id="adminSlotMessage" role="status"></p>';
document.getElementById('adminOperations').append(adminSlots);
async function loadAdminSlots(){try{
 const date=document.getElementById('slotAdminDate').value,data=await api('slots',null,'&date='+encodeURIComponent(date)),host=document.getElementById('adminSlotForms');host.replaceChildren();
 for(const slot of data.slots){const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button');label.textContent=slot.label+' · '+slot.booked+' आरक्षित';input.type='number';input.min=slot.booked;input.max=10000;input.required=true;input.value=slot.capacity;label.append(input);button.className='btn';button.textContent='सेभ गर्नुहोस्';form.append(label,button);host.append(form);
 form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await api('slot-save',{date,slot:slot.id,capacity:Number(input.value),revision:slot.revision});await loadAdminSlots();await loadDeliverySlots();document.getElementById('adminSlotMessage').textContent='क्षमता सेभ भयो।';}catch(e){document.getElementById('adminSlotMessage').textContent=e.message;}finally{button.disabled=false;}};}
 }catch(e){document.getElementById('adminSlotMessage').textContent=e.message;}}
document.getElementById('loadAdminSlots').onclick=loadAdminSlots;
