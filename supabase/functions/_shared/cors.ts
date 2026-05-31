// Shared CORS handling for the CRM Networker Edge Functions (Deno).
// The frontend (Next.js on a Vercel/preview origin) invokes these via
// supabase-js `functions.invoke`, which sends a preflight OPTIONS; reply to it
// here and echo the headers on every response.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Returns a 204 preflight response when the request is an OPTIONS, else null. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}
