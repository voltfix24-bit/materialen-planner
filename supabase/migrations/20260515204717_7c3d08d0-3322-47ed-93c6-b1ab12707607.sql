-- 1. Ensure functions exist (re-create idempotently)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_export_stale_on_material()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.mark_export_stale_on_case_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.so_number IS DISTINCT FROM OLD.so_number)
     OR (NEW.so_customernumber IS DISTINCT FROM OLD.so_customernumber)
     OR (NEW.so_project IS DISTINCT FROM OLD.so_project) THEN
    IF OLD.last_exported_at IS NOT NULL THEN
      NEW.export_stale := true;
      NEW.last_material_change_at := now();
      IF NEW.status = 'geexporteerd' THEN
        NEW.status := 'in_bewerking';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2. Drop & recreate stale triggers (idempotent)
DROP TRIGGER IF EXISTS trg_cml_mark_stale ON public.case_material_lines;
CREATE TRIGGER trg_cml_mark_stale
  AFTER INSERT OR UPDATE OR DELETE ON public.case_material_lines
  FOR EACH ROW EXECUTE FUNCTION public.mark_export_stale_on_material();

DROP TRIGGER IF EXISTS trg_cases_settings_stale ON public.cases;
CREATE TRIGGER trg_cases_settings_stale
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.mark_export_stale_on_case_settings();

-- 3. updated_at triggers
DROP TRIGGER IF EXISTS trg_cases_updated_at ON public.cases;
CREATE TRIGGER trg_cases_updated_at BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_articles_updated_at ON public.articles;
CREATE TRIGGER trg_articles_updated_at BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_liander_items_updated_at ON public.liander_assortment_items;
CREATE TRIGGER trg_liander_items_updated_at BEFORE UPDATE ON public.liander_assortment_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_case_material_lines_updated_at ON public.case_material_lines;
CREATE TRIGGER trg_case_material_lines_updated_at BEFORE UPDATE ON public.case_material_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_case_order_lines_updated_at ON public.case_order_lines;
CREATE TRIGGER trg_case_order_lines_updated_at BEFORE UPDATE ON public.case_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_verkooporder_lines_updated_at ON public.verkooporder_lines;
CREATE TRIGGER trg_verkooporder_lines_updated_at BEFORE UPDATE ON public.verkooporder_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. New columns
ALTER TABLE public.export_logs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS last_verkooporder_rebuild_at timestamptz;