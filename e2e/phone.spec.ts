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
