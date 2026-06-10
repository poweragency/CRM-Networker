import { corsBaseHeaders } from './cors.ts';

// Small response helpers so every function returns CORS-safe JSON / files and a
// consistent error envelope { error: <code>, message?: <detail> }. The per-request
// Access-Control-Allow-Origin is stamped by withCors() (see cors.ts FINDING #8).

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsBaseHeaders, 'Content-Type': 'application/json' },
  });
}

export function error(code: string, status = 400, message?: string): Response {
  return json({ error: code, ...(message ? { message } : {}) }, status);
}

/** A downloadable file response (used by the export renderer). */
export function fileResponse(
  bytes: Uint8Array | string,
  filename: string,
  contentType: string,
): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsBaseHeaders,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/** Map a Postgres/RPC error code to an HTTP status + stable error code. */
export function mapPgError(message: string): { status: number; code: string } {
  const m = message.toLowerCase();
  if (m.includes('not_crm_eligible') || m.includes('42501') || m.includes('forbidden'))
    return { status: 403, code: 'forbidden' };
  if (m.includes('expired')) return { status: 410, code: 'invitation_expired' };
  if (m.includes('invalid token') || m.includes('no_data_found'))
    return { status: 404, code: 'invalid_token' };
  if (m.includes('already accepted') || m.includes('unique_violation') || m.includes('23505'))
    return { status: 409, code: 'conflict' };
  return { status: 400, code: 'bad_request' };
}
