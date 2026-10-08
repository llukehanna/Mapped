import { expect, test } from '@playwright/test';
import { chooseMode, chooseTopic, openSetup, start, typeLikeAPerson, watchErrors } from './helpers.ts';

const SOUTH_AMERICA: Record<string, string> = {
  ARG: 'Argentina', BOL: 'Bolivia', BRA: 'Brazil', CHL: 'Chile', COL: 'Colombia', ECU: 'Ecuador',
  GUY: 'Guyana', PRY: 'Paraguay', PER: 'Peru', SUR: 'Suriname', URY: 'Uruguay', VEN: 'Venezuela',
};

test('setup: the topic changes the mode blurbs and the board', async ({ page }) => {
  await openSetup(page);
  const topics = page.getByRole('group', { name: 'Topic' });
  await expect(topics.getByRole('button', { name: 'Countries' })).toHaveAttribute('aria-pressed', 'true');
  await chooseTopic(page, 'Capitals');
  await expect(topics.getByRole('button', { name: 'Capitals' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radio', { name: /^Type/ })).toContainText('Name every capital');
  await expect(page.locator('.setup')).toContainText('World · Capitals · Type board');
  await chooseTopic(page, 'Countries');
  await expect(page.getByRole('radio', { name: /^Type/ })).toContainText('Name them all, any order');
  await expect(page.locator('.setup')).toContainText('World · Type board');
});

test('flags · type: a flag at a time; typing its country moves on', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await chooseTopic(page, 'Flags');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await expect(page.locator('.setup')).toContainText('S. America · Flags · Type board');
  await start(page);
  await expect(page.locator('.topbar .pill')).toHaveText('S. America · Flags · Type');
  const flag = page.locator('.flag-card img');
  const first = await page.locator('.guess').getAttribute('data-target-id');
  await expect(flag).toHaveAttribute('src', `/flags/${first}.svg`);
  await expect(page.getByLabel('Country name')).toHaveAttribute('placeholder', 'Type the country…');
  await typeLikeAPerson(page, [SOUTH_AMERICA[first!]]);
  await expect(page.locator('.topbar .score')).toHaveText('1 / 12');
  await expect(page.getByRole('status').filter({ hasText: SOUTH_AMERICA[first!] })).toBeVisible();
  await expect(page.locator('.guess')).not.toHaveAttribute('data-target-id', first!);
  // Skip reveals the country.
  const second = (await page.locator('.guess').getAttribute('data-target-id'))!;
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('status').filter({ hasText: `It was ${SOUTH_AMERICA[second]}` })).toBeVisible();
  expect(errors).toEqual([]);
});

test('flags · identify: pick with the number keys; a wrong pick costs a try', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await chooseTopic(page, 'Flags');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await chooseMode(page, 'Identify');
  await start(page);
  const choices = page.locator('.flag-choices button');
  await expect(choices).toHaveCount(4);
  await expect(choices.nth(0)).toHaveAccessibleName('Flag 1');
  const target = await page.locator('.flag-choices').getAttribute('data-target-id');
  const srcs = await choices.evaluateAll((els) => els.map((b) => b.querySelector('img')!.getAttribute('src')));
  const right = srcs.indexOf(`/flags/${target}.svg`);
  expect(right).toBeGreaterThanOrEqual(0);
  const wrong = srcs.findIndex((s) => s !== `/flags/${target}.svg`);
  await page.keyboard.press(String(wrong + 1));
  await expect(page.locator('.flag-choices .tries i.on')).toHaveCount(2);
  await expect(choices.nth(wrong)).toBeDisabled();
  await page.keyboard.press(String(right + 1));
  await expect(page.locator('.topbar .score')).toHaveText('1 / 12');
  expect(errors).toEqual([]);
});

test('flags · identify: each hint takes away a wrong flag', async ({ page }) => {
  await openSetup(page);
  await chooseTopic(page, 'Flags');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await chooseMode(page, 'Identify');
  await start(page);
  const choices = page.locator('.flag-choices button');
  await expect(choices).toHaveCount(4);
  await page.keyboard.press('?');
  await expect(page.locator('.flag-choices button:disabled')).toHaveCount(1);
  await page.keyboard.press('?');
  await expect(page.locator('.flag-choices button:disabled')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Hints' })).toContainText('2/2');
  // The right flag is never taken away.
  const target = await page.locator('.flag-choices').getAttribute('data-target-id');
  await expect(page.locator(`.flag-choices button:not(:disabled) img[src="/flags/${target}.svg"]`)).toHaveCount(1);
});

test('capitals · type: a capital lights up its country', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await chooseTopic(page, 'Capitals');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  const input = page.getByRole('textbox');
  await expect(input).toHaveAccessibleName('Capital');
  await expect(input).toHaveAttribute('placeholder', 'Type a capital…');
  await typeLikeAPerson(page, ['lima', 'quito'], 'Capital');
  await expect(page.locator('.topbar .score')).toHaveText('2 / 12');
  await expect(page.getByRole('status').filter({ hasText: 'Quito · Ecuador' })).toBeVisible();
  await typeLikeAPerson(page, ['nairobi'], 'Capital');
  await expect(page.locator('.toast')).toContainText("Nairobi is Kenya's capital, which isn't in this quiz");
  expect(errors).toEqual([]);
});

test('capitals · locate: the prompt names the capital', async ({ page }) => {
  await openSetup(page);
  await chooseTopic(page, 'Capitals');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await chooseMode(page, 'Locate');
  await start(page);
  const prompt = page.locator('.prompt');
  await expect(prompt).toContainText('Whose capital is');
  const id = await prompt.getAttribute('data-target-id');
  const capitals: Record<string, string> = {
    ARG: 'Buenos Aires', BOL: 'Sucre', BRA: 'Brasília', CHL: 'Santiago', COL: 'Bogotá', ECU: 'Quito',
    GUY: 'Georgetown', PRY: 'Asunción', PER: 'Lima', SUR: 'Paramaribo', URY: 'Montevideo', VEN: 'Caracas',
  };
  await expect(prompt.locator('.prompt-name')).toHaveText(capitals[id!]);
});
