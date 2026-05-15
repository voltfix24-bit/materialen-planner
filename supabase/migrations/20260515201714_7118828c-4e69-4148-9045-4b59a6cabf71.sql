
-- Helper: updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 1. cases
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number TEXT,
  case_number TEXT,
  description TEXT,
  case_date DATE,
  template_version TEXT,
  asp_sap_code TEXT,
  delivery_address TEXT,
  contact_person TEXT,
  internal_note TEXT,
  status TEXT NOT NULL DEFAULT 'concept',
  so_customernumber TEXT,
  so_project TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cases_case_number ON public.cases(case_number);
CREATE INDEX idx_cases_project_number ON public.cases(project_number);
CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category_code TEXT UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. articles
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number TEXT NOT NULL UNIQUE,
  description TEXT,
  unit TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  packaging_unit TEXT,
  requires_charge_or_haspel BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'Handmatig',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_articles_article_number ON public.articles(article_number);
CREATE INDEX idx_articles_category_id ON public.articles(category_id);
CREATE TRIGGER trg_articles_updated BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. liander_assortment_imports
CREATE TABLE public.liander_assortment_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  import_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  new_items_count INTEGER NOT NULL DEFAULT 0,
  updated_items_count INTEGER NOT NULL DEFAULT 0,
  inactive_items_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. liander_assortment_items
CREATE TABLE public.liander_assortment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID REFERENCES public.liander_assortment_imports(id) ON DELETE SET NULL,
  article_number TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  customer_quantity_field_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_liander_items_article_number ON public.liander_assortment_items(article_number);
CREATE TRIGGER trg_liander_items_updated BEFORE UPDATE ON public.liander_assortment_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. case_material_lines
CREATE TABLE public.case_material_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  article_number TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  used_quantity NUMERIC NOT NULL DEFAULT 0,
  return_quantity NUMERIC NOT NULL DEFAULT 0,
  total_quantity NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_code TEXT,
  charge_or_haspel_number TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT true,
  is_auto_generated BOOLEAN NOT NULL DEFAULT false,
  source_rule TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cml_case_id ON public.case_material_lines(case_id);
CREATE INDEX idx_cml_category_id ON public.case_material_lines(category_id);
CREATE INDEX idx_cml_article_number ON public.case_material_lines(article_number);
CREATE TRIGGER trg_cml_updated BEFORE UPDATE ON public.case_material_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. case_order_lines (Aanvulling)
CREATE TABLE public.case_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  article_number TEXT,
  description TEXT,
  unit TEXT,
  customer_quantity NUMERIC NOT NULL DEFAULT 0,
  matched_liander_assortment_item_id UUID REFERENCES public.liander_assortment_items(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'unknown',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_col_case_id ON public.case_order_lines(case_id);
CREATE TRIGGER trg_col_updated BEFORE UPDATE ON public.case_order_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. verkooporder_lines
CREATE TABLE public.verkooporder_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  sol_articlenumber TEXT,
  sol_quantity NUMERIC NOT NULL DEFAULT 0,
  so_number TEXT,
  so_customernumber TEXT,
  so_project TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vol_case_id ON public.verkooporder_lines(case_id);
CREATE TRIGGER trg_vol_updated BEFORE UPDATE ON public.verkooporder_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. haspel_numbers
CREATE TABLE public.haspel_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  article_number TEXT,
  charge_or_haspel_number TEXT,
  description TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_haspel_case_id ON public.haspel_numbers(case_id);

-- 10. export_logs
CREATE TABLE public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL DEFAULT 'verkooporder_csv',
  file_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_export_logs_case_id ON public.export_logs(case_id);

-- Enable RLS on all tables
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liander_assortment_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liander_assortment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_material_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verkooporder_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haspel_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- v1 open policies (will be replaced with role-based policies later)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['cases','categories','articles','liander_assortment_imports','liander_assortment_items','case_material_lines','case_order_lines','verkooporder_lines','haspel_numbers','export_logs']) LOOP
    EXECUTE format('CREATE POLICY "v1_open_select" ON public.%I FOR SELECT USING (true);', t);
    EXECUTE format('CREATE POLICY "v1_open_insert" ON public.%I FOR INSERT WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "v1_open_update" ON public.%I FOR UPDATE USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "v1_open_delete" ON public.%I FOR DELETE USING (true);', t);
  END LOOP;
END $$;

-- Seed categories
INSERT INTO public.categories (name, category_code, sort_order) VALUES
  ('Kabels','KAB',10),
  ('MS Installatie','MSI',20),
  ('MS patronen','MSP',30),
  ('Aarding','AAR',40),
  ('Eindsluitingen MS','EMS',50),
  ('Moffen MS','MMS',60),
  ('Magnefix','MAG',70),
  ('LS-rek','LSR',80),
  ('Stationsinrichting','STI',90),
  ('I-Netten','INT',100),
  ('Trafo','TRA',110),
  ('Overige','OVR',120),
  ('Asbest','ASB',130),
  ('Moffen LS','MLS',140),
  ('Standaard voorraad','STV',150),
  ('Extra voorraad','EXV',160),
  ('Compact station','CST',170),
  ('Mantelbuis','MBU',180),
  ('Algemeen','ALG',190);
