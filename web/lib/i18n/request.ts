import { getRequestConfig } from 'next-intl/server';
import { defaultLocale } from './config';

/**
 * next-intl request config (referenced by next.config.mjs).
 * Single-locale (`it`) setup: no locale negotiation, no locale path segment
 * (ADR-008). Loads the Italian message catalog for every request.
 */
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  const messages = (await import(`@/messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: 'Europe/Rome',
  };
});
