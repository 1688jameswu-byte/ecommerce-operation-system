CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS temu_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'TEMU',
  platform_store_id TEXT,
  site_country TEXT,
  store_group TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  group_name TEXT,
  remark TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_id)
);

CREATE TABLE IF NOT EXISTS temu_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  team_id TEXT,
  group_name TEXT,
  level TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  remark TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_id)
);

CREATE TABLE IF NOT EXISTS temu_store_operator_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  legacy_store_id TEXT,
  legacy_operator_id TEXT,
  store_name TEXT NOT NULL DEFAULT '',
  operator_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'primary',
  platform TEXT NOT NULL DEFAULT 'TEMU',
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  remark TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_id)
);

CREATE TABLE IF NOT EXISTS temu_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT,
  source_batch_id TEXT,
  import_type TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'json_migration',
  file_name TEXT,
  report_date DATE,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  uploaded_by TEXT,
  uploaded_by_name TEXT,
  uploaded_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_temu_import_batches_source
  ON temu_import_batches (import_type, source_type, COALESCE(source_batch_id, ''), COALESCE(file_name, ''));

CREATE TABLE IF NOT EXISTS temu_import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES temu_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER,
  error_reason TEXT NOT NULL DEFAULT '',
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS temu_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT,
  source_id TEXT,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  operator_name TEXT,
  temu_product_id TEXT,
  temu_spu_id TEXT,
  product_name TEXT NOT NULL DEFAULT '',
  product_image_url TEXT,
  category_name TEXT,
  first_online_at TIMESTAMPTZ,
  product_status TEXT,
  current_price NUMERIC(14, 4),
  current_inventory INTEGER,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_temu_products_store_product
  ON temu_products (store_id, temu_product_id)
  WHERE store_id IS NOT NULL AND temu_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS temu_product_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES temu_products(id) ON DELETE CASCADE,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  temu_product_id TEXT,
  temu_spu_id TEXT,
  sku_id TEXT,
  sku_code TEXT,
  sku_name TEXT,
  sku_price NUMERIC(14, 4),
  sku_inventory INTEGER,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_temu_product_skus_store_sku
  ON temu_product_skus (store_id, COALESCE(sku_id, ''), COALESCE(sku_code, ''))
  WHERE store_id IS NOT NULL AND (sku_id IS NOT NULL OR sku_code IS NOT NULL);

CREATE TABLE IF NOT EXISTS temu_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT,
  source_id TEXT,
  import_batch_id UUID REFERENCES temu_import_batches(id) ON DELETE CASCADE,
  source_batch_id TEXT NOT NULL DEFAULT '',
  source_row_number INTEGER,
  source_row_hash TEXT NOT NULL,
  order_no TEXT NOT NULL DEFAULT '',
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  operator_name TEXT,
  product_id UUID REFERENCES temu_products(id) ON DELETE SET NULL,
  product_sku_id UUID REFERENCES temu_product_skus(id) ON DELETE SET NULL,
  temu_product_id TEXT,
  temu_spu_id TEXT,
  sku_id TEXT,
  sku_code TEXT,
  declared_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  item_amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
  order_time TIMESTAMPTZ,
  order_date DATE,
  order_status TEXT,
  is_valid_order BOOLEAN NOT NULL DEFAULT TRUE,
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_batch_id, source_row_hash)
);

