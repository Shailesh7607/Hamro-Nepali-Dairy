import {test} from 'node:test';
import {bindSession} from '../lib/session.mjs';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import * as deliveryOptions from '../lib/delivery-options.mjs';
import * as commerce from '../lib/commerce.mjs';
import * as operations from '../lib/operations.mjs';
import * as improvements from '../lib/improvements.mjs';
import {products} from '../lib/catalog.mjs';
const env={ADMIN_EMAILS:'owner@example.invalid',PAYMENT_MODE:'sandbox'};
const sqlite=new DatabaseSync(':memory:');
for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
const prepare = sql => ({
 bind(...values) {
  const stmt=sqlite.prepare(sql);
  return {sql,
   async first(){ return stmt.get(...values)||null; },
   async all(){ return {results:stmt.all(...values)}; },
   async run(){ const r=stmt.run(...values); return {meta:{changes:r.changes}}; }
  };
 }
});
let batchTail=Promise.resolve();
env.DB={prepare,batch(statements){const result=batchTail.then(async()=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements){if(statement.sql?.startsWith('SELECT'))results.push(await statement.all());else results.push(await statement.run());}sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}});batchTail=result.catch(()=>{});return result;}};
for(const p of products)sqlite.prepare('INSERT INTO inventory(product_id,available,enabled,revision,updated) VALUES(?,10000,1,0,0)').run(p.id);
let paymentResponse={};
const context=vm.createContext({Response,Request,URL,URLSearchParams,AbortSignal,TextEncoder,crypto,btoa,console,fetch:async()=>Response.json(paymentResponse)});
const route=new vm.SourceTextModule(readFileSync(new URL('../app/api/shop/route.js',import.meta.url),'utf8'),{context});
await route.link(async name=>{
 const values=name.endsWith('delivery-options.mjs')?deliveryOptions:name==='cloudflare:workers'?{env}:name.endsWith('improvements.mjs')?improvements:name.endsWith('operations.mjs')?operations:name.endsWith('catalog.mjs')?{products}:commerce;
 return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context});
});await route.evaluate();const handler=route.namespace.createShopHandler(env);
const buyer={id:'buyer',email:'buyer@example.invalid'},admin={id:'owner',email:'owner@example.invalid'};
const input=()=>({requestId:crypto.randomUUID(),business:'Test cafe',contact:'Test',phone:'९८४१२३४५६७',address:'Kathmandu test',deliveryDate:commerce.today(Date.now()+2*86400000),deliverySlot:'morning',notes:'',method:'bank',deliveryArea:'other',cart:{milk:21}});
async function call(action,body,user=buyer,origin='https://shop.test'){
 const headers={'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email};if(body){headers.origin=origin;headers['content-type']='application/json';}
 const request=new Request('https://shop.test/api/shop?action='+action,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});if(user.id)bindSession(request,{...user,admin:user.id===admin.id});const r=await handler(request);return {status:r.status,data:await r.json()};
}
test('21 litres saves trusted total, units and exactly one order after retry',async()=>{
 const data=input();data.total=1;let r=await call('create',data);assert.equal(r.status,201);assert.equal(r.data.order.total,1785);assert.equal(r.data.order.payload.items[0].qty,21);assert.equal(r.data.order.payload.items[0].unit,'लिटर');assert.equal(r.data.order.delivery,null);
 const again=await call('create',data);assert.equal(again.data.order.id,r.data.order.id);assert.equal(sqlite.prepare('SELECT count(*) n FROM orders WHERE id=?').get(r.data.order.id).n,1);
 const mismatch=await call('create',{...data,cart:{milk:22}});assert.equal(mismatch.status,409);
});
test('empty, below-minimum, fractional, corrupt and unknown carts are rejected',async()=>{
 for(const cart of [{},{milk:19},{milk:21.5},{milk:'21'},{bad:20},[],null])assert.equal((await call('create',{...input(),cart})).status,400);
 assert.deepEqual(commerce.normalizeCart({milk:-1,ghee:5,x:'<script>'}),{ghee:5});
});
test('past dates and malformed calendar dates are rejected',()=>{
 for(const deliveryDate of ['2020-01-01','2028-02-30'])assert.throws(()=>commerce.validate({...input(),deliveryDate}));
});
test('anonymous and cross-origin writes are rejected',async()=>{
 assert.equal((await call('create',input(),{id:'',email:''})).status,401);
 assert.equal((await call('create',input(),buyer,'https://evil.test')).status,403);
});
test('owner isolation and staff-only reads/updates',async()=>{
 const {data}=await call('create',input());const id=data.order.id;
 assert.equal((await call('update',{id,revision:0,status:'confirmed',delivery:0})).status,403);
 assert.equal((await call('pay',{id},{id:'other',email:'other@example.invalid'})).status,404);
 assert.equal((await call('list&admin=1')).status,403);
 assert.equal((await call('list&admin=1',null,admin)).status,200);
});
test('bank order progresses from quote to manual payment to delivery with audit trail',async()=>{
 const {data}=await call('create',input());const id=data.order.id;
 assert.equal((await call('pay',{id})).status,409);
 let r=await call('update',{id,revision:0,status:'confirmed',delivery:100},admin);assert.equal(r.data.order.total,1885);
 assert.equal((await call('update',{id,revision:0,status:'delivered'},admin)).status,409);
 assert.equal((await call('pay',{id})).status,409); // no bank details configured
 Object.assign(env,{BANK_NAME:'Test bank',BANK_ACCOUNT_NAME:'Test merchant',BANK_ACCOUNT_NUMBER:'TEST-ONLY'});
 assert.equal((await call('pay',{id})).data.bank.name,'Test bank');
 r=await call('update',{id,revision:1,status:'confirmed',markPaid:true,reference:'TEST-TRANSFER'},admin);assert.equal(r.data.order.payment,'paid');
 r=await call('update',{id,revision:2,status:'delivered'},admin);assert.equal(r.data.order.status,'delivered');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM order_events WHERE order_id=?').get(id).n,6);
 assert.equal((await call('update',{id,revision:3,status:'delivered',delivery:5},admin)).status,409);
});
test('wallets cannot claim payment until provider verifies matching amount and transaction',async()=>{
 const {data}=await call('create',{...input(),method:'khalti'});const id=data.order.id;
 await call('update',{id,revision:0,status:'confirmed',delivery:0},admin);
 assert.equal((await call('pay',{id})).status,409);env.KHALTI_SECRET_KEY='fixture-only';
 paymentResponse={pidx:'test-pidx',payment_url:'https://test-pay.khalti.com/?test=1'};
 assert.equal((await call('pay',{id})).status,200);
 paymentResponse={pidx:'test-pidx',status:'Completed',total_amount:1,transaction_id:'txn'};
 assert.equal((await call('verify',{id})).data.order.payment,'pending');
 paymentResponse={pidx:'test-pidx',status:'Completed',total_amount:178500,transaction_id:'txn',refunded:false};
 assert.equal((await call('verify',{id})).data.order.payment,'test_paid');
 assert.equal((await call('pay',{id})).status,409);
});
test('eSewa form signed server-side and verified using expected order and amount',async()=>{
 env.ESEWA_SECRET_KEY='fixture-secret';env.ESEWA_PRODUCT_CODE='fixture-product';
 const {data}=await call('create',{...input(),method:'esewa'});const id=data.order.id;
 await call('update',{id,revision:0,status:'confirmed',delivery:0},admin);
 const r=await call('pay',{id});assert.equal(r.status,200);assert.equal(r.data.form.fields.total_amount,'1785');assert.equal(r.data.form.fields.signature,createHmac('sha256','fixture-secret').update(`total_amount=1785,transaction_uuid=${id},product_code=fixture-product`).digest('base64'));assert.equal(r.data.form.fields.transaction_uuid,id);
 paymentResponse={status:'COMPLETE',transaction_uuid:'wrong',product_code:'fixture-product',total_amount:1785,ref_id:'ref'};
 assert.equal((await call('verify',{id})).data.order.payment,'pending');
 paymentResponse.transaction_uuid=id;assert.equal((await call('verify',{id})).data.order.payment,'test_paid');
});

