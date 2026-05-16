CREATE OR REPLACE FUNCTION public.get_case_verbruik_lines(p_case_id uuid)
RETURNS TABLE(
  id uuid,
  case_id uuid,
  article_id uuid,
  article_number text,
  description text,
  unit text,
  quantity numeric,
  used_quantity numeric,
  return_quantity numeric,
  total_quantity numeric,
  charge_or_haspel_number text,
  note text,
  category_id uuid,
  category_code text,
  category_name text,
  category_sort_order int,
  sort_order int,
  excel_row_number int,
  template_line_id uuid,
  source_template_id uuid,
  formula_status text,
  formula_source_text text,
  is_manual boolean,
  is_auto_generated boolean,
  source_rule text,
  source_label text,
  liander_status text,
  liander_description text,
  liander_unit text,
  requires_charge_or_haspel boolean,
  warnings jsonb,
  has_blocking_warning boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT
      cml.*,
      cat.name AS category_name,
      cat.sort_order AS category_sort_order,
      l.id AS liander_id,
      l.active AS liander_active,
      l.description AS liander_description,
      l.unit AS liander_unit,
      COALESCE(a.requires_charge_or_haspel, false) AS requires_charge_or_haspel
    FROM public.case_material_lines cml
    LEFT JOIN public.categories cat ON cat.id = cml.category_id
    LEFT JOIN public.liander_assortment_items l
      ON l.article_number = btrim(cml.article_number)
    LEFT JOIN public.articles a
      ON a.id = cml.article_id
    WHERE cml.case_id = p_case_id
  ),
  enriched AS (
    SELECT
      b.*,
      CASE
        WHEN b.article_number IS NULL OR btrim(b.article_number) = '' THEN 'unknown'
        WHEN b.liander_id IS NULL THEN 'not_found'
        WHEN b.liander_active = true THEN 'active'
        ELSE 'inactive'
      END AS liander_status,
      CASE
        WHEN b.source_template_id IS NOT NULL OR b.template_line_id IS NOT NULL THEN 'template'
        WHEN b.is_manual THEN 'handmatig'
        WHEN b.is_auto_generated THEN 'auto'
        WHEN b.article_id IS NOT NULL THEN 'artikelbestand'
        ELSE 'overig'
      END AS source_label
    FROM base b
  ),
  with_warnings AS (
    SELECT
      e.*,
      (
        SELECT COALESCE(jsonb_agg(w), '[]'::jsonb) FROM (
          SELECT * FROM (VALUES
            (
              COALESCE(e.total_quantity, 0) > 0 AND (e.article_number IS NULL OR btrim(e.article_number) = ''),
              'missing_article_number'::text, 'Ontbrekend artikelnummer'::text, 'blocking'::text
            ),
            (
              COALESCE(e.total_quantity, 0) < 0,
              'negative_total', 'Negatief totaal', 'blocking'
            ),
            (
              e.formula_status = 'stored_not_active',
              'formula_not_active', 'Formule opgeslagen, niet automatisch berekend', 'warning'
            ),
            (
              e.article_number IS NOT NULL AND btrim(e.article_number) <> ''
              AND e.liander_id IS NULL,
              'not_in_liander', 'Niet in actieve Liander-lijst', 'warning'
            ),
            (
              e.liander_id IS NOT NULL AND e.liander_active = false,
              'liander_inactive', 'Liander-artikel inactief', 'warning'
            ),
            (
              COALESCE(e.requires_charge_or_haspel, false) = true
              AND (e.charge_or_haspel_number IS NULL OR btrim(e.charge_or_haspel_number) = ''),
              'missing_charge_or_haspel', 'Charge/haspel ontbreekt', 'warning'
            )
          ) AS v(active, code, label, severity)
          WHERE v.active
        ) w(active, code, label, severity)
      ) AS warnings
    FROM enriched e
  )
  SELECT
    w.id, w.case_id, w.article_id, w.article_number, w.description, w.unit,
    w.quantity, w.used_quantity, w.return_quantity, w.total_quantity,
    w.charge_or_haspel_number, w.note,
    w.category_id, w.category_code, w.category_name, w.category_sort_order,
    w.sort_order, w.excel_row_number, w.template_line_id, w.source_template_id,
    w.formula_status, w.formula_source_text,
    w.is_manual, w.is_auto_generated, w.source_rule, w.source_label,
    w.liander_status, w.liander_description, w.liander_unit,
    w.requires_charge_or_haspel,
    w.warnings,
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(w.warnings) ww
      WHERE ww->>'severity' = 'blocking'
    ) AS has_blocking_warning
  FROM with_warnings w
  WHERE
    COALESCE(w.total_quantity, 0) > 0
    OR COALESCE(w.used_quantity, 0) > 0
    OR COALESCE(w.return_quantity, 0) > 0
    OR (w.charge_or_haspel_number IS NOT NULL AND btrim(w.charge_or_haspel_number) <> '')
    OR w.formula_status = 'stored_not_active'
    OR jsonb_array_length(w.warnings) > 0
  ORDER BY
    w.category_sort_order NULLS LAST,
    w.sort_order NULLS LAST,
    w.excel_row_number NULLS LAST,
    w.article_number NULLS LAST;
$$;