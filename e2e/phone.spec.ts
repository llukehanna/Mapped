import { expect, test } from '@playwright/test';
import { openSetup, start, watchErrors } from './helpers.ts';

test('phone: setup sheet, play, menu', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await start(page);
  await page.getByLabel('Country name').pressSequentially('chad');
  await expect(page.locator('.topbar .score')).toHaveText('1 / 197');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('phone: the sign-in card is a bottom sheet', async ({ page }) => {
  await page.goto('/signin');
  const card = page.getByRole('dialog', { name: 'Sign in' });
  await expect(card.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  // Once its slide-up animation settles, the sheet sits on the bottom edge.
  await expect
    .poll(async () => {
      const box = (await card.boundingBox())!;
      return Math.abs(box.y + box.height - page.viewportSize()!.height);
    })
    .toBeLessThan(2);
});
