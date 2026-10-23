import {ShopError,today,normalizeCart} from './commerce.mjs';
import {products} from './catalog.mjs';
export const backupTables=['orders','inventory','shop_settings','order_events','support_tickets','operation_errors','delivery_days','daily_inventory','stock_movements','standing_plans','saved_addresses','delivery_slots'];
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function requireDate(value){if(!validDate(value))throw new ShopError('सही मिति छान्नुहोस्।');return value;}
export function bucket(date=''){return date?{table:'daily_inventory',where:'stock_date=?',params:[date]}:{table:'inventory',where:'1=1',params:[]};}
export async function inventoryView(db,date=''){
 if(date)requireDate(date);const plan=date?await db.prepare('SELECT * FROM delivery_days WHERE date=?').bind(date).first():null;
 const b=bucket(plan?date:'');const {results}=await db.prepare('SELECT * FROM '+b.table+' WHERE '+b.where).bind(...b.params).all();
 const inventory=products.map(p=>({...p,...(results.find(r=>r.product_id===p.id)||{product_id:p.id,available:0,enabled:0,revision:0,low_threshold:0}),id:p.id,stock_date:plan?date:''}));
 const count=date?await db.prepare("SELECT count(*) n FROM orders WHERE json_extract(payload,'$.deliveryDate')=? AND status<>'cancelled'").bind(date).first():{n:0};
 return {inventory,stockDate:plan?date:'',plan,remainingOrders:plan?Math.max(0,plan.max_orders-count.n):null};
}
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v||'');
export async function changeStock(db,input,user){
 const date=input.stock_date||'';if(date)requireDate(date);
 const p=products.find(p=>p.id===input.product_id);
 if(!p||!['receive','waste','adjust'].includes(input.kind)||!Number.isInteger(input.quantity)||input.quantity<0||input.quantity>1000000||!Number.isInteger(input.revision)||!uuid(input.requestId)||typeof input.note!=='string'||input.note.trim().length<3||input.note.length>200)throw new ShopError('परिमाण, कारण र स्टक संस्करण जाँच्नुहोस्।');
 if(input.kind!=='adjust'&&input.quantity===0)throw new ShopError('परिमाण शून्यभन्दा बढी हुनुपर्छ।');
 if(date&&!await db.prepare('SELECT date FROM delivery_days WHERE date=?').bind(date).first())throw new ShopError('पहिले यो दिनको योजना सेभ गर्नुहोस्।',409);
 const signature=JSON.stringify({date,product:input.product_id,kind:input.kind,quantity:input.quantity,note:input.note.trim(),enabled:input.enabled,low_threshold:input.low_threshold,revision:input.revision});
 const old=await db.prepare('SELECT * FROM stock_movements WHERE id=?').bind(input.requestId).first();
 if(old){if(old.actor!==user.id||old.signature!==signature)throw new ShopError('अनुरोध नम्बर मिलेन।',409);return {saved:true};}
 const b=bucket(date),current=await db.prepare('SELECT * FROM '+b.table+' WHERE product_id=? AND '+b.where).bind(p.id,...b.params).first();
 const available=current?.available||0,revision=current?.revision||0;
 if(revision!==input.revision)throw new ShopError('स्टक फेरिएको छ। ताजा गरेर फेरि प्रयास गर्नुहोस्।',409);
 const delta=input.kind==='adjust'?input.quantity-available:input.quantity*(input.kind==='waste'?-1:1);
 if(available+delta<0||available+delta>1000000)throw new ShopError('उपलब्ध स्टकभन्दा बढी घटाउन मिल्दैन।',409);
 const enabled=input.enabled===undefined?(current?.enabled||0):input.enabled===true?1:input.enabled===false?0:-1;
 const low=input.low_threshold===undefined?(current?.low_threshold||0):input.low_threshold;
 if(enabled<0||!Number.isInteger(low)||low<0||low>1000000)throw new ShopError('बिक्री स्थिति वा चेतावनी सीमा मिलेन।');
 const token=crypto.randomUUID(),now=Date.now();
 const init=date?db.prepare('INSERT OR IGNORE INTO daily_inventory(id,stock_date,product_id,updated) VALUES(?,?,?,?)').bind(date+':'+p.id,date,p.id,now):db.prepare('INSERT OR IGNORE INTO inventory(product_id,updated) VALUES(?,?)').bind(p.id,now);
 const rows=await db.batch([init,
 db.prepare('INSERT OR IGNORE INTO stock_movements(id,product_id,stock_date,delta,kind,note,actor,signature,token,created) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM '+b.table+' WHERE product_id=? AND '+b.where+' AND revision=?)').bind(input.requestId,p.id,date,delta,input.kind,input.note.trim(),user.id,signature,token,now,p.id,...b.params,revision),
 db.prepare('UPDATE '+b.table+' SET available=available+?,enabled=?,low_threshold=?,revision=revision+1,updated=? WHERE product_id=? AND '+b.where+' AND EXISTS(SELECT 1 FROM stock_movements WHERE id=? AND token=?)').bind(delta,enabled,low,now,p.id,...b.params,input.requestId,token)
 ]);
 if(!rows[2].meta.changes){const recorded=await db.prepare('SELECT * FROM stock_movements WHERE id=?').bind(input.requestId).first();if(recorded?.actor===user.id&&recorded.signature===signature)return {saved:true};throw new ShopError('स्टक फेरिएको छ। ताजा गर्नुहोस्।',409);}
 return {saved:true};
}
export function nextPlanDates(plan,earliest,latest){
 if(plan.paused)return [];const days=JSON.parse(plan.weekdays),skip=JSON.parse(plan.holidays),dates=[];
 for(let value=earliest;value<=latest&&dates.length<7;value=new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10))if(days.includes(new Date(value+'T00:00:00Z').getUTCDay())&&!skip.includes(value))dates.push(value);
 return dates;
}
export async function improvementsGet(action,url,user,db,window){
 if(action==='availability')return inventoryView(db,requireDate(url.searchParams.get('date')));
 if(action==='plans'){
  const {results}=await db.prepare('SELECT * FROM standing_plans WHERE owner=? ORDER BY created DESC LIMIT 50').bind(user.id).all();return {plans:results.map(p=>({...p,owner:undefined,dates:nextPlanDates(p,window.earliest,window.latest)}))};
 }
 if(!['stock-history','daily-dashboard','reports'].includes(action))return null;
 if(!user.admin)throw new ShopError('कर्मचारी अनुमति छैन।',403);
 if(action==='stock-history'){
  const date=url.searchParams.get('date')||'';if(date)requireDate(date);
  const {results}=await db.prepare('SELECT id,product_id,stock_date,delta,kind,note,created FROM stock_movements WHERE stock_date=? ORDER BY created DESC,id DESC LIMIT 100').bind(date).all();return {movements:results};
 }
 if(action==='daily-dashboard'){
  const date=requireDate(url.searchParams.get('date'));
  const {results}=await db.prepare("SELECT id,payload,total,status,payment,revision FROM orders WHERE json_extract(payload,'$.deliveryDate')=? ORDER BY created,id LIMIT 501").bind(date).all();if(results.length>500)throw new ShopError('धेरै अर्डर छन्। प्रशासकीय निर्यात आवश्यक छ।',409);
  const orders=results.map(o=>({...o,payload:JSON.parse(o.payload)}));const totals={};for(const o of orders.filter(o=>o.status!=='cancelled'))for(const i of o.payload.items)totals[i.id]=(totals[i.id]||0)+i.qty;
  return {...await inventoryView(db,date),orders,totals};
 }
 const from=requireDate(url.searchParams.get('from')),to=requireDate(url.searchParams.get('to'));if(from>to||Date.parse(to)-Date.parse(from)>92*86400000)throw new ShopError('अधिकतम ९३ दिनको अवधि छान्नुहोस्।');
 const {results:sales}=await db.prepare("SELECT json_extract(j.value,'$.id') product_id,sum(json_extract(j.value,'$.qty')) quantity,sum(json_extract(j.value,'$.subtotal')) revenue FROM orders o,json_each(o.payload,'$.items') j WHERE o.status='delivered' AND json_extract(o.payload,'$.deliveryDate') BETWEEN ? AND ? GROUP BY product_id").bind(from,to).all();
 const {results:waste}=await db.prepare("SELECT product_id,sum(-delta) quantity FROM stock_movements WHERE kind='waste' AND date(created/1000,'unixepoch','+345 minutes') BETWEEN ? AND ? GROUP BY product_id").bind(from,to).all();
 const total=await db.prepare("SELECT count(*) orders,coalesce(sum(total),0) booked,coalesce(sum(CASE WHEN payment='paid' THEN total ELSE 0 END),0) paid FROM orders WHERE status='delivered' AND json_extract(payload,'$.deliveryDate') BETWEEN ? AND ?").bind(from,to).first();return {from,to,sales,waste,total};
}
export async function improvementsPost(action,input,user,db,owned){
 if(action==='stock-move'){if(!user.admin)throw new ShopError('कर्मचारी अनुमति छैन।',403);return changeStock(db,input,user);}
 if(action==='day-plan'){
  if(!user.admin)throw new ShopError('कर्मचारी अनुमति छैन।',403);const date=requireDate(input.date);if(date<today()||date>today(Date.now()+90*86400000)||!Number.isInteger(input.max_orders)||input.max_orders<0||input.max_orders>10000||!Number.isInteger(input.revision))throw new ShopError('मिति, क्षमता र संस्करण जाँच्नुहोस्।');
  const r=await db.prepare('INSERT INTO delivery_days(date,max_orders,revision,updated) VALUES(?,?,1,?) ON CONFLICT(date) DO UPDATE SET max_orders=excluded.max_orders,revision=delivery_days.revision+1,updated=excluded.updated WHERE delivery_days.revision=?').bind(date,input.max_orders,Date.now(),input.revision).run();if(!r.meta.changes)throw new ShopError('योजना फेरिएको छ। ताजा गर्नुहोस्।',409);return {saved:true};
 }
 if(action==='plan-save'){
  if(!uuid(input.requestId)||typeof input.name!=='string'||input.name.trim().length<1||input.name.length>80||!Array.isArray(input.weekdays)||!input.weekdays.length||input.weekdays.length>7||input.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)||!Array.isArray(input.holidays)||input.holidays.length>90||input.holidays.some(d=>!validDate(d)))throw new ShopError('योजना नाम, दिन र छुट्टी मिति जाँच्नुहोस्।');
  await owned(input.source_id,{...user,admin:false});
  const count=await db.prepare('SELECT count(*) n FROM standing_plans WHERE owner=?').bind(user.id).first();if(count.n>=50)throw new ShopError('योजना सीमा पूरा भयो।',409);
  await db.prepare('INSERT OR IGNORE INTO standing_plans(id,owner,source_id,name,weekdays,holidays,created) VALUES(?,?,?,?,?,?,?)').bind(input.requestId,user.id,input.source_id,input.name.trim(),JSON.stringify([...new Set(input.weekdays)].sort()),JSON.stringify(input.holidays),Date.now()).run();
  const p=await db.prepare('SELECT * FROM standing_plans WHERE id=?').bind(input.requestId).first();if(p.owner!==user.id||p.source_id!==input.source_id||p.name!==input.name.trim()||p.weekdays!==JSON.stringify([...new Set(input.weekdays)].sort())||p.holidays!==JSON.stringify(input.holidays))throw new ShopError('अनुरोध नम्बर मिलेन।',409);return {saved:true};
 }
 if(action==='plan-update'){
  if(typeof input.paused!=='boolean'||!Number.isInteger(input.revision)||!Array.isArray(input.holidays)||input.holidays.length>90||input.holidays.some(d=>!validDate(d)))throw new ShopError('योजना विवरण मिलेन।');
  const r=await db.prepare('UPDATE standing_plans SET paused=?,holidays=?,revision=revision+1 WHERE id=? AND owner=? AND revision=?').bind(input.paused?1:0,JSON.stringify(input.holidays),input.id,user.id,input.revision).run();if(!r.meta.changes)throw new ShopError('योजना भेटिएन वा फेरिएको छ।',409);return {saved:true};
 }
 if(action==='reorder'){
  const o=await owned(input.id,{...user,admin:false}),p=JSON.parse(o.payload);const cart=normalizeCart(Object.fromEntries(p.items.map(i=>[i.id,i.qty])));if(Object.keys(cart).length!==p.items.length)throw new ShopError('केही वस्तुको परिमाण बदलेको छ। नयाँ कार्ट बनाउनुहोस्।',409);
  return {draft:{business:p.business,contact:p.contact,phone:p.phone,address:p.address,notes:p.notes,deliveryArea:p.deliveryArea,method:o.method,cart}};
 }
 return null;
}
export function reserveStatements(db,order,user,token,now,date){
 const b=bucket(date),{deliveryDate,deliverySlot}=JSON.parse(order.payload);
 const joinDate=date?' AND i.stock_date=?':'';
 return [
 db.prepare("INSERT OR IGNORE INTO orders(id,owner,payload,subtotal,delivery,total,method,created,updated,stock_token,stock_reserved,stock_date) SELECT ?,?,?,?,?,?,?,?,?,?,1,? WHERE NOT EXISTS(SELECT 1 FROM json_each(?,'$.items') item LEFT JOIN "+b.table+" i ON i.product_id=json_extract(item.value,'$.id')"+joinDate+" WHERE i.product_id IS NULL OR i.enabled<>1 OR i.available<json_extract(item.value,'$.qty')) AND (SELECT count(*) FROM orders WHERE json_extract(payload,'$.deliveryDate')=? AND status<>'cancelled')<coalesce((SELECT max_orders FROM delivery_days WHERE date=?),1000000) AND (?<>'' OR NOT EXISTS(SELECT 1 FROM delivery_days WHERE date=?)) AND (SELECT count(*) FROM orders WHERE json_extract(payload,'$.deliveryDate')=? AND json_extract(payload,'$.deliverySlot')=? AND status<>'cancelled')<coalesce((SELECT capacity FROM delivery_slots WHERE date=? AND slot=?),20)").bind(order.id,user.id,order.payload,order.subtotal,order.delivery,order.subtotal+(order.delivery??0),order.method,now,now,token,date,order.payload,...(date?[date]:[]),deliveryDate,deliveryDate,date,deliveryDate,deliveryDate,deliverySlot,deliveryDate,deliverySlot),
 db.prepare("UPDATE "+b.table+" SET available=available-(SELECT json_extract(value,'$.qty') FROM json_each(?,'$.items') WHERE json_extract(value,'$.id')="+b.table+".product_id),revision=revision+1,updated=? WHERE "+b.where+" AND product_id IN (SELECT json_extract(value,'$.id') FROM json_each(?,'$.items')) AND EXISTS(SELECT 1 FROM orders WHERE id=? AND stock_token=?)").bind(order.payload,now,...b.params,order.payload,order.id,token),
 db.prepare("INSERT OR IGNORE INTO stock_movements(id,product_id,stock_date,delta,kind,note,actor,created) SELECT ?||':reserve:'||json_extract(value,'$.id'),json_extract(value,'$.id'),?,-json_extract(value,'$.qty'),'reserve',?,?,? FROM json_each(?,'$.items') WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND stock_token=?)").bind(order.id,date,order.id,user.id,now,order.payload,order.id,token),
 db.prepare("INSERT OR IGNORE INTO order_events(id,order_id,actor,action,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND stock_token=?)").bind(order.id+':created',order.id,user.id,'Order received',now,order.id,token),
 db.prepare("UPDATE orders SET stock_token='' WHERE id=? AND stock_token=?").bind(order.id,token)
 ];
}
export function releaseStatements(db,o,revision,now,user){
 const b=bucket(o.stock_date||'');return [
 db.prepare("UPDATE "+b.table+" SET available=available+(SELECT json_extract(value,'$.qty') FROM json_each(?,'$.items') WHERE json_extract(value,'$.id')="+b.table+".product_id),revision=revision+1,updated=? WHERE "+b.where+" AND product_id IN (SELECT json_extract(value,'$.id') FROM json_each(?,'$.items')) AND EXISTS(SELECT 1 FROM orders WHERE id=? AND revision=? AND status='cancelled' AND stock_reserved=1)").bind(o.payload,now,...b.params,o.payload,o.id,revision),
 db.prepare("INSERT OR IGNORE INTO stock_movements(id,product_id,stock_date,delta,kind,note,actor,created) SELECT ?||':cancel:'||json_extract(value,'$.id'),json_extract(value,'$.id'),?,json_extract(value,'$.qty'),'cancel',?,?,? FROM json_each(?,'$.items') WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND revision=? AND status='cancelled' AND stock_reserved=1)").bind(o.id,o.stock_date||'',o.id,user.id,now,o.payload,o.id,revision),
 db.prepare("UPDATE orders SET stock_reserved=0 WHERE id=? AND revision=? AND status='cancelled'").bind(o.id,revision)
 ];
}
