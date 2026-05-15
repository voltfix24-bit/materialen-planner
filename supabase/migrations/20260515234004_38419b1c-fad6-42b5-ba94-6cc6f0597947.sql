-- 1. Add explicit excel template id mapping to categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS excel_template_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS categories_excel_template_id_key
  ON public.categories(excel_template_id)
  WHERE excel_template_id IS NOT NULL;

-- Backfill the 19 known categories by name
UPDATE public.categories SET excel_template_id = m.eid
FROM (VALUES
  ('Kabels',1),('MS Installatie',2),('MS patronen',3),('Aarding',4),
  ('Eindsluitingen MS',5),('Moffen MS',6),('Magnefix',7),('LS-rek',8),
  ('Stationsinrichting',9),('I-Netten',10),('Trafo',11),('Overige',12),
  ('Asbest',13),('Moffen LS',14),('Standaard voorraad',15),('Extra voorraad',16),
  ('Compact station',17),('Mantelbuis',18),('Algemeen',19)
) AS m(nm, eid)
WHERE public.categories.name = m.nm
  AND (public.categories.excel_template_id IS DISTINCT FROM m.eid);

COMMENT ON COLUMN public.categories.sort_order IS 'UI-volgorde van categorieën in de Materiaalstaat';
COMMENT ON COLUMN public.categories.excel_template_id IS 'Mapping naar Excel-template categorie-ID (1..19). Onafhankelijk van sort_order.';

-- 2. Update process_material_template_import to map via excel_template_id (no more sort_order/10)
CREATE OR REPLACE FUNCTION public.process_material_template_import(
  p_name text, p_version text, p_source_file_name text, p_source_sheet_name text,
  p_lines jsonb, p_notes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id   uuid;
  v_total         int := 0;
  v_articles      int := 0;
  v_headers       int := 0;
  v_formulas      int := 0;
  v_warnings      int := 0;
  v_unmapped_cats int := 0;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'name_required');
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_lines');
  END IF;

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

  -- Mapping is now EXCLUSIVELY via categories.excel_template_id (geen sort_order/10 meer)
  WITH cats AS (
    SELECT id, category_code, excel_template_id
      FROM public.categories
     WHERE excel_template_id IS NOT NULL
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
  LEFT JOIN cats c
    ON c.excel_template_id = NULLIF(elem->>'excel_category_id','')::int;

  GET DIAGNOSTICS v_total = ROW_COUNT;

  SELECT
    count(*) FILTER (WHERE is_section_header),
    count(*) FILTER (WHERE is_formula_quantity OR total_formula_text IS NOT NULL),
    count(*) FILTER (WHERE category_id IS NULL AND NOT is_section_header AND NOT is_blank_or_separator),
    count(*) FILTER (
      WHERE category_id IS NULL
        AND excel_category_id IS NOT NULL
        AND NOT is_section_header
        AND NOT is_blank_or_separator
    )
  INTO v_headers, v_formulas, v_warnings, v_unmapped_cats
  FROM public.material_template_lines
  WHERE template_id = v_template_id;

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'total_lines', v_total,
    'article_lines_count', v_articles,
    'section_headers_count', v_headers,
    'formula_lines_count', v_formulas,
    'warning_count', v_warnings,
    'unmapped_category_count', v_unmapped_cats
  );
END $function$;