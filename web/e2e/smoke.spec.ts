import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke E2E — visit every main page as a logged-in user and assert it RENDERS
 * without crashing. Catches: broken pages (HTTP 5xx), the global error boundary,
 * and uncaught client-side exceptions. Read-only: no data is created or deleted.
 * Any crash also reaches Sentry (real browser + real app code).
 */

// Static routes reachable by an org admin/owner. A non-admin account will be
// redirected away from some (still no crash → the test passes on the redirect).
const PAGES = [
  '/dashboard',
  '/genealogia',
  '/statistiche',
  '/presenze',
  '/lista-contatti',
  '/notifiche',
  '/classifiche',
  '/sette-perche',
  '/report',
  '/analytics',
  '/impostazioni',
  '/org',
  '/admin',
];

/** Fail the test on any uncaught client exception during the navigation. */
async function gotoNoCrash(page: Page, path: string) {
  const clientErrors: string[] = [];
  page.on('pageerror', (e) => clientErrors.push(e.message));

  const resp = await page.goto(path, { waitUntil: 'networkidle' });

  // Server didn't 5xx.
  expect(resp?.status() ?? 0, `HTTP status for ${path}`).toBeLessThan(500);
  // The root error boundary is not showing.
  await expect(
    page.getByText('Qualcosa è andato storto'),
    `error boundary on ${path}`,
  ).toHaveCount(0);
  // No uncaught client-side exceptions.
  expect(clientErrors, `client errors on ${path}`).toEqual([]);
}

for (const path of PAGES) {
  test(`renders ${path}`, async ({ page }) => {
    await gotoNoCrash(page, path);
  });
}

// Exercise a bit of interactive client code (still non-destructive): open the
// anagrafica modal from the profile and close it.
test('profile: open + close anagrafica modal', async ({ page }) => {
  await gotoNoCrash(page, '/impostazioni');
  const openBtn = page.getByRole('button', { name: /anagrafica/i }).first();
  if (await openBtn.count()) {
    await openBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  }
});
