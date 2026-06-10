-- 0078: permettere l'eliminazione DEFINITIVA di un login (auth.users) / marketer.
--
-- BUG: audit_log.actor_user_id e actor_marketer_id avevano FK ... ON DELETE SET NULL,
-- ma audit_log e APPEND-ONLY (trg_audit_immutable blocca ogni UPDATE/DELETE). Quindi
-- eliminare un auth.users con storia d'audit innescava la cascade "UPDATE audit_log
-- SET actor_user_id = NULL" -> bloccata dal trigger di immutabilita -> l'intera DELETE
-- falliva e rollbackava. Risultato: i login eliminati restavano (orfani), e anche la
-- rimozione dal tree (revokeAccountForMarketer -> deleteUser) falliva in silenzio.
--
-- FIX: rimuovere quelle FK. E' anche il design CORRETTO per un audit log immutabile:
-- l'id dell'attore va CONSERVATO come verita storica anche dopo che il login/marketer
-- viene eliminato (non azzerato). Le righe d'audit restano immutabili: il trigger e i
-- REVOKE UPDATE/DELETE non sono toccati. Nessuna perdita di dati: i valori restano.
-- Backward-compatible: rimuove solo l'enforcement referenziale.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND contype = 'f'
      AND (conname LIKE '%actor_user_id%' OR conname LIKE '%actor_marketer_id%')
  LOOP
    EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
