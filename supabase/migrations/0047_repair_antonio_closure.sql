-- 0047: data repair (user-authorized) — antonio incoronato (3edc9433) was
-- soft-deleted in a test but still has an active account, so the Binary Viewer
-- fell back to mock for him. Restore the marketer + rebuild its tree closure
-- (a leaf: self row + the parent's upline rows, depth+1). Parent = Cesare Banfi
-- (893b6fd8); antonio sits on the LEFT leg (free among live nodes).
--
-- NOTE: this is a one-time data repair tied to specific ids. On a fresh database
-- (e.g. `supabase db reset`) none of these ids exist, so every statement matches
-- zero rows and the migration is a safe no-op. Committed only to keep the repo
-- migration history aligned with the live ledger (audit finding A12).

UPDATE public.marketers
SET deleted_at = NULL
WHERE id = '3edc9433-f90a-4e09-979f-e48356d79ae0' AND deleted_at IS NOT NULL;

DELETE FROM public.marketer_tree_closure
WHERE descendant_id = '3edc9433-f90a-4e09-979f-e48356d79ae0';

INSERT INTO public.marketer_tree_closure (org_id, ancestor_id, descendant_id, depth, branch_leg)
SELECT 'ad9a57f3-b658-4178-9124-daf2d1904518'::uuid,
       '3edc9433-f90a-4e09-979f-e48356d79ae0'::uuid,
       '3edc9433-f90a-4e09-979f-e48356d79ae0'::uuid,
       0, NULL::placement_leg
UNION ALL
SELECT c.org_id, c.ancestor_id,
       '3edc9433-f90a-4e09-979f-e48356d79ae0'::uuid,
       c.depth + 1,
       CASE WHEN c.ancestor_id = '893b6fd8-2f94-4f1c-a209-40e29a728559'
            THEN 'LEFT'::placement_leg ELSE c.branch_leg END
FROM public.marketer_tree_closure c
WHERE c.descendant_id = '893b6fd8-2f94-4f1c-a209-40e29a728559';
