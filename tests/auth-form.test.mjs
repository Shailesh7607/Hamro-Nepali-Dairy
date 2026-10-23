import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/auth.js',import.meta.url),'utf8');
function screen(mode,fetch){
 const node=()=>({value:'',type:'password',hidden:false,disabled:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},classList:{toggle(){}},after(){}});
 const ids=Object.fromEntries(['authForm','message','submit','title','description','emailField','passwordField','confirmField','recoveryLink','showPassword'].map(k=>[k,node()]));
 ids.authForm.elements={email:node(),password:node(),confirm:node()};ids.authForm.reportValidity=()=>true;
 const events={};vm.runInNewContext(source,{URLSearchParams,AbortSignal,location:{search:'?mode='+mode,assign(){}},document:{getElementById:id=>ids[id],querySelector:()=>node()},window:{addEventListener:(name,fn)=>events[name]=fn},fetch});
 ids.authForm.elements.email.value='fixture@example.invalid';ids.authForm.elements.password.value='fixture-password-only';ids.authForm.elements.confirm.value='fixture-password-only';
 return {ids,events,submit:()=>ids.authForm.onsubmit({preventDefault(){}})};
}
test('login clears and masks password fields before a request, including failures',async()=>{
 let view;view=screen('login',async(url,options)=>{
  assert.equal(view.ids.authForm.elements.password.value,'');assert.equal(view.ids.authForm.elements.confirm.value,'');assert.equal(view.ids.authForm.elements.password.type,'password');
  assert.equal(JSON.parse(options.body).password,'fixture-password-only');return {ok:false,json:async()=>({error:'Login failed'})};
 });view.ids.showPassword.onclick({currentTarget:view.ids.showPassword});await view.submit();assert.equal(view.ids.message.textContent,'Login failed');assert.equal(view.ids.authForm.elements.password.value,'');assert.equal(view.ids.submit.disabled,false);
});
test('recovery does not send an autofilled password; navigation clears fields',async()=>{
 let payload;const view=screen('recover',async(_,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({message:'Check email'})};});await view.submit();assert.deepEqual(payload,{email:'fixture@example.invalid'});
 view.ids.authForm.elements.password.value='autofill';view.events.pagehide();assert.equal(view.ids.authForm.elements.password.value,'');
});
test('network failure clears passwords and auth form never falls back to a GET submission',async()=>{
 const view=screen('login',async()=>{throw new Error('Connection failed')});await view.submit();assert.equal(view.ids.authForm.elements.password.value,'');assert.equal(view.ids.submit.disabled,false);
 const html=readFileSync(new URL('../public/auth.html',import.meta.url),'utf8');assert.match(html,/<form[^>]*method="post"[^>]*action="\/api\/auth\/login"/);
});

test('empty, HTML, truncated and invalid auth responses show a useful error without automatic retries',async()=>{
 const responses=[{ok:true,status:200,json:async()=>{throw new SyntaxError('Unexpected end of JSON input')}},{ok:false,status:502,json:async()=>{throw new SyntaxError('Unexpected token <')}},{ok:true,status:200,json:async()=>null},{ok:true,status:200,json:async()=>({})},{ok:true,status:200,json:async()=>({redirect:'https://other.invalid'})}];
 for(const response of responses){let count=0;const view=screen('login',async()=>{count++;return response});await view.submit();assert.match(view.ids.message.textContent,/HTTP/);assert.ok(!view.ids.message.textContent.includes('Unexpected'));assert.equal(view.ids.authForm.elements.password.value,'');assert.equal(view.ids.submit.disabled,false);assert.equal(count,1);}
});
