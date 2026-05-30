/**
 * Minimal class-name joiner. (Full cn() with tailwind-merge comes with the
 * shadcn/ui layer in a later phase — kept dependency-free for the scaffold.)
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
