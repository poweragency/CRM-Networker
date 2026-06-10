'use client';

import * as React from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * CycleReportButton — "Scarica report ciclo XX" on the dashboard. XX is the
 * just-completed (previous) cycle; the button stays available for the whole
 * current cycle. A dialog collects the rank realised in that cycle (shown
 * award-style in the PDF), then opens the printable report in a new tab.
 */
export function CycleReportButton({ prevCycleNumber }: { prevCycleNumber: number }) {
  const [open, setOpen] = React.useState(false);
  const [rank, setRank] = React.useState('');

  function download() {
    const url = `/report/ciclo/${prevCycleNumber}?rank=${encodeURIComponent(rank.trim())}`;
    window.open(url, '_blank', 'noopener');
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <FileDown className="h-4 w-4" aria-hidden />
        Scarica report ciclo {prevCycleNumber}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Report ciclo ${prevCycleNumber}`}
        description="Inserisci il rank realizzato nel ciclo: comparirà nel report in stile award. Puoi anche lasciarlo vuoto."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-rank">Rank realizzato</Label>
            <Input
              id="report-rank"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              placeholder="es. Manager, Director, Diamond…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  download();
                }
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button onClick={download} className="gap-2">
              <FileDown className="h-4 w-4" aria-hidden />
              Genera report
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
