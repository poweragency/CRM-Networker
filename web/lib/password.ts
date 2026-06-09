/**
 * Lightweight password-strength gate used wherever a password is SET (reset,
 * invitation accept, admin account creation). Goal: stop trivially-weak/common
 * passwords (e.g. "aaaaaaaa") from ever being saved, so the browser's
 * compromised-password warning never has a reason to fire. This is OUR check
 * (instant, surfaced as an inline banner); Supabase's optional "leaked password
 * protection" is the server-side breach check on top.
 *
 * Shared by client forms and server actions — keep it dependency-free.
 */

export const PASSWORD_MIN_LENGTH = 8;

// A small blacklist of the most common/banned passwords (lowercased). Not
// exhaustive — the all-same-char and sequence checks below catch the rest of the
// obvious cases (aaaaaaaa, 12345678, abcdefgh, …).
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'passw0rd', 'qwerty', 'qwertyui', 'qwerty123',
  '12345678', '123456789', '1234567890', '123123123', 'abc12345', 'abcd1234',
  'iloveyou', 'admin123', 'welcome1', 'letmein1', 'changeme', 'football',
  'superman', 'trustno1', 'whatever', 'password123', 'qazwsxedc',
]);

/** Is the string a pure ascending/descending run (1234…, abcd…, 8765…)? */
function isSequential(s: string): boolean {
  if (s.length < 4) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

export type PasswordWeakness = 'short' | 'common';

/**
 * Returns the reason a password is too weak, or null if acceptable.
 * - `short`  → under {@link PASSWORD_MIN_LENGTH} characters
 * - `common` → blacklisted, a single repeated character, or a simple sequence
 */
export function passwordWeakness(password: string): PasswordWeakness | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return 'short';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'common';
  if (/^(.)\1+$/.test(password)) return 'common'; // all the same character
  if (isSequential(lower)) return 'common';
  return null;
}
