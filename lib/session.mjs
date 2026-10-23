import {ShopError} from './commerce.mjs';
const verified = new WeakMap();
// Only server code binds identity. HTTP headers and browser metadata are never used.
export function bindSession(request,user){verified.set(request,Object.freeze({...user}));}
export function session(request){const user=verified.get(request);if(!user)throw new ShopError('कृपया आफ्नो खातामा लगइन गर्नुहोस्।',401);return user;}
