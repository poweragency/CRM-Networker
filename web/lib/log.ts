/**
 * Minimal structured logger — the single observability sink for the app.
 *
 * Writes to stdout/stderr, which Vercel captures into queryable Function Logs (and
 * the browser console on the client). The point is that swallowed/handled errors
 * STOP being invisible: data-layer catch blocks that degrade to a fallback should
 * still `logError(...)` so a real failure is diagnosable in production.
 *
 * Deliberately dependency-free. To ship to Sentry/Logtail later, route the three
 * `emit` calls here — no call site changes needed.
 */

type LogMeta = Record<string, unknown>;

function serializeError(err: unknown): LogMeta {
  if (err instanceof Error) {
    return { error: err.name, message: err.message, stack: err.stack };
  }
  if (err && typeof err === 'object') {
    try {
      return { error: JSON.stringify(err) };
    } catch {
      return { error: String(err) };
    }
  }
  return { error: String(err) };
}

/** Log a handled/swallowed error with its scope so it is diagnosable in prod. */
export function logError(scope: string, err: unknown, meta?: LogMeta): void {
  // eslint-disable-next-line no-console
  console.error(`[powernetwork:${scope}]`, { ...serializeError(err), ...(meta ?? {}) });
}

/** Log a non-fatal warning (degraded behaviour, suspicious input, etc.). */
export function logWarn(scope: string, message: string, meta?: LogMeta): void {
  // eslint-disable-next-line no-console
  console.warn(`[powernetwork:${scope}] ${message}`, meta ?? {});
}
