import { redirect } from 'next/navigation';

/**
 * /percorso-prospect — the standalone kanban no longer exists. The prospect board
 * lives INSIDE each marketer profile (your own → /impostazioni, a downline →
 * /team/[id]), under the "Percorsi informativi" tab. Any direct visit (or a stale
 * link / notification) is sent to the caller's own Percorsi tab.
 */
export default function PercorsoProspectIndex() {
  redirect('/impostazioni?tab=prospects');
}
