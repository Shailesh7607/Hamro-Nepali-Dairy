import {deliveryAreas,deliveryArea} from './delivery.mjs';
import { products } from './catalog.mjs';
export class ShopError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const today = (now=Date.now()) => new Date(now+345*60000).toISOString().slice(0,10);
export function normalizeCart(value){
 const cart={};if(!value || typeof value!=='object' || Array.isArray(value)) return cart;
 for(const p of products){const q=value[p.id];if(Number.isInteger(q)&&q>=p.minimum&&q<=10000)cart[p.id]=q;}
 return cart;
}
export function validate(input){
 if(!input || typeof input!=='object') throw new ShopError('अर्डर विवरण मिलेन।');
 const field=(key,max,min=1)=>{const s=typeof input[key]==='string'?input[key].trim():'';if(s.length<min||s.length>max)throw new ShopError('नाम, फोन र ठेगाना जाँच्नुहोस्।');return s;};
 const business=field('business',200),contact=field('contact',120),address=field('address',500,3),notes=field('notes',1000,0);
 const phone=field('phone',30).replace(/[०-९]/g,d=>String('०१२३४५६७८९'.indexOf(d)));
 if(!/^\+?[0-9 ()-]{7,30}$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15)throw new ShopError('सही फोन नम्बर लेख्नुहोस्।');
 const deliveryDate=field('deliveryDate',10,0);
 if(deliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||!Number.isFinite(Date.parse(deliveryDate+'T00:00:00Z'))||new Date(deliveryDate+'T00:00:00Z').toISOString().slice(0,10)!==deliveryDate||deliveryDate<today()))throw new ShopError('आज वा भविष्यको सही मिति छान्नुहोस्।');
 if(!['cod','bank','khalti','esewa'].includes(input.method))throw new ShopError('भुक्तानी विधि मिलेन।');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId))throw new ShopError('अनुरोध नम्बर मिलेन।');
 const area=deliveryArea(input.deliveryArea);if(!area)throw new ShopError('डेलिभरी क्षेत्र छान्नुहोस्।');
 const deliverySlot=input.deliverySlot;
 if(deliverySlot!==undefined&&!['morning','afternoon'].includes(deliverySlot))throw new ShopError('डेलिभरी समय छान्नुहोस्।');
 const clean=normalizeCart(input.cart);
 if(!Object.keys(clean).length || Object.keys(clean).length!==Object.keys(input.cart||{}).length)throw new ShopError('कार्टको न्यूनतम परिमाण जाँच्नुहोस्।');
 const items=products.filter(p=>clean[p.id]).map(p=>({id:p.id,name:p.name,unit:p.unit,price:p.price,qty:clean[p.id],subtotal:p.price*clean[p.id]}));
 return {id:'DG-'+input.requestId.toUpperCase(),payload:JSON.stringify({business,contact,phone,address,deliveryDate,...(deliverySlot?{deliverySlot}:{}),deliveryArea:area.id,deliveryAreaLabel:area.label,notes,items}),subtotal:items.reduce((n,p)=>n+p.subtotal,0),method:input.method,delivery:area.fee};
}
export {session} from './session.mjs';
export function paymentReady(o){if(o.status==='cancelled'||['paid','test_paid'].includes(o.payment)||o.delivery===null)throw new ShopError('डेलिभरी शुल्क पुष्टि र भुक्तानी स्थिति जाँच्नुहोस्।',409);}
export function confirmedPayment(method,result,order,env){
 if(method==='khalti')return result.status==='Completed' && result.pidx===order.provider_id && Number(result.total_amount)===order.total*100 && !!result.transaction_id && !result.refunded;
 return result.status==='COMPLETE' && result.transaction_uuid===order.id && result.product_code===env.ESEWA_PRODUCT_CODE && Number(result.total_amount)===order.total && !!result.ref_id;
}
export function adminPatch(o,input){
 if(['cancelled','delivered'].includes(o.status)&&input.status!==o.status)throw new ShopError('समाप्त अर्डर फेरि खोल्न मिल्दैन।',409);
 if(input.revision!==o.revision)throw new ShopError('अर्डर फेरिएको छ। सूची ताजा गर्नुहोस्।',409);
 if(!['new','confirmed','out_for_delivery','delivered','cancelled'].includes(input.status))throw new ShopError('स्थिति मिलेन।');
 let delivery=o.delivery;
 if(input.delivery!==undefined && input.delivery!==o.delivery){
  if(o.provider_id||['paid','test_paid'].includes(o.payment))throw new ShopError('भुक्तानी सुरु भएपछि रकम बदल्न मिल्दैन।',409);
  if(!Number.isInteger(input.delivery)||input.delivery<0||input.delivery>100000)throw new ShopError('सही डेलिभरी शुल्क लेख्नुहोस्।');delivery=input.delivery;
 }
 if(input.status!=='new' && input.status!=='cancelled' && delivery===null)throw new ShopError('पहिले डेलिभरी शुल्क पुष्टि गर्नुहोस्।');
 let payment=o.payment,reference=o.reference;
 if(input.markPaid){
  if(!['bank','cod'].includes(o.method)||delivery===null||input.status==='cancelled')throw new ShopError('यो भुक्तानी म्यानुअल पुष्टि गर्न मिल्दैन।');
  if(o.method==='cod'&&input.status!=='delivered')throw new ShopError('नगद प्राप्ति पुष्टि गर्न अर्डर डेलिभर भएको हुनुपर्छ।');
  if(typeof input.reference!=='string'||input.reference.trim().length<3||input.reference.length>120)throw new ShopError('कारोबार वा नगद रसिद नम्बर लेख्नुहोस्।');
  payment='paid';reference=input.reference.trim();
 }
 if(input.status==='cancelled' && (['paid','test_paid'].includes(o.payment)||o.provider_id))throw new ShopError('भुक्तानी सुरु भएको अर्डर रद्द गर्नुअघि व्यापारीबाट समाधान गर्नुहोस्।',409);
 return {delivery,total:o.subtotal+(delivery??0),status:input.status,payment,reference};
}
export function config(env){return {deliveryAreas,bank:env.BANK_NAME&&env.BANK_ACCOUNT_NAME&&env.BANK_ACCOUNT_NUMBER?{name:env.BANK_NAME,accountName:env.BANK_ACCOUNT_NAME,number:env.BANK_ACCOUNT_NUMBER}:null,khalti:!!env.KHALTI_SECRET_KEY,esewa:!!(env.ESEWA_SECRET_KEY&&env.ESEWA_PRODUCT_CODE),mode:env.PAYMENT_MODE==='live'?'live':'sandbox'};}
