function updateNavigation(){
 const hash=location.hash||'#products';
 document.querySelectorAll('.mobile-nav a,.nav a,.head>.checkout-nav').forEach(a=>{
  if(a.hash===hash)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
 });
 if(['#account','#orders'].includes(hash))window.scrollTo(0,0);
}
window.addEventListener('hashchange',updateNavigation);updateNavigation();
for(const id of ['drawer','productDialog']){
 const dialog=document.getElementById(id);
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
 });
 dialog.addEventListener('close',()=>{if(id==='drawer')document.body.classList.remove('open');});
}
