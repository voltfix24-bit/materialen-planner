
CREATE OR REPLACE FUNCTION public.get_case_readiness(p_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case record;
  v_total_lines int := 0;
  v_lines_with_qty int := 0;
  v_missing_article int := 0;
  v_negative_total int := 0;
  v_formula_placeholder int := 0;
  v_aanvulling_lines int := 0;
  v_unmatched int := 0;
  v_inactive int := 0;
  v_missing_in_aanvulling int := 0;
  v_verkooporder_lines int := 0;
  v_exportable_lines int := 0;
  v_last_export record;
  v_last_failed record;
  v_aanvulling_stale bool := false;
  v_verkooporder_stale bool := false;
  v_settings_missing text[] := ARRAY[]::text[];
  v_blocking text[] := ARRAY[]::text[];
  v_warnings text[] := ARRAY[]::text[];
  v_ready bool;
BEGIN
  SELECT * INTO v_case FROM public.cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','case_not_found');
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE COALESCE(total_quantity,0) > 0),
    count(*) FILTER (
      WHERE COALESCE(total_quantity,0) > 0
        AND (article_number IS NULL OR btrim(article_number) = '')
    ),
    count(*) FILTER (WHERE COALESCE(total_quantity,0) < 0),
    count(*) FILTER (WHERE formula_status = 'stored_not_active')
  INTO v_total_lines, v_lines_with_qty, v_missing_article,
       v_negative_total, v_formula_placeholder
  FROM public.case_material_lines
  WHERE case_id = p_case_id;

  SELECT count(*) INTO v_aanvulling_lines
    FROM public.case_order_lines WHERE case_id = p_case_id;

  SELECT count(*) INTO v_verkooporder_lines
    FROM public.verkooporder_lines WHERE case_id = p_case_id;

  -- Stale flags
  IF v_case.last_aanvulling_rebuild_at IS NULL THEN
    v_aanvulling_stale := (v_aanvulling_lines > 0);
  ELSIF v_case.last_material_change_at IS NOT NULL
        AND v_case.last_material_change_at > v_case.last_aanvulling_rebuild_at THEN
    v_aanvulling_stale := true;
  END IF;

  IF v_case.last_verkooporder_rebuild_at IS NULL THEN
    v_verkooporder_stale := (v_verkooporder_lines > 0);
  ELSIF v_case.last_aanvulling_rebuild_at IS NOT NULL
        AND v_case.last_aanvulling_rebuild_at > v_case.last_verkooporder_rebuild_at THEN
    v_verkooporder_stale := true;
  END IF;

  -- Unmatched / inactive (from material lines vs liander)
  WITH src AS (
    SELECT DISTINCT NULLIF(btrim(article_number),'') AS art
    FROM public.case_material_lines
    WHERE case_id = p_case_id
      AND COALESCE(total_quantity,0) > 0
      AND article_number IS NOT NULL
      AND btrim(article_number) <> ''
  )
  SELECT
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM public.liander_assortment_items la WHERE la.article_number = s.art
      )
    ),
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM public.liander_assortment_items la
        WHERE la.article_number = s.art AND la.active = false
      ) AND NOT EXISTS (
        SELECT 1 FROM public.liander_assortment_items la
        WHERE la.article_number = s.art AND la.active = true
      )
    )
  INTO v_unmatched, v_inactive
  FROM src s;

  -- Exporteerbare aanvulling-regels
  SELECT count(*) INTO v_exportable_lines
  FROM public.case_order_lines
  WHERE case_id = p_case_id
    AND article_number IS NOT NULL
    AND btrim(article_number) <> ''
    AND COALESCE(customer_quantity,0) > 0;

  -- SO settings
  IF v_case.so_number IS NULL OR btrim(v_case.so_number)='' THEN
    v_settings_missing := array_append(v_settings_missing, 'so_number');
  END IF;
  IF v_case.so_customernumber IS NULL OR btrim(v_case.so_customernumber)='' THEN
    v_settings_missing := array_append(v_settings_missing, 'so_customernumber');
  END IF;
  IF v_case.so_project IS NULL OR btrim(v_case.so_project)='' THEN
    v_settings_missing := array_append(v_settings_missing, 'so_project');
  END IF;

  -- Last exports
  SELECT exported_at, file_name, row_count, status, error_message
    INTO v_last_export
  FROM public.export_logs
  WHERE case_id = p_case_id AND status = 'success'
  ORDER BY exported_at DESC LIMIT 1;

  SELECT exported_at, file_name, status, error_message
    INTO v_last_failed
  FROM public.export_logs
  WHERE case_id = p_case_id AND status = 'failed'
  ORDER BY exported_at DESC LIMIT 1;

  -- Compose blocking / warnings
  IF v_lines_with_qty = 0 THEN
    v_blocking := array_append(v_blocking, 'Geen materiaalregels met hoeveelheid > 0.');
  END IF;
  IF array_length(v_settings_missing,1) > 0 THEN
    v_blocking := array_append(v_blocking, 'Vul verkooporder-instellingen aan: ' || array_to_string(v_settings_missing, ', ') || '.');
  END IF;
  IF v_missing_article > 0 THEN
    v_blocking := array_append(v_blocking, v_missing_article || ' regel(s) zonder artikelnummer.');
  END IF;
  IF v_negative_total > 0 THEN
    v_blocking := array_append(v_blocking, v_negative_total || ' regel(s) met negatief totaal.');
  END IF;
  IF v_aanvulling_lines = 0 THEN
    v_blocking := array_append(v_blocking, 'Bouw eerst Aanvulling op.');
  END IF;
  IF v_aanvulling_stale THEN
    v_blocking := array_append(v_blocking, 'Aanvulling is verouderd, bouw opnieuw op.');
  END IF;
  IF v_aanvulling_lines > 0 AND v_exportable_lines = 0 THEN
    v_blocking := array_append(v_blocking, 'Geen exporteerbare Aanvulling-regels.');
  END IF;

  IF v_unmatched > 0 THEN
    v_warnings := array_append(v_warnings, v_unmatched || ' artikel(en) niet gevonden in actieve Liander-lijst.');
  END IF;
  IF v_inactive > 0 THEN
    v_warnings := array_append(v_warnings, v_inactive || ' artikel(en) inactief in Liander.');
  END IF;
  IF v_formula_placeholder > 0 THEN
    v_warnings := array_append(v_warnings, v_formula_placeholder || ' formule-placeholder(s) niet automatisch berekend.');
  END IF;
  IF v_verkooporder_stale THEN
    v_warnings := array_append(v_warnings, 'Verkooporder is verouderd t.o.v. Aanvulling (wordt opnieuw opgebouwd bij export).');
  END IF;

  v_ready := (array_length(v_blocking,1) IS NULL);

  RETURN jsonb_build_object(
    'ready_for_export', v_ready,
    'blocking', to_jsonb(v_blocking),
    'warnings', to_jsonb(v_warnings),
    'checks', jsonb_build_object(
      'material_total_lines', v_total_lines,
      'material_lines_with_quantity', v_lines_with_qty,
      'missing_article_number', v_missing_article,
      'negative_total', v_negative_total,
      'formula_placeholder', v_formula_placeholder,
      'aanvulling_lines', v_aanvulling_lines,
      'aanvulling_stale', v_aanvulling_stale,
      'unmatched_liander', v_unmatched,
      'inactive_liander', v_inactive,
      'verkooporder_lines', v_verkooporder_lines,
      'verkooporder_stale', v_verkooporder_stale,
      'exportable_aanvulling_lines', v_exportable_lines,
      'verkooporder_settings_missing', to_jsonb(v_settings_missing)
    ),
    'timestamps', jsonb_build_object(
      'last_material_change_at', v_case.last_material_change_at,
      'last_aanvulling_rebuild_at', v_case.last_aanvulling_rebuild_at,
      'last_verkooporder_rebuild_at', v_case.last_verkooporder_rebuild_at,
      'last_exported_at', v_case.last_exported_at,
      'export_stale', v_case.export_stale
    ),
    'last_export', CASE WHEN v_last_export.exported_at IS NULL THEN NULL ELSE
      jsonb_build_object(
        'exported_at', v_last_export.exported_at,
        'file_name', v_last_export.file_name,
        'row_count', v_last_export.row_count,
        'status', v_last_export.status
      ) END,
    'last_failed_export', CASE WHEN v_last_failed.exported_at IS NULL THEN NULL ELSE
      jsonb_build_object(
        'exported_at', v_last_failed.exported_at,
        'file_name', v_last_failed.file_name,
        'error_message', v_last_failed.error_message
      ) END
  );
END
$function$;
