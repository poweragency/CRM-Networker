'use client';

import * as React from 'react';
import { AlertTriangle, CalendarClock, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import { updateOrgCycleAction } from '@/app/(app)/org/cycle-actions';

/**
 * CycleSettings — org card (on /org) to set the 28-day company-cycle anchor: the
 * current cycle number + its end date/time (= reset point, from which the next
 * 28-day cycles run). Pre-filled with the effective current cycle.
 */

function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CycleSettings({
  currentNumber,
  currentEndIso,
}: {
  currentNumber: number | null;
  currentEndIso: string | null;
}) {
  const { toast } = useToast();
  const [num, setNum] = React.useState<number | ''>(currentNumber ?? '');
  const [end, setEnd] = React.useState(isoToLocalInput(currentEndIso));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (num === '' || !end) {
      setError('Inserisci il numero del ciclo e la data/ora di fine.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const cycle = { anchor_end: new Date(end).toISOString(), anchor_number: Number(num) };
      const res = await updateOrgCycleAction(cycle);
      toast({
        title: res.ok ? 'Ciclo aziendale aggiornato' : 'Errore nel salvataggio',
        description: res.demo ? 'Modalità demo (simulato)' : undefined,
        variant: res.ok ? 'success' : 'error',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-warning/45 bg-warning/[0.025] shadow-sm">
      <CardHeader className="space-y-3 p-5 pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-warning" aria-hidden />
          Ciclo aziendale
        </CardTitle>
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/45 bg-warning/10 px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="leading-relaxed">
            <strong>Non toccare</strong> se non per un <strong>cambio aziendale ufficiale</strong>{' '}
            (es. allungare il ciclo per un evento). Cambiare queste date{' '}
            <strong>sposta l&apos;azzeramento di TUTTE le statistiche</strong> del ciclo.
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          I cicli durano <strong>28 giorni</strong> (non i mesi solari). Numero e data/ora di
          fine indicano il ciclo ATTUALE: da lì le statistiche &laquo;del ciclo&raquo; si
          azzerano e ripartono.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cy-num">Numero ciclo attuale</Label>
          <Input
            id="cy-num"
            type="number"
            min={1}
            value={num}
            onChange={(e) => setNum(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="es. 78"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cy-end">Fine ciclo attuale (azzeramento)</Label>
          <Input
            id="cy-end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Da qui ripartono i 28 giorni.</p>
        </div>

        {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}

        <div className="sm:col-span-2">
          <Button onClick={save} disabled={pending} className="gap-2">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Salva ciclo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
