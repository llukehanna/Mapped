import { expect, test, type Page } from '@playwright/test';
import { chooseTopic, openSetup, watchErrors } from './helpers.ts';

const card = (page: Page) => page.locator('.learn-card');

/** Waits for the next question, then returns its flag and the 1–4 key for each answer. */
async function ask(page: Page) {
  await expect(card(page)).toHaveAttribute('data-phase', 'asking');
  const target = (await card(page).getAttribute('data-target-id'))!;
  const ids = await page.locator('.learn-choice').evaluateAll((els) => els.map((b) => (b as HTMLElement).dataset.countryId!));
  const right = String(ids.indexOf(target) + 1);
  const wrong = String(ids.findIndex((id) => id !== target) + 1);
  return { target, right, wrong };
}

async function answerWrong(page: Page, key: string) {
  await page.keyboard.press(key);
  await expect(page.getByRole('button', { name: /^Continue/ })).toBeVisible();
  await page.getByRole('button', { name: /^Continue/ }).click();
}

test('flags · learn: practice is opt-in, drills with requeues, and never talks to the server', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await chooseTopic(page, 'Flags');
  await page.getByRole('button', { name: /^S\. America/ }).click();

  // Play is the default; Learn hides Mode and Time limit and is not ranked.
  const mode = page.getByRole('radiogroup', { name: 'Play or learn' });
  await expect(mode.getByRole('radio', { name: 'Play' })).toHaveAttribute('aria-checked', 'true');
  await mode.getByRole('radio', { name: 'Learn' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Mode' })).toBeHidden();
  await expect(page.getByRole('radiogroup', { name: 'Time limit' })).toBeHidden();
  await expect(page.locator('.setup')).toContainText('Practice · not ranked');
  await expect(page.locator('.setup')).toContainText('0 / 12 learned');
  await expect(page.getByRole('button', { name: /^Start learning/ })).toBeVisible();

  const games: string[] = [];
  page.on('request', (r) => r.url().includes('/api/games') && games.push(r.url()));
  await page.getByRole('button', { name: /^Start learning/ }).click();

  await expect(page.locator('.topbar .pill')).toHaveText('S. America · Flags · Learn');
  await expect(page.locator('.topbar .score')).toHaveText('Learned 0 / 12');
  await expect(card(page).locator('img.flag')).toBeVisible();
  await expect(page.locator('.learn-choice')).toHaveCount(4);

  // Wrong: the right name is shown, Continue waits; the flag comes back 3 cards later.
  const first = await ask(page);
  await page.keyboard.press(first.wrong);
  await expect(card(page)).toContainText(/That's .+ · .+/);
  await expect(page.locator('.learn-choice.right')).toHaveAttribute('data-country-id', first.target);
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.locator('.topbar .score')).toHaveText('Learned 0 / 12');

  const streak: Record<string, number> = {};
  for (let i = 0; i < 3; i++) {
    const q = await ask(page);
    expect(q.target).not.toBe(first.target);
    await page.keyboard.press(q.right);
    streak[q.target] = 1;
  }
  const back = await ask(page);
  expect(back.target).toBe(first.target);
  await page.keyboard.press(back.right);

  // Keep every other flag below two in a row until the first one comes round again and is learned.
  for (let guard = 0; guard < 40; guard++) {
    const q = await ask(page);
    if (q.target === first.target) {
      await page.keyboard.press(q.right);
      break;
    }
    if (streak[q.target] === 1) {
      await answerWrong(page, q.wrong);
      streak[q.target] = 0;
    } else {
      await page.keyboard.press(q.right);
      streak[q.target] = 1;
    }
  }
  await expect(page.locator('.topbar .score')).toHaveText('Learned 1 / 12');

  // Stop: no confirmation, straight to the summary.
  await page.getByRole('button', { name: 'Stop' }).click();
  const summary = page.getByRole('dialog', { name: 'Learn summary' });
  await expect(summary).toContainText(/Learned 1 of 12 flags in \d+:\d\d/);
  await expect(summary).toContainText('Hardest this round');
  await summary.getByRole('button', { name: 'Play Flags' }).click();

  // Play is still there, same region; the learned count stays on this browser.
  await expect(mode.getByRole('radio', { name: 'Play' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /^S\. America/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Mode' })).toBeVisible();
  await expect(page.locator('.setup')).toContainText('S. America · Flags · Type board');
  await mode.getByRole('radio', { name: 'Learn' }).click();
  await expect(page.locator('.setup')).toContainText('1 / 12 learned');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('.setup')).toContainText('0 / 12 learned');

  expect(games).toEqual([]);
  expect(errors).toEqual([]);
});

test('flags · learn: another topic goes back to Play; the summary closes to Learn', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await chooseTopic(page, 'Flags');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  const mode = page.getByRole('radiogroup', { name: 'Play or learn' });
  await mode.getByRole('radio', { name: 'Learn' }).click();
  await chooseTopic(page, 'Countries');
  await expect(mode).toBeHidden();
  await expect(page.getByRole('radiogroup', { name: 'Mode' })).toBeVisible();
  await chooseTopic(page, 'Flags');
  await expect(mode.getByRole('radio', { name: 'Play' })).toHaveAttribute('aria-checked', 'true');

  // Enter starts learning; Esc stops; Esc again closes the summary back to the setup in Learn.
  await mode.getByRole('radio', { name: 'Learn' }).click();
  await page.keyboard.press('Enter');
  await expect(card(page)).toBeVisible();
  const q = await ask(page);
  await page.keyboard.press(q.right);
  await expect(card(page)).toHaveAttribute('data-phase', 'answered');
  await expect(card(page).locator('.learn-line.right')).toHaveText(/^[^']+ · .+$/);
  await expect(page.getByRole('button', { name: /^Continue/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const summary = page.getByRole('dialog', { name: 'Learn summary' });
  await expect(summary).toContainText(/Learned 0 of 12 flags/);
  await expect(summary).not.toContainText('Hardest this round');
  await page.keyboard.press('Escape');
  await expect(summary).toBeHidden();
  await expect(mode.getByRole('radio', { name: 'Learn' })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});
