/**
 * i18n configuration. v1 ships Italian only (`it` is the source catalog).
 * ADR-008: slugs are NOT translated per-locale and there is no `[locale]` path
 * segment — `next-intl` localizes content only. The structure stays i18n-ready
 * for future locales without restructuring nav.
 */
export const locales = ['it'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'it';
