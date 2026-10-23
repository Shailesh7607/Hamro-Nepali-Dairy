import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {authContext,verifiedAccount,handleAuth,handleCallback} from './auth.mjs';
import {bindSession} from './session.mjs';
import {ShopError} from './commerce.mjs';
import {createShopHandler} from '../app/api/shop/route.js';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
export function validateConfig(config){
 const origin=new URL(config.APP_ORIGIN);if(origin.origin!==config.APP_ORIGIN)throw new Error('APP_ORIGIN must be an origin without a trailing slash or path.');
 if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('External hosting requires HTTPS APP_ORIGIN.');
 if(new URL(config.SUPABASE_URL).protocol!=='https:'||!config.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))throw new Error('Set the Supabase HTTPS URL and publishable key. Do not use a service-role key.');
}
export function createApp(config,db,{contextFactory=authContext}={}){
 validateConfig(config);const shop=createShopHandler({...config,DB:db});
 const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));const rates=new Map();
 function limit(key,max){const now=Date.now();for(const [k,v]of rates)if(v.until<=now)rates.delete(k);let v=rates.get(key);if(!v){if(rates.size>10000)throw new ShopError('सेवा व्यस्त छ।',429);v={n:0,until:now+15*60000};rates.set(key,v);}if(++v.n>max)throw new ShopError('धेरै प्रयास भए। केही समयपछि प्रयास गर्नुहोस्।',429);}
 return createServer(async(req,res)=>{
  let context;
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
  function send(response){
   for(const [k,v]of Object.entries(headers))res.setHeader(k,v);
   for(const [k,v]of response.headers)if(k!=='set-cookie')res.setHeader(k,v);
   if(context){for(const [k,v]of context.responseHeaders)if(k!=='set-cookie')res.setHeader(k,v);const cookies=context.responseHeaders.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);}
   res.statusCode=response.status;response.arrayBuffer().then(body=>res.end(Buffer.from(body))).catch(()=>res.end());
  }
  try{
   const url=new URL(req.url,config.APP_ORIGIN);if(url.origin!==config.APP_ORIGIN)throw new ShopError('अनुरोध मिलेन।',400);
   if(!['GET','HEAD','POST'].includes(req.method))throw new ShopError('यो अनुरोध विधि मिलेन।',405);
   const api=url.pathname.startsWith('/api/');let body;
   if(req.method==='POST'){
    if(req.headers.origin!==config.APP_ORIGIN)throw new ShopError('अनुरोध अनुमति छैन।',403);
    if(!req.headers['content-type']?.startsWith('application/json'))throw new ShopError('JSON आवश्यक छ।',415);
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>20000)throw new ShopError('अनुरोध धेरै ठूलो छ।',413);chunks.push(chunk);}body=Buffer.concat(chunks).toString('utf8');
   }
   if(['/auth.html','/shop.html','/'].includes(url.pathname))headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
   const request=new Request(url,{method:req.method,headers:req.headers,body});
   if(url.pathname==='/healthz'){await db.prepare('SELECT 1 AS healthy').bind().first();send(Response.json({ok:true,release:/^[a-f0-9]{40}$/.test(config.RELEASE_SHA||'')?config.RELEASE_SHA:'development'}));return;}
   if(url.pathname==='/auth/callback'){
    if(req.method!=='GET')throw new ShopError('अनुरोध विधि मिलेन।',405);
    context=contextFactory(request,config);const target=await handleCallback(url,context);send(new Response(null,{status:303,headers:{Location:target}}));return;
   }
   if(url.pathname.startsWith('/api/auth/')){
    const action=url.pathname.slice('/api/auth/'.length);
    limit('ip:'+req.socket.remoteAddress,100);
    context=contextFactory(request,config);
    if(action==='me'&&req.method==='GET'){send(Response.json({account:await verifiedAccount(context.client)}));return;}
    if(req.method!=='POST')throw new ShopError('POST आवश्यक छ।',405);
    let input;try{input=JSON.parse(body);}catch{throw new ShopError('अनुरोध विवरण मिलेन।');}
    if(!input||typeof input!=='object'||Array.isArray(input))throw new ShopError('अनुरोध विवरण मिलेन।');
    if(typeof input.email==='string')limit('email:'+createHash('sha256').update(input.email.trim().toLowerCase()).digest('hex'),20);
    send(Response.json(await handleAuth(action,input,context,config)));return;
   }
   if(url.pathname==='/api/shop'){
    if(!['GET','POST'].includes(req.method))throw new ShopError('अनुरोध विधि मिलेन।',405);
    context=contextFactory(request,config);const user=await verifiedAccount(context.client);bindSession(request,user);send(await shop(request));return;
   }
   if(api||req.method==='POST')throw new ShopError('पृष्ठ भेटिएन।',404);
   const relative=url.pathname==='/'?'shop.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');const file=resolve(root,relative);
   if(!file.startsWith(root+sep)&&file!==resolve(root,'shop.html'))throw new ShopError('पृष्ठ भेटिएन।',404);
   const type=mime[extname(file)];if(!type)throw new ShopError('पृष्ठ भेटिएन।',404);
   const data=await readFile(file);send(new Response(req.method==='HEAD'?null:data,{headers:{'Content-Type':type}}));
  }catch(e){const known=e instanceof ShopError;const status=known?e.status:e.code==='ENOENT'?404:500;if(status===500)console.error('Request failed',crypto.randomUUID());send(Response.json({error:known?e.message:status===404?'पृष्ठ भेटिएन।':'सेवा उपलब्ध भएन। पछि फेरि प्रयास गर्नुहोस्।'},{status}));}
 });
}
