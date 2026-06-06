-- 0046: table-level privileges for org_documents (RLS still governs rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_documents TO authenticated;
