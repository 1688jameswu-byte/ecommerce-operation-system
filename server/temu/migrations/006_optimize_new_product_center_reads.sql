CREATE INDEX IF NOT EXISTS idx_temu_snapshot_date_store_operator_tag
  ON temu_new_product_daily_snapshot (snapshot_date, store_id, operator_id, product_tag);

CREATE INDEX IF NOT EXISTS idx_temu_snapshot_date_tag
  ON temu_new_product_daily_snapshot (snapshot_date, product_tag);

CREATE INDEX IF NOT EXISTS idx_temu_recommendation_priority
  ON temu_ad_recommendations (priority);

CREATE INDEX IF NOT EXISTS idx_temu_recommendation_date_status_priority_type
  ON temu_ad_recommendations (recommendation_date, status, priority, recommendation_type);

CREATE INDEX IF NOT EXISTS idx_temu_orders_store_sku_id
  ON temu_order_items (store_id, sku_id);

CREATE INDEX IF NOT EXISTS idx_temu_orders_store_sku_code
  ON temu_order_items (store_id, sku_code);

CREATE INDEX IF NOT EXISTS idx_temu_ad_report_date
  ON temu_ad_product_daily (report_date);

CREATE INDEX IF NOT EXISTS idx_temu_ad_store_spu
  ON temu_ad_product_daily (store_id, temu_spu_id);
