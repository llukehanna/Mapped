import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  // The real Worker and a fresh local D1, with fake sign-in (localhost only).
  webServer: {
    command: 'npm run build && npm run serve:e2e',
    port: 4173,
    // Never reuse a stale server on 4173: the tests need a fresh local D1 and the current build.
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /phone/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone/ },
  ],
});
