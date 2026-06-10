'use client';

import * as React from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/crm/toaster';
import { parseCsv } from '@/lib/csv';

/**
 * Reusable "Import CSV" button: opens a file picker, reads + parses the CSV
 * client-side (delimiter auto-detected) and hands the parsed rows to `onRows`.
 * Parse/empty-file errors surface as a toast; the caller does the row→model
 * mapping + persistence. Excel users can "Salva con nome → CSV" first.
 */
export function ImportCsvButton({
  label = 'Importa CSV',
  onRows,
  title,
  disabled,
}: {
  label?: string;
  onRows: (rows: string[][]) => void | Promise<void>;
  title?: string;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast({ title: 'Il file è vuoto.', variant: 'error' });
        return;
      }
      await onRows(rows);
    } catch {
      toast({ title: 'Impossibile leggere il file CSV.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        title={title}
        className="gap-2"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        {label}
      </Button>
    </>
  );
}
