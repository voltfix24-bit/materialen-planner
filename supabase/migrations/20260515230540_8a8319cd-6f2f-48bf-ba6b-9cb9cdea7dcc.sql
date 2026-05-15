CREATE OR REPLACE FUNCTION public.mark_case_as_material_dirty(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_case_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.cases
     SET last_material_change_at = now(),
         export_stale = CASE WHEN last_exported_at IS NOT NULL THEN true ELSE export_stale END,
         status = CASE WHEN status = 'geexporteerd' THEN 'in_bewerking' ELSE status END
   WHERE id = p_case_id;
END
$$;

CREATE OR REPLACE FUNCTION public.mark_export_stale_on_material()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_case_id uuid;
BEGIN
  v_case_id := COALESCE(NEW.case_id, OLD.case_id);
  PERFORM public.mark_case_as_material_dirty(v_case_id);
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public._mark_case_material_dirty(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.mark_case_as_material_dirty(p_case_id);
END
$$;

DROP FUNCTION IF EXISTS public.lookup_material_articles(text[]);

CREATE FUNCTION public.lookup_material_articles(p_article_numbers text[])
RETURNS TABLE(
  article_number text,
  found boolean,
  source text,
  article_id uuid,
  description text,
  unit text,
  category_id uuid,
  category_code text,
  liander_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input AS (
    SELECT DISTINCT btrim(elem) AS article_number
      FROM unnest(p_article_numbers) AS elem
     WHERE elem IS NOT NULL AND btrim(elem) <> ''
  ),
  art AS (
    SELECT a.id, a.article_number, a.description, a.unit, a.category_id, a.category_code
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
    a.id                                   AS article_id,
    COALESCE(a.description, l.description) AS description,
    COALESCE(a.unit, l.unit)               AS unit,
    a.category_id,
    a.category_code,
    CASE
      WHEN l.article_number IS NULL THEN 'not_found'
      WHEN l.active = true THEN 'active'
      ELSE 'inactive'
    END AS liander_status
  FROM input i
  LEFT JOIN art a ON a.article_number = i.article_number
  LEFT JOIN lia l ON l.article_number = i.article_number
$$;