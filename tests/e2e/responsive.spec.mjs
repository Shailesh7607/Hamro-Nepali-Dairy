import {test,expect} from '@playwright/test';
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:844,height:390}]){
 test(`layout and dialogs fit ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/shop.html');
  const fits=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await fits();
  await expect(page.locator('#grid [data-detail="milk"]').first()).toBeVisible();
  await page.locator('#grid button[data-detail="milk"]').click();
  const product=page.locator('#productDialog');await expect(product).toBeVisible();
  await expect(product).toHaveCSS('background-color','rgb(255, 254, 251)');
  const rect=await product.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width+1);expect(rect.y+rect.height).toBeLessThanOrEqual(viewport.height+1);
  await page.keyboard.press('Escape');await expect(product).not.toBeVisible();
  await page.locator('#openCart').click();const cart=page.locator('#drawer');await expect(cart).toBeVisible();await expect(cart).toHaveCSS('background-color','rgb(255, 254, 251)');
  const box=await cart.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.width).toBeLessThanOrEqual(viewport.width);expect(box.height).toBeLessThanOrEqual(viewport.height+1);
  await page.keyboard.press('Escape');await expect(cart).not.toBeVisible();await expect(page.locator('#openCart')).toBeFocused();
  await page.locator('[data-add="milk"]').click();
  for(const route of ['checkout','orders','account']){await page.goto('/shop.html#'+route);await fits();}
  await page.goto('/auth.html');await fits();expect(errors).toEqual([]);
 });
}
