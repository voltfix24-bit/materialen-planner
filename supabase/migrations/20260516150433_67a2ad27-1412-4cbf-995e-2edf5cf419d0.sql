-- Centrale readiness-functie
CREATE OR REPLACE FUNCTION public.get_case_export_readiness(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_case record;
  v_total_lines int := 0;
  v_lines_with_qty int := 0;
  v_missing_article int := 0;
  v_negative_total int := 0;
  v_formula_placeholder int := 0;
  v_charge_missing int := 0;
  v_aanvulling_lines int := 0;
  v_unmatched int := 0;
  v_inactive int := 0;
  v_verkooporder_lines int := 0;
  v_exportable_lines int := 0;
  v_last_export record;
  v_last_failed record;
  v_aanvulling_stale bool := false;
  v_verkooporder_stale bool := false;
  v_settings_missing text[] := ARRAY[]::text[];
  v_blocking jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_ready bool;
  v_status text;
BEGIN
  SELECT * INTO v_case FROM public.cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ready', false,
      'status', 'error',
      'blocking_count', 1,
      'warning_count', 0,
      'blocking_items', jsonb_build_array(jsonb_build_object(
        'code','case_not_found','message','Case niet gevonden.')),
      'warning_items', '[]'::jsonb,
      'summary', '{}'::jsonb
    );
  END IF;

  -- material stats
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

  -- charge/haspel missing where required
  SELECT count(*) INTO v_charge_missing
  FROM public.case_material_lines cml
  LEFT JOIN public.articles a ON a.id = cml.article_id
  WHERE cml.case_id = p_case_id
    AND COALESCE(cml.total_quantity,0) > 0
    AND COALESCE(a.requires_charge_or_haspel, false) = true
    AND (cml.charge_or_haspel_number IS NULL OR btrim(cml.charge_or_haspel_number) = '');

  SELECT count(*) INTO v_aanvulling_lines
    FROM public.case_order_lines WHERE case_id = p_case_id;

  SELECT count(*) INTO v_verkooporder_lines
    FROM public.verkooporder_lines WHERE case_id = p_case_id;

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

  SELECT count(*) INTO v_exportable_lines
  FROM public.case_order_lines
  WHERE case_id = p_case_id
    AND article_number IS NOT NULL
    AND btrim(article_number) <> ''
    AND COALESCE(customer_quantity,0) > 0;

  IF v_case.so_number IS NULL OR btrim(v_case.so_number)='' THEN
    v_settings_missing := array_append(v_settings_missing, 'so_number');
  END IF;
  IF v_case.so_customernumber IS NULL OR btrim(v_case.so_customernumber)='' THEN
    v_settings_missing := array_append(v_settings_missing, 'so_customernumber');
  END IF;
  IF v_case.so_project IS NULL OR btrim(v_case.so_project)='' THEN
    v_settings_missing := array_append(v_settings_missing, 'so_project');
  END IF;

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

  -- Compose blocking_items
  IF v_lines_with_qty = 0 THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','no_material_lines',
      'message','Geen materiaalregels met hoeveelheid > 0.'));
  END IF;
  IF 'so_number' = ANY(v_settings_missing) THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','missing_so_number','message','Vul so_number in op tabblad Overzicht.'));
  END IF;
  IF 'so_customernumber' = ANY(v_settings_missing) THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','missing_so_customernumber','message','Vul so_customernumber in op tabblad Overzicht.'));
  END IF;
  IF 'so_project' = ANY(v_settings_missing) THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','missing_so_project','message','Vul so_project in op tabblad Overzicht.'));
  END IF;
  IF v_missing_article > 0 THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','missing_article_number',
      'message', v_missing_article || ' materiaalregel(s) zonder artikelnummer.',
      'count', v_missing_article));
  END IF;
  IF v_negative_total > 0 THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','negative_total',
      'message', v_negative_total || ' materiaalregel(s) met negatief totaal.',
      'count', v_negative_total));
  END IF;
  IF v_aanvulling_lines = 0 THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','no_aanvulling','message','Bouw eerst Aanvulling op.'));
  END IF;
  IF v_aanvulling_stale THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','aanvulling_stale','message','Aanvulling is verouderd, bouw opnieuw op.'));
  END IF;
  IF v_aanvulling_lines > 0 AND v_exportable_lines = 0 THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'code','no_exportable_lines','message','Geen exporteerbare Aanvulling-regels (alle hoeveelheden 0 of artikelnummers ontbreken).'));
  END IF;

  -- Compose warnings
  IF v_unmatched > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','unmatched_liander',
      'message', v_unmatched || ' artikel(en) niet gevonden in actieve Liander-lijst.',
      'count', v_unmatched));
  END IF;
  IF v_inactive > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','inactive_liander',
      'message', v_inactive || ' artikel(en) inactief in Liander.',
      'count', v_inactive));
  END IF;
  IF v_formula_placeholder > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','formula_placeholder',
      'message', v_formula_placeholder || ' formule-placeholder(s) niet automatisch berekend.',
      'count', v_formula_placeholder));
  END IF;
  IF v_charge_missing > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','missing_charge_or_haspel',
      'message', v_charge_missing || ' regel(s) zonder charge/haspel waar vereist.',
      'count', v_charge_missing));
  END IF;
  IF v_verkooporder_lines = 0 AND v_aanvulling_lines > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','verkooporder_not_built','message','Verkooporder nog niet opgebouwd (export rebuildt zelf).'));
  END IF;
  IF v_verkooporder_stale THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','verkooporder_stale','message','Verkooporder mogelijk verouderd (export rebuildt zelf).'));
  END IF;
  IF v_last_failed.exported_at IS NOT NULL
     AND (v_last_export.exported_at IS NULL OR v_last_failed.exported_at > v_last_export.exported_at) THEN
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','last_export_failed',
      'message','Laatste exportpoging is mislukt: ' || COALESCE(v_last_failed.error_message,'onbekend')));
  END IF;

  v_ready := (jsonb_array_length(v_blocking) = 0);
  v_status := CASE
    WHEN NOT v_ready THEN 'blocked'
    WHEN jsonb_array_length(v_warnings) > 0 THEN 'ready_with_warnings'
    ELSE 'ready'
  END;

  RETURN jsonb_build_object(
    'ready', v_ready,
    'status', v_status,
    'blocking_count', jsonb_array_length(v_blocking),
    'warning_count', jsonb_array_length(v_warnings),
    'blocking_items', v_blocking,
    'warning_items', v_warnings,
    'summary', jsonb_build_object(
      'material_total_lines', v_total_lines,
      'material_lines_with_quantity', v_lines_with_qty,
      'missing_article_number', v_missing_article,
      'negative_total', v_negative_total,
      'formula_placeholder', v_formula_placeholder,
      'charge_missing', v_charge_missing,
      'aanvulling_lines', v_aanvulling_lines,
      'aanvulling_stale', v_aanvulling_stale,
      'verkooporder_lines', v_verkooporder_lines,
      'verkooporder_stale', v_verkooporder_stale,
      'unmatched_liander', v_unmatched,
      'inactive_liander', v_inactive,
      'exportable_aanvulling_lines', v_exportable_lines,
      'verkooporder_settings_missing', to_jsonb(v_settings_missing),
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
          'row_count', v_last_export.row_count
        ) END,
      'last_failed_export', CASE WHEN v_last_failed.exported_at IS NULL THEN NULL ELSE
        jsonb_build_object(
          'exported_at', v_last_failed.exported_at,
          'file_name', v_last_failed.file_name,
          'error_message', v_last_failed.error_message
        ) END
    )
  );
