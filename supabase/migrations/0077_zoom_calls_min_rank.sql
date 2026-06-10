-- 0077: zoom_calls.min_rank — "rank minimo per partecipare".
--
-- NULL = Tutti (chiunque, inclusi cliente/no_rank). Un min_rank valorizzato NASCONDE
-- la call ai membri sotto quel rango (via RLS SELECT): admin e il creatore la vedono
-- sempre (per gestirla). Tutti i read path (/presenze fetchCalls, lista impostazioni)
-- passano dal client RLS-bound, quindi questa singola policy lo applica ovunque.
-- Backward-compatible: le call esistenti hanno min_rank NULL → nessun cambiamento.

ALTER TABLE public.zoom_calls
  ADD COLUMN IF NOT EXISTS min_rank public.marketer_rank;

COMMENT ON COLUMN public.zoom_calls.min_rank IS
  'Rango minimo per vedere/partecipare alla call. NULL = tutti (incl. cliente/no_rank). Gating in zoom_calls_select; admin + creatore bypassano per gestione.';

DROP POLICY IF EXISTS zoom_calls_select ON public.zoom_calls;
CREATE POLICY zoom_calls_select ON public.zoom_calls
  FOR SELECT USING (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR created_by = public.current_marketer_id()
      OR (
        -- visibilità esistente (org oppure team filtrata per branch)
        (
          scope = 'org'
          OR (scope = 'team' AND EXISTS (
            SELECT 1 FROM public.marketer_tree_closure c
            WHERE c.org_id = zoom_calls.org_id
              AND c.ancestor_id = zoom_calls.created_by
              AND c.descendant_id = public.current_marketer_id()
              AND c.depth >= 1
              AND (
                COALESCE(zoom_calls.team_branch, 'all') = 'all'
                OR (zoom_calls.team_branch = 'left'  AND c.branch_leg = 'LEFT')
                OR (zoom_calls.team_branch = 'right' AND c.branch_leg = 'RIGHT')
              )
          ))
        )
        -- gate sul rango minimo (NULL = tutti)
        AND (
          zoom_calls.min_rank IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.ranks_meta rc
            JOIN public.ranks_meta rm ON rm.rank = zoom_calls.min_rank
            WHERE rc.rank = NULLIF(public.current_rank(), '')::public.marketer_rank
              AND rc.sort_order >= rm.sort_order
          )
        )
      )
    )
  );
