// Shared, side-effect-free browser rules. The server remains authoritative.
globalThis.shopRules = {
 stockIssue(product, quantity, availability) {
  if (availability.status !== 'ready') return availability.status === 'error' ? 'unverified' : 'loading';
  if (availability.remainingOrders === 0) return 'closed';
  const stock = availability.inventory.find(item => item.id === product.id);
  if (!stock?.enabled || stock.available < product.minimum) return 'unavailable';
  if (quantity > Math.min(10000, stock.available)) return 'shortage';
  return null;
 },
 cartIssues(products, cart, availability) {
  const items = products.filter(product => cart[product.id]);
  if (!items.length) return [{type:'empty'}];
  return items.flatMap(product => {
   const type = this.stockIssue(product, cart[product.id], availability);
   return type ? [{type, name:product.name}] : [];
  });
 }
};
globalThis.shopAvailability = {status:'loading',inventory:[],remainingOrders:null};
