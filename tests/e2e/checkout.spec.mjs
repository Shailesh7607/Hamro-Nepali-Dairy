import {test,expect} from '@playwright/test';
test('customer can buy milk with an address and delivery slot',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/shop.html');await expect(page.locator('.brand b')).toHaveText('हाम्रो नेपाली डेरी');
 await expect(page.locator('[data-add="milk"]')).toBeEnabled();await page.locator('[data-add="milk"]').click();
 await page.goto('/shop.html#checkout');
 const form=page.locator('#checkoutForm');await expect(form).toBeVisible();
 await form.locator('[name=business]').fill('Browser Test Cafe');await form.locator('[name=contact]').fill('Test Buyer');await form.locator('[name=phone]').fill('9841234567');await form.locator('[name=address]').fill('Sanepa test address');await form.locator('[name=deliveryArea]').selectOption('sanepa');
 await expect(form.locator('[name=deliverySlot] option[value=morning]')).toHaveCount(1);await form.locator('[name=deliverySlot]').selectOption('morning');
 await form.locator('[name=payment][value=cod]').check();await page.locator('#submitOrder').click();
 await expect(page).toHaveURL(/#orders$/);await expect(page.locator('#ordersList')).toContainText('Browser Test Cafe');await expect(page.locator('#ordersList')).toContainText('7–11 AM');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
