-- 0084: Presenze Zoom — NON puoi segnare te stesso presente. Solo un UPLINE stretto
-- (qualcuno sopra di te nell'albero) o un admin può segnare la presenza di un marketer.
-- Prima bastava can_see_marketer (che include sé stessi); ora serve can_mark_attendance.
CREATE OR REPLACE FUNCTION public.can_mark_attendance(p_marketer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.marketer_tree_closure cl
      WHERE cl.org_id = public.current_org_id()
        AND cl.ancestor_id = public.current_marketer_id()
        AND cl.descendant_id = p_marketer
        AND cl.depth >= 1
    );
$$;
GRANT EXECUTE ON FUNCTION public.can_mark_attendance(uuid) TO authenticated;

DROP POLICY IF EXISTS zoom_attendance_insert ON public.zoom_attendance;
CREATE POLICY zoom_attendance_insert ON public.zoom_attendance
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND public.can_mark_attendance(marketer_id)
);

DROP POLICY IF EXISTS zoom_attendance_update ON public.zoom_attendance;
CREATE POLICY zoom_attendance_update ON public.zoom_attendance
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_mark_attendance(marketer_id)
)
WITH CHECK (
  org_id = public.current_org_id()
  AND public.can_mark_attendance(marketer_id)
);

DROP POLICY IF EXISTS zoom_attendance_delete ON public.zoom_attendance;
CREATE POLICY zoom_attendance_delete ON public.zoom_attendance
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_mark_attendance(marketer_id)
);