test('each delivery zone saves trusted fee and total; client fee cannot override it',async()=>{
 for(const [deliveryArea,fee] of [['sanepa',100],['lalitpur_ring',150],['kathmandu_ring',200],['bhaktapur_city',300],['other',null]]){
  const data={...input(),deliveryArea,delivery:0,total:1};
  const user={id:'area-'+deliveryArea,email:'test@example.invalid'};
  const r=await call('create',data,user);assert.equal(r.status,201);assert.equal(r.data.order.delivery,fee);assert.equal(r.data.order.total,1785+(fee??0));assert.equal(r.data.order.payload.deliveryArea,deliveryArea);
  assert.equal((await call('create',data,user)).data.order.id,r.data.order.id);
  assert.equal((await call('create',{...data,deliveryArea:deliveryArea==='sanepa'?'other':'sanepa'},user)).status,409);
 }
});
test('unknown and missing areas are rejected; manual quote stays payment-blocked',async()=>{
 for(const deliveryArea of [undefined,'unknown','__proto__'])assert.equal((await call('create',{...input(),deliveryArea})).status,400);
 const o=commerce.validate(input());assert.equal(o.delivery,null);assert.throws(()=>commerce.paymentReady({...o,status:'new',payment:'pending'}));
});

test('account identity and admin role come only from the trusted session',async()=>{
 const customer=await call('config&admin=1');assert.equal(customer.data.account.role,'customer');assert.equal(customer.data.admin,false);
 const owner=await call('config',null,admin);assert.equal(owner.data.account.role,'admin');assert.equal(owner.data.account.email,admin.email);
 assert.equal((await call('config',null,{id:'',email:''})).status,401);
 assert.equal((await call('overview')).status,403);
 assert.equal((await call('overview',null,admin)).status,200);
});
test('two customers have isolated histories and observe admin status updates',async()=>{
 const alice={id:'alice',email:'alice@example.invalid'},bob={id:'bob',email:'bob@example.invalid'};
 const a=(await call('create',{...input(),business:'Alice cafe',admin:true,role:'admin'},alice)).data.order;
 const b=(await call('create',{...input(),business:'Bob cafe'},bob)).data.order;
 assert.deepEqual((await call('list',null,alice)).data.orders.map(o=>o.id),[a.id]);
 assert.deepEqual((await call('list',null,bob)).data.orders.map(o=>o.id),[b.id]);
 assert.equal((await call('list&search=Bob',null,alice)).data.orders.length,0);
 assert.equal((await call('list&admin=1&search=Bob',null,admin)).data.orders[0].id,b.id);
 assert.equal((await call('update',{id:b.id,revision:0,status:'delivered'},alice)).status,404);
 assert.equal((await call('update',{id:a.id,revision:0,status:'confirmed'},alice)).status,403);
 assert.equal((await call('update',{id:a.id,revision:0,status:'out_for_delivery',delivery:100},admin)).status,200);
 assert.equal((await call('list&status=out_for_delivery',null,alice)).data.orders[0].status,'out_for_delivery');
 assert.equal((await call('list&status=delivered',null,alice)).data.orders.length,0);
 assert.equal((await call('list&status=invalid',null,alice)).status,400);
 assert.equal((await call('overview',null,alice)).status,403);
});

