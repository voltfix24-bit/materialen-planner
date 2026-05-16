-- 1. Add last_aanvulling_rebuild_at to cases
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS last_aanvulling_rebuild_at timestamptz;

-- 2. Improved rebuild_case_order_lines
CREATE OR REPLACE FUNCTION public.rebuild_case_order_lines(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_matched_count               integer := 0;
  v_unmatched_count             integer := 0;
  v_inactive_count              integer := 0;
  v_missing_article_count       integer := 0;
  v_total_source_lines          integer := 0;
  v_total_source_articles       integer := 0;
  v_matched_articles            text[];
  v_unmatched_articles          text[];
  v_inactive_articles           text[];
  v_missing_article_number_lines jsonb;
BEGIN
  -- Source: alle relevante materiaalregels
  CREATE TEMP TABLE _src_all ON COMMIT DROP AS
  SELECT
    id,
    NULLIF(btrim(article_number), '') AS article_number,
    description,
    unit,
    COALESCE(total_quantity, 0)::numeric AS qty
  FROM public.case_material_lines
  WHERE case_id = p_case_id
    AND COALESCE(total_quantity, 0) > 0;

  SELECT count(*) INTO v_total_source_lines FROM _src_all;

  -- Regels zonder artikelnummer
  SELECT
    count(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'description', description, 'unit', unit, 'qty', qty
    )), '[]'::jsonb)
  INTO v_missing_article_count, v_missing_article_number_lines
  FROM _src_all
  WHERE article_number IS NULL;

  -- Per artikelnummer geaggregeerd (alleen met artikelnummer)
  CREATE TEMP TABLE _src ON COMMIT DROP AS
  SELECT
    article_number,
    max(description) AS description,
    max(unit)        AS unit,
    sum(qty)::numeric AS qty
  FROM _src_all
  WHERE article_number IS NOT NULL
  GROUP BY article_number;

  SELECT count(*) INTO v_total_source_articles FROM _src;

  -- Match tegen actieve Liander
  CREATE TEMP TABLE _matched ON COMMIT DROP AS
  SELECT s.article_number,
         COALESCE(l.description, s.description) AS description,
         COALESCE(l.unit, s.unit) AS unit,
         s.qty,
         l.id AS liander_id
  FROM _src s
  JOIN public.liander_assortment_items l
    ON l.article_number = s.article_number AND l.active = true;

  SELECT count(*), COALESCE(array_agg(article_number ORDER BY article_number), '{}')
    INTO v_matched_count, v_matched_articles FROM _matched;

  -- Inactief in Liander
  SELECT count(*), COALESCE(array_agg(s.article_number ORDER BY s.article_number), '{}')
    INTO v_inactive_count, v_inactive_articles
  FROM _src s
  JOIN public.liander_assortment_items l
    ON l.article_number = s.article_number AND l.active = false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.liander_assortment_items la
     WHERE la.article_number = s.article_number AND la.active = true
  );

  -- Niet gevonden in Liander (geen enkele match)
  SELECT count(*), COALESCE(array_agg(s.article_number ORDER BY s.article_number), '{}')
    INTO v_unmatched_count, v_unmatched_articles
  FROM _src s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.liander_assortment_items la
     WHERE la.article_number = s.article_number
  );

  -- Atomic replace
  DELETE FROM public.case_order_lines WHERE case_id = p_case_id;

  INSERT INTO public.case_order_lines
    (case_id, article_number, description, unit, customer_quantity,
     matched_liander_assortment_item_id, match_status)
  SELECT p_case_id, m.article_number, m.description, m.unit, m.qty,
         m.liander_id, 'matched'
  FROM _matched m;

  UPDATE public.cases
     SET last_aanvulling_rebuild_at = now()
   WHERE id = p_case_id;

  RETURN jsonb_build_object(
    'matched_count', v_matched_count,
    'unmatched_count', v_unmatched_count,
    'inactive_count', v_inactive_count,
    'missing_article_number_count', v_missing_article_count,
    'total_source_lines', v_total_source_lines,
    'total_source_articles', v_total_source_articles,
    'matched_articles', to_jsonb(v_matched_articles),
    'unmatched_articles', to_jsonb(v_unmatched_articles),
    'inactive_articles', to_jsonb(v_inactive_articles),
    'missing_article_number_lines', v_missing_article_number_lines
  );
