-- 1. Update process_liander_assortment_import: detect duplicates server-side
CREATE OR REPLACE FUNCTION public.process_liander_assortment_import(
  p_file_name text,
  p_sheet_name text,
  p_header_row_index integer,
  p_rows jsonb,
  p_warnings jsonb,
  p_skipped_rows integer,
  p_total_rows integer,
  p_imported_by text DEFAULT 'system'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_import_id      uuid;
  v_new_count      integer := 0;
  v_updated_count  integer := 0;
  v_inactive_count integer := 0;
  v_valid_rows     integer;
  v_duplicates     text[];
BEGIN
  v_valid_rows := COALESCE(jsonb_array_length(p_rows), 0);

  IF v_valid_rows = 0 THEN
    INSERT INTO public.liander_assortment_imports
      (file_name, imported_by, total_rows, status, error_message,
       sheet_name, header_row_index, skipped_rows_count, warnings)
    VALUES
      (p_file_name, p_imported_by, p_total_rows, 'failed',
       'Import geblokkeerd: er zijn geen geldige artikelregels gevonden.',
       p_sheet_name, p_header_row_index, p_skipped_rows, p_warnings)
    RETURNING id INTO v_import_id;

    RETURN jsonb_build_object(
      'status','failed',
      'import_id', v_import_id,
      'error', 'Import geblokkeerd: er zijn geen geldige artikelregels gevonden.'
    );
  END IF;

  -- Server-side duplicate detection
  SELECT array_agg(article_number)
    INTO v_duplicates
  FROM (
    SELECT btrim(elem->>'article_number') AS article_number, count(*) AS c
    FROM jsonb_array_elements(p_rows) AS elem
    WHERE btrim(COALESCE(elem->>'article_number','')) <> ''
    GROUP BY btrim(elem->>'article_number')
    HAVING count(*) > 1
  ) d;

  IF v_duplicates IS NOT NULL AND array_length(v_duplicates, 1) > 0 THEN
    INSERT INTO public.liander_assortment_imports
      (file_name, imported_by, total_rows, status, error_message,
       sheet_name, header_row_index, skipped_rows_count, warnings)
    VALUES
      (p_file_name, p_imported_by, p_total_rows, 'failed',
       'Import geblokkeerd: dubbele artikelnummers gevonden in het importbestand: '
         || array_to_string(v_duplicates[1:10], ', ')
         || CASE WHEN array_length(v_duplicates,1) > 10 THEN ' …' ELSE '' END,
       p_sheet_name, p_header_row_index, p_skipped_rows, p_warnings)
    RETURNING id INTO v_import_id;

    RETURN jsonb_build_object(
      'status','failed',
      'import_id', v_import_id,
      'error','Import geblokkeerd: dubbele artikelnummers gevonden in het importbestand.',
      'duplicates', to_jsonb(v_duplicates)
    );
  END IF;

  -- Create processing record
  INSERT INTO public.liander_assortment_imports
    (file_name, imported_by, total_rows, status,
     sheet_name, header_row_index, skipped_rows_count, warnings)
  VALUES
    (p_file_name, p_imported_by, p_total_rows, 'processing',
     p_sheet_name, p_header_row_index, p_skipped_rows, p_warnings)
  RETURNING id INTO v_import_id;

  CREATE TEMP TABLE _incoming ON COMMIT DROP AS
  SELECT
    btrim(elem->>'article_number')                         AS article_number,
    NULLIF(btrim(COALESCE(elem->>'description','')), '')   AS description,
    NULLIF(btrim(COALESCE(elem->>'unit','')), '')          AS unit,
    NULLIF(elem->>'customer_quantity_field_name', '')      AS customer_quantity_field_name,
    COALESCE(elem->'raw_data', '{}'::jsonb)                AS raw_data
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE btrim(COALESCE(elem->>'article_number','')) <> '';

  SELECT count(*) INTO v_new_count
    FROM _incoming i
   WHERE NOT EXISTS (SELECT 1 FROM public.liander_assortment_items l WHERE l.article_number = i.article_number);

  SELECT count(*) INTO v_updated_count
    FROM _incoming i
   WHERE EXISTS (SELECT 1 FROM public.liander_assortment_items l WHERE l.article_number = i.article_number);

  SELECT count(*) INTO v_inactive_count
    FROM public.liander_assortment_items l
   WHERE l.active = true
     AND NOT EXISTS (SELECT 1 FROM _incoming i WHERE i.article_number = l.article_number);

  INSERT INTO public.liander_assortment_items
    (import_id, article_number, description, unit,
     customer_quantity_field_name, active, raw_data)
  SELECT
    v_import_id, i.article_number, i.description, i.unit,
    i.customer_quantity_field_name, true, i.raw_data
  FROM _incoming i
  ON CONFLICT (article_number) DO UPDATE
    SET import_id                    = EXCLUDED.import_id,
        description                  = EXCLUDED.description,
        unit                         = EXCLUDED.unit,
        customer_quantity_field_name = EXCLUDED.customer_quantity_field_name,
        active                       = true,
        raw_data                     = EXCLUDED.raw_data,
        updated_at                   = now();

  UPDATE public.liander_assortment_items l
     SET active = false, updated_at = now()
   WHERE l.active = true
     AND NOT EXISTS (SELECT 1 FROM _incoming i WHERE i.article_number = l.article_number);

  UPDATE public.liander_assortment_imports
     SET status = 'completed',
         new_items_count      = v_new_count,
         updated_items_count  = v_updated_count,
         inactive_items_count = v_inactive_count
   WHERE id = v_import_id;

  RETURN jsonb_build_object(
    'status','completed',
    'import_id', v_import_id,
    'new_items_count', v_new_count,
    'updated_items_count', v_updated_count,
    'inactive_items_count', v_inactive_count
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Liander import failed: %', SQLERRM;
  RAISE;
END
$function$;

-- 2. Atomaire rebuild van Aanvulling per case
CREATE OR REPLACE FUNCTION public.rebuild_case_order_lines(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_matched_count       integer := 0;
  v_unmatched_count     integer := 0;
  v_total_source_lines  integer := 0;
  v_matched_articles    text[];
  v_unmatched_articles  text[];
BEGIN
  -- Source: material lines with total_quantity > 0
  CREATE TEMP TABLE _src ON COMMIT DROP AS
  SELECT
    btrim(article_number) AS article_number,
    max(description)      AS description,
    max(unit)             AS unit,
    sum(COALESCE(total_quantity,0))::numeric AS qty
  FROM public.case_material_lines
  WHERE case_id = p_case_id
    AND total_quantity > 0
    AND article_number IS NOT NULL
    AND btrim(article_number) <> ''
  GROUP BY btrim(article_number);

  SELECT count(*) INTO v_total_source_lines FROM _src;

  -- Match against active Liander
  CREATE TEMP TABLE _matched ON COMMIT DROP AS
  SELECT s.article_number, s.description, s.unit, s.qty, l.id AS liander_id
  FROM _src s
  JOIN public.liander_assortment_items l
    ON l.article_number = s.article_number AND l.active = true;

  SELECT count(*), COALESCE(array_agg(article_number ORDER BY article_number), '{}')
    INTO v_matched_count, v_matched_articles
    FROM _matched;

  SELECT count(*), COALESCE(array_agg(s.article_number ORDER BY s.article_number), '{}')
    INTO v_unmatched_count, v_unmatched_articles
    FROM _src s
   WHERE NOT EXISTS (SELECT 1 FROM _matched m WHERE m.article_number = s.article_number);

  -- Atomic replace
  DELETE FROM public.case_order_lines WHERE case_id = p_case_id;

  INSERT INTO public.case_order_lines
    (case_id, article_number, description, unit, customer_quantity,
     matched_liander_assortment_item_id, match_status)
  SELECT
    p_case_id, m.article_number, m.description, m.unit, m.qty,
    m.liander_id, 'matched'
  FROM _matched m;

  RETURN jsonb_build_object(
    'matched_count', v_matched_count,
    'unmatched_count', v_unmatched_count,
    'total_source_lines', v_total_source_lines,
    'matched_articles', to_jsonb(v_matched_articles),
    'unmatched_articles', to_jsonb(v_unmatched_articles)
  );
END
$function$;