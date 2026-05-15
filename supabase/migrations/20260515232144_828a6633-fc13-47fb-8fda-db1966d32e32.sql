
-- Templates
CREATE TABLE public.material_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text,
  source_file_name text,
  source_sheet_name text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.material_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY v1_open_select ON public.material_templates FOR SELECT USING (true);
CREATE POLICY v1_open_insert ON public.material_templates FOR INSERT WITH CHECK (true);
CREATE POLICY v1_open_update ON public.material_templates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY v1_open_delete ON public.material_templates FOR DELETE USING (true);
CREATE TRIGGER trg_material_templates_updated BEFORE UPDATE ON public.material_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.material_template_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.material_templates(id) ON DELETE CASCADE,
  excel_row_number integer,
  article_number text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  default_quantity numeric,
  unit text,
  default_used_quantity numeric,
  default_return_quantity numeric,
  default_total_quantity numeric,
  note text,
  category_id uuid,
  category_code text,
  excel_category_id integer,
  is_section_header boolean NOT NULL DEFAULT false,
  is_blank_or_separator boolean NOT NULL DEFAULT false,
  is_formula_quantity boolean NOT NULL DEFAULT false,
  quantity_formula_text text,
  total_formula_text text,
  formula_references jsonb,
  source_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mtl_template ON public.material_template_lines(template_id, sort_order);
ALTER TABLE public.material_template_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY v1_open_select ON public.material_template_lines FOR SELECT USING (true);
CREATE POLICY v1_open_insert ON public.material_template_lines FOR INSERT WITH CHECK (true);
CREATE POLICY v1_open_update ON public.material_template_lines FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY v1_open_delete ON public.material_template_lines FOR DELETE USING (true);
CREATE TRIGGER trg_mtl_updated BEFORE UPDATE ON public.material_template_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.case_template_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.material_templates(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text,
  lines_created_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cta_case ON public.case_template_applications(case_id);
ALTER TABLE public.case_template_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY v1_open_select ON public.case_template_applications FOR SELECT USING (true);
CREATE POLICY v1_open_insert ON public.case_template_applications FOR INSERT WITH CHECK (true);
CREATE POLICY v1_open_update ON public.case_template_applications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY v1_open_delete ON public.case_template_applications FOR DELETE USING (true);

-- Extend case_material_lines
ALTER TABLE public.case_material_lines
  ADD COLUMN IF NOT EXISTS template_line_id uuid,
  ADD COLUMN IF NOT EXISTS excel_row_number integer,
  ADD COLUMN IF NOT EXISTS formula_source_text text,
  ADD COLUMN IF NOT EXISTS formula_status text,
  ADD COLUMN IF NOT EXISTS source_template_id uuid;

CREATE INDEX IF NOT EXISTS idx_cml_source_template ON public.case_material_lines(case_id, source_template_id);

-- Apply RPC
CREATE OR REPLACE FUNCTION public.apply_material_template_to_case(
  p_case_id uuid,
  p_template_id uuid,
  p_mode text DEFAULT 'append'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_skipped_headers int := 0;
  v_formula int := 0;
  v_warnings int := 0;
  v_base_sort int := 0;
  v_app_id uuid;
BEGIN
  IF p_case_id IS NULL OR p_template_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_params');
  END IF;

  IF p_mode NOT IN ('append', 'replace_template_lines') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
  END IF;

  IF p_mode = 'replace_template_lines' THEN
    DELETE FROM public.case_material_lines
     WHERE case_id = p_case_id AND source_template_id = p_template_id;
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) INTO v_base_sort
    FROM public.case_material_lines WHERE case_id = p_case_id;

  SELECT count(*) FILTER (WHERE is_section_header)
    INTO v_skipped_headers
    FROM public.material_template_lines
   WHERE template_id = p_template_id;

  SELECT count(*) FILTER (WHERE category_id IS NULL AND NOT is_section_header AND NOT is_blank_or_separator)
    INTO v_warnings
    FROM public.material_template_lines
   WHERE template_id = p_template_id;

  WITH src AS (
    SELECT *,
      row_number() OVER (ORDER BY sort_order, excel_row_number, id) AS rn
    FROM public.material_template_lines
    WHERE template_id = p_template_id
      AND NOT is_section_header
      AND NOT is_blank_or_separator
  )
  INSERT INTO public.case_material_lines (
    case_id, article_number, description, unit,
    quantity, used_quantity, return_quantity, total_quantity,
    note, category_id, category_code, sort_order,
    is_manual, is_auto_generated, source_rule,
    template_line_id, excel_row_number,
    formula_source_text, formula_status, source_template_id
  )
  SELECT
    p_case_id,
    src.article_number,
    src.description,
    src.unit,
    COALESCE(src.default_quantity, 0),
    COALESCE(src.default_used_quantity, 0),
    COALESCE(src.default_return_quantity, 0),
    COALESCE(src.default_quantity, 0) - COALESCE(src.default_return_quantity, 0),
    src.note,
    src.category_id,
    src.category_code,
    v_base_sort + (src.rn::int * 10),
    false, false, 'template',
    src.id,
    src.excel_row_number,
    COALESCE(src.quantity_formula_text, src.total_formula_text),
    CASE WHEN src.is_formula_quantity OR src.quantity_formula_text IS NOT NULL OR src.total_formula_text IS NOT NULL
         THEN 'stored_not_active' ELSE 'none' END,
    p_template_id
  FROM src;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT count(*) INTO v_formula
    FROM public.case_material_lines
   WHERE case_id = p_case_id
     AND source_template_id = p_template_id
     AND formula_status = 'stored_not_active';

  INSERT INTO public.case_template_applications
    (case_id, template_id, lines_created_count, status, note)
  VALUES (p_case_id, p_template_id, v_inserted, 'success', p_mode)
  RETURNING id INTO v_app_id;

  IF v_inserted > 0 THEN
    PERFORM public.mark_case_as_material_dirty(p_case_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_app_id,
    'lines_created_count', v_inserted,
    'skipped_headers_count', v_skipped_headers,
    'formula_lines_count', v_formula,
    'warning_count', v_warnings
  );
END $$;
