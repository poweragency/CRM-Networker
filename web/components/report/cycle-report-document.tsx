'use client';

import { Award, Download, Network, TrendingUp, Users } from 'lucide-react';
import type { CycleTeamReport } from '@/lib/data/reports';

/**
 * CycleReportDocument — the printable end-of-cycle team report. A clean, light
 * "sheet" (theme-independent colours) that prints to a tidy PDF via the browser's
 * Save-as-PDF: the toolbar and shadows are stripped with `print:` utilities. The
 * rank entered before download is shown award-style at the top.
 */

function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function CycleReportDocument({
  cycleNumber,
  rank,
  report,
}: {
  cycleNumber: number;
  rank: string;
  report: CycleTeamReport;
}) {
  const phases = [
    { label: 'Business Info → Follow-up', value: pct(report.reachedFup, report.reachedBi) },
    { label: 'Follow-up → Closing', value: pct(report.reachedClosing, report.reachedFup) },
    { label: 'Closing → Iscrizione', value: pct(report.reachedIscrizione, report.reachedClosing) },
  ];
  const overall = pct(report.reachedIscrizione, report.reachedBi);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 print:bg-white print:p-0">
      {/* Toolbar — hidden when printing */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between print:hidden">
        <a href="/dashboard" className="text-sm text-slate-500 transition-colors hover:text-slate-800">
          ← Torna alla dashboard
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
        >
          <Download className="h-4 w-4" aria-hidden />
          Scarica PDF
        </button>
      </div>

      {/* Report sheet */}
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-10 text-slate-900 shadow-xl ring-1 ring-slate-200 print:max-w-none print:rounded-none print:p-8 print:shadow-none print:ring-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Network className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight">CRM Networker</p>
              <p className="text-xs text-slate-500">Report di fine ciclo</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tracking-tight">Ciclo {cycleNumber}</p>
            <p className="text-xs text-slate-500">
              {fmtDate(report.startIso)} — {fmtDate(report.endIso)}
            </p>
          </div>
        </div>

        {/* Award (rank realizzato) */}
        {rank ? (
          <div className="my-8 flex flex-col items-center rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-white py-7 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg">
              <Award className="h-7 w-7" aria-hidden />
            </span>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
              Rank realizzato nel ciclo
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-amber-900">{rank}</p>
          </div>
        ) : (
          <div className="my-8" />
        )}

        {/* Headline stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-slate-500">
              <Users className="h-4 w-4" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide">Prospect totali</span>
            </div>
            <p className="mt-2 text-4xl font-extrabold tabular-nums">{report.total}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-5">
            <div className="flex items-center gap-2 text-emerald-600">
              <TrendingUp className="h-4 w-4" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide">Conversione generale</span>
            </div>
            <p className="mt-2 text-4xl font-extrabold tabular-nums text-emerald-700">{overall}</p>
            <p className="text-xs text-slate-500">Business Info → Iscrizione</p>
          </div>
        </div>

        {/* Per-phase conversion */}
        <p className="mt-8 mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Conversione per fase
        </p>
        <div className="space-y-2">
          {phases.map((p) => (
            <div
              key={p.label}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            >
              <span className="text-sm font-medium text-slate-700">{p.label}</span>
              <span className="text-lg font-bold tabular-nums text-slate-900">{p.value}</span>
            </div>
          ))}
        </div>

        <p className="mt-10 border-t border-slate-200 pt-4 text-center text-[11px] text-slate-400">
          Generato da CRM Networker · Performance del team per il ciclo {cycleNumber}
        </p>
      </div>
    </div>
  );
}
