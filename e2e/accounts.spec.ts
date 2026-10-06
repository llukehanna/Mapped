import { expect, test } from '@playwright/test';
import { asPlayer, openSetup, pickName, signInFromSetup, start, typeLikeAPerson, watchErrors } from './helpers.ts';

const SOUTH_AMERICA = ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'];

test('play signed out, sign in from the review: the game is claimed and on the board', async ({ page }) => {
  const errors = watchErrors(page);
  const player = await asPlayer(page);
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await expect(page.locator('.setup').getByText('S. America · Type board')).toBeVisible();
  await start(page);
  await expect(page.locator('.topbar .ranked')).toHaveText('Ranked');
  await typeLikeAPerson(page, SOUTH_AMERICA);

  const saveCard = page.locator('.savecard');
  await expect(saveCard).toContainText('Sign in to save this run');
  await expect(saveCard).toContainText(/would put you #\d+ on S\. America · Type/);
  await saveCard.getByRole('button', { name: 'Sign in' }).click();

  // Back from (fake) Google on the same review, asked for a name.
  await expect(page.getByText('Every one. Nothing missed.')).toBeVisible();
  await pickName(page, player.name);
  await expect(saveCard).toContainText(/Saved · #\d+ on S\. America · Type/);
  await saveCard.getByRole('button', { name: 'Leaderboard' }).click();

  await expect(page).toHaveURL(/\/leaderboards\/type\/south-america$/);
  const board = page.getByRole('dialog', { name: 'Leaderboards' });
  await expect(board.locator('tr.you')).toContainText(player.name);
  expect(errors).toEqual([]);
});

test('a paused run is saved unranked', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toContainText('Pausing makes this run unranked.');
  await page.keyboard.press('Escape');
  await typeLikeAPerson(page, SOUTH_AMERICA);
  await expect(page.locator('.savecard')).toContainText('Unranked: paused.');
});

test('a leaderboard link opens that board, and closing it goes home', async ({ page }) => {
  await page.goto('/leaderboards/locate/asia');
  const board = page.getByRole('dialog', { name: 'Leaderboards' });
  await expect(board.getByRole('tab', { name: 'Locate' })).toHaveAttribute('aria-selected', 'true');
  await expect(board.getByRole('button', { name: 'Asia' })).toHaveAttribute('aria-pressed', 'true');
  await board.getByRole('button', { name: 'Europe' }).click();
  await expect(page).toHaveURL(/\/leaderboards\/locate\/europe$/);
  await board.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/localhost:4173\/$/);
  await expect(board).toBeHidden();
});

test('sign in from setup, then sign out', async ({ page }) => {
  const player = await asPlayer(page);
  await openSetup(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sign in' }).getByRole('button', { name: 'Sign in with Google' }).click();
  await pickName(page, player.name);
  const chip = page.locator('.namechip');
  await expect(chip).toContainText(player.name);
  await chip.click();
  await page.getByRole('menuitem', { name: 'Your games' }).click();
  await expect(page.getByRole('dialog', { name: 'Your games' })).toContainText('No saved games yet.');
  await page.keyboard.press('Escape');
  await chip.click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('a lost /finish response is retried once, so the run still saves', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  let attempts = 0;
  await page.route('**/api/games/*/finish', (route) => (++attempts === 1 ? route.abort() : route.continue()));
  await typeLikeAPerson(page, SOUTH_AMERICA);
  await expect(page.locator('.savecard')).toContainText('Sign in to save this run');
  expect(attempts).toBe(2);
});

test('the name card opens by itself once per session, and the menu can still open it', async ({ page }) => {
  await asPlayer(page);
  await openSetup(page);
  await signInFromSetup(page);
  const card = page.getByRole('dialog', { name: 'Pick a name' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'How well do you know the map?' })).toBeVisible();
  await expect(card).toBeHidden();
  await page.locator('.namechip').click();
  await page.getByRole('menuitem', { name: 'Pick a name' }).click();
  await expect(card).toBeVisible();
});

test('a session that has expired shows Sign in again instead of an error', async ({ page }) => {
  const player = await asPlayer(page);
  await openSetup(page);
  await signInFromSetup(page);
  await pickName(page, player.name);
  await page.context().clearCookies();
  await page.locator('.namechip').click();
  await page.getByRole('menuitem', { name: 'Your games' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
});
