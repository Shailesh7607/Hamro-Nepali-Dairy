import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {ShopError} from './commerce.mjs';
export function authContext(request,config,transport=fetch){
 const responseHeaders=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Expires':'0'});
 const secure=new URL(config.APP_ORIGIN).protocol==='https:';
 const cookies=new Map(parseCookieHeader(request.headers.get('cookie')||'').map(c=>[c.name,c.value]));
 const client=createServerClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{
  cookieOptions:{name:'dahi-auth',path:'/',sameSite:'lax',httpOnly:true,secure},
  global:{fetch:(url,options)=>transport(url,{...options,signal:AbortSignal.timeout(15000)})},
  cookies:{getAll:()=>Array.from(cookies,([name,value])=>({name,value})),setAll(changes,cacheHeaders){
   for(const {name,value,options} of changes){cookies.set(name,value);responseHeaders.append('Set-Cookie',serializeCookieHeader(name,value,{...options,httpOnly:true,secure,sameSite:'lax',path:'/'}));}
   for(const [key,value]of Object.entries(cacheHeaders||{}))responseHeaders.set(key,value);
  }}
 });
 return {client,responseHeaders};
}
export async function verifiedAccount(client){
 const {data,error}=await client.auth.getUser();
 if(error||!data?.user){
  if(error?.status>=500||error?.name==='AuthRetryableFetchError')throw new ShopError('लगइन सेवा उपलब्ध भएन। फेरि प्रयास गर्नुहोस्।',503);
  throw new ShopError('कृपया लगइन गर्नुहोस्।',401);
 }
 const u=data.user;
 if(u.is_anonymous||!u.email_confirmed_at)throw new ShopError('पहिले आफ्नो इमेल पुष्टि गर्नुहोस्।',403);
 const {data:role,error:roleError}=await client.rpc('current_account_role');
 if(roleError||!['customer','admin'].includes(role))throw new ShopError('खाताको अनुमति जाँच्न सकिएन। फेरि प्रयास गर्नुहोस्।',503);
 return {id:'sb:'+u.id,email:u.email||'',admin:role==='admin'};
}
export function emailInput(value){if(typeof value!=='string'||value.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw new ShopError('सही इमेल ठेगाना लेख्नुहोस्।');return value.trim().toLowerCase();}
export function passwordInput(value,newPassword=false){if(typeof value!=='string'||value.length>128||value.length<(newPassword?12:1))throw new ShopError(newPassword?'पासवर्ड १२ देखि १२८ अक्षरको हुनुपर्छ।':'पासवर्ड लेख्नुहोस्।');return value;}
export async function handleAuth(path,input,context,config){
 const {client}=context;
 const callback=config.APP_ORIGIN+'/auth/callback';
 if(path==='login'){
  const {error}=await client.auth.signInWithPassword({email:emailInput(input.email),password:passwordInput(input.password)});
  if(error)throw new ShopError(error.status===429?'धेरै प्रयास भए। केही समयपछि प्रयास गर्नुहोस्।':'इमेल वा पासवर्ड मिलेन, वा इमेल पुष्टि हुन बाँकी छ।',error.status===429?429:401);
  const account=await verifiedAccount(client);return {account,redirect:'/shop.html#account'};
 }
 if(path==='signup'){
  const {error}=await client.auth.signUp({email:emailInput(input.email),password:passwordInput(input.password,true),options:{emailRedirectTo:callback}});
  if(error){if(error.status===429)throw new ShopError('धेरै प्रयास भए। केही समयपछि प्रयास गर्नुहोस्।',429);throw new ShopError('खाता बनाउन सकिएन। पासवर्ड र इमेल सेवा जाँचेर फेरि प्रयास गर्नुहोस्।',400);}
  return {message:'योग्य इमेलमा पुष्टि लिङ्क पठाइएको छ। यही ब्राउजरमा लिङ्क खोल्नुहोस्, त्यसपछि लगइन गर्नुहोस्।'};
 }
 if(path==='recover'){
  const {error}=await client.auth.resetPasswordForEmail(emailInput(input.email),{redirectTo:callback+'?next=reset'});
  if(error&&error.status>=500)throw new ShopError('इमेल सेवा उपलब्ध भएन। केही समयपछि प्रयास गर्नुहोस्।',503);
  if(error?.status===429)throw new ShopError('धेरै प्रयास भए। केही समयपछि प्रयास गर्नुहोस्।',429);
  return {message:'खाता उपलब्ध भए पासवर्ड बदल्ने लिङ्क पठाइएको छ। इमेलको लिङ्क यही ब्राउजरमा खोल्नुहोस्।'};
 }
 if(path==='password'){
  await verifiedAccount(client);
  const {error}=await client.auth.updateUser({password:passwordInput(input.password,true)});
  if(error)throw new ShopError('पासवर्ड बदल्न सकिएन। नयाँ recovery link मागेर फेरि प्रयास गर्नुहोस्।');
  await client.auth.signOut({scope:'local'});
  return {message:'पासवर्ड बदलियो। नयाँ पासवर्डबाट लगइन गर्नुहोस्।',redirect:'/auth.html?changed=1'};
 }
 if(path==='logout'){
  const {error}=await client.auth.signOut({scope:'local'});
  if(error)throw new ShopError('साइन आउट पूरा भएन। फेरि प्रयास गर्नुहोस्।',503);
  return {redirect:'/auth.html'};
 }
 throw new ShopError('अनुरोध भेटिएन।',404);
}
export async function handleCallback(url,context){
 const code=url.searchParams.get('code');if(!code||code.length>4096)return '/auth.html?error=link';
 const flowId=url.searchParams.get('sb_flow_id');
 const {error}=await context.client.auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);
 if(error)return '/auth.html?error=link';
 return url.searchParams.get('next')==='reset'?'/auth.html?mode=reset':'/shop.html#account';
}