END
$function$;

-- 3. Read RPC: gematchte aanvulling-regels (verrijkt)
CREATE OR REPLACE FUNCTION public.get_case_aanvulling_lines(p_case_id uuid)
RETURNS TABLE(
  case_order_line_id uuid,
  article_number text,
  description text,
  unit text,
  customer_quantity numeric,
  matched_liander_assortment_item_id uuid,
  match_status text,
  source_material_line_count integer,
  source_total_quantity numeric,
  liander_description text,
  liander_unit text,
  liander_active boolean,
  last_liander_import_date timestamptz,
  note text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT btrim(article_number) AS art,
           count(*)::int AS cnt,
           sum(COALESCE(total_quantity,0))::numeric AS total
    FROM public.case_material_lines
    WHERE case_id = p_case_id
      AND COALESCE(total_quantity,0) > 0
      AND article_number IS NOT NULL
      AND btrim(article_number) <> ''
    GROUP BY btrim(article_number)
  )
  SELECT
    o.id,
    o.article_number,
    o.description,
    o.unit,
    o.customer_quantity,
    o.matched_liander_assortment_item_id,
    o.match_status,
    COALESCE(s.cnt, 0),
    COALESCE(s.total, 0),
    l.description,
    l.unit,
    l.active,
    li.import_date,
    o.note
  FROM public.case_order_lines o
  LEFT JOIN public.liander_assortment_items l
    ON l.id = o.matched_liander_assortment_item_id
  LEFT JOIN public.liander_assortment_imports li
    ON li.id = l.import_id
  LEFT JOIN src s ON s.art = o.article_number
  WHERE o.case_id = p_case_id
  ORDER BY o.article_number ASC NULLS LAST;
$function$;

-- 4. Read RPC: niet-bestelbare regels
CREATE OR REPLACE FUNCTION public.get_case_aanvulling_unmatched_lines(p_case_id uuid)
RETURNS TABLE(
  article_number text,
  description text,
  unit text,
  source_total_quantity numeric,
  source_material_line_count integer,
  category_name text,
  reason text,
  liander_status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT
      NULLIF(btrim(cml.article_number), '') AS art,
      max(cml.description) AS description,
      max(cml.unit) AS unit,
      sum(COALESCE(cml.total_quantity,0))::numeric AS total,
      count(*)::int AS cnt,
      max(cat.name) AS category_name
    FROM public.case_material_lines cml
    LEFT JOIN public.categories cat ON cat.id = cml.category_id
    WHERE cml.case_id = p_case_id
      AND COALESCE(cml.total_quantity,0) > 0
    GROUP BY NULLIF(btrim(cml.article_number), '')
  ),
  classified AS (
    SELECT
      s.art,
      s.description,
      s.unit,
      s.total,
      s.cnt,
      s.category_name,
      CASE
        WHEN s.art IS NULL THEN 'missing_article_number'
        WHEN EXISTS (
          SELECT 1 FROM public.liander_assortment_items la
           WHERE la.article_number = s.art AND la.active = true
        ) THEN 'matched'
        WHEN EXISTS (
          SELECT 1 FROM public.liander_assortment_items la
           WHERE la.article_number = s.art
        ) THEN 'inactive'
        ELSE 'not_found'
      END AS liander_status
    FROM src s
  )
  SELECT
    c.art,
    c.description,
    c.unit,
    c.total,
    c.cnt,
    c.category_name,
    CASE c.liander_status
      WHEN 'missing_article_number' THEN 'Artikelnummer ontbreekt'
      WHEN 'inactive' THEN 'Artikel bestaat, maar is inactief in huidige Liander-lijst'
      WHEN 'not_found' THEN 'Niet gevonden in actieve Liander-lijst'
      ELSE ''
    END,
    c.liander_status
  FROM classified c
  WHERE c.liander_status <> 'matched'
  ORDER BY
    (c.liander_status = 'missing_article_number') DESC,
    c.liander_status,
    c.art NULLS LAST;
$function$;