import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * TEMPORARY — /api/sentry-test. Visit this URL once to confirm Sentry is wired
 * end-to-end: it sends a single (harmless) test event, then you should see it in
 * the Sentry dashboard within seconds. REMOVE this route after verifying.
 *
 * `Sentry.flush()` is important on Vercel serverless: it forces the event to be
 * delivered before the function freezes (a fire-and-forget capture can be dropped).
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  Sentry.captureException(
    new Error('Sentry test event — innocuo, serve solo a verificare il monitoraggio errori.'),
  );
  const delivered = await Sentry.flush(2000);
  return NextResponse.json({
    sent: delivered,
    note: delivered
      ? 'Evento inviato. Controlla la dashboard Sentry (Issues). Poi rimuovi questa route.'
      : 'Flush non confermato: il DSN è impostato e il deploy aggiornato?',
  });
}
