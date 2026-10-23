import {ShopError,today} from './commerce.mjs';
export const defaultSchedule={cutoff:'16:00',lead_days:1,revision:0};
export function deliveryWindow(settings=defaultSchedule,now=Date.now()){
 const local=new Date(now+345*60000),[hour,minute]=settings.cutoff.split(':').map(Number);
 const days=settings.lead_days+(local.getUTCHours()*60+local.getUTCMinutes()>=hour*60+minute?1:0);
 return {...settings,timezone:'Asia/Kathmandu',earliest:today(now+days*86400000),latest:today(now+90*86400000)};
}
export function enforceDelivery(payload,settings,now=Date.now()){
 const {earliest,latest}=deliveryWindow(settings,now);
 if(!payload.deliveryDate||payload.deliveryDate<earliest||payload.deliveryDate>latest)throw new ShopError(`डेलिभरी मिति ${earliest} देखि ${latest} बीच छान्नुहोस्। कटअफ समय नेपाल समयअनुसार हो।`,409);
}
export function validateSchedule(input){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.cutoff)||!Number.isInteger(input.lead_days)||input.lead_days<1||input.lead_days>7)throw new ShopError('कटअफ समय र १–७ दिनको तयारी समय छान्नुहोस्।');
 return {cutoff:input.cutoff,lead_days:input.lead_days};
}
export function validateStock(input,products){
 if(!products.some(p=>p.id===input.product_id)||!Number.isInteger(input.available)||input.available<0||input.available>1000000||typeof input.enabled!=='boolean'||!Number.isInteger(input.revision))throw new ShopError('स्टक विवरण मिलेन।');
}
