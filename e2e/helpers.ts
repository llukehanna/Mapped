import { expect, type Page } from '@playwright/test';

/** Fails the test on any console error or CSP violation. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function openSetup(page: Page, seed = 1) {
  await page.goto(`/?seed=${seed}`);
  await expect(page.locator('path.shape').first()).toBeAttached();
  await expect(page.getByRole('heading', { name: 'How well do you know the map?' })).toBeVisible();
}

/** Picks one subregion only (the setup starts on World). */
export async function chooseSubregion(page: Page, name: string) {
  await page.getByRole('button', { name: /Subregions/ }).click();
  await page.getByRole('button', { name: new RegExp(`^${name} \\d+$`) }).click();
}

export async function chooseMode(page: Page, mode: 'Type' | 'Locate' | 'Identify') {
  await page.getByRole('radio', { name: new RegExp(`^${mode}`) }).click();
}

export async function start(page: Page) {
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.locator('.topbar')).toBeVisible();
}

/** Clicks a point where `id` is the topmost shape, once the map has stopped moving. */
export async function clickCountry(page: Page, id: string) {
  // Let any framing animation (550 ms) finish so the point we find stays on the country.
  await page.waitForTimeout(700);
  const point = await page.waitForFunction((id) => {
    const box = document.querySelector(`path.shape[data-id="${id}"]`)?.getBoundingClientRect();
    if (!box || box.width < 2) return null;
    // Sample a grid over the bounding box, nearest the center first (outlying islands make the center ocean).
    const points: [number, number][] = [];
    for (let fy = 0.02; fy < 1; fy += 0.04) for (let fx = 0.02; fx < 1; fx += 0.04) points.push([fx, fy]);
    points.sort((a, b) => Math.hypot(a[0] - 0.5, a[1] - 0.5) - Math.hypot(b[0] - 0.5, b[1] - 0.5));
    for (const [fx, fy] of points) {
      const [x, y] = [box.x + box.width * fx, box.y + box.height * fy];
      if ((document.elementFromPoint(x, y) as HTMLElement | null)?.dataset.id === id) return { x, y };
    }
    return null;
  }, id);
  const { x, y } = (await point.jsonValue())!;
  await page.mouse.click(x, y);
}

/** A unique player for this test: fake sign-in uses the `mapped_fake_as` cookie as the Google account. */
export async function asPlayer(page: Page) {
  const tag = `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e4)}`;
  const email = `p${tag}@example.com`;
  await page.context().addCookies([{ name: 'mapped_fake_as', value: email, url: 'http://localhost:4173' }]);
  return { email, name: `p${tag}` };
}

/** Types each name at a believable human pace, so the server ranks the run. */
export async function typeLikeAPerson(page: Page, names: string[]) {
  const input = page.getByLabel('Country name');
  for (const name of names) {
    await input.pressSequentially(name.toLowerCase(), { delay: 25 });
    await page.waitForTimeout(250);
  }
}

export async function pickName(page: Page, name: string) {
  const card = page.getByRole('dialog', { name: 'Pick a name' });
  await card.getByLabel('Display name').fill(name);
  await expect(card.getByText('✓ Available')).toBeVisible();
  await card.getByRole('button', { name: 'Done' }).click();
  await expect(card).toBeHidden();
}

/** Signs in from the setup card with the fake Google account `asPlayer` set up; lands on the name card. */
export async function signInFromSetup(page: Page) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sign in' }).getByRole('button', { name: 'Sign in with Google' }).click();
}
