ALTER TABLE temu_products
  ADD COLUMN IF NOT EXISTS product_title TEXT,
  ADD COLUMN IF NOT EXISTS spu_id TEXT,
  ADD COLUMN IF NOT EXISTS skc_id TEXT,
  ADD COLUMN IF NOT EXISTS skc_code TEXT,
  ADD COLUMN IF NOT EXISTS leaf_category_name TEXT,
  ADD COLUMN IF NOT EXISTS declared_price_cny NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS declared_price_status TEXT,
  ADD COLUMN IF NOT EXISTS created_time TIMESTAMPTZ;

ALTER TABLE temu_product_skus
  ADD COLUMN IF NOT EXISTS product_title TEXT,
  ADD COLUMN IF NOT EXISTS spu_id TEXT,
  ADD COLUMN IF NOT EXISTS skc_id TEXT,
  ADD COLUMN IF NOT EXISTS skc_code TEXT,
  ADD COLUMN IF NOT EXISTS leaf_category_name TEXT,
  ADD COLUMN IF NOT EXISTS product_status TEXT,
  ADD COLUMN IF NOT EXISTS spec1_name TEXT,
  ADD COLUMN IF NOT EXISTS spec2_name TEXT,
  ADD COLUMN IF NOT EXISTS declared_price_cny NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS declared_price_status TEXT,
  ADD COLUMN IF NOT EXISTS created_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_temu_products_skc_id ON temu_products (skc_id);
CREATE INDEX IF NOT EXISTS idx_temu_products_created_time ON temu_products (created_time);
CREATE INDEX IF NOT EXISTS idx_temu_product_skus_skc_id ON temu_product_skus (skc_id);
CREATE INDEX IF NOT EXISTS idx_temu_product_skus_skc_code ON temu_product_skus (skc_code);
CREATE INDEX IF NOT EXISTS idx_temu_product_skus_created_time ON temu_product_skus (created_time);
