ALTER TABLE temu_products
  ADD COLUMN IF NOT EXISTS temu_skc_id TEXT;

ALTER TABLE temu_product_skus
  ADD COLUMN IF NOT EXISTS temu_skc_id TEXT;

UPDATE temu_products
SET temu_skc_id = COALESCE(temu_skc_id, skc_id)
WHERE temu_skc_id IS NULL AND skc_id IS NOT NULL;

UPDATE temu_product_skus
SET temu_skc_id = COALESCE(temu_skc_id, skc_id)
WHERE temu_skc_id IS NULL AND skc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_temu_products_store_spu ON temu_products (store_id, temu_spu_id);
CREATE INDEX IF NOT EXISTS idx_temu_products_temu_skc_id ON temu_products (temu_skc_id);
CREATE INDEX IF NOT EXISTS idx_temu_product_skus_store_sku_id ON temu_product_skus (store_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_temu_product_skus_store_sku_code ON temu_product_skus (store_id, sku_code);
CREATE INDEX IF NOT EXISTS idx_temu_product_skus_temu_skc_id ON temu_product_skus (temu_skc_id);
CREATE INDEX IF NOT EXISTS idx_temu_ad_store_date_spu ON temu_ad_product_daily (store_id, report_date, temu_spu_id);
