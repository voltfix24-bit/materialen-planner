
-- 1. Add CASCADE to case-related foreign keys
ALTER TABLE public.case_material_lines DROP CONSTRAINT IF EXISTS case_material_lines_case_id_fkey;
ALTER TABLE public.case_material_lines
  ADD CONSTRAINT case_material_lines_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.case_order_lines DROP CONSTRAINT IF EXISTS case_order_lines_case_id_fkey;
ALTER TABLE public.case_order_lines
  ADD CONSTRAINT case_order_lines_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.verkooporder_lines DROP CONSTRAINT IF EXISTS verkooporder_lines_case_id_fkey;
ALTER TABLE public.verkooporder_lines
  ADD CONSTRAINT verkooporder_lines_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.haspel_numbers DROP CONSTRAINT IF EXISTS haspel_numbers_case_id_fkey;
ALTER TABLE public.haspel_numbers
  ADD CONSTRAINT haspel_numbers_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE public.export_logs DROP CONSTRAINT IF EXISTS export_logs_case_id_fkey;
ALTER TABLE public.export_logs
  ADD CONSTRAINT export_logs_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- 2. New columns on cases for export-stale tracking
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS last_exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_material_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS export_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS so_number text;

-- 3. exported_by on export_logs
ALTER TABLE public.export_logs
  ADD COLUMN IF NOT EXISTS exported_by text;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON public.cases(case_number);
CREATE INDEX IF NOT EXISTS idx_cases_project_number ON public.cases(project_number);
CREATE INDEX IF NOT EXISTS idx_articles_article_number ON public.articles(article_number);
CREATE INDEX IF NOT EXISTS idx_liander_items_article_number ON public.liander_assortment_items(article_number);
CREATE INDEX IF NOT EXISTS idx_cml_case_id ON public.case_material_lines(case_id);
CREATE INDEX IF NOT EXISTS idx_cml_article_number ON public.case_material_lines(article_number);
CREATE INDEX IF NOT EXISTS idx_cml_category_id ON public.case_material_lines(category_id);
CREATE INDEX IF NOT EXISTS idx_col_case_id ON public.case_order_lines(case_id);
CREATE INDEX IF NOT EXISTS idx_vol_case_id ON public.verkooporder_lines(case_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_case_id ON public.export_logs(case_id);

-- 5. Trigger: mark export stale on material change
CREATE OR REPLACE FUNCTION public.mark_export_stale_on_material()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_case_id uuid;
BEGIN
  v_case_id := COALESCE(NEW.case_id, OLD.case_id);
  UPDATE public.cases
    SET last_material_change_at = now(),
        export_stale = CASE WHEN last_exported_at IS NOT NULL THEN true ELSE export_stale END,
        status = CASE WHEN status = 'geexporteerd' THEN 'in_bewerking' ELSE status END
    WHERE id = v_case_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_cml_mark_stale ON public.case_material_lines;
CREATE TRIGGER trg_cml_mark_stale
AFTER INSERT OR UPDATE OR DELETE ON public.case_material_lines
FOR EACH ROW EXECUTE FUNCTION public.mark_export_stale_on_material();

-- 6. Trigger: mark export stale when verkooporder settings on cases change
CREATE OR REPLACE FUNCTION public.mark_export_stale_on_case_settings()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.so_number IS DISTINCT FROM OLD.so_number)
     OR (NEW.so_customernumber IS DISTINCT FROM OLD.so_customernumber)
     OR (NEW.so_project IS DISTINCT FROM OLD.so_project) THEN
    IF OLD.last_exported_at IS NOT NULL THEN
      NEW.export_stale := true;
      IF NEW.status = 'geexporteerd' THEN
        NEW.status := 'in_bewerking';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cases_settings_stale ON public.cases;
CREATE TRIGGER trg_cases_settings_stale
BEFORE UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.mark_export_stale_on_case_settings();
