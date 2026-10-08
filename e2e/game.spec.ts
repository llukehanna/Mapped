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
  await page.getByRole('alertdialog', { name: 'Give up?' }).getByRole('button', { name: 'Give up' }).click();
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

test('there is no pause: Esc and Give up ask in one central dialog while the clock keeps running', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  await expect(page.getByRole('button', { name: /Pause/ })).toHaveCount(0);
  const dialog = page.getByRole('alertdialog', { name: 'Give up?' });
  const clock = page.locator('.topbar .clock');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  const before = await clock.textContent();
  await expect(clock).not.toHaveText(before!, { timeout: 3000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Give up' }).click();
  await dialog.getByRole('button', { name: 'Give up' }).click();
  await expect(page.locator('.review-bar')).toBeVisible();
});

test('type mode: hints are for the country you pick, a letter at a time', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  const input = page.getByLabel('Country name');
  const card = page.getByRole('region', { name: 'Hints' });
  // Nothing picked: Hint asks for a pick, and the pick gets the hint.
  await input.pressSequentially('?');
  await expect(page.getByRole('status').filter({ hasText: "Click a country you haven't found" })).toBeVisible();
  await expect(card).toBeHidden();
  await clickCountry(page, 'BRA');
  await expect(card).toContainText('1/4');
  await expect(card.locator('li')).toHaveText(['Starts with B']);
  await input.pressSequentially('?');
  await expect(card.locator('li').nth(1)).toHaveText('B _ _ _ _ _ · 6 letters');
  await card.getByRole('button', { name: /Another hint/ }).click();
  await expect(card.locator('li').nth(2)).toHaveText('B _ _ _ _ l');
  await expect(input).toHaveValue('');
  // Picking another country switches the card to it, free until asked.
  await clickCountry(page, 'PER');
  await expect(card).toContainText('0/4');
  await card.getByRole('button', { name: /Get a hint/ }).click();
  await expect(card.locator('li')).toHaveText(['Starts with P']);
  // Finding it clears the pick.
  await input.pressSequentially('peru');
  await expect(card).toBeHidden();
});

test('Greenland fills in with Denmark', async ({ page }) => {
  await openSetup(page);
  await start(page);
  await page.getByLabel('Country name').pressSequentially('denmark');
  await expect(page.locator('path.shape[data-id="t-greenland"]')).toHaveClass(/\b(just|found)\b/);
});

test('the theme toggle is always there, including mid-game and in review', async ({ page }) => {
  await openSetup(page);
  await start(page);
  await page.locator('.topbar').getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Give up' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Give up' }).click();
  await expect(page.locator('.review-bar').getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
});

test('light mode is remembered across reloads', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
