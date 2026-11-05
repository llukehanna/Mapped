import { expect, test, type Page } from '@playwright/test';
import { SEAS } from '../src/data/seas.ts';
import { chooseMode, chooseTopic, clickCountry, openSetup, pointOn, start, watchErrors } from './helpers.ts';

const NAME = new Map(SEAS.map((s) => [s.id, s.name]));

async function startSeas(page: Page, mode: 'Type' | 'Locate' | 'Identify' = 'Type') {
  await openSetup(page);
  await chooseTopic(page, 'Seas');
  await expect(page.locator('path.shape[data-id="pac"]')).toBeAttached();
  if (mode !== 'Type') await chooseMode(page, mode);
  await start(page);
}

test('seas setup: the sea data loads only for Seas, which has no regions', async ({ page }) => {
  const errors = watchErrors(page);
  const seaRequests: string[] = [];
  page.on('request', (r) => r.url().includes('seas.topo') && seaRequests.push(r.url()));
  await openSetup(page);
  await page.getByRole('button', { name: /^Europe/ }).click();
  await page.waitForTimeout(300);
  expect(seaRequests).toEqual([]);
  await chooseTopic(page, 'Seas');
  await expect.poll(() => seaRequests.length).toBeGreaterThan(0);
  await expect(page.locator('path.shape[data-id="pac"]')).toBeAttached();
  await expect(page.getByRole('group', { name: 'Regions' })).toHaveCount(0);
  await expect(page.locator('.setup')).toContainText('World · Seas · Type board');
  await expect(page.locator('.setup')).toContainText('55 seas');
  await expect(page.getByRole('radio', { name: /^Locate/ })).toContainText('Click the named sea');
  await chooseTopic(page, 'Countries');
  await expect(page.getByRole('group', { name: 'Regions' }).getByRole('button', { name: /^World/ })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('seas type: names count, short forms too; gulfs get a note and countries nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await startSeas(page);
  await expect(page.locator('.topbar .pill')).toHaveText('World · Seas · Type');
  const input = page.getByLabel('Sea name');
  await expect(input).toHaveAttribute('placeholder', 'Type a sea…');
  const score = page.locator('.topbar .score');
  await input.fill('Mediterranean');
  await expect(score).toHaveText('1 / 55');
  await input.fill('pacific');
  await expect(score).toHaveText('2 / 55');
  await input.fill('Gulf of Mexico');
  await expect(page.getByRole('status').filter({ hasText: 'Gulf of Mexico: a gulf, not on the list' })).toBeVisible();
  await expect(score).toHaveText('2 / 55');
  // Once that note is gone, a country name says nothing at all.
  await expect(page.getByRole('status')).toHaveCount(0);
  await input.fill('France');
  await input.press('Enter');
  await page.waitForTimeout(800);
  await expect(score).toHaveText('2 / 55');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('seas locate: clicking the named sea scores', async ({ page }) => {
  const errors = watchErrors(page);
  await startSeas(page, 'Locate');
  const target = (await page.locator('.prompt').getAttribute('data-target-id'))!;
  expect(NAME.has(target)).toBe(true);
  await expect(page.locator('.prompt-name')).toHaveText(NAME.get(target)!);
  await clickCountry(page, target);
  await expect(page.locator('.topbar .score')).toHaveText('1 / 55');
  expect(errors).toEqual([]);
});

test('seas locate: clicking land costs nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await startSeas(page, 'Locate');
  await page.waitForTimeout(700);
  // Inland Australia: between the Timor Sea and the Coral Sea, at the Coral Sea's middle latitudes (around Alice Springs).
  const point = await page.evaluate(() => {
    const box = (id: string) => document.querySelector(`path.shape[data-id="${id}"]`)!.getBoundingClientRect();
    const [timor, coral] = [box('timor'), box('coral')];
    const [x0, x1, y0, y1] = [timor.right, coral.left, coral.top + coral.height * 0.4, coral.bottom - coral.height * 0.2];
    const points: [number, number][] = [];
    for (let fy = 0; fy <= 1; fy += 0.1) for (let fx = 0; fx <= 1; fx += 0.1) points.push([x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy]);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    points.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    return points.map(([x, y]) => ({ x, y })).find(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('cover')) ?? null;
  });
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await page.waitForTimeout(300);
  await expect(page.getByLabel('3 tries left')).toBeVisible();
  await expect(page.locator('.topbar .score')).toHaveText('0 / 55');
  expect(errors).toEqual([]);
});

test('seas identify: name the lit-up sea; hatched water takes no clicks', async ({ page }) => {
  const errors = watchErrors(page);
  await startSeas(page, 'Identify');
  const input = page.getByLabel('Sea name');
  await expect(input).toHaveAttribute('placeholder', 'Name the highlighted sea…');
  const target = (await page.locator('.guess').getAttribute('data-target-id'))!;
  expect(NAME.has(target)).toBe(true);
  await input.fill(NAME.get(target)!);
  await expect(page.locator('.topbar .score')).toHaveText('1 / 55');
  expect(await page.locator('path.water').count()).toBeGreaterThan(0);
  await expect(page.locator('path.water').first()).toHaveCSS('pointer-events', 'none');
  expect(errors).toEqual([]);
});

test('seas review: missed seas by basin, named with their basin on hover', async ({ page }) => {
  const errors = watchErrors(page);
  await startSeas(page);
  await page.getByRole('button', { name: 'Give up' }).click();
  await page.getByRole('alertdialog', { name: 'Give up?' }).getByRole('button', { name: 'Give up' }).click();
  const review = page.getByRole('complementary', { name: 'Missed seas' });
  await expect(review).toBeVisible();
  await expect(review.getByText('Missed · 55')).toBeVisible();
  await expect(review.locator('.review-group-label').filter({ hasText: /^Mediterranean · 7$/ })).toBeVisible();
  await expect(review.locator('.review-item').filter({ hasText: /^Aegean Sea$/ })).toBeVisible();
  const { x, y } = await pointOn(page, 'aegean');
  await page.mouse.move(x, y);
  await expect(page.locator('.tip')).toHaveText('Aegean Sea · Mediterranean');
  expect(errors).toEqual([]);
});

test('seas setup: Start waits for the sea map, and says so if it fails', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/seas.topo-*.json', async (route) => {
    await held;
    await route.continue();
  });
  await openSetup(page);
  await chooseTopic(page, 'Seas');
  const go = page.locator('.setup .start');
  await expect(go).toBeDisabled();
  await expect(page.locator('.setup')).toContainText('Loading the seas…');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await expect(page.locator('.topbar')).toHaveCount(0);
  release();
  await expect(go).toBeEnabled();
  await expect(page.locator('.setup')).not.toContainText('Loading the seas…');
  await start(page);
  await expect(page.locator('.topbar .score')).toHaveText('0 / 55');
});

