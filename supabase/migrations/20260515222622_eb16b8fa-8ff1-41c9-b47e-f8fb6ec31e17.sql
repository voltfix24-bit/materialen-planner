-- 1. Unique constraint on article_number
ALTER TABLE public.liander_assortment_items
  ADD CONSTRAINT liander_assortment_items_article_number_key UNIQUE (article_number);

-- 2. Transactional import RPC
CREATE OR REPLACE FUNCTION public.process_liander_assortment_import(
  p_file_name        text,
  p_sheet_name       text,
  p_header_row_index integer,
  p_rows             jsonb,
  p_warnings         jsonb,
  p_skipped_rows     integer,
  p_total_rows       integer,
  p_imported_by      text DEFAULT 'system'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import_id     uuid;
  v_new_count     integer := 0;
  v_updated_count integer := 0;
  v_inactive_count integer := 0;
  v_valid_rows    integer;
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

  -- Create processing record
  INSERT INTO public.liander_assortment_imports
    (file_name, imported_by, total_rows, status,
     sheet_name, header_row_index, skipped_rows_count, warnings)
  VALUES
    (p_file_name, p_imported_by, p_total_rows, 'processing',
     p_sheet_name, p_header_row_index, p_skipped_rows, p_warnings)
  RETURNING id INTO v_import_id;

  -- Stage incoming rows
  CREATE TEMP TABLE _incoming ON COMMIT DROP AS
  SELECT
    btrim(elem->>'article_number')                         AS article_number,
    NULLIF(btrim(COALESCE(elem->>'description','')), '')   AS description,
    NULLIF(btrim(COALESCE(elem->>'unit','')), '')          AS unit,
    NULLIF(elem->>'customer_quantity_field_name', '')      AS customer_quantity_field_name,
    COALESCE(elem->'raw_data', '{}'::jsonb)                AS raw_data
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE btrim(COALESCE(elem->>'article_number','')) <> '';

  -- Count diff before mutating
  SELECT count(*) INTO v_new_count
    FROM _incoming i
   WHERE NOT EXISTS (
     SELECT 1 FROM public.liander_assortment_items l
      WHERE l.article_number = i.article_number
   );

  SELECT count(*) INTO v_updated_count
    FROM _incoming i
   WHERE EXISTS (
     SELECT 1 FROM public.liander_assortment_items l
      WHERE l.article_number = i.article_number
   );

  SELECT count(*) INTO v_inactive_count
    FROM public.liander_assortment_items l
   WHERE l.active = true
     AND NOT EXISTS (
       SELECT 1 FROM _incoming i
        WHERE i.article_number = l.article_number
     );

  -- Bulk upsert
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

  -- Mark missing as inactive
  UPDATE public.liander_assortment_items l
     SET active = false, updated_at = now()
   WHERE l.active = true
     AND NOT EXISTS (
       SELECT 1 FROM _incoming i
        WHERE i.article_number = l.article_number
     );

  -- Finalize
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
  -- Roll back data mutations; record failure in a separate autonomous-style row
  -- (we re-insert because the in-progress row is rolled back too).
  RAISE WARNING 'Liander import failed: %', SQLERRM;
  RAISE; -- bubble; client will record a failed row separately if needed
END
$$;