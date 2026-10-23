import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../lib/http-app.mjs';
import {openDatabase} from '../lib/sqlite.mjs';
import {authContext,verifiedAccount,handleCallback} from '../lib/auth.mjs';
import {products} from '../lib/catalog.mjs';
import {today} from '../lib/commerce.mjs';
const users={alice:{id:'11111111-1111-4111-8111-111111111111',email:'alice@example.invalid',role:'customer'},bob:{id:'22222222-2222-4222-8222-222222222222',email:'bob@example.invalid',role:'customer'},admin:{id:'33333333-3333-4333-8333-333333333333',email:'admin@example.invalid',role:'admin'}};
function fixture(){
 const sessions=new Map(),calls=[],roles=new Map(Object.values(users).map(u=>[u.id,u.role]));
 const makeUser=u=>({...u,email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{role:'admin'},is_anonymous:false});
 const transport=async(raw,options={})=>{
  const url=new URL(raw);const headers=new Headers(options.headers);let body;try{body=JSON.parse(options.body||'{}')}catch{body={}};calls.push({path:url.pathname,query:url.search,body});
  const bearer=headers.get('authorization')?.replace(/^Bearer /,'');const existing=sessions.get(bearer);
  if(url.pathname.endsWith('/token')){
   const u=Object.values(users).find(u=>u.email===body.email);
   if(!u||body.password!=='test-password-only')return Response.json({msg:'Invalid login credentials',error_code:'invalid_credentials'},{status:400});
   const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:u.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';sessions.set(token,u);
   return Response.json({access_token:token,refresh_token:'refresh-'+u.id,token_type:'bearer',expires_in:3600,user:makeUser(u)});
  }
  if(url.pathname.endsWith('/user')){
   if(!existing)return Response.json({msg:'Invalid token',error_code:'bad_jwt'},{status:401});
   return Response.json(makeUser(existing));
  }
  if(url.pathname.endsWith('/current_account_role'))return existing?Response.json(roles.get(existing.id)):Response.json({message:'Denied'},{status:401});
  if(url.pathname.endsWith('/logout')){sessions.delete(bearer);return new Response(null,{status:204});}
  if(url.pathname.endsWith('/signup'))return Response.json({id:crypto.randomUUID(),email:body.email,identities:[]});
  if(url.pathname.endsWith('/recover'))return Response.json({});
  throw new Error('Unexpected fixture path '+url.pathname);
 };
 return {transport,calls,roles};
}
async function start(t){
 const db=openDatabase(':memory:');const f=fixture();const config={APP_ORIGIN:'http://127.0.0.1:3000',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
 const server=createApp(config,db,{contextFactory:(request,config)=>authContext(request,config,f.transport)});server.listen(0,'127.0.0.1');await once(server,'listening');config.APP_ORIGIN='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(()=>{db.close();resolve()})}));
 async function call(path,body,cookie='',extra={}){
  return fetch(config.APP_ORIGIN+path,{method:body===undefined?'GET':'POST',headers:{cookie,...(body===undefined?{}:{origin:config.APP_ORIGIN,'content-type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 }
 async function login(who){const r=await call('/api/auth/login',{email:users[who].email,password:'test-password-only'});assert.equal(r.status,200);const cookies=r.headers.getSetCookie();assert.ok(cookies.length);assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Lax')));const body=await r.json();assert.equal(body.account.admin,who==='admin');assert.equal(body.access_token,undefined);return cookies.map(c=>c.split(';')[0]).join('; ');}
 return {db,f,config,call,login};
}
test('independent server serves account screens and never serves private source',async t=>{
 const {call}=await start(t);for(const path of ['/','/auth.html','/auth.js','/auth.css','/shop-rules.js']){const r=await call(path);assert.equal(r.status,200,path);}
 assert.equal((await call('/.env')).status,404);assert.equal((await call('/lib/auth.mjs')).status,404);
 assert.equal((await call('/api/auth/me')).status,401);
 assert.equal((await call('/api/shop?action=config',undefined,'',{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'admin@example.invalid'})).status,401);
});
test('login sets HttpOnly cookies, verifies roles fresh, ignores user metadata and logs out',async t=>{
 const {call,login,f}=await start(t);const alice=await login('alice');
 let r=await call('/api/shop?action=config',undefined,alice,{'oai-authenticated-user-email':'admin@example.invalid'});assert.equal((await r.json()).admin,false);
 const admin=await login('admin');assert.equal((await call('/api/shop?action=overview',undefined,admin)).status,200);
 f.roles.set(users.admin.id,'customer');assert.equal((await call('/api/shop?action=overview',undefined,admin)).status,403);
 r=await call('/api/auth/logout',{},alice);assert.equal(r.status,200);assert.ok(r.headers.getSetCookie().some(c=>c.includes('Max-Age=0')));
 assert.equal((await call('/api/shop?action=config',undefined,alice)).status,401);
});
test('login rejects wrong passwords, bad JSON, cross-origin writes and missing origin',async t=>{
 const {call}=await start(t);
 assert.equal((await call('/api/auth/login',{email:users.alice.email,password:'wrong'})).status,401);
 assert.equal((await call('/api/auth/login',{email:users.alice.email,password:'test-password-only'},'',{origin:'https://evil.invalid'})).status,403);
 assert.equal((await call('/api/auth/login',{},'',{origin:''})).status,403);
 assert.equal((await call('/api/auth/login',[])).status,400);
});
test('signup and recovery use PKCE callbacks and never accept client admin roles',async t=>{
 const {call,f,config}=await start(t);
 let r=await call('/api/auth/signup',{email:'new@example.invalid',password:'long-test-password',role:'admin'});assert.equal(r.status,200);
 assert.ok(r.headers.getSetCookie().some(c=>c.includes('code-verifier')&&c.includes('HttpOnly')));
 const signup=f.calls.find(c=>c.path.endsWith('/signup'));assert.equal(signup.body.role,undefined);assert.notEqual(signup.body.code_challenge,undefined);
 assert.equal((await call('/api/auth/signup',{email:'new@example.invalid',password:'short'})).status,400);
 r=await call('/api/auth/recover',{email:'unknown@example.invalid'});assert.equal(r.status,200);assert.ok((await r.json()).message);
 const recover=f.calls.find(c=>c.path.endsWith('/recover'));assert.equal(new URLSearchParams(recover.query).get('redirect_to'),config.APP_ORIGIN+'/auth/callback?next=reset');
 assert.equal((await call('/api/auth/password',{password:'long-test-password'})).status,401);
});
test('callback redirects are fixed and invalid codes do not establish a session',async()=>{
 const context={client:{auth:{exchangeCodeForSession:async code=>({error:code==='bad'?new Error():null})}}};
 assert.equal(await handleCallback(new URL('https://shop.test/auth/callback?code=good&next=https://evil.test'),context),'/shop.html#account');
 assert.equal(await handleCallback(new URL('https://shop.test/auth/callback?code=good&next=reset'),context),'/auth.html?mode=reset');
 assert.equal(await handleCallback(new URL('https://shop.test/auth/callback?code=bad'),context),'/auth.html?error=link');
});
test('unconfirmed accounts and failed role checks cannot access customer/admin functions',async()=>{
 await assert.rejects(verifiedAccount({auth:{getUser:async()=>({data:{user:{id:'x',email_confirmed_at:null}}})}}),e=>e.status===403);
 await assert.rejects(verifiedAccount({auth:{getUser:async()=>({data:{user:{id:'x',email_confirmed_at:'confirmed'}}})},rpc:async()=>({error:new Error()})}),e=>e.status===503);
});
test('real HTTP checkout isolates two logged-in customers and completes admin delivery',async t=>{
 const {call,login,db}=await start(t);const alice=await login('alice'),bob=await login('bob'),admin=await login('admin');
 for(const p of products)db.sqlite.prepare('INSERT INTO inventory(product_id,available,enabled,revision,updated) VALUES(?,10000,1,0,0)').run(p.id);
 const payload={requestId:crypto.randomUUID(),business:'HTTP cafe',contact:'Buyer',phone:'9841234567',address:'Lalitpur test',deliveryDate:today(Date.now()+3*86400000),deliverySlot:'morning',notes:'',method:'cod',deliveryArea:'sanepa',cart:{milk:20},role:'admin',total:1};
 const r=await call('/api/shop?action=create',payload,alice);assert.equal(r.status,201);const order=(await r.json()).order;assert.equal(order.total,1800);
 assert.equal((await call('/api/shop?action=create',payload,alice)).status,200);
 const own=await(await call('/api/shop?action=list',undefined,alice)).json();assert.equal(own.orders.length,1);
 const other=await(await call('/api/shop?action=list',undefined,bob)).json();assert.equal(other.orders.length,0);
 assert.equal((await call('/api/shop?action=list&admin=1',undefined,bob)).status,403);
 assert.equal((await call('/api/shop?action=update',{id:order.id,status:'delivered',revision:0},alice)).status,403);
 const done=await call('/api/shop?action=update',{id:order.id,status:'delivered',revision:0,markPaid:true,reference:'CASH-HTTP-001'},admin);assert.equal(done.status,200);assert.equal((await done.json()).order.payment,'paid');
 assert.equal(db.sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,9980);
});
test('SQLite adapter rolls back the complete batch on a later failure',async()=>{
 const db=openDatabase(':memory:');try{
 await assert.rejects(db.batch([db.prepare('INSERT INTO operation_errors(id,action,created) VALUES(?,?,?)').bind('same','test',0),db.prepare('INSERT INTO operation_errors(id,action,created) VALUES(?,?,?)').bind('same','test',0)]));
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM operation_errors').get().n,0);
 }finally{db.close();}
});
test('saved addresses isolate customers, reject stale changes and snapshot into orders',async t=>{
 const {call,login,db}=await start(t),alice=await login('alice'),bob=await login('bob');
 const details={label:'Home',business:'Cafe',contact:'Buyer',phone:'9841234567',address:'Sanepa original address',deliveryArea:'sanepa',notes:'Ring the bell'};
 let r=await call('/api/shop?action=address-save',details,alice);assert.equal(r.status,200);const {id}=await r.json();
 assert.equal((await(await call('/api/shop?action=addresses',undefined,bob)).json()).addresses.length,0);
 assert.equal((await call('/api/shop?action=address-save',{...details,id,revision:0,address:'Hacked address'},bob)).status,409);
 assert.equal((await call('/api/shop?action=address-delete',{id,revision:0},bob)).status,409);
 db.sqlite.prepare('INSERT INTO inventory(product_id,available,enabled,revision,updated) VALUES(?,1000,1,0,0)').run('milk');
 const payload={...details,deliveryDate:today(Date.now()+3*86400000),deliverySlot:'afternoon',method:'cod',cart:{milk:20},requestId:crypto.randomUUID()};
 r=await call('/api/shop?action=create',payload,alice);assert.equal(r.status,201);const order=(await r.json()).order;
 assert.equal((await call('/api/shop?action=address-save',{...details,id,revision:0,address:'New home'},alice)).status,200);
 assert.equal((await call('/api/shop?action=address-save',{...details,id,revision:0},alice)).status,409);
 assert.equal((await call('/api/shop?action=address-delete',{id,revision:1},alice)).status,200);
 const saved=JSON.parse(db.sqlite.prepare('SELECT payload FROM orders WHERE id=?').get(order.id).payload);assert.equal(saved.address,details.address);assert.equal(saved.deliverySlot,'afternoon');
});
test('last slot is atomic, retries are idempotent and cancellation releases capacity',async t=>{
 const {call,login,db}=await start(t),alice=await login('alice'),bob=await login('bob'),admin=await login('admin');
 const date=today(Date.now()+3*86400000),plan={date,slot:'morning',capacity:1,revision:-1};
 assert.equal((await call('/api/shop?action=slot-save',plan,alice)).status,403);
 assert.equal((await call('/api/shop?action=slot-save',plan,admin)).status,200);
 db.sqlite.prepare('INSERT INTO inventory(product_id,available,enabled,revision,updated) VALUES(?,1000,1,0,0)').run('milk');
 const input=()=>({business:'Slot test',contact:'Buyer',phone:'9841234567',address:'Sanepa',deliveryArea:'sanepa',notes:'',deliveryDate:date,deliverySlot:'morning',method:'cod',cart:{milk:20},requestId:crypto.randomUUID()});
 const payloads=[input(),input()],cookies=[alice,bob],results=await Promise.all(payloads.map((p,i)=>call('/api/shop?action=create',p,cookies[i])));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);const winner=results.findIndex(r=>r.status===201),order=(await results[winner].json()).order;
 assert.equal((await call('/api/shop?action=create',payloads[winner],cookies[winner])).status,200);
 assert.equal(db.sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,980);
 assert.equal((await call('/api/shop?action=slot-save',{...plan,capacity:0,revision:0},admin)).status,409);
 assert.equal((await call('/api/shop?action=update',{id:order.id,revision:0,status:'cancelled'},admin)).status,200);
 assert.equal((await call('/api/shop?action=create',payloads[1-winner],cookies[1-winner])).status,201);
 const slots=(await(await call('/api/shop?action=slots&date='+date,undefined,alice)).json()).slots;assert.equal(slots[0].remaining,0);assert.equal(slots[1].remaining,20);
});
test('new orders reject missing/invalid slots and closed slots without reducing stock',async t=>{
 const {call,login,db}=await start(t),alice=await login('alice'),admin=await login('admin'),date=today(Date.now()+3*86400000);
 db.sqlite.prepare('INSERT INTO inventory(product_id,available,enabled,revision,updated) VALUES(?,1000,1,0,0)').run('milk');
 const payload={business:'Slot test',contact:'Buyer',phone:'9841234567',address:'Sanepa',deliveryArea:'sanepa',notes:'',deliveryDate:date,method:'cod',cart:{milk:20},requestId:crypto.randomUUID()};
 assert.equal((await call('/api/shop?action=create',payload,alice)).status,400);
 assert.equal((await call('/api/shop?action=create',{...payload,deliverySlot:'midnight'},alice)).status,400);
 assert.equal((await call('/api/shop?action=slot-save',{date,slot:'afternoon',capacity:0,revision:-1},admin)).status,200);
 assert.equal((await call('/api/shop?action=create',{...payload,deliverySlot:'afternoon'},alice)).status,409);
 assert.equal(db.sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,1000);
 assert.equal((await call('/api/shop?action=slots&date=2026-02-30',undefined,alice)).status,400);
 const backup=await(await call('/api/shop?action=backup',undefined,admin)).json();assert.equal(backup.format,'dudhghar-backup-v3');assert.equal(backup.tables.delivery_slots.length,1);
});
test('auth page restricts scripts; private files and passwords are not returned',async t=>{
 const {call}=await start(t);
 const page=await call('/auth.html');assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.match(page.headers.get('cache-control'),/no-store/);
 for(const path of ['/.env','/.env.example','/tests/auth.test.mjs','/data/shop.sqlite','/README.md'])assert.equal((await call(path)).status,404,path);
 for(const password of ['wrong-password-only','test-password-only']){
  const response=await call('/api/auth/login',{email:users.alice.email,password});const body=await response.text();assert.ok(!body.includes(password));assert.ok(!body.includes('access_token'));assert.match(response.headers.get('cache-control'),/no-store/);
 }
});
