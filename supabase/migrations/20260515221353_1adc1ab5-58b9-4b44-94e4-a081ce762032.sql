-- Drop duplicate updated_at triggers (keep *_updated_at variant)
DROP TRIGGER IF EXISTS trg_articles_updated ON public.articles;
DROP TRIGGER IF EXISTS trg_cml_updated ON public.case_material_lines;
DROP TRIGGER IF EXISTS trg_col_updated ON public.case_order_lines;
DROP TRIGGER IF EXISTS trg_cases_updated ON public.cases;
DROP TRIGGER IF EXISTS trg_categories_updated ON public.categories;
DROP TRIGGER IF EXISTS trg_liander_items_updated ON public.liander_assortment_items;
DROP TRIGGER IF EXISTS trg_vol_updated ON public.verkooporder_lines;

-- Extra fields for Liander import history
ALTER TABLE public.liander_assortment_imports
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS sheet_name text,
  ADD COLUMN IF NOT EXISTS header_row_index integer,
  ADD COLUMN IF NOT EXISTS skipped_rows_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warnings jsonb;