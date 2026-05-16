-- rebuild_verkooporder_lines: bouwt verkooporder_lines vanuit case_order_lines (Aanvulling)
CREATE OR REPLACE FUNCTION public.rebuild_verkooporder_lines(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_case             record;
  v_missing          text[] := ARRAY[]::text[];
  v_warnings         jsonb := '[]'::jsonb;
  v_warning_count    int := 0;
  v_source_count     int := 0;
  v_inserted         int := 0;
  v_total_quantity   numeric := 0;
BEGIN
  SELECT id, case_number,
         so_number, so_customernumber, so_project,
         last_aanvulling_rebuild_at, last_material_change_at
    INTO v_case
    FROM public.cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_not_found');
  END IF;

  IF v_case.so_number IS NULL OR btrim(v_case.so_number) = '' THEN
    v_missing := array_append(v_missing, 'so_number');
  END IF;
  IF v_case.so_customernumber IS NULL OR btrim(v_case.so_customernumber) = '' THEN
    v_missing := array_append(v_missing, 'so_customernumber');
  END IF;
  IF v_case.so_project IS NULL OR btrim(v_case.so_project) = '' THEN
    v_missing := array_append(v_missing, 'so_project');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'missing_verkooporder_settings',
      'missing', to_jsonb(v_missing)
    );
  END IF;

  SELECT count(*) INTO v_source_count
    FROM public.case_order_lines
   WHERE case_id = p_case_id;

  IF v_source_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_aanvulling',
      'message', 'Bouw eerst Aanvulling op voordat je Verkooporder maakt.'
    );
  END IF;

  IF v_case.last_aanvulling_rebuild_at IS NULL THEN
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'aanvulling_not_built',
      'message', 'Aanvulling-rebuildtijd onbekend.'
    );
    v_warning_count := v_warning_count + 1;
  ELSIF v_case.last_material_change_at IS NOT NULL
        AND v_case.last_material_change_at > v_case.last_aanvulling_rebuild_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'aanvulling_stale',
      'message', 'Aanvulling is verouderd. Bouw eerst Aanvulling opnieuw op.'
    );
  END IF;

  -- Vervang verkooporder_lines atomisch
  DELETE FROM public.verkooporder_lines WHERE case_id = p_case_id;

  WITH agg AS (
    SELECT
      btrim(article_number) AS art,
      sum(COALESCE(customer_quantity, 0))::numeric AS qty
    FROM public.case_order_lines
    WHERE case_id = p_case_id
      AND article_number IS NOT NULL
      AND btrim(article_number) <> ''
      AND COALESCE(customer_quantity, 0) > 0
    GROUP BY btrim(article_number)
  ),
  ins AS (
    INSERT INTO public.verkooporder_lines
      (case_id, sol_articlenumber, sol_quantity, so_number, so_customernumber, so_project)
    SELECT
      p_case_id, a.art, a.qty,
      v_case.so_number, v_case.so_customernumber, v_case.so_project
    FROM agg a
    RETURNING sol_quantity
  )
  SELECT count(*), COALESCE(sum(sol_quantity), 0)
    INTO v_inserted, v_total_quantity
    FROM ins;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_exportable_lines',
      'message', 'Geen exporteerbare regels in de Aanvulling (alle hoeveelheden 0 of artikelnummers ontbreken).'
    );
  END IF;

  UPDATE public.cases
     SET last_verkooporder_rebuild_at = now()
   WHERE id = p_case_id;

  RETURN jsonb_build_object(
    'success', true,
    'lines_created_count', v_inserted,
    'source_order_lines_count', v_source_count,
    'total_quantity', v_total_quantity,
    'warning_count', v_warning_count,
    'warnings', v_warnings
  );
END
$function$;

-- get_case_verkooporder_lines: leesfunctie met versheid-context
CREATE OR REPLACE FUNCTION public.get_case_verkooporder_lines(p_case_id uuid)
RETURNS TABLE(
  verkooporder_line_id uuid,
  sol_articlenumber text,
  sol_quantity numeric,
  so_number text,
  so_customernumber text,
  so_project text,
  source_case_order_line_count integer,
  last_aanvulling_rebuild_at timestamptz,
  last_verkooporder_rebuild_at timestamptz,
  last_material_change_at timestamptz,
  last_exported_at timestamptz,
  case_status text,
  export_stale boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT btrim(article_number) AS art, count(*)::int AS cnt
    FROM public.case_order_lines
    WHERE case_id = p_case_id
      AND article_number IS NOT NULL
      AND btrim(article_number) <> ''
    GROUP BY btrim(article_number)
  ),
  c AS (
    SELECT last_aanvulling_rebuild_at, last_verkooporder_rebuild_at,
           last_material_change_at, last_exported_at, status, export_stale
      FROM public.cases WHERE id = p_case_id
  )
  SELECT
    v.id,
    v.sol_articlenumber,
    v.sol_quantity,
    v.so_number,
    v.so_customernumber,
    v.so_project,
    COALESCE(s.cnt, 0),
    (SELECT last_aanvulling_rebuild_at FROM c),
    (SELECT last_verkooporder_rebuild_at FROM c),
    (SELECT last_material_change_at FROM c),
    (SELECT last_exported_at FROM c),
    (SELECT status FROM c),
    (SELECT export_stale FROM c),
    v.created_at,
    v.updated_at
  FROM public.verkooporder_lines v
  LEFT JOIN src s ON s.art = v.sol_articlenumber
  WHERE v.case_id = p_case_id
  ORDER BY v.sol_articlenumber ASC;
$function$;