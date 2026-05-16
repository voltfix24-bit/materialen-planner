ALTER TABLE public.export_logs
  ADD COLUMN IF NOT EXISTS csv_config jsonb,
  ADD COLUMN IF NOT EXISTS csv_header text;