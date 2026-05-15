-- Index voor sort-volgorde lookups (geen UNIQUE: normalize/swap/handmatig zou anders breken)
CREATE INDEX IF NOT EXISTS idx_cml_case_cat_sort
  ON public.case_material_lines (case_id, category_id, sort_order);

-- Helper: case markeren als materiaal-gewijzigd / export verouderd
CREATE OR REPLACE FUNCTION public._mark_case_material_dirty(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cases
     SET last_material_change_at = now(),
         export_stale = CASE WHEN last_exported_at IS NOT NULL THEN true ELSE export_stale END,
         status = CASE WHEN status = 'geexporteerd' THEN 'in_bewerking' ELSE status END
   WHERE id = p_case_id;
END $$;

-- Reorder up/down binnen dezelfde categorie (atomaire swap)
CREATE OR REPLACE FUNCTION public.reorder_case_material_line(
  p_case_id uuid,
  p_line_id uuid,
  p_direction text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur   record;
  v_swap  record;
  v_tmp   numeric;
BEGIN
  SELECT id, sort_order, category_id
    INTO v_cur
    FROM public.case_material_lines
   WHERE id = p_line_id AND case_id = p_case_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'line_not_found');
  END IF;

  IF p_direction = 'up' THEN
    SELECT id, sort_order INTO v_swap
      FROM public.case_material_lines
     WHERE case_id = p_case_id
       AND category_id IS NOT DISTINCT FROM v_cur.category_id
       AND sort_order < v_cur.sort_order
     ORDER BY sort_order DESC
     LIMIT 1
     FOR UPDATE;
  ELSIF p_direction = 'down' THEN
    SELECT id, sort_order INTO v_swap
      FROM public.case_material_lines
     WHERE case_id = p_case_id
       AND category_id IS NOT DISTINCT FROM v_cur.category_id
       AND sort_order > v_cur.sort_order
     ORDER BY sort_order ASC
     LIMIT 1
     FOR UPDATE;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_direction');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_neighbor');
  END IF;

  -- Swap via tijdelijk negatieve waarde om eventuele toekomstige unique-index niet te raken
  v_tmp := -1 * (extract(epoch FROM clock_timestamp())::numeric);
  UPDATE public.case_material_lines SET sort_order = v_tmp           WHERE id = v_cur.id;
  UPDATE public.case_material_lines SET sort_order = v_cur.sort_order WHERE id = v_swap.id;
  UPDATE public.case_material_lines SET sort_order = v_swap.sort_order WHERE id = v_cur.id;

  PERFORM public._mark_case_material_dirty(p_case_id);

  RETURN jsonb_build_object(
    'success', true,
    'line_id', v_cur.id,
    'new_sort_order', v_swap.sort_order
  );
END $$;

-- Verplaats regel naar een andere categorie, achteraan in die categorie
CREATE OR REPLACE FUNCTION public.move_case_material_line_to_category(
  p_case_id uuid,
  p_line_id uuid,
  p_category_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max  numeric;
  v_code text;
BEGIN
  SELECT category_code INTO v_code FROM public.categories WHERE id = p_category_id;

  SELECT COALESCE(max(sort_order), 0) INTO v_max
    FROM public.case_material_lines
   WHERE case_id = p_case_id
     AND category_id IS NOT DISTINCT FROM p_category_id;

  UPDATE public.case_material_lines
     SET category_id   = p_category_id,
         category_code = v_code,
         sort_order    = v_max + 10
   WHERE id = p_line_id AND case_id = p_case_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'line_not_found');
  END IF;

  PERFORM public._mark_case_material_dirty(p_case_id);

  RETURN jsonb_build_object('success', true, 'new_sort_order', v_max + 10);
END $$;