CREATE TABLE IF NOT EXISTS temu_traffic_daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT,
  source_id TEXT,
  import_batch_id UUID REFERENCES temu_import_batches(id) ON DELETE CASCADE,
  source_batch_id TEXT NOT NULL DEFAULT '',
  source_row_number INTEGER,
  source_row_hash TEXT NOT NULL,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT NOT NULL DEFAULT '',
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  operator_name TEXT,
  report_date DATE NOT NULL,
  total_views NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_visitors NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_pay_buyers NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_pay_conversion_rate NUMERIC(16, 8) NOT NULL DEFAULT 0,
  total_pay_pieces NUMERIC(14, 4) NOT NULL DEFAULT 0,
  product_views NUMERIC(14, 4) NOT NULL DEFAULT 0,
  product_visitors NUMERIC(14, 4) NOT NULL DEFAULT 0,
  detail_pay_buyers NUMERIC(14, 4) NOT NULL DEFAULT 0,
  detail_pay_conversion_rate NUMERIC(16, 8) NOT NULL DEFAULT 0,
  store_page_views NUMERIC(14, 4) NOT NULL DEFAULT 0,
  store_page_visitors NUMERIC(14, 4) NOT NULL DEFAULT 0,
  store_page_pay_buyers NUMERIC(14, 4) NOT NULL DEFAULT 0,
  store_page_pay_conversion_rate NUMERIC(16, 8) NOT NULL DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_batch_id, source_row_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_temu_traffic_current_store_date
  ON temu_traffic_daily_records (store_id, report_date)
  WHERE is_current = TRUE AND store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS temu_effective_new_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL,
  import_batch_id UUID REFERENCES temu_import_batches(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'TEMU',
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  legacy_store_id TEXT,
  store_name TEXT,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  operator_name TEXT,
  site_join_date DATE NOT NULL,
  skc TEXT NOT NULL DEFAULT '',
  remark TEXT,
  created_by TEXT,
  created_by_name TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_temu_effective_listing_store_date_skc
  ON temu_effective_new_listings (store_id, site_join_date, skc)
  WHERE store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS temu_warning_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL,
  import_batch_id UUID REFERENCES temu_import_batches(id) ON DELETE SET NULL,
  rule_group TEXT NOT NULL DEFAULT 'risk',
  rule_type TEXT NOT NULL DEFAULT '',
  rule_name TEXT NOT NULL DEFAULT '',
  metric_field TEXT NOT NULL DEFAULT '',
  yellow_threshold NUMERIC(14, 4),
  red_threshold NUMERIC(14, 4),
  growth_threshold NUMERIC(14, 4),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_weight INTEGER NOT NULL DEFAULT 0,
  display_limit INTEGER,
  remark TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_id)
);

CREATE TABLE IF NOT EXISTS temu_ad_product_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  import_batch_id UUID REFERENCES temu_import_batches(id) ON DELETE SET NULL,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  operator_name TEXT,
  product_id UUID REFERENCES temu_products(id) ON DELETE SET NULL,
  temu_product_id TEXT,
  temu_spu_id TEXT,
  product_name TEXT,
  ad_spend NUMERIC(14, 4),
  net_ad_spend NUMERIC(14, 4),
  global_sales_amount NUMERIC(14, 4),
  global_roas NUMERIC(14, 4),
  global_acos NUMERIC(14, 4),
  global_cpa NUMERIC(14, 4),
  global_sub_order_count NUMERIC(14, 4),
  global_unit_count NUMERIC(14, 4),
  global_impressions NUMERIC(14, 4),
  global_clicks NUMERIC(14, 4),
  global_ctr NUMERIC(16, 8),
  global_cvr NUMERIC(16, 8),
  global_add_to_cart_count NUMERIC(14, 4),
  promo_sales_amount NUMERIC(14, 4),
  promo_roas NUMERIC(14, 4),
  promo_week_roas NUMERIC(14, 4),
  target_roas NUMERIC(14, 4),
  promo_acos NUMERIC(14, 4),
  promo_cpa NUMERIC(14, 4),
  promo_sub_order_count NUMERIC(14, 4),
  promo_unit_count NUMERIC(14, 4),
  promo_impressions NUMERIC(14, 4),
  promo_clicks NUMERIC(14, 4),
  promo_ctr NUMERIC(16, 8),
  promo_cvr NUMERIC(16, 8),
  promo_add_to_cart_count NUMERIC(14, 4),
  net_promo_sales_amount NUMERIC(14, 4),
  net_promo_roas NUMERIC(14, 4),
  net_promo_acos NUMERIC(14, 4),
  net_promo_cpa NUMERIC(14, 4),
  net_promo_sub_order_count NUMERIC(14, 4),
  net_promo_unit_count NUMERIC(14, 4),
  calculated_cpc NUMERIC(14, 4) GENERATED ALWAYS AS (ad_spend / NULLIF(global_clicks, 0)) STORED,
  calculated_add_to_cart_rate NUMERIC(16, 8) GENERATED ALWAYS AS (global_add_to_cart_count / NULLIF(global_clicks, 0)) STORED,
  calculated_cart_to_order_rate NUMERIC(16, 8) GENERATED ALWAYS AS (global_sub_order_count / NULLIF(global_add_to_cart_count, 0)) STORED,
  calculated_avg_order_value NUMERIC(14, 4) GENERATED ALWAYS AS (global_sales_amount / NULLIF(global_sub_order_count, 0)) STORED,
  calculated_target_roas_gap NUMERIC(14, 4) GENERATED ALWAYS AS (promo_roas - target_roas) STORED,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_temu_ad_product_daily_store_date_product
  ON temu_ad_product_daily (store_id, report_date, temu_product_id)
  WHERE store_id IS NOT NULL AND temu_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_temu_stores_name ON temu_stores (store_name);
