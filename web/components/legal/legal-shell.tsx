import Link from 'next/link';
import { ArrowLeft, Network } from 'lucide-react';

/**
 * Dati identificativi del fornitore del servizio (POWER AGENCY).
 * Fonte: visura Camera di Commercio MI — impresa individuale Amore Vincenzo.
 */
export const COMPANY = {
  legalName: 'Amore Vincenzo',
  tradeName: 'Power Agency',
  address: 'Via Giuseppe Parini 2, 20019 Settimo Milanese (MI), Italia',
  vat: '12497340963',
  taxCode: 'MRAVCN95C27F839R',
  rea: 'MI-2675736',
  pec: 'poweragency@pec.it',
  email: 'info@poweragency.it',
  identifier:
    'Amore Vincenzo, impresa individuale operante con il nome commerciale «Power Agency», con sede legale in Via Giuseppe Parini 2, 20019 Settimo Milanese (MI), Italia — P.IVA 12497340963 — C.F. MRAVCN95C27F839R — REA MI-2675736 — PEC poweragency@pec.it',
} as const;

export type LegalSection = { heading: string; body: React.ReactNode[] };

export function LegalShell({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <Link
          href="/accedi"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Torna al login
        </Link>

        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Network className="h-5 w-5" aria-hidden />
          </div>
          <span className="text-base font-semibold">CRM Networker</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ultimo aggiornamento: {updated}</p>

        <div className="mt-10 flex flex-col gap-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="mb-3 text-lg font-semibold">{s.heading}</h2>
              {s.body.map((p, i) => (
                <div key={i} className="mb-3 text-[0.95rem] leading-relaxed text-muted-foreground">
                  {p}
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-5 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/cookie" className="hover:text-foreground">Cookie</Link>
          <Link href="/termini" className="hover:text-foreground">Termini</Link>
          <span className="ml-auto">© 2026 {COMPANY.tradeName} · P.IVA {COMPANY.vat}</span>
        </div>
      </div>
    </div>
  );
}
