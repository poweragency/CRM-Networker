import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCallStats, listCalls } from '@/lib/data/calls';
import { listProspects } from '@/lib/data/prospects';
import { listContacts } from '@/lib/data/contacts';
import type { CallWithTarget } from '@/lib/types/db';
import { CallsManager, type CallTargetOption } from '@/components/calls/calls-manager';

/**
 * /chiamate — the call log (CRM, doc 01 §5.3 / ADR-008 slug).
 *
 * Server component. Reads the caller's visible calls + a 30-day stats window +
 * the prospect/contact universe (for the link picker and for resolving each
 * call's target name) through the demo-safe data layer, which falls back to the
 * mock datasets when Supabase env is missing OR a query fails — so this page
 * builds and renders with no env (RESILIENCE). All data access happens here at
 * request time; the interactive table/form receive plain serialized rows and run
 * the mutation through a demo-safe Server Action.
 *
 * Marked dynamic because the data layer reads request cookies/Supabase — this
 * keeps prerender from crashing while still degrading to demo data with no env.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('chiamate');
  return { title: t('title') };
}

export default async function ChiamatePage() {
  // Full recent log + the 30-day stats window + the link/target universe.
  const [callsRes, statsRes, prospectsRes, contactsRes] = await Promise.all([
    listCalls(),
    getCallStats(30),
    listProspects(),
    listContacts({ sortBy: 'first_name', sortDir: 'asc' }),
  ]);

  // Resolve each call's display name from the prospect/contact universe. The
  // mock path already fills `target_name`; the real path leaves it null, so we
  // join here (RSC) and hand the table fully-resolved rows.
  const prospectName = new Map(prospectsRes.data.map((p) => [p.id, p.full_name]));
  const contactName = new Map(
    contactsRes.data.map((c) => [
      c.id,
      `${c.first_name} ${c.last_name ?? ''}`.trim(),
    ]),
  );

  const calls: CallWithTarget[] = callsRes.data.map((c) => ({
    ...c,
    target_name:
      c.target_name ??
      (c.prospect_id ? prospectName.get(c.prospect_id) : undefined) ??
      (c.contact_id ? contactName.get(c.contact_id) : undefined) ??
      null,
  }));

  // Prospect options for the searchable link picker in the "Registra chiamata"
  // form (open + recent first; the picker filters client-side).
  const prospectOptions: CallTargetOption[] = prospectsRes.data.map((p) => ({
    id: p.id,
    name: p.full_name,
    stage: p.current_stage,
  }));

  const initialDemo =
    callsRes.demo || statsRes.demo || prospectsRes.demo || contactsRes.demo;

  return (
    <CallsManager
      initialCalls={calls}
      initialStats={statsRes.data}
      prospectOptions={prospectOptions}
      initialDemo={initialDemo}
    />
  );
}
