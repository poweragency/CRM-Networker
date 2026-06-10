import { test as setup, expect } from '@playwright/test';

/**
 * Logs in with the E2E account and saves the authenticated session so the smoke
 * tests don't each re-login (and don't each hit the auth rate limit).
 */
const authFile = 'e2e/.auth/user.json';

setup('login', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error('Imposta le env E2E_EMAIL e E2E_PASSWORD prima di lanciare i test.');
  }

  await page.goto('/accedi');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();

  // Login does a hard navigation to the landing page on success.
  await page.waitForURL(/\/(impostazioni|dashboard|genealogia)/, { timeout: 25_000 });
  await expect(page.locator('body')).toBeVisible();

  await page.context().storageState({ path: authFile });
});
