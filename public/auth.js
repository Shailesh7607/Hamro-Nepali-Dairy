const params=new URLSearchParams(location.search);
const mode=['signup','recover','reset'].includes(params.get('mode'))?params.get('mode'):'login';
const form=document.getElementById('authForm'),message=document.getElementById('message'),button=document.getElementById('submit');
const copy={login:['फेरि स्वागत छ','आफ्नो इमेल र पासवर्ड प्रयोग गर्नुहोस्।','लगइन गर्नुहोस् →'],signup:['आफ्नो खाता बनाउनुहोस्','नयाँ खाता ग्राहकका रूपमा खुल्छ। इमेल पुष्टि गर्नुपर्नेछ।','खाता बनाउनुहोस् →'],recover:['पासवर्ड बिर्सनुभयो?','खाताको इमेलमा recovery link पठाउँछौँ। यही ब्राउजरमा खोल्नुहोस्।','लिङ्क पठाउनुहोस् →'],reset:['नयाँ पासवर्ड राख्नुहोस्','कम्तीमा १२ अक्षरको नयाँ पासवर्ड छान्नुहोस्।','पासवर्ड बदल्नुहोस् →']}[mode];
document.getElementById('title').textContent=copy[0];document.getElementById('description').textContent=copy[1];button.textContent=copy[2];
document.querySelector(`[data-mode="${mode}"]`)?.setAttribute('aria-current','page');
document.getElementById('emailField').hidden=mode==='reset';form.elements.email.required=mode!=='reset';
document.getElementById('passwordField').hidden=mode==='recover';form.elements.password.required=mode!=='recover';form.elements.password.minLength=['signup','reset'].includes(mode)?12:1;form.elements.password.autocomplete=mode==='login'?'current-password':'new-password';
document.getElementById('confirmField').hidden=!['signup','reset'].includes(mode);form.elements.confirm.required=['signup','reset'].includes(mode);document.getElementById('recoveryLink').hidden=mode!=='login';
function clearPasswords(){
 form.elements.password.value='';form.elements.confirm.value='';form.elements.password.type='password';
 const toggle=document.getElementById('showPassword');toggle.textContent='देखाउनुहोस्';toggle.setAttribute('aria-pressed','false');
}
window.addEventListener('pagehide',clearPasswords);
function show(text,error=false){message.textContent=text;message.classList.toggle('error',error)}
if(params.has('error'))show('लिङ्क समाप्त वा अमान्य छ। लिङ्क मागेको ब्राउजरमा खोल्नुहोस् वा नयाँ लिङ्क माग्नुहोस्।',true);
if(params.has('changed'))show('पासवर्ड बदलियो। नयाँ पासवर्डबाट लगइन गर्नुहोस्।');
document.getElementById('showPassword').onclick=e=>{const visible=form.elements.password.type==='password';form.elements.password.type=visible?'text':'password';e.currentTarget.textContent=visible?'लुकाउनुहोस्':'देखाउनुहोस्';e.currentTarget.setAttribute('aria-pressed',String(visible));};
form.onsubmit=async e=>{
 e.preventDefault();if(button.disabled||!form.reportValidity())return;
 if(['signup','reset'].includes(mode)&&form.elements.password.value!==form.elements.confirm.value){show('दुवै पासवर्ड एउटै हुनुपर्छ।',true);return;}
 button.disabled=true;button.textContent='पर्खनुहोस्…';show('');
 const payload=mode==='recover'?{email:form.elements.email.value}:mode==='reset'?{password:form.elements.password.value}:{email:form.elements.email.value,password:form.elements.password.value};
 const body=JSON.stringify(payload);delete payload.password;clearPasswords();
 try{
  const response=await fetch('/api/auth/'+(mode==='reset'?'password':mode),{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(25000)});
  const invalidResponse=()=>new Error('सर्भरबाट पूरा जवाफ आएन (HTTP '+(response.status||'unknown')+')। npm start चलिरहेको छ र पृष्ठ सही ठेगानामा खुलेको छ जाँच्नुहोस्। त्यसपछि फेरि प्रयास गर्नुहोस्।');
  let result;try{result=await response.json();}catch{throw invalidResponse();}
  if(!result||typeof result!=='object'||Array.isArray(result))throw invalidResponse();
  if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'अनुरोध पूरा भएन।');
  if(mode==='login'||mode==='reset'){
   const expected=mode==='login'?'/shop.html#account':'/auth.html?changed=1';
   if(result.redirect!==expected)throw invalidResponse();
  }else if(typeof result.message!=='string'||!result.message.trim())throw invalidResponse();
  if(result.redirect){const target=mode==='login'&&params.get('next')==='checkout'?'/shop.html#checkout':result.redirect;location.assign(target);return;}
  show(result.message);
 }catch(e){show(e.name==='TimeoutError'?'जवाफ आएन। केही समयपछि फेरि प्रयास गर्नुहोस्।':e.message||'जडान जाँच्नुहोस्।',true);}finally{clearPasswords();button.disabled=false;button.textContent=copy[2];}
};
if(mode==='reset'){
 button.disabled=true;
 fetch('/api/auth/me').then(async r=>{if(!r.ok)throw new Error();button.disabled=false;}).catch(()=>{form.hidden=true;show('पहिले इमेलको recovery link खोल्नुहोस्।',true);const a=document.createElement('a');a.href='/auth.html?mode=recover';a.textContent='नयाँ recovery link माग्नुहोस्';message.after(a);});
}
