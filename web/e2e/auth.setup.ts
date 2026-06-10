import { test as setup, expect } from '@playwright/test';

/**
 * Logs in with the E2E account and saves the authenticated session. Robust against
 * the cookie-propagation race (the app's hard redirect can beat the middleware in a
 * fresh browser context): we wait for Supabase's token response, then navigate to
 * the landing OURSELVES once the auth cookie is set. If Supabase rejects the login
 * we surface its exact reason.
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

  // Capture Supabase's auth response (success OR rejection) around the click.
  const tokenRespPromise = page
    .waitForResponse((r) => r.url().includes('/auth/v1/token'), { timeout: 20_000 })
    .catch(() => null);
  await page.locator('button[type="submit"]').click();
  const tokenResp = await tokenRespPromise;

  if (tokenResp && !tokenResp.ok()) {
    const body = await tokenResp.text().catch(() => '');
    throw new Error(
      `Supabase ha RIFIUTATO il login (HTTP ${tokenResp.status()}).\n` +
        `  Risposta: ${body.slice(0, 400)}\n` +
        `  → "invalid_grant / Invalid login credentials" = email o password sbagliata.\n` +
        `  → "email_not_confirmed" = l'account non è confermato.`,
    );
  }
  if (!tokenResp) {
    throw new Error(
      'Nessuna risposta di login da Supabase (createClient nullo / env mancanti, o il form non ha inviato). ' +
        `URL: ${page.url()}`,
    );
  }

  // Auth ok → give the cookie a beat, then navigate ourselves and confirm we're in.
  await page.waitForTimeout(800);
  await page.goto('/impostazioni');
  await page.waitForLoadState('networkidle');

  if (/\/accedi/.test(new URL(page.url()).pathname)) {
    throw new Error(
      `Login accettato da Supabase ma la sessione non regge: rimbalzato a ${page.url()}. ` +
        'Probabile problema di cookie/Site URL.',
    );
  }

  await expect(page.locator('body')).toBeVisible();
  await page.context().storageState({ path: authFile });
});