END
$$;

-- Backwards compatible wrapper: get_case_readiness uses centrale functie
CREATE OR REPLACE FUNCTION public.get_case_readiness(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
  s jsonb;
  blocking_msgs text[];
  warning_msgs text[];
BEGIN
  v := public.get_case_export_readiness(p_case_id);
  IF v ? 'error' THEN
    RETURN v;
  END IF;
  s := v->'summary';

  SELECT array_agg(elem->>'message') INTO blocking_msgs
    FROM jsonb_array_elements(v->'blocking_items') elem;
  SELECT array_agg(elem->>'message') INTO warning_msgs
    FROM jsonb_array_elements(v->'warning_items') elem;

  RETURN jsonb_build_object(
    'ready_for_export', v->'ready',
    'status', v->'status',
    'blocking', COALESCE(to_jsonb(blocking_msgs), '[]'::jsonb),
    'warnings', COALESCE(to_jsonb(warning_msgs), '[]'::jsonb),
    'blocking_items', v->'blocking_items',
    'warning_items', v->'warning_items',
    'checks', jsonb_build_object(
      'material_total_lines', s->'material_total_lines',
      'material_lines_with_quantity', s->'material_lines_with_quantity',
      'missing_article_number', s->'missing_article_number',
      'negative_total', s->'negative_total',
      'formula_placeholder', s->'formula_placeholder',
      'aanvulling_lines', s->'aanvulling_lines',
      'aanvulling_stale', s->'aanvulling_stale',
      'verkooporder_lines', s->'verkooporder_lines',
      'verkooporder_stale', s->'verkooporder_stale',
      'unmatched_liander', s->'unmatched_liander',
      'inactive_liander', s->'inactive_liander',
      'exportable_aanvulling_lines', s->'exportable_aanvulling_lines',
      'verkooporder_settings_missing', s->'verkooporder_settings_missing'
    ),
    'timestamps', s->'timestamps',
    'last_export', s->'last_export',
    'last_failed_export', s->'last_failed_export',
    'summary', s
  );
END
$$;

-- rebuild_verkooporder_lines: gebruik centrale validatie vooraf
CREATE OR REPLACE FUNCTION public.rebuild_verkooporder_lines(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_case             record;
  v_readiness        jsonb;
  v_blocking         jsonb;
  v_first_block      jsonb;
  v_inserted         int := 0;
  v_total_quantity   numeric := 0;
  v_source_count     int := 0;
BEGIN
  v_readiness := public.get_case_export_readiness(p_case_id);

  IF (v_readiness ? 'error') THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_not_found');
  END IF;

  v_blocking := v_readiness->'blocking_items';
  IF jsonb_array_length(v_blocking) > 0 THEN
    v_first_block := v_blocking->0;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'export_blocked',
      'error_code', v_first_block->>'code',
      'message', v_first_block->>'message',
      'blocking_items', v_blocking,
      'warning_items', v_readiness->'warning_items'
    );
  END IF;

  SELECT * INTO v_case FROM public.cases WHERE id = p_case_id;

  SELECT count(*) INTO v_source_count
    FROM public.case_order_lines WHERE case_id = p_case_id;

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

  UPDATE public.cases
     SET last_verkooporder_rebuild_at = now()
   WHERE id = p_case_id;

  RETURN jsonb_build_object(
    'success', true,
    'lines_created_count', v_inserted,
    'source_order_lines_count', v_source_count,
    'total_quantity', v_total_quantity,
    'warning_items', v_readiness->'warning_items',
    'warning_count', jsonb_array_length(v_readiness->'warning_items')
  );
END
$$;