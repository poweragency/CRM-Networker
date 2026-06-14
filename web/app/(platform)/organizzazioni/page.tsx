import type { Metadata } from 'next';
import { listOrgsForPlatform } from '@/lib/data/platform';
import { OrgManager } from '@/components/platform/org-manager';

/**
 * /organizzazioni — super-admin org management (list + search + create + suspend).
 * RSC: fetches all orgs via the platform RPC (self-gated on is_platform_admin).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Organizzazioni' };

export default async function OrganizzazioniPage() {
  const { data } = await listOrgsForPlatform();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Organizzazioni</h1>
        <p className="text-sm text-muted-foreground">
          Crea, cerca e sospendi le organizzazioni della piattaforma.
        </p>
      </div>
      <OrgManager initial={data} />
    </div>
  );
}
