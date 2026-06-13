-- 0085: flag "libro" sui documenti org. I documenti con is_book=true compaiono
-- nella sezione "Libri" dell'Informativa (libreria di libri in PDF, gestita
-- dall'admin), separati dai documenti scaricabili normali.
ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS is_book boolean NOT NULL DEFAULT false;
