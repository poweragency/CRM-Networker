-- 0056: enable Supabase Realtime for zoom_attendance so the Presenze page updates
-- live (many people checking in at the start of a Zoom no longer require a manual
-- refresh). REPLICA IDENTITY FULL makes UPDATE/DELETE payloads carry the whole row
-- so Realtime can apply the table's RLS (each leader only receives changes for the
-- people in their visible subtree — same scope as the SELECT policy).

ALTER TABLE public.zoom_attendance REPLICA IDENTITY FULL;

-- Add to the realtime publication (idempotent: skip if already a member).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'zoom_attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.zoom_attendance;
  END IF;
END $$;
