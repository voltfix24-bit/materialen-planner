
-- 1. Foreign keys (idempotent via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_template_applications_case_id_fkey') THEN
    ALTER TABLE public.case_template_applications
      ADD CONSTRAINT case_template_applications_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_template_lines_category_id_fkey') THEN
    ALTER TABLE public.material_template_lines
      ADD CONSTRAINT material_template_lines_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_material_lines_template_line_id_fkey') THEN
    ALTER TABLE public.case_material_lines
      ADD CONSTRAINT case_material_lines_template_line_id_fkey
      FOREIGN KEY (template_line_id) REFERENCES public.material_template_lines(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_material_lines_source_template_id_fkey') THEN
    ALTER TABLE public.case_material_lines
      ADD CONSTRAINT case_material_lines_source_template_id_fkey
      FOREIGN KEY (source_template_id) REFERENCES public.material_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_mtl_template_id           ON public.material_template_lines(template_id);
CREATE INDEX IF NOT EXISTS idx_mtl_article_number        ON public.material_template_lines(article_number);
CREATE INDEX IF NOT EXISTS idx_mtl_excel_row             ON public.material_template_lines(excel_row_number);
CREATE INDEX IF NOT EXISTS idx_cta_case_id               ON public.case_template_applications(case_id);
CREATE INDEX IF NOT EXISTS idx_cta_template_id           ON public.case_template_applications(template_id);
CREATE INDEX IF NOT EXISTS idx_cml_case_source_template  ON public.case_material_lines(case_id, source_template_id);
CREATE INDEX IF NOT EXISTS idx_cml_case_template_line    ON public.case_material_lines(case_id, template_line_id);

-- 3. Transactional template import RPC
CREATE OR REPLACE FUNCTION public.process_material_template_import(
  p_name              text,
  p_version           text,
  p_source_file_name  text,
  p_source_sheet_name text,
  p_lines             jsonb,
  p_notes             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id   uuid;
  v_total         int := 0;
  v_articles      int := 0;
  v_headers       int := 0;
  v_formulas      int := 0;
  v_warnings      int := 0;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'name_required');
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_lines');
  END IF;

  -- Validate at least one article line exists
  SELECT count(*) INTO v_articles
    FROM jsonb_array_elements(p_lines) elem
   WHERE COALESCE((elem->>'is_section_header')::bool, false) = false
     AND COALESCE((elem->>'is_blank_or_separator')::bool, false) = false
     AND NULLIF(btrim(COALESCE(elem->>'article_number', '')), '') IS NOT NULL;

  IF v_articles = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_article_lines');
  END IF;

  INSERT INTO public.material_templates
    (name, version, source_file_name, source_sheet_name, active, notes)
  VALUES
    (btrim(p_name), NULLIF(btrim(COALESCE(p_version, '')), ''),
     p_source_file_name, p_source_sheet_name, true, p_notes)
  RETURNING id INTO v_template_id;

  WITH cats AS (
    SELECT id, category_code,
           CASE WHEN sort_order > 0 THEN (sort_order / 10)::int ELSE NULL END AS excel_id
      FROM public.categories
  )
  INSERT INTO public.material_template_lines (
    template_id, excel_row_number, article_number, description, sort_order,
    default_quantity, unit, default_used_quantity, default_return_quantity,
    default_total_quantity, note, category_id, category_code, excel_category_id,
    is_section_header, is_blank_or_separator, is_formula_quantity,
    quantity_formula_text, total_formula_text, formula_references, source_type
  )
  SELECT
    v_template_id,
    NULLIF(elem->>'excel_row_number','')::int,
    NULLIF(elem->>'article_number',''),
    NULLIF(elem->>'description',''),
    COALESCE((elem->>'sort_order')::int, 0),
    NULLIF(elem->>'default_quantity','')::numeric,
    NULLIF(elem->>'unit',''),
    NULLIF(elem->>'default_used_quantity','')::numeric,
    NULLIF(elem->>'default_return_quantity','')::numeric,
    NULLIF(elem->>'default_total_quantity','')::numeric,
    NULLIF(elem->>'note',''),
    c.id,
    c.category_code,
    NULLIF(elem->>'excel_category_id','')::int,
    COALESCE((elem->>'is_section_header')::bool, false),
    COALESCE((elem->>'is_blank_or_separator')::bool, false),
    COALESCE((elem->>'is_formula_quantity')::bool, false),
    NULLIF(elem->>'quantity_formula_text',''),
    NULLIF(elem->>'total_formula_text',''),
    elem->'formula_references',
    NULLIF(elem->>'source_type','')
  FROM jsonb_array_elements(p_lines) elem
  LEFT JOIN cats c ON c.excel_id = NULLIF(elem->>'excel_category_id','')::int;

  GET DIAGNOSTICS v_total = ROW_COUNT;

  SELECT
    count(*) FILTER (WHERE is_section_header),
    count(*) FILTER (WHERE is_formula_quantity OR total_formula_text IS NOT NULL),
    count(*) FILTER (WHERE category_id IS NULL AND NOT is_section_header AND NOT is_blank_or_separator)
  INTO v_headers, v_formulas, v_warnings
  FROM public.material_template_lines
  WHERE template_id = v_template_id;

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'total_lines', v_total,
    'article_lines_count', v_articles,
    'section_headers_count', v_headers,
    'formula_lines_count', v_formulas,
    'warning_count', v_warnings
  );
END $$;

-- 4. Rebuild apply_material_template_to_case with append_missing + replace_template_lines
--    + article_id binding to active articles
DROP FUNCTION IF EXISTS public.apply_material_template_to_case(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.apply_material_template_to_case(
  p_case_id     uuid,
  p_template_id uuid,
  p_mode        text DEFAULT 'append_missing'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted          int := 0;
  v_skipped_existing  int := 0;
  v_skipped_headers   int := 0;
  v_formula           int := 0;
  v_warnings          int := 0;
  v_base_sort         int := 0;
  v_app_id            uuid;
  v_mode              text;
BEGIN
  IF p_case_id IS NULL OR p_template_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_params');
  END IF;

  -- Backwards compatibility: treat legacy 'append' as 'append_missing'
  v_mode := CASE WHEN p_mode = 'append' THEN 'append_missing' ELSE p_mode END;

  IF v_mode NOT IN ('append_missing', 'replace_template_lines') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
  END IF;

  IF v_mode = 'replace_template_lines' THEN
    DELETE FROM public.case_material_lines
     WHERE case_id = p_case_id AND source_template_id = p_template_id;
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) INTO v_base_sort
    FROM public.case_material_lines WHERE case_id = p_case_id;

  SELECT count(*) FILTER (WHERE is_section_header OR is_blank_or_separator)
    INTO v_skipped_headers
    FROM public.material_template_lines
   WHERE template_id = p_template_id;

  SELECT count(*) FILTER (WHERE category_id IS NULL AND NOT is_section_header AND NOT is_blank_or_separator)
    INTO v_warnings
    FROM public.material_template_lines
   WHERE template_id = p_template_id;

  -- Source template article-lines, skipping headers and blanks
  WITH src AS (
    SELECT mtl.*,
           row_number() OVER (ORDER BY mtl.sort_order, mtl.excel_row_number, mtl.id) AS rn,
           EXISTS (
             SELECT 1 FROM public.case_material_lines cml
              WHERE cml.case_id = p_case_id AND cml.template_line_id = mtl.id
           ) AS already_present
      FROM public.material_template_lines mtl
     WHERE mtl.template_id = p_template_id
       AND NOT mtl.is_section_header
       AND NOT mtl.is_blank_or_separator
  ),
  to_insert AS (
    SELECT s.*,
           a.id AS resolved_article_id
      FROM src s
      LEFT JOIN public.articles a
        ON a.active = true
       AND a.article_number = s.article_number
     WHERE s.already_present = false
  ),
  inserted AS (
    INSERT INTO public.case_material_lines (
      case_id, article_id, article_number, description, unit,
      quantity, used_quantity, return_quantity, total_quantity,
      note, category_id, category_code, sort_order,
      is_manual, is_auto_generated, source_rule,
      template_line_id, excel_row_number,
      formula_source_text, formula_status, source_template_id
    )
    SELECT
      p_case_id,
      ti.resolved_article_id,
      ti.article_number,
      ti.description,
      ti.unit,
      COALESCE(ti.default_quantity, 0),
      COALESCE(ti.default_used_quantity, 0),
      COALESCE(ti.default_return_quantity, 0),
      COALESCE(ti.default_quantity, 0) - COALESCE(ti.default_return_quantity, 0),
      ti.note,
      ti.category_id,
      ti.category_code,
      v_base_sort + (ti.rn::int * 10),
      false, false, 'template',
      ti.id,
      ti.excel_row_number,
      COALESCE(ti.quantity_formula_text, ti.total_formula_text),
      CASE WHEN ti.is_formula_quantity OR ti.quantity_formula_text IS NOT NULL OR ti.total_formula_text IS NOT NULL
           THEN 'stored_not_active' ELSE 'none' END,
      p_template_id
    FROM to_insert ti
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  SELECT count(*) FILTER (WHERE already_present)
    INTO v_skipped_existing
    FROM (
      SELECT EXISTS (
        SELECT 1 FROM public.case_material_lines cml
         WHERE cml.case_id = p_case_id AND cml.template_line_id = mtl.id
      ) AS already_present
      FROM public.material_template_lines mtl
      WHERE mtl.template_id = p_template_id
        AND NOT mtl.is_section_header
        AND NOT mtl.is_blank_or_separator
    ) q;

  -- In replace mode the existing rows were just deleted, so "skipped_existing" is 0
  IF v_mode = 'replace_template_lines' THEN
    v_skipped_existing := 0;
  END IF;

  SELECT count(*) INTO v_formula
    FROM public.case_material_lines
   WHERE case_id = p_case_id
     AND source_template_id = p_template_id
     AND formula_status = 'stored_not_active';

  INSERT INTO public.case_template_applications
    (case_id, template_id, lines_created_count, status, note)
  VALUES (p_case_id, p_template_id, v_inserted, 'success', v_mode)
  RETURNING id INTO v_app_id;

  IF v_inserted > 0 THEN
    PERFORM public.mark_case_as_material_dirty(p_case_id);
    PERFORM public.normalize_case_material_sort_order(p_case_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_app_id,
    'mode', v_mode,
    'lines_created_count', v_inserted,
    'skipped_existing_count', v_skipped_existing,
    'skipped_headers_count', v_skipped_headers,
    'formula_lines_count', v_formula,
    'warning_count', v_warnings
  );
END $$;
