'use server';

import { revalidatePath } from 'next/cache';
import { saveOrgTheme, type SaveThemeResult } from '@/lib/data/org-theme';
import type { OrgTheme } from '@/lib/theme';

/**
 * Server action backing the Tema settings card. Persists (or clears) the org
 * theme, then revalidates the app layout so the new CSS variables apply for
 * everyone on next load.
 */
export async function saveOrgThemeAction(
  theme: OrgTheme | null,
): Promise<SaveThemeResult> {
  const res = await saveOrgTheme(theme);
  if (res.ok && !res.demo) revalidatePath('/', 'layout');
  return res;
}
