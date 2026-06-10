'use client';

import * as React from 'react';
import { Loader2, Share2 } from 'lucide-react';
import { RANK_LABELS, type MarketerRank } from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import { downloadReportCard, REPORT_RANKS } from '@/lib/report-card';
import { fetchCycleReportAction } from '@/app/(app)/dashboard/actions';

/**
 * CycleReportButton — "Scarica report ciclo XX" on the dashboard. XX is the
 * just-completed (previous) cycle; the button stays available for the whole
 * current cycle. Pick the rank realised in the cycle, then it generates a hype
 * Instagram-Story image (1080×1920, branded with the rank colour) and downloads
 * it directly — ready to post.
 */
export function CycleReportButton({ prevCycleNumber }: { prevCycleNumber: number }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [rank, setRank] = React.useState<MarketerRank>('executive');
  const [busy, setBusy] = React.useState(false);

  async function generate() {
    setBusy(true);
    try {
      const report = await fetchCycleReportAction(prevCycleNumber);
      downloadReportCard({ rank, cycleNumber: prevCycleNumber, report });
      setOpen(false);
    } catch {
      toast({ title: 'Impossibile generare il riconoscimento.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Share2 className="h-4 w-4" aria-hidden />
        Scarica report ciclo {prevCycleNumber}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Riconoscimento ciclo ${prevCycleNumber}`}
        description="Scegli il rank realizzato: genera un'immagine in formato storia (1080×1920) brandizzata col colore del rank, pronta da postare."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-rank">Rank realizzato</Label>
            <select
              id="report-rank"
              value={rank}
              onChange={(e) => setRank(e.target.value as MarketerRank)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REPORT_RANKS.map((r) => (
                <option key={r} value={r}>
                  {RANK_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={generate} disabled={busy} className="gap-2">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Share2 className="h-4 w-4" aria-hidden />
              )}
              Scarica immagine
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
