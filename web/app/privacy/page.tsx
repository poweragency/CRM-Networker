import type { Metadata } from 'next';
import { LegalShell, COMPANY } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy — Gen X',
  description: 'Informativa sul trattamento dei dati personali del servizio Gen X.',
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="giugno 2026"
      sections={[
        {
          heading: '1. Titolare e ruoli nel trattamento',
          body: [
            <>Il servizio Gen X è fornito da {COMPANY.identifier} (di seguito il “Fornitore”).</>,
            <>
              Per i dati relativi all’account dell’utente (profilo, abbonamento, fatturazione) il Fornitore
              agisce in qualità di <strong>titolare del trattamento</strong>. Per i dati che l’utente carica e
              gestisce tramite la piattaforma (contatti, prospect, genealogia della rete, attività), il
              Fornitore agisce in qualità di <strong>responsabile del trattamento</strong> (art. 28 GDPR) per
              conto dell’utente, che ne resta titolare.
            </>,
            <>Per qualsiasi richiesta scrivere a <a className="text-primary underline" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> — PEC {COMPANY.pec}.</>,
          ],
        },
        {
          heading: '2. Dati trattati',
          body: [
            <>
              <strong>Dati dell’account:</strong> nome, email, ruolo, credenziali (gestite dal provider di
              autenticazione, password non in chiaro), dati di fatturazione dell’abbonamento.
            </>,
            <>
              <strong>Dati inseriti nella piattaforma:</strong> anagrafiche di contatti e prospect, struttura
              della rete (genealogia), note, chiamate, attività e documenti caricati dall’utente.
            </>,
            <><strong>Dati tecnici:</strong> log operativi e di sicurezza necessari al funzionamento del servizio.</>,
          ],
        },
        {
          heading: '3. Finalità e basi giuridiche',
          body: [
            <>Erogazione del servizio e gestione dell’account — esecuzione del contratto.</>,
            <>Sicurezza, prevenzione abusi e diagnostica — legittimo interesse.</>,
            <>Adempimenti legali, contabili e fiscali — obbligo di legge.</>,
          ],
        },
        {
          heading: '4. Fornitori e responsabili',
          body: [
            <>
              Per erogare il servizio ci avvaliamo di fornitori che trattano dati per nostro conto
              (responsabili ex art. 28 GDPR), tra cui <strong>Supabase</strong> (database, autenticazione e
              storage) e il provider di hosting. I dati non vengono venduti a terzi.
            </>,
          ],
        },
        {
          heading: '5. Trasferimenti extra-UE',
          body: [
            <>
              Alcuni fornitori possono trattare dati al di fuori dello Spazio Economico Europeo, sulla base di
              garanzie adeguate (es. Clausole Contrattuali Standard della Commissione Europea).
            </>,
          ],
        },
        {
          heading: '6. Conservazione',
          body: [
            <>
              I dati sono conservati per la durata del rapporto contrattuale. Alla cessazione dell’account i
              dati personali vengono cancellati o anonimizzati, salvo obblighi di legge (es. dati fiscali).
            </>,
          ],
        },
        {
          heading: '7. Sicurezza',
          body: [
            <>
              Adottiamo misure tecniche e organizzative adeguate: isolamento dei dati per utente (Row Level
              Security), accessi basati su ruoli, trasmissione cifrata (HTTPS) e protezione delle credenziali.
            </>,
          ],
        },
        {
          heading: '8. Diritti dell’interessato',
          body: [
            <>
              Hai diritto di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione, oltre
              al diritto di revocare il consenso e di proporre reclamo all’Autorità Garante per la protezione
              dei dati personali (<a className="text-primary underline" href="https://www.garanteprivacy.it" target="_blank" rel="noopener">garanteprivacy.it</a>).
              Per i dati dei contatti inseriti dall’utente, le richieste degli interessati vanno indirizzate
              all’utente titolare; il Fornitore lo assiste come responsabile. Contatti: <a className="text-primary underline" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
            </>,
          ],
        },
        {
          heading: '9. Cookie',
          body: [
            <>Per l’uso dei cookie consulta la <a className="text-primary underline" href="/cookie">Cookie Policy</a>.</>,
          ],
        },
      ]}
    />
  );
}
