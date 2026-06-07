import { Suspense } from 'react';
import { getCurrentClaims } from '@/lib/data/session';
import { getRootMarketer, getSubtree } from '@/lib/data/genealogy';
import { GenealogyView } from '@/components/genealogy/genealogy-view';
import { GenealogySkeleton } from '@/components/genealogy/genealogy-skeleton';
import type { TreeNode } from '@/lib/types/db';

/**
 * /genealogia — the binary genealogy centerpiece (doc 14).
 *
 * Server component. Reads the caller's claims and the initial tree window
 * (root + ≤4 levels) through the demo-safe data layer, which falls back to the
 * mock binary tree when Supabase env is missing OR a query fails — so this page
 * builds and renders with no env (RESILIENCE). All Supabase access happens here at
 * request time; the client view receives a plain serialized node list.
 *
 * Marked dynamic because the data layer reads request cookies/Supabase — this
 * keeps prerender from crashing while still degrading to demo data with no env.
 */
export const dynamic = 'force-dynamic';

export default async function GenealogiaPage() {
  const { claims, demo: claimsDemo } = await getCurrentClaims();

  // Seed the client with the root + a BOUNDED window (~300 nodes by BFS) instead of
  // the whole org — deeper people are reached on demand via search (revealNode loads
  // just their path + neighborhood). `rollup:true` stamps each node's whole-subtree
  // prospect total server-side, so the numbers stay correct without loading everyone.
  const rootRes = await getRootMarketer();
  const root = rootRes.data;

  const subtreeRes = await getSubtree(root.id, 'GLOBAL', undefined, {
    limit: 300,
    rollup: true,
  });

  // De-dupe (the subtree already includes the root) into a stable pre-order list.
  const byId = new Map<string, TreeNode>();
  byId.set(root.id, root);
  for (const n of subtreeRes.data) byId.set(n.id, n);
  const initialNodes = Array.from(byId.values());

  const initialDemo = claimsDemo || rootRes.demo || subtreeRes.demo;

  return (
    <Suspense fallback={<GenealogySkeleton />}>
      <GenealogyView
        initialNodes={initialNodes}
        rootId={root.id}
        initialDemo={initialDemo}
        claims={{ role: claims.role, rank: claims.rank }}
      />
    </Suspense>
  );
}
