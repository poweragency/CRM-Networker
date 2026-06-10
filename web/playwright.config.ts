import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright smoke E2E for the CRM. Drives a REAL browser through the login +
 * main pages, so any client/server crash surfaces (and lands in Sentry). It is
 * READ-ONLY by design — no add/remove/delete — so it's safe to run against
 * production. Destructive flows are tested manually.
 *
 * Required env: E2E_EMAIL, E2E_PASSWORD (a real account on the target).
 * Optional:     E2E_BASE_URL (default = production URL below).
 * One-time:     `npx playwright install chromium`
 * Run:          `npm run test:e2e`
 */
const baseURL = process.env.E2E_BASE_URL ?? 'https://crm-networker.vercel.app';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    // Logs in once and saves the session for the other tests to reuse.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
    // A mobile profile to catch viewport-specific crashes (Samsung ≈ Chrome Android).
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
});
