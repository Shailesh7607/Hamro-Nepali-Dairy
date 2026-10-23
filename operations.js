// In-site updates only. Email/SMS transport is not configured.
const op=document.getElementById('operationsPanel');
let operationsState=null,ticketRows=[];
function opMessage(text){document.getElementById('operationsMessage').textContent=text;}
async function loadOperations(){
 opMessage('लोड हुँदैछ…');
 try{
  const [notices,tickets]=await Promise.all([api('notifications'),api('tickets')]);ticketRows=tickets.tickets;
  document.getElementById('notificationsList').innerHTML=notices.notifications.map(n=>`<li><a href="#orders">${escapeHTML(n.order_id)}</a><br>${escapeHTML(n.action==='Order received'?'अर्डर प्राप्त भयो':statusNames[n.action.replace('Status: ','')]||n.action)} · ${escapeHTML(new Date(n.created).toLocaleString('ne-NP',{timeZone:'Asia/Kathmandu'}))}</li>`).join('')||'<li>अहिलेसम्म सूचना छैन।</li>';
  document.getElementById('ticketList').innerHTML=ticketRows.map(t=>`<article class="saved-order"><h3>${escapeHTML(t.id)}</h3><p>${escapeHTML(t.order_id)} · ${escapeHTML(t.kind)} · ${escapeHTML(t.status)}</p><p>${escapeHTML(t.message)}</p><p><strong>जवाफ:</strong> ${escapeHTML(t.response||'कर्मचारीको समीक्षा बाँकी')}</p>${settings.admin?`<form data-ticket-update="${escapeHTML(t.id)}"><label>स्थिति<select name="status">${['open','reviewing','resolved'].map(v=>`<option ${v===t.status?'selected':''}>${v}</option>`).join('')}</select></label><label>ग्राहकलाई जवाफ<textarea name="response" required minlength="3" maxlength="2000">${escapeHTML(t.response)}</textarea></label><button class="btn">जवाफ सेभ गर्नुहोस्</button></form>`:''}</article>`).join('')||'<p>सहायता अनुरोध छैन।</p>';
  document.getElementById('adminOperations').hidden=!settings.admin;
  if(settings.admin){const admin=document.getElementById('adminOperations');op.prepend(admin);const stock=document.getElementById('simpleStock');admin.insertBefore(stock,admin.querySelector('details'));operationsState=await api('operations');await renderOperations();}
  if(typeof loadPlans==='function')await loadPlans();
  opMessage('');
 }catch(e){document.getElementById('notificationsList').replaceChildren();document.getElementById('ticketList').replaceChildren();document.getElementById('adminOperations').hidden=true;opMessage(e.message);}
}
async function renderOperations(){
 const data=operationsState;
 if(typeof loadStockScope==='function')await loadStockScope();
 const form=document.getElementById('scheduleForm');form.elements.cutoff.value=data.schedule.cutoff;form.elements.lead_days.value=data.schedule.lead_days;
 document.getElementById('errorsList').innerHTML=data.errors.map(e=>`<li>${escapeHTML(e.action)} · ${escapeHTML(new Date(e.created).toISOString())}<br>सन्दर्भ: ${escapeHTML(e.id)}</li>`).join('')||'<li>रेकर्ड भएका सर्भर त्रुटि छैनन्।</li>';
}
async function opSubmit(form,action,payload){
 const button=form.querySelector('button');button.disabled=true;opMessage('सेभ हुँदैछ…');
 try{await api(action,payload);await getSettings();await loadOperations();opMessage('सेभ भयो।');return true;}catch(e){opMessage(e.message);return false;}finally{button.disabled=false;}
}
op.addEventListener('submit',async e=>{
 const form=e.target;e.preventDefault();if(!form.reportValidity())return;const f=new FormData(form);
 if(form.dataset.stock){const old=operationsState.inventory.find(p=>p.product_id===form.dataset.stock);await opSubmit(form,'stock',{product_id:old.product_id,available:Number(f.get('available')),enabled:f.get('enabled')==='on',revision:old.revision});}
 if(form.id==='scheduleForm')await opSubmit(form,'schedule',{cutoff:f.get('cutoff'),lead_days:Number(f.get('lead_days')),revision:operationsState.schedule.revision});
 if(form.id==='supportForm'){
  const payload={order_id:f.get('order_id').trim(),kind:f.get('kind'),message:f.get('message')};
  const signature=JSON.stringify(payload);if(form.dataset.signature!==signature){form.dataset.signature=signature;form.dataset.request=crypto.randomUUID();}
  if(await opSubmit(form,'ticket',{...payload,requestId:form.dataset.request})){form.reset();delete form.dataset.signature;delete form.dataset.request;}
 }
 if(form.dataset.ticketUpdate){const old=ticketRows.find(t=>t.id===form.dataset.ticketUpdate);await opSubmit(form,'ticket-update',{id:old.id,revision:old.revision,status:f.get('status'),response:f.get('response')});}
});
document.getElementById('refreshOperations').onclick=loadOperations;
document.getElementById('downloadBackup').onclick=async e=>{
 const button=e.currentTarget;button.disabled=true;opMessage('ब्याकअप तयार हुँदैछ…');
 try{const data=await api('backup');const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.href=url;link.download='hamro-nepali-dairy-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);opMessage('ब्याकअप डाउनलोड सुरु भयो। फाइलमा ग्राहक विवरण हुन्छ; सुरक्षित स्थानमा राख्नुहोस्।');}catch(error){opMessage(error.message);}finally{button.disabled=false;}
};
document.getElementById('ordersList').addEventListener('click',e=>{const button=e.target.closest('[data-support]');if(!button)return;document.getElementById('supportForm').elements.order_id.value=button.dataset.support;document.getElementById('supportForm').closest('details').open=true;location.hash='account';setTimeout(()=>document.getElementById('supportForm').scrollIntoView({behavior:'smooth'}),100);});
setInterval(()=>{if(!document.hidden&&location.hash==='#account'&&!op.contains(document.activeElement))loadOperations();},45000);
if(location.hash==='#account')getSettings().then(ok=>{if(ok)loadOperations();});
