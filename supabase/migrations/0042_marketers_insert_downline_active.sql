-- Allow non-admins to place their own recruits (entry rank) anywhere in THEIR
-- visible subtree as active members — matching the tree "Aggiungi membro" flow.
-- Previously non-admins could only insert status='pending', which the tree-add
-- (status='active') violated → "Impossibile aggiungere". Admins still unrestricted.
DROP POLICY IF EXISTS marketers_insert ON public.marketers;
CREATE POLICY marketers_insert ON public.marketers
  FOR INSERT WITH CHECK (
    org_id = public.current_org_id()
    AND public.current_membership_active()
    AND (
      public.is_org_admin()
      OR (
        parent_id IS NOT NULL
        AND public.can_see_marketer(parent_id)
        AND rank = 'executive'::marketer_rank
      )
    )
  );
