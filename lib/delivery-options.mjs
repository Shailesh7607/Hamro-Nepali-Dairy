import {ShopError} from './commerce.mjs';
import {deliveryArea} from './delivery.mjs';
export const slots=[{id:'morning',label:'बिहान ७–११ / 7–11 AM'},{id:'afternoon',label:'दिउँसो १–५ / 1–5 PM'}];
const dateCheck=date=>{if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new ShopError('सही मिति छान्नुहोस्।');};
export async function deliveryGet(action,url,user,db){
 if(action==='addresses')return {addresses:(await db.prepare('SELECT id,label,details,revision FROM saved_addresses WHERE owner=? ORDER BY updated DESC').bind(user.id).all()).results.map(a=>({...a,details:JSON.parse(a.details)}))};
 if(action==='slots'){
  const date=url.searchParams.get('date');dateCheck(date);
  const result=[];for(const slot of slots){
   const plan=await db.prepare('SELECT * FROM delivery_slots WHERE date=? AND slot=?').bind(date,slot.id).first();
   const count=await db.prepare("SELECT count(*) n FROM orders WHERE json_extract(payload,'$.deliveryDate')=? AND json_extract(payload,'$.deliverySlot')=? AND status<>'cancelled'").bind(date,slot.id).first();
   const capacity=plan?.capacity??20;result.push({...slot,capacity,booked:count.n,remaining:Math.max(0,capacity-count.n),revision:plan?.revision??-1});
  }return {date,slots:result,timezone:'Asia/Kathmandu'};
 }return null;
}
export async function deliveryPost(action,input,user,db){
 if(action==='address-delete'){
  const r=await db.prepare('DELETE FROM saved_addresses WHERE id=? AND owner=? AND revision=?').bind(String(input.id||''),user.id,input.revision??-1).run();
  if(!r.meta.changes)throw new ShopError('ठेगाना फेरिएको छ वा भेटिएन। ताजा गर्नुहोस्।',409);return {saved:true};
 }
 if(action==='address-save'){
  const text=(key,max,min=1)=>{const value=typeof input[key]==='string'?input[key].trim():'';if(value.length<min||value.length>max)throw new ShopError('ठेगानाको विवरण जाँच्नुहोस्।');return value;};
  const label=text('label',60),details={business:text('business',200),contact:text('contact',120),phone:text('phone',30),address:text('address',500,3),deliveryArea:text('deliveryArea',40),notes:text('notes',1000,0)};
  if(!deliveryArea(details.deliveryArea)||!/^\+?[0-9०-९ ()-]{7,30}$/.test(details.phone))throw new ShopError('फोन र क्षेत्र जाँच्नुहोस्।');
  const id=input.id||crypto.randomUUID();if(typeof id!=='string'||id.length>100)throw new ShopError('ठेगाना नम्बर मिलेन।');
  if(input.id){
   const r=await db.prepare('UPDATE saved_addresses SET label=?,details=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').bind(label,JSON.stringify(details),Date.now(),id,user.id,input.revision??-1).run();
   if(!r.meta.changes)throw new ShopError('ठेगाना फेरिएको छ वा भेटिएन। ताजा गर्नुहोस्।',409);
  }else{
   const r=await db.prepare('INSERT INTO saved_addresses(id,owner,label,details,updated) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM saved_addresses WHERE owner=?)<10').bind(id,user.id,label,JSON.stringify(details),Date.now(),user.id).run();
   if(!r.meta.changes)throw new ShopError('बढीमा १० ठेगाना राख्न सकिन्छ।',409);
  }return {saved:true,id};
 }
 if(action==='slot-save'){
  if(!user.admin)throw new ShopError('कर्मचारी अनुमति छैन।',403);dateCheck(input.date);
  if(!slots.some(s=>s.id===input.slot)||!Number.isInteger(input.capacity)||input.capacity<0||input.capacity>10000||!Number.isInteger(input.revision))throw new ShopError('स्लट क्षमता जाँच्नुहोस्।');
  const r=await db.prepare(`INSERT INTO delivery_slots(date,slot,capacity,revision) SELECT ?,?,?,0 WHERE ?>=-1 AND (SELECT count(*) FROM orders WHERE json_extract(payload,'$.deliveryDate')=? AND json_extract(payload,'$.deliverySlot')=? AND status<>'cancelled')<=? AND (?=-1 OR EXISTS(SELECT 1 FROM delivery_slots WHERE date=? AND slot=?)) ON CONFLICT(date,slot) DO UPDATE SET capacity=excluded.capacity,revision=delivery_slots.revision+1 WHERE delivery_slots.revision=?`).bind(input.date,input.slot,input.capacity,input.revision,input.date,input.slot,input.capacity,input.revision,input.date,input.slot,input.revision).run();
  if(!r.meta.changes)throw new ShopError('क्षमता आरक्षित अर्डरभन्दा कम छ वा योजना फेरिएको छ। ताजा गर्नुहोस्।',409);return {saved:true};
 }return null;
}