test('seas setup: a failed sea map keeps Start off and shows why', async ({ page }) => {
  await page.route('**/seas.topo-*.json', (route) => route.fulfill({ status: 500, body: '' }));
  await openSetup(page);
  await chooseTopic(page, 'Seas');
  await expect(page.locator('.setup')).toContainText('Sea data failed to load (500). Reload to try again.');
  // Said once, on the card: not again in the middle of the map.
  await expect(page.getByText('Sea data failed to load (500). Reload to try again.')).toHaveCount(1);
  await expect(page.locator('.setup .start')).toBeDisabled();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await expect(page.locator('.topbar')).toHaveCount(0);
  // Countries still plays.
  await chooseTopic(page, 'Countries');
  await expect(page.locator('.setup .start')).toBeEnabled();
});

test('seas identify: By region starts closed; a lit target under the open panel is brought into view', async ({ page }) => {
  const errors = watchErrors(page);
  // Seed 180 orders the seas Barents Sea, then Amundsen Sea (under the panel's corner at world zoom).
  await page.route('**/api/games', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), seed: 180 } });
  });
  await startSeas(page, 'Identify');
  await expect(page.locator('.guess')).toHaveAttribute('data-target-id', 'barents');
  const head = page.locator('.progress-head');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.guess')).toHaveAttribute('data-target-id', 'amundsen');
  await page.waitForTimeout(1200);
  const sea = (await page.locator('path.shape[data-id="amundsen"]').boundingBox())!;
  const panel = (await page.locator('.progress').boundingBox())!;
  const overlaps = sea.x < panel.x + panel.width && panel.x < sea.x + sea.width && sea.y < panel.y + panel.height && panel.y < sea.y + sea.height;
  expect(overlaps).toBe(false);
  expect(errors).toEqual([]);
});

/** How many points of a grid over the viewport (between the top bar and the dock) fall inside the sea as drawn. */
const onScreen = (page: Page, id: string) =>
  page.evaluate((id) => {
    const el = document.querySelector<SVGPathElement>(`path.shape[data-id="${id}"]`)!;
    const toLocal = el.getScreenCTM()!.inverse();
    let hits = 0;
    for (let i = 0.5; i < 64; i++)
      for (let j = 0.5; j < 40; j++) {
        const [x, y] = [(innerWidth * i) / 64, 80 + ((innerHeight - 200) * j) / 40];
        if (el.isPointInFill(new DOMPoint(x, y).matrixTransform(toLocal))) hits += 1;
      }
    return hits;
  }, id);

test('seas identify: a lit sea split by the map edge is brought into view when zoomed in elsewhere', async ({ page }) => {
  const errors = watchErrors(page);
  // Seed 322 orders the seas Mediterranean, then the Pacific (drawn in two pieces at the map's left and right edges).
  await page.route('**/api/games', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), seed: 322 } });
  });
  await startSeas(page, 'Identify');
  await expect(page.locator('.guess')).toHaveAttribute('data-target-id', 'med');
  await page.waitForTimeout(800);
  // Zoom in on the middle of the map (Africa): the Pacific's latitudes, but none of its water.
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  expect(await onScreen(page, 'pac')).toBe(0);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.guess')).toHaveAttribute('data-target-id', 'pac');
  await page.waitForTimeout(1200);
  expect(await onScreen(page, 'pac')).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
