import type { Prospect, ProspectStage } from '@/lib/types/db';

/**
 * View models passed from the RSC page to the client board. The data layer is
 * server-only, so the page resolves the owner display-name (via the genealogy
 * data layer) once and ships a plain, serializable shape — the client never
 * re-reads Supabase or imports server-only modules.
 */

/** A prospect enriched with its resolved owner display name (board card). */
export interface ProspectView extends Prospect {
  owner_name: string;
  /**
   * Set when this card is a Lista contatti contact mirrored into the board (not a
   * real prospect row). Holds the lista_contatti entry id. Such cards are
   * read-only on the board — their phase is driven by the Percorso checkboxes.
   */
  listaContattiId?: string;
}

/** A board column ready for render: stage + its prospect views. */
export interface StageColumnView {
  stage: ProspectStage;
  prospects: ProspectView[];
}

/** The serialized board envelope handed to the client orchestrator. */
export interface BoardView {
  columns: StageColumnView[];
  total: number;
}
