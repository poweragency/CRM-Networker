-- =============================================================================
-- File 0023 — Lista contatti: campo `percorso`
-- Purpose: Tracks how far an invited contact has progressed along the funnel
--          path, as a single progressive phase index:
--            0 = nessuna fase,
--            1 = Business Info, 2 = Follow-up, 3 = Closing,
--            4 = Check Soldi,  5 = Iscrizione.
--          Rendered in the "Percorsi" pane as 5 progressive checkboxes for every
--          contact whose stato is diverso da non_invitato.
--
-- Depends on: 0022_rename_centos_to_lista_contatti.sql (lista_contatti_entries).
-- =============================================================================

ALTER TABLE public.lista_contatti_entries
  ADD COLUMN percorso smallint NOT NULL DEFAULT 0
    CONSTRAINT lista_contatti_percorso_chk CHECK (percorso BETWEEN 0 AND 5);

COMMENT ON COLUMN public.lista_contatti_entries.percorso IS
  'Fase del percorso raggiunta (0 = nessuna, 1..5 = Business Info → Follow-up → Closing → Check Soldi → Iscrizione). Progressivo.';