test('Nepal cutoff changes earliest delivery exactly at 16:00, including year rollover',()=>{
 const schedule={cutoff:'16:00',lead_days:1};
 assert.equal(operations.deliveryWindow(schedule,Date.parse('2026-12-31T10:14:59Z')).earliest,'2027-01-01');
 assert.equal(operations.deliveryWindow(schedule,Date.parse('2026-12-31T10:15:00Z')).earliest,'2027-01-02');
 assert.throws(()=>operations.enforceDelivery({deliveryDate:'2027-01-01'},schedule,Date.parse('2026-12-31T10:15:00Z')));
 for(const cutoff of ['25:00','16:60','x'])assert.throws(()=>operations.validateSchedule({cutoff,lead_days:1}));
});
test('cutoff, inventory and operational controls cannot be changed by customers',async()=>{
 for(const action of ['operations','backup'])assert.equal((await call(action)).status,403);
 for(const [action,body] of [['stock',{product_id:'milk',available:0,enabled:false,revision:0}],['schedule',{cutoff:'10:00',lead_days:1,revision:0}],['ticket-update',{id:'x',status:'resolved',response:'test',revision:0}]])assert.equal((await call(action,body)).status,403);
 assert.equal((await call('create',{...input(),deliveryDate:commerce.today()})).status,409);
 assert.equal((await call('create',{...input(),deliveryDate:''})).status,409);
});
test('stock reservations are atomic across simultaneous buyers and retries',async()=>{
 sqlite.prepare("UPDATE inventory SET available=21,enabled=1 WHERE product_id='milk'").run();
 const a={id:'race-a',email:'a@example.invalid'},b={id:'race-b',email:'b@example.invalid'},data=input();
 const results=await Promise.all([call('create',data,a),call('create',input(),b)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,0);
 const retry=await call('create',data,a);assert.equal(retry.status,200);
 const id=retry.data.order.id;let r=await call('update',{id,revision:0,status:'cancelled'},admin);assert.equal(r.status,200);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,21);
 assert.equal((await call('update',{id,revision:1,status:'cancelled'},admin)).status,200);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,21);
 assert.equal((await call('update',{id,revision:2,status:'new'},admin)).status,409);
 sqlite.prepare("UPDATE inventory SET available=10000 WHERE product_id='milk'").run();
});
test('mixed cart stock failure rolls back the whole order and reservations',async()=>{
 const before=sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available;
 sqlite.prepare("UPDATE inventory SET available=0 WHERE product_id='ghee'").run();
 const data={...input(),cart:{milk:20,ghee:5}};assert.equal((await call('create',data,{id:'mixed',email:'mixed@example.invalid'})).status,409);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,before);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM orders WHERE id=?').get('DG-'+data.requestId.toUpperCase()).n,0);
 sqlite.prepare("UPDATE inventory SET available=10000 WHERE product_id='ghee'").run();
});
test('admin stock saves reject stale revisions after an order reserves stock',async()=>{
 const old=sqlite.prepare("SELECT * FROM inventory WHERE product_id='milk'").get();
 await call('create',input(),{id:'stock-race',email:'stock@example.invalid'});
 assert.equal((await call('stock',{product_id:'milk',available:10000,enabled:true,revision:old.revision},admin)).status,409);
 const next=sqlite.prepare("SELECT * FROM inventory WHERE product_id='milk'").get();
 assert.equal((await call('stock',{product_id:'milk',available:10000,enabled:false,revision:next.revision},admin)).status,200);
 assert.equal((await call('create',input(),{id:'disabled',email:'d@example.invalid'})).status,409);
 sqlite.prepare("UPDATE inventory SET enabled=1 WHERE product_id='milk'").run();
});
test('support requests and notifications stay private; admin reply reaches only the owner',async()=>{
 const a={id:'help-a',email:'ha@example.invalid'},b={id:'help-b',email:'hb@example.invalid'};
 const o=(await call('create',input(),a)).data.order;
 const payload={requestId:crypto.randomUUID(),order_id:o.id,kind:'spoiled',message:'Milk arrived spoiled; kept packaging.'};
 const r=await call('ticket',payload,a);assert.equal(r.status,201);
 assert.equal((await call('ticket',payload,a)).data.id,r.data.id);
 assert.equal((await call('ticket',{...payload,requestId:crypto.randomUUID()},b)).status,404);
 assert.equal((await call('tickets',null,b)).data.tickets.length,0);
 assert.equal((await call('ticket-update',{id:r.data.id,revision:0,status:'reviewing',response:'Please retain packaging for review.'},admin)).status,200);
 assert.match((await call('tickets',null,a)).data.tickets[0].response,/retain packaging/);
 const notices=(await call('notifications',null,a)).data.notifications;assert.equal(notices.length,1);assert.equal(notices[0].order_id,o.id);
 assert.equal((await call('notifications',null,b)).data.notifications.length,0);
});
test('complete delivery cycle produces customer-visible updates and cannot reopen delivered order',async()=>{
 const user={id:'cycle',email:'cycle@example.invalid'};
 const o=(await call('create',{...input(),deliveryArea:'sanepa'},user)).data.order;
 for(const [revision,status] of ['confirmed','out_for_delivery','delivered'].entries())assert.equal((await call('update',{id:o.id,revision,status},admin)).status,200);
 const history=(await call('notifications',null,user)).data.notifications;assert.equal(history.length,4);
 assert.equal((await call('list',null,user)).data.orders[0].status,'delivered');
 assert.equal((await call('update',{id:o.id,revision:3,status:'new'},admin)).status,409);
});
test('backup has every operational table and sensitive provider fields are not in customer views',async()=>{
 const backup=await call('backup',null,admin);assert.equal(backup.status,200);
 assert.equal(backup.data.format,'dudhghar-backup-v3');assert.equal(backup.data.tables.orders.length,sqlite.prepare('SELECT count(*) n FROM orders').get().n);
 assert.equal(Object.keys(backup.data.tables).length,12);
 const own=(await call('list')).data.orders[0];assert.equal(own.owner,undefined);assert.equal(own.provider_id,undefined);
});
test('unhandled storage failures return a reference and record no request payload',async()=>{
 const original=env.DB;let once=true;
 env.DB={...original,prepare(sql){if(once&&sql.includes('FROM orders WHERE')){once=false;throw new Error('fixture storage failure with secret');}return original.prepare(sql);}};
 try{const r=await call('list');assert.equal(r.status,500);assert.ok(r.data.requestId);assert.doesNotMatch(JSON.stringify(r.data),/secret/);assert.equal(sqlite.prepare('SELECT action FROM operation_errors WHERE id=?').get(r.data.requestId).action,'list');}finally{env.DB=original;}
});

