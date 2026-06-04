-- =============================================================================
-- File 0031 — Tree-maintenance triggers must be SECURITY DEFINER
-- Purpose: marketers_after_insert_tree() and marketers_after_move_tree() write to
--          public.marketer_tree_closure, on which the `authenticated` role only
--          holds SELECT (0006 grants SELECT only; closure is "trigger-maintained
--          only"). The functions were created SECURITY INVOKER in 0004, so a
--          marketer INSERT/move performed by an authenticated user failed with
--          "permission denied for table marketer_tree_closure" — which made the
--          "add member" flow impossible from the app.
--
--          Flip both to SECURITY DEFINER so they run as the function owner (which
--          owns the closure table). Both already SET search_path = public,
--          extensions, so this is safe; they only build closure rows derived from
--          the row whose INSERT/UPDATE was already RLS-checked.
--
-- Depends on: 0004_marketers_tree.sql (the two trigger functions).
-- =============================================================================

ALTER FUNCTION public.marketers_after_insert_tree() SECURITY DEFINER;
ALTER FUNCTION public.marketers_after_move_tree()   SECURITY DEFINER;
