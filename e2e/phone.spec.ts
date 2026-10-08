import { expect, test } from '@playwright/test';
import { chooseMode, chooseTopic, openSetup, start, watchErrors } from './helpers.ts';

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

test('phone: flags · identify fits a 375px screen', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await openSetup(page);
  await chooseTopic(page, 'Flags');
  await chooseMode(page, 'Identify');
  await start(page);
  const choices = page.locator('.flag-choices button');
  await expect(choices).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  // Every flag is on screen and tappable.
  for (const box of await Promise.all((await choices.all()).map((c) => c.boundingBox()))) {
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await choices.nth(0).click();
  expect(errors).toEqual([]);
});
