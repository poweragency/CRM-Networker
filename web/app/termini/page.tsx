import type { Metadata } from 'next';
import { LegalShell, COMPANY } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Termini di Servizio — CRM Networker',
  description: "Condizioni d'uso del servizio CRM Networker.",
};

export default function TerminiPage() {
  return (
    <LegalShell
      title="Termini di Servizio"
      updated="giugno 2026"
      sections={[
        {
          heading: '1. Fornitore del servizio',
          body: [
            <>
              CRM Networker è un servizio software in abbonamento (SaaS) fornito da {COMPANY.identifier}.
              Regime forfettario: operazioni non soggette a IVA ai sensi dell’art. 1, commi 54-89, L. 190/2014.
              Creando un account o utilizzando il servizio l’utente accetta i presenti Termini.
            </>,
          ],
        },
        {
          heading: '2. Oggetto',
          body: [
            <>
              CRM Networker è una piattaforma di CRM e business intelligence per il network marketing: gestione
              di contatti e prospect, genealogia della rete, chiamate, percorsi e reportistica. Il servizio è
              fornito “così com’è”, con possibili evoluzioni delle funzionalità.
            </>,
          ],
        },
        {
          heading: '3. Account e responsabilità dell’utente',
          body: [
            <>
              L’utente è responsabile della riservatezza delle credenziali e dei dati inseriti nella
              piattaforma. Garantisce di avere idonea base giuridica per trattare i dati dei propri contatti e
              prospect e di rispettare la normativa applicabile, agendo quale titolare del trattamento di tali
              dati.
            </>,
          ],
        },
        {
          heading: '4. Uso consentito',
          body: [
            <>
              È vietato utilizzare il servizio per finalità illecite, inviare comunicazioni non richieste in
              violazione delle norme vigenti, violare diritti di terzi, compromettere la sicurezza della
              piattaforma o rivendere/sublicenziare l’accesso senza autorizzazione scritta.
            </>,
          ],
        },
        {
          heading: '5. Piani e pagamenti',
          body: [
            <>
              L’accesso richiede un abbonamento secondo il piano attivato. Prezzi, quote e condizioni sono
              comunicati al momento dell’attivazione. Salvo diversa indicazione, gli abbonamenti si rinnovano
              periodicamente e sono disdicibili secondo quanto previsto dal piano.
            </>,
          ],
        },
        {
          heading: '6. Trattamento dei dati (DPA)',
          body: [
            <>
              In relazione ai dati dei contatti e prospect inseriti dall’utente, il Fornitore agisce quale
              responsabile del trattamento e tratta i dati secondo le istruzioni dell’utente titolare, come
              descritto nella <a className="text-primary underline" href="/privacy">Privacy Policy</a>, che
              costituisce parte integrante dei presenti Termini.
            </>,
          ],
        },
        {
          heading: '7. Proprietà intellettuale',
          body: [
            <>
              Il software, il marchio e i materiali della piattaforma sono di proprietà di {COMPANY.legalName}
              {' '}(Power Agency) o dei suoi licenzianti. All’utente è concessa una licenza d’uso non esclusiva
              e non trasferibile per la durata dell’abbonamento. I dati inseriti dall’utente restano di sua
              titolarità.
            </>,
          ],
        },
        {
          heading: '8. Limitazione di responsabilità',
          body: [
            <>
              Nei limiti di legge, il Fornitore non è responsabile per danni indiretti o consequenziali, né per
              interruzioni o malfunzionamenti temporanei del servizio o dei fornitori terzi. L’utente è tenuto a
              conservare copie dei dati critici.
            </>,
          ],
        },
        {
          heading: '9. Sospensione e cessazione',
          body: [
            <>
              Il Fornitore può sospendere o chiudere un account in caso di violazione dei presenti Termini o di
              mancato pagamento. L’utente può cessare l’uso del servizio in qualsiasi momento. Alla cessazione i
              dati sono trattati come indicato nella Privacy Policy.
            </>,
          ],
        },
        {
          heading: '10. Legge applicabile e foro competente',
          body: [
            <>
              I presenti Termini sono regolati dalla legge italiana. Per le controversie è competente in via
              esclusiva il Foro di Milano, salvo i fori inderogabili a tutela del consumatore.
            </>,
          ],
        },
        {
          heading: '11. Contatti',
          body: [
            <>Per qualsiasi domanda scrivere a <a className="text-primary underline" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> — PEC {COMPANY.pec}.</>,
          ],
        },
      ]}
    />
  );
}
