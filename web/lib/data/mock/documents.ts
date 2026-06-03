import type {
  DocumentCategory,
  DocumentStatus,
  DocumentVersion,
  InternalDocument,
  TiptapDoc,
} from '@/lib/types/db';
import { DEMO_ORG_ID, DEMO_OWNER_ID, daysAgo } from './_shared';

/**
 * ~14 demo internal documents (rich-text only, NO file uploads — ADR-009 #5)
 * across all categories/statuses, with realistic Tiptap/ProseMirror JSON bodies
 * and a small version history for a couple of them. Drives the document list,
 * the reader/editor and the version timeline + duplicate/archive actions in
 * "modalità demo".
 */

/** Tiny helpers to author readable Tiptap JSON without boilerplate. */
function doc(...content: TiptapDoc['content'] extends infer C ? NonNullable<C> : never): TiptapDoc {
  return { type: 'doc', content };
}
function h(level: number, text: string) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}
function p(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
function ul(...items: string[]) {
  return {
    type: 'bulletList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })),
  };
}

interface Seed {
  id: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  tags: string[];
  version: number;
  ageDays: number;
  body: TiptapDoc;
  archived?: boolean;
  duplicated_from?: string | null;
}

const SEEDS: Seed[] = [
  {
    id: 'doc-001',
    title: 'Script primo contatto telefonico',
    category: 'script',
    status: 'published',
    tags: ['telefono', 'apertura'],
    version: 3,
    ageDays: 90,
    body: doc(
      h(1, 'Script primo contatto telefonico'),
      p('Obiettivo della chiamata: fissare un appuntamento conoscitivo, non vendere.'),
      h(2, 'Apertura'),
      p('Ciao [nome], sono [tuo nome]. Ti rubo solo un minuto: ti chiamo perché sto ampliando un progetto nel settore wellness e ho pensato a te.'),
      h(2, 'Domande chiave'),
      ul(
        'Sei aperto a valutare un’entrata extra part-time?',
        'Quanto tempo potresti dedicarci a settimana?',
        'Cosa ti spingerebbe a cambiare la tua situazione attuale?',
      ),
      h(2, 'Chiusura'),
      p('Ti va se ci vediamo 20 minuti per spiegarti come funziona? Preferisci giovedì o venerdì?'),
    ),
  },
  {
    id: 'doc-002',
    title: 'Guida al percorso prospect (6 fasi)',
    category: 'formazione',
    status: 'published',
    tags: ['percorso', 'fondamentali'],
    version: 2,
    ageDays: 75,
    body: doc(
      h(1, 'Il percorso prospect in 6 fasi'),
      p('Ogni prospect attraversa sei fasi canoniche. Non saltare le fasi: la velocità nasce dalla coerenza.'),
      ul(
        'Conoscitiva — primo contatto e scoperta dei bisogni.',
        'Business Info — presentazione del progetto.',
        'Follow-up — gestione delle obiezioni.',
        'Closing — chiusura della trattativa.',
        'Check Soldi — verifica della disponibilità economica.',
        'Iscrizione — ingresso ufficiale nel team.',
      ),
    ),
  },
  {
    id: 'doc-003',
    title: 'Procedura onboarding nuovo iscritto',
    category: 'onboarding',
    status: 'published',
    tags: ['onboarding', 'checklist'],
    version: 4,
    ageDays: 60,
    body: doc(
      h(1, 'Onboarding nuovo iscritto'),
      p('Prime 72 ore: il momento più importante per la ritenzione.'),
      ul(
        'Messaggio di benvenuto entro 1 ora.',
        'Aggiunta al gruppo del team.',
        'Primo ordine prodotto guidato.',
        'Fissare la prima sessione di formazione.',
      ),
    ),
  },
  {
    id: 'doc-004',
    title: 'Gestione delle 5 obiezioni più comuni',
    category: 'formazione',
    status: 'published',
    tags: ['obiezioni', 'closing'],
    version: 1,
    ageDays: 45,
    body: doc(
      h(1, 'Le 5 obiezioni più comuni'),
      p('“Non ho tempo”, “Non ho soldi”, “Devo pensarci”, “È un sistema piramidale?”, “Non sono portato a vendere”.'),
      p('Per ognuna: ascolta, valida, riformula, rispondi con una domanda.'),
    ),
  },
  {
    id: 'doc-005',
    title: 'Post Instagram — testimonianza prodotto',
    category: 'marketing',
    status: 'draft',
    tags: ['social', 'instagram'],
    version: 1,
    ageDays: 10,
    body: doc(
      h(1, 'Bozza post testimonianza'),
      p('Foto prima/dopo + caption autentica. Niente claim medici.'),
    ),
  },
  {
    id: 'doc-006',
    title: 'Script messaggio WhatsApp di follow-up',
    category: 'script',
    status: 'published',
    tags: ['whatsapp', 'follow-up'],
    version: 2,
    ageDays: 30,
    body: doc(
      h(1, 'Follow-up WhatsApp'),
      p('Ciao [nome]! Come promesso ti lascio qui il materiale di cui parlavamo. Quando hai 5 minuti dimmi cosa ne pensi 😊'),
    ),
  },
  {
    id: 'doc-007',
    title: 'Procedura check soldi e budget',
    category: 'procedura',
    status: 'published',
    tags: ['check-soldi', 'budget'],
    version: 1,
    ageDays: 25,
    body: doc(
      h(1, 'Check soldi'),
      p('Prima dell’iscrizione, verifica con delicatezza che il prospect possa sostenere l’investimento iniziale.'),
    ),
  },
  {
    id: 'doc-008',
    title: 'Piano formativo prime 4 settimane',
    category: 'formazione',
    status: 'published',
    tags: ['formazione', 'piano'],
    version: 1,
    ageDays: 50,
    body: doc(
      h(1, 'Piano 30 giorni'),
      ul('Settimana 1: prodotto e storia.', 'Settimana 2: lista nomi.', 'Settimana 3: inviti.', 'Settimana 4: prime presentazioni.'),
    ),
  },
  {
    id: 'doc-009',
    title: 'Template email evento di gruppo',
    category: 'marketing',
    status: 'draft',
    tags: ['email', 'evento'],
    version: 1,
    ageDays: 8,
    body: doc(h(1, 'Invito evento'), p('Oggetto: Ti aspetto giovedì! Corpo da personalizzare.')),
  },
  {
    id: 'doc-010',
    title: 'Procedura inserimento contatto nel CRM',
    category: 'procedura',
    status: 'published',
    tags: ['crm', 'procedura'],
    version: 2,
    ageDays: 40,
    body: doc(
      h(1, 'Inserire un contatto'),
      p('Compila sempre fonte e tag: servono per le statistiche di provenienza.'),
    ),
  },
  {
    id: 'doc-011',
    title: 'Script di reclutamento a freddo',
    category: 'script',
    status: 'archived',
    tags: ['freddo', 'vecchio'],
    version: 1,
    ageDays: 200,
    archived: true,
    body: doc(h(1, 'Script a freddo (archiviato)'), p('Versione superata dallo script v3.')),
  },
  {
    id: 'doc-012',
    title: 'Guida alla Lista contatti',
    category: 'formazione',
    status: 'published',
    tags: ['centos', 'lista-100'],
    version: 1,
    ageDays: 35,
    body: doc(
      h(1, 'La Lista dei 100'),
      p('Scrivi 100 nomi senza giudicare. La quantità batte la selezione iniziale.'),
    ),
  },
  {
    id: 'doc-013',
    title: 'Linee guida brand sui social',
    category: 'marketing',
    status: 'published',
    tags: ['brand', 'social'],
    version: 1,
    ageDays: 20,
    body: doc(h(1, 'Brand sui social'), p('Tono positivo, mai promesse di guadagni garantiti.')),
  },
  {
    id: 'doc-014',
    title: 'Checklist chiusura iscrizione (copia)',
    category: 'procedura',
    status: 'draft',
    tags: ['closing', 'checklist'],
    version: 1,
    ageDays: 4,
    duplicated_from: 'doc-003',
    body: doc(h(1, 'Checklist chiusura'), p('Duplicato da “Onboarding nuovo iscritto”, da adattare.')),
  },
];

export const MOCK_DOCUMENTS: InternalDocument[] = SEEDS.map((s) => ({
  id: s.id,
  org_id: DEMO_ORG_ID,
  title: s.title,
  category: s.category,
  status: s.status,
  body: s.body,
  current_version: s.version,
  duplicated_from_id: s.duplicated_from ?? null,
  tags: s.tags,
  created_by: DEMO_OWNER_ID,
  updated_by: DEMO_OWNER_ID,
  created_at: daysAgo(s.ageDays),
  updated_at: daysAgo(Math.max(1, Math.floor(s.ageDays / 4))),
  archived_at: s.archived ? daysAgo(15) : null,
  deleted_at: null,
}));

/**
 * Demo version history. For documents with `current_version > 1` we synthesize
 * a snapshot per prior version so the version timeline is populated.
 */
export const MOCK_DOCUMENT_VERSIONS: DocumentVersion[] = SEEDS.flatMap((s) => {
  if (s.version <= 1) return [];
  const out: DocumentVersion[] = [];
  for (let v = 1; v < s.version; v++) {
    out.push({
      id: `${s.id}-v${v}`,
      org_id: DEMO_ORG_ID,
      document_id: s.id,
      version_no: v,
      title: s.title,
      body: doc(h(1, s.title), p(`Versione ${v} — contenuto precedente.`)),
      change_note:
        v === 1 ? 'Versione iniziale' : `Aggiornamento contenuti (v${v})`,
      created_by: DEMO_OWNER_ID,
      created_at: daysAgo(s.ageDays - v * 5),
    });
  }
  return out;
});