test('a delayed/lost checkout response can be retried without another order or stock debit',async()=>{
 const user={id:'slow-client',email:'slow@example.invalid'},data=input();
 const initial=await call('create',data,user); // Simulate a response committed on server but lost by the browser.
 const remaining=sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available;
 const retry=await call('create',data,user);
 assert.equal(retry.data.order.id,initial.data.order.id);assert.equal((await call('list',null,user)).data.orders.length,1);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,remaining);
});

test('backup restores into a new offline database without reserving stock a second time',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'dudhghar-restore-'));
 try{
  const backup=(await call('backup',null,admin)).data,source=join(dir,'backup.json'),target=join(dir,'restored.sqlite');writeFileSync(source,JSON.stringify(backup),{mode:0o600});
  const r=spawnSync(process.execPath,['scripts/restore-backup.mjs',source,target],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const restored=new DatabaseSync(target);
  assert.equal(restored.prepare('SELECT count(*) n FROM orders').get().n,backup.tables.orders.length);
  assert.equal(restored.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available);
  assert.equal(restored.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n,0);restored.close();
  assert.notEqual(spawnSync(process.execPath,['scripts/restore-backup.mjs',source,target]).status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('stock receipt and wastage are audited, idempotent and cannot make stock negative',async()=>{
 const row=sqlite.prepare("SELECT * FROM inventory WHERE product_id='milk'").get();
 const data={product_id:'milk',kind:'receive',quantity:50,revision:row.revision,note:'Fresh delivery',requestId:crypto.randomUUID(),enabled:true,low_threshold:40};
 assert.equal((await call('stock-move',data)).status,403);
 assert.equal((await call('stock-move',data,admin)).status,200);
 assert.equal((await call('stock-move',data,admin)).status,200);
 let now=sqlite.prepare("SELECT * FROM inventory WHERE product_id='milk'").get();assert.equal(now.available,row.available+50);
 assert.equal((await call('stock-move',{...data,quantity:51},admin)).status,409);
 assert.equal((await call('stock-move',{...data,kind:'waste',quantity:now.available+1,revision:now.revision,requestId:crypto.randomUUID()},admin)).status,409);
 const waste={...data,kind:'waste',quantity:3,revision:now.revision,requestId:crypto.randomUUID(),note:'Damaged container'};
 assert.equal((await call('stock-move',waste,admin)).status,200);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,now.available-3);
 assert.equal((await call('stock-history',null,admin)).data.movements.filter(m=>m.id===waste.requestId).length,1);
});
test('daily stock isolates dates, enforces capacity atomically, and returns stock to its original date',async()=>{
 const date=commerce.today(Date.now()+10*86400000),date2=commerce.today(Date.now()+11*86400000);
 for(const d of [date,date2]){
  assert.equal((await call('day-plan',{date:d,max_orders:1,revision:0},admin)).status,200);
  assert.equal((await call('stock-move',{stock_date:d,product_id:'milk',kind:'receive',quantity:50,revision:0,note:'Daily production',requestId:crypto.randomUUID(),enabled:true},admin)).status,200);
 }
 const config=(await call('availability&date='+date)).data;assert.equal(config.inventory.find(p=>p.id==='milk').available,50);
 const shared=sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available;
 const a={id:'dated-a',email:'a@invalid.test'},b={id:'dated-b',email:'b@invalid.test'};
 const results=await Promise.all([call('create',{...input(),deliveryDate:date},a),call('create',{...input(),deliveryDate:date},b)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,shared);
 assert.equal((await call('availability&date='+date2)).data.inventory.find(p=>p.id==='milk').available,50);
 const o=results.find(r=>r.status===201).data.order;assert.equal(o.stock_date,date);
 assert.equal((await call('update',{id:o.id,revision:0,status:'cancelled'},admin)).status,200);
 const restored=(await call('availability&date='+date)).data;assert.equal(restored.remainingOrders,1);assert.equal(restored.inventory.find(p=>p.id==='milk').available,50);
 assert.equal((await call('daily-dashboard&date='+date)).status,403);
 assert.equal((await call('daily-dashboard&date='+date,null,admin)).data.orders.length,1);
 assert.equal((await call('stock-history&date='+date,null,admin)).data.movements.filter(m=>m.kind==='cancel').length,1);
});
test('reorder creates only a private draft and does not reserve stock',async()=>{
 const user={id:'repeat',email:'repeat@invalid.test'};const o=(await call('create',input(),user)).data.order;
 const before=sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available;
 const r=await call('reorder',{id:o.id},user);assert.equal(r.status,200);assert.equal(r.data.draft.cart.milk,21);
 assert.equal((await call('reorder',{id:o.id},buyer)).status,404);
 assert.equal(sqlite.prepare("SELECT available FROM inventory WHERE product_id='milk'").get().available,before);
 assert.equal((await call('list',null,user)).data.orders.length,1);
});
test('standing plans skip holidays, pause and stay private',async()=>{
 const user={id:'standing',email:'standing@invalid.test'};const o=(await call('create',input(),user)).data.order;
 const earliest=operations.deliveryWindow().earliest;
 const data={requestId:crypto.randomUUID(),source_id:o.id,name:'Morning milk',weekdays:[0,1,2,3,4,5,6],holidays:[earliest]};
 assert.equal((await call('plan-save',data,user)).status,200);assert.equal((await call('plan-save',data,user)).status,200);
 let plans=(await call('plans',null,user)).data.plans;assert.equal(plans.length,1);assert.ok(!plans[0].dates.includes(earliest));
 assert.equal((await call('plans')).data.plans.length,0);
 assert.equal((await call('plan-update',{id:data.requestId,paused:true,holidays:[],revision:0})).status,409);
 assert.equal((await call('plan-update',{id:data.requestId,paused:true,holidays:[],revision:0},user)).status,200);
 assert.equal((await call('plans',null,user)).data.plans[0].dates.length,0);
});
test('reports separate delivered sales from wastage and exclude cancelled orders',async()=>{
 const user={id:'reports',email:'reports@invalid.test'},date=commerce.today(Date.now()+15*86400000);
 const o=(await call('create',{...input(),deliveryDate:date,deliveryArea:'sanepa'},user)).data.order;
 assert.equal((await call('update',{id:o.id,revision:0,status:'delivered'},admin)).status,200);
 const r=await call('reports&from='+date+'&to='+date,null,admin);assert.equal(r.status,200);assert.equal(r.data.total.orders,1);assert.equal(r.data.sales.find(p=>p.product_id==='milk').quantity,21);assert.equal(r.data.total.paid,0);
 assert.equal((await call('reports&from='+date+'&to='+date)).status,403);
 assert.equal((await call('reports&from=2026-02-30&to='+date,null,admin)).status,400);
});

test('cash on delivery remains unpaid until admin records a delivered cash receipt',async()=>{
 const person={id:'cod-buyer',email:'cod@example.invalid'};
 await call('stock',{product_id:'milk',available:10000,enabled:true,revision:sqlite.prepare("SELECT revision FROM inventory WHERE product_id='milk'").get().revision},admin);
 const submitted=await call('create',{...input(),method:'cod',deliveryArea:'sanepa'},person);
 assert.equal(submitted.status,201);const o=submitted.data.order;
 assert.equal(o.method,'cod');assert.equal(o.payment,'pending');assert.equal(o.total,1885);
 assert.equal((await call('pay',{id:o.id},person)).status,409);
 assert.equal((await call('verify',{id:o.id},person)).status,400);
 assert.equal((await call('update',{id:o.id,revision:0,status:'delivered',markPaid:true,reference:'CASH-001'},person)).status,403);
 assert.equal((await call('update',{id:o.id,revision:0,status:'confirmed',markPaid:true,reference:'CASH-001'},admin)).status,400);
 const delivered=await call('update',{id:o.id,revision:0,status:'delivered'},admin);
 assert.equal(delivered.data.order.payment,'pending');
 assert.equal((await call('update',{id:o.id,revision:1,status:'delivered',markPaid:true,reference:''},admin)).status,400);
 const paid=await call('update',{id:o.id,revision:1,status:'delivered',markPaid:true,reference:'CASH-001'},admin);
 assert.equal(paid.status,200);assert.equal(paid.data.order.payment,'paid');assert.equal(paid.data.order.reference,'CASH-001');
 assert.equal((await call('update',{id:o.id,revision:1,status:'delivered',markPaid:true,reference:'CASH-001'},admin)).status,409);
});

test('shopping guards handle loading, date capacity, disabled stock, quantity limits and empty carts',()=>{
 const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/shop-rules.js',import.meta.url),'utf8'),ctx);
 const rules=ctx.shopRules,p=products[0];
 const available={status:'ready',remainingOrders:null,inventory:[{id:p.id,enabled:true,available:21}]};
 assert.equal(rules.stockIssue(p,20,available),null);
 assert.equal(rules.stockIssue(p,22,available),'shortage');
 assert.equal(rules.stockIssue(p,20,{...available,status:'loading'}),'loading');
 assert.equal(rules.stockIssue(p,20,{...available,status:'error'}),'unverified');
 assert.equal(rules.stockIssue(p,20,{...available,remainingOrders:0}),'closed');
 assert.equal(rules.stockIssue(p,20,{...available,inventory:[{id:p.id,enabled:false,available:21}]}),'unavailable');
 assert.equal(rules.cartIssues(products,{},available)[0].type,'empty');
 assert.equal(rules.cartIssues(products,{milk:22},available)[0].type,'shortage');
 assert.equal(rules.cartIssues(products,{milk:20},available).length,0);
});
