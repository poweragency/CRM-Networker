import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * /api/health — lightweight liveness probe for an external uptime monitor
 * (UptimeRobot, Better Stack, …). No auth, no DB query: it just proves the Next
 * server is up and answering, and reports whether the Supabase env is wired (so a
 * mis-deployed build is visible). Always dynamic so it actually exercises the
 * server on each ping. Returns 200 when healthy.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', configured: isSupabaseConfigured });
}
