CREATE TABLE IF NOT EXISTS temu_new_product_daily_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  operator_name TEXT,
  product_id UUID REFERENCES temu_products(id) ON DELETE CASCADE,
  temu_product_id TEXT,
  temu_spu_id TEXT,
  product_name TEXT,
  product_image_url TEXT,
  category_name TEXT,
  first_online_at TIMESTAMPTZ,
  days_online INTEGER,
  new_product_stage TEXT,
  current_price NUMERIC(14, 4),
  current_inventory INTEGER,
  product_status TEXT,
  is_new_product BOOLEAN NOT NULL DEFAULT FALSE,
  is_ad_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_ordered BOOLEAN NOT NULL DEFAULT FALSE,
  order_count INTEGER NOT NULL DEFAULT 0,
  order_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  order_sales_amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
  first_order_time TIMESTAMPTZ,
  last_order_time TIMESTAMPTZ,
  ad_spend NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ad_sales_amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ad_order_count NUMERIC(14, 4) NOT NULL DEFAULT 0,
  ad_unit_count NUMERIC(14, 4) NOT NULL DEFAULT 0,
  impressions NUMERIC(14, 4) NOT NULL DEFAULT 0,
  clicks NUMERIC(14, 4) NOT NULL DEFAULT 0,
  add_to_cart_count NUMERIC(14, 4) NOT NULL DEFAULT 0,
  target_roas NUMERIC(14, 4),
  roas NUMERIC(14, 4),
  acos NUMERIC(14, 4),
  ctr NUMERIC(16, 8),
  cvr NUMERIC(16, 8),
  cpc NUMERIC(14, 4),
  natural_order_count NUMERIC(14, 4) NOT NULL DEFAULT 0,
  natural_sales_amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
  natural_order_ratio NUMERIC(16, 8),
  product_tag TEXT,
  abnormal_type TEXT,
  latest_recommendation_type TEXT,
  latest_recommendation_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_date, product_id)
);

CREATE TABLE IF NOT EXISTS temu_ad_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_date DATE NOT NULL,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  operator_name TEXT,
  product_id UUID REFERENCES temu_products(id) ON DELETE CASCADE,
  temu_product_id TEXT,
  temu_spu_id TEXT,
  sku_code TEXT,
  product_name TEXT,
  recommendation_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  problem_type TEXT,
  recommendation_text TEXT NOT NULL DEFAULT '',
  reason_text TEXT,
  suggested_action TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  handled_by TEXT,
  handled_by_name TEXT,
  handled_at TIMESTAMPTZ,
  handle_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recommendation_date, product_id, recommendation_type)
);

CREATE TABLE IF NOT EXISTS temu_product_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES temu_products(id) ON DELETE CASCADE,
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_date DATE,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  source_type TEXT,
  source_id TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temu_snapshot_date ON temu_new_product_daily_snapshot (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_temu_snapshot_store ON temu_new_product_daily_snapshot (store_id);
CREATE INDEX IF NOT EXISTS idx_temu_snapshot_operator ON temu_new_product_daily_snapshot (operator_id);
CREATE INDEX IF NOT EXISTS idx_temu_snapshot_product ON temu_new_product_daily_snapshot (product_id);
CREATE INDEX IF NOT EXISTS idx_temu_snapshot_tag ON temu_new_product_daily_snapshot (product_tag);
CREATE INDEX IF NOT EXISTS idx_temu_snapshot_first_online ON temu_new_product_daily_snapshot (first_online_at);

CREATE INDEX IF NOT EXISTS idx_temu_recommendation_date ON temu_ad_recommendations (recommendation_date);
CREATE INDEX IF NOT EXISTS idx_temu_recommendation_store ON temu_ad_recommendations (store_id);
CREATE INDEX IF NOT EXISTS idx_temu_recommendation_operator ON temu_ad_recommendations (operator_id);
CREATE INDEX IF NOT EXISTS idx_temu_recommendation_product ON temu_ad_recommendations (product_id);
CREATE INDEX IF NOT EXISTS idx_temu_recommendation_status ON temu_ad_recommendations (status);
CREATE INDEX IF NOT EXISTS idx_temu_recommendation_type ON temu_ad_recommendations (recommendation_type);

CREATE INDEX IF NOT EXISTS idx_temu_timeline_product ON temu_product_timeline (product_id, event_time);
CREATE INDEX IF NOT EXISTS idx_temu_timeline_store ON temu_product_timeline (store_id);
CREATE INDEX IF NOT EXISTS idx_temu_timeline_type ON temu_product_timeline (event_type);