-- Normaliseer sort_order naar 10/20/30/... per categorie binnen een case
CREATE OR REPLACE FUNCTION public.normalize_case_material_sort_order(
  p_case_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH ranked AS (
    SELECT id,
           (row_number() OVER (
             PARTITION BY category_id
             ORDER BY sort_order, article_number, created_at
           )) * 10 AS new_sort
      FROM public.case_material_lines
     WHERE case_id = p_case_id
  )
  UPDATE public.case_material_lines cml
     SET sort_order = ranked.new_sort
    FROM ranked
   WHERE cml.id = ranked.id
     AND cml.sort_order IS DISTINCT FROM ranked.new_sort;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM public._mark_case_material_dirty(p_case_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', v_count);
END $$;

-- Materiaalregels van een case mét Liander-matchstatus
CREATE OR REPLACE FUNCTION public.get_case_material_lines_with_status(
  p_case_id uuid
) RETURNS TABLE (
  id uuid,
  case_id uuid,
  article_id uuid,
  article_number text,
  description text,
  sort_order int,
  quantity numeric,
  unit text,
  used_quantity numeric,
  return_quantity numeric,
  total_quantity numeric,
  note text,
  category_id uuid,
  category_code text,
  charge_or_haspel_number text,
  is_manual boolean,
  is_auto_generated boolean,
  source_rule text,
  created_at timestamptz,
  updated_at timestamptz,
  liander_status text,
  liander_description text,
  liander_unit text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    l.unit        AS liander_unit
  FROM public.case_material_lines cml
  LEFT JOIN public.liander_assortment_items l
    ON l.article_number = btrim(cml.article_number)
  WHERE cml.case_id = p_case_id
  ORDER BY cml.sort_order ASC, cml.article_number ASC NULLS LAST
$$;

-- Bulk lookup van artikelnummers in articles + actieve Liander
CREATE OR REPLACE FUNCTION public.lookup_material_articles(
  p_article_numbers text[]
) RETURNS TABLE (
  article_number text,
  found boolean,
  source text,
  description text,
  unit text,
  category_id uuid,
  category_code text,
  liander_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT DISTINCT btrim(elem) AS article_number
      FROM unnest(p_article_numbers) AS elem
     WHERE elem IS NOT NULL AND btrim(elem) <> ''
  ),
  art AS (
    SELECT a.article_number, a.description, a.unit, a.category_id, a.category_code
      FROM public.articles a
      JOIN input i ON i.article_number = a.article_number
     WHERE a.active = true
  ),
  lia AS (
    SELECT l.article_number, l.description, l.unit, l.active
      FROM public.liander_assortment_items l
      JOIN input i ON i.article_number = l.article_number
  )
  SELECT
    i.article_number,
    (a.article_number IS NOT NULL OR l.article_number IS NOT NULL) AS found,
    CASE
      WHEN a.article_number IS NOT NULL AND l.article_number IS NOT NULL THEN 'both'
      WHEN a.article_number IS NOT NULL THEN 'articles'
      WHEN l.article_number IS NOT NULL THEN 'liander'
      ELSE 'none'
    END AS source,
    COALESCE(a.description, l.description) AS description,
    COALESCE(a.unit, l.unit)               AS unit,
    a.category_id, a.category_code,
    CASE
      WHEN l.article_number IS NULL THEN 'not_found'
      WHEN l.active = true THEN 'active'
      ELSE 'inactive'
    END AS liander_status
  FROM input i
  LEFT JOIN art a ON a.article_number = i.article_number
  LEFT JOIN lia l ON l.article_number = i.article_number
$$;

-- Bulk insert van materiaalregels in één transactie, met sort_order achteraan per categorie
CREATE OR REPLACE FUNCTION public.bulk_add_case_material_lines(
  p_case_id uuid,
  p_lines   jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_lines', 'inserted', 0);
  END IF;

  WITH input AS (
    SELECT
      elem,
      NULLIF(elem->>'category_id','')::uuid AS category_id,
      ord
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(elem, ord)
  ),
  per_cat AS (
    SELECT category_id, COALESCE(max(sort_order), 0) AS base
      FROM public.case_material_lines
     WHERE case_id = p_case_id
     GROUP BY category_id
  ),
  ranked AS (
    SELECT
      i.elem,
      i.category_id,
      COALESCE(p.base, 0)
        + (row_number() OVER (PARTITION BY i.category_id ORDER BY i.ord)) * 10 AS new_sort
    FROM input i
    LEFT JOIN per_cat p ON p.category_id IS NOT DISTINCT FROM i.category_id
  )
  INSERT INTO public.case_material_lines (
    case_id, article_id, article_number, description, unit,
    category_id, category_code, sort_order,
    quantity, used_quantity, return_quantity, total_quantity,
    note, is_manual, is_auto_generated, source_rule,
    charge_or_haspel_number
  )
  SELECT
    p_case_id,
    NULLIF(elem->>'article_id','')::uuid,
    NULLIF(elem->>'article_number',''),
    NULLIF(elem->>'description',''),
    NULLIF(elem->>'unit',''),
    category_id,
    NULLIF(elem->>'category_code',''),
    new_sort,
    COALESCE((elem->>'quantity')::numeric, 0),
    COALESCE((elem->>'used_quantity')::numeric, 0),
    COALESCE((elem->>'return_quantity')::numeric, 0),
    COALESCE((elem->>'total_quantity')::numeric, 0),
    NULLIF(elem->>'note',''),
    COALESCE((elem->>'is_manual')::boolean, false),
    COALESCE((elem->>'is_auto_generated')::boolean, false),
    NULLIF(elem->>'source_rule',''),
    NULLIF(elem->>'charge_or_haspel_number','')
  FROM ranked;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    PERFORM public._mark_case_material_dirty(p_case_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END $$;