CREATE INDEX IF NOT EXISTS idx_temu_operators_name ON temu_operators (operator_name);
CREATE INDEX IF NOT EXISTS idx_temu_relations_store ON temu_store_operator_relations (store_id);
CREATE INDEX IF NOT EXISTS idx_temu_relations_operator ON temu_store_operator_relations (operator_id);
CREATE INDEX IF NOT EXISTS idx_temu_batches_type ON temu_import_batches (import_type, source_type);
CREATE INDEX IF NOT EXISTS idx_temu_batches_store ON temu_import_batches (store_id);
CREATE INDEX IF NOT EXISTS idx_temu_errors_batch ON temu_import_errors (batch_id);
CREATE INDEX IF NOT EXISTS idx_temu_products_store ON temu_products (store_id);
CREATE INDEX IF NOT EXISTS idx_temu_products_spu ON temu_products (temu_spu_id);
CREATE INDEX IF NOT EXISTS idx_temu_products_first_online ON temu_products (first_online_at);
CREATE INDEX IF NOT EXISTS idx_temu_skus_product ON temu_product_skus (product_id);
CREATE INDEX IF NOT EXISTS idx_temu_skus_store ON temu_product_skus (store_id);
CREATE INDEX IF NOT EXISTS idx_temu_skus_sku_id ON temu_product_skus (sku_id);
CREATE INDEX IF NOT EXISTS idx_temu_skus_sku_code ON temu_product_skus (sku_code);
CREATE INDEX IF NOT EXISTS idx_temu_orders_batch ON temu_order_items (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_temu_orders_store_date ON temu_order_items (store_id, order_date);
CREATE INDEX IF NOT EXISTS idx_temu_orders_operator_date ON temu_order_items (operator_id, order_date);
CREATE INDEX IF NOT EXISTS idx_temu_orders_order_no ON temu_order_items (order_no);
CREATE INDEX IF NOT EXISTS idx_temu_orders_product ON temu_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_temu_orders_sku ON temu_order_items (product_sku_id);
CREATE INDEX IF NOT EXISTS idx_temu_orders_temu_product ON temu_order_items (temu_product_id);
CREATE INDEX IF NOT EXISTS idx_temu_orders_sku_code ON temu_order_items (sku_code);
CREATE INDEX IF NOT EXISTS idx_temu_traffic_batch ON temu_traffic_daily_records (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_temu_traffic_store_date ON temu_traffic_daily_records (store_id, report_date);
CREATE INDEX IF NOT EXISTS idx_temu_traffic_operator_date ON temu_traffic_daily_records (operator_id, report_date);
CREATE INDEX IF NOT EXISTS idx_temu_effective_store_date ON temu_effective_new_listings (store_id, site_join_date);
CREATE INDEX IF NOT EXISTS idx_temu_effective_operator_date ON temu_effective_new_listings (operator_id, site_join_date);
CREATE INDEX IF NOT EXISTS idx_temu_effective_skc ON temu_effective_new_listings (skc);
CREATE INDEX IF NOT EXISTS idx_temu_rules_group ON temu_warning_rules (rule_group, rule_type);
CREATE INDEX IF NOT EXISTS idx_temu_ad_store_date ON temu_ad_product_daily (store_id, report_date);
CREATE INDEX IF NOT EXISTS idx_temu_ad_operator_date ON temu_ad_product_daily (operator_id, report_date);
CREATE INDEX IF NOT EXISTS idx_temu_ad_product ON temu_ad_product_daily (product_id);
CREATE INDEX IF NOT EXISTS idx_temu_ad_temu_product ON temu_ad_product_daily (temu_product_id);
CREATE INDEX IF NOT EXISTS idx_temu_ad_spu ON temu_ad_product_daily (temu_spu_id);
