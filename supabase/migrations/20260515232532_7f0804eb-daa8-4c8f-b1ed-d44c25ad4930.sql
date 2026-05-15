
DROP FUNCTION IF EXISTS public.get_case_material_lines_with_status(uuid);

CREATE OR REPLACE FUNCTION public.get_case_material_lines_with_status(p_case_id uuid)
RETURNS TABLE(
  id uuid, case_id uuid, article_id uuid, article_number text, description text,
  sort_order integer, quantity numeric, unit text, used_quantity numeric,
  return_quantity numeric, total_quantity numeric, note text,
  category_id uuid, category_code text, charge_or_haspel_number text,
  is_manual boolean, is_auto_generated boolean, source_rule text,
  created_at timestamptz, updated_at timestamptz,
  liander_status text, liander_description text, liander_unit text,
  template_line_id uuid, excel_row_number integer,
  formula_source_text text, formula_status text, source_template_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    cml.id, cml.case_id, cml.article_id, cml.article_number, cml.description,
    cml.sort_order, cml.quantity, cml.unit, cml.used_quantity,
    cml.return_quantity, cml.total_quantity, cml.note,
    cml.category_id, cml.category_code, cml.charge_or_haspel_number,
    cml.is_manual, cml.is_auto_generated, cml.source_rule,
    cml.created_at, cml.updated_at,
    CASE
      WHEN cml.article_number IS NULL OR btrim(cml.article_number) = '' THEN 'unknown'
      WHEN l.id IS NULL THEN 'not_found'
      WHEN l.active = true THEN 'active'
      ELSE 'inactive'
    END AS liander_status,
    l.description AS liander_description,
    l.unit        AS liander_unit,
    cml.template_line_id, cml.excel_row_number,
    cml.formula_source_text, cml.formula_status, cml.source_template_id
  FROM public.case_material_lines cml
  LEFT JOIN public.liander_assortment_items l
    ON l.article_number = btrim(cml.article_number)
  WHERE cml.case_id = p_case_id
  ORDER BY cml.sort_order ASC, cml.article_number ASC NULLS LAST
$$;
