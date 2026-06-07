-- 0057: covering indexes on the high-traffic foreign-key columns the app filters
-- by (owner_marketer_id / marketer_id / sponsor_id / call_id). At small data these
-- columns were seq-scanned (still sub-ms), but the stress-test seed (100 members +
-- thousands of rows) confirmed they'd become slow at real scale. All additive.

CREATE INDEX IF NOT EXISTS prospects_owner_idx
  ON public.prospects (owner_marketer_id);

CREATE INDEX IF NOT EXISTS calls_marketer_idx
  ON public.calls (marketer_id);
CREATE INDEX IF NOT EXISTS calls_prospect_idx
  ON public.calls (prospect_id);

-- Presenze page filters: marketer_id IN (subtree) + call_date; also covers the FK.
CREATE INDEX IF NOT EXISTS zoom_attendance_marketer_date_idx
  ON public.zoom_attendance (marketer_id, call_date);
CREATE INDEX IF NOT EXISTS zoom_attendance_call_id_idx
  ON public.zoom_attendance (call_id);

CREATE INDEX IF NOT EXISTS lista_contatti_owner_idx
  ON public.lista_contatti_entries (owner_marketer_id);

CREATE INDEX IF NOT EXISTS contacts_owner_idx
  ON public.contacts (owner_marketer_id);

-- Spillover / sponsorship-chain lookups in the genealogy.
CREATE INDEX IF NOT EXISTS marketers_sponsor_idx
  ON public.marketers (sponsor_id);

CREATE INDEX IF NOT EXISTS seven_whys_marketer_idx
  ON public.seven_whys (marketer_id);
