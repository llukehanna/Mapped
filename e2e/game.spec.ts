import { expect, test } from '@playwright/test';
import { chooseMode, chooseSubregion, clickCountry, openSetup, start, watchErrors } from './helpers.ts';

const SOUTH_AMERICA = ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'];
const AUSTRALASIA: Record<string, string> = { AUS: 'Australia', NZL: 'New Zealand' };

test('type mode: name every South American country and reach a perfect review', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  const input = page.getByLabel('Country name');
  for (const name of SOUTH_AMERICA) await input.pressSequentially(name.toLowerCase(), { delay: 5 });
  await expect(page.getByText('Every one. Nothing missed.')).toBeVisible();
  await expect(page.locator('.review-bar .score')).toHaveText('12 / 12');
  await expect(page.getByText('New best')).toBeVisible();
  expect(errors).toEqual([]);
});

test('type mode: typo on Enter, territory note, give up lists the rest', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  const input = page.getByLabel('Country name');
  await input.fill('brazl');
  await input.press('Enter');
  await expect(page.locator('.topbar .score')).toHaveText('1 / 12');
  await expect(page.getByRole('status').filter({ hasText: 'Accepted as Brazil' })).toBeVisible();
  await input.pressSequentially('falklands');
  await expect(page.getByRole('status').filter({ hasText: 'Falkland Islands: Territory of the United Kingdom' })).toBeVisible();
  await page.getByRole('button', { name: 'Give up' }).click();
  await page.getByRole('button', { name: 'Sure?' }).click();
  await expect(page.getByText('Missed · 11')).toBeVisible();
});

test('locate mode: wrong click costs a try, right click scores, skip reveals', async ({ page }) => {
  await openSetup(page);
  await chooseSubregion(page, 'Australasia');
  await chooseMode(page, 'Locate');
  await start(page);
  const prompt = page.locator('.prompt');
  const first = (await prompt.getAttribute('data-target-id'))!;
  const other = first === 'AUS' ? 'NZL' : 'AUS';
  await clickCountry(page, other);
  await expect(page.getByLabel('2 tries left')).toBeVisible();
  await clickCountry(page, first);
  await expect(page.locator('.topbar .score')).toHaveText('1 / 2');
  await page.getByRole('button', { name: /Skip/ }).click();
  await expect(page.getByText('Missed · 1')).toBeVisible();
  await expect(page.locator('.review-item')).toHaveText(AUSTRALASIA[other]);
});

test('identify mode: name the highlighted country, skip the next', async ({ page }) => {
  await openSetup(page);
  await chooseSubregion(page, 'Australasia');
  await chooseMode(page, 'Identify');
  await start(page);
  const form = page.locator('form.guess');
  const first = (await form.getAttribute('data-target-id'))!;
  await page.getByLabel('Country name').pressSequentially(AUSTRALASIA[first]);
  await expect(page.locator('.topbar .score')).toHaveText('1 / 2');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('Missed · 1')).toBeVisible();
});

test('countdown: time running out ends the game', async ({ page }) => {
  await page.clock.install();
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await page.getByRole('radio', { name: '5', exact: true }).click();
  await start(page);
  await expect(page.locator('.topbar .clock')).toHaveText('5:00');
  await page.clock.fastForward('05:01');
  await expect(page.locator('.review-bar')).toBeVisible();
  await expect(page.getByText('Missed · 12')).toBeVisible();
});

test('pause hides the map and Esc resumes', async ({ page }) => {
  await openSetup(page);
  await start(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
});

test('light mode is remembered across reloads', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
