CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "1688_suppliers" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name TEXT NOT NULL DEFAULT '',
  contact_name TEXT,
  contact_phone TEXT,
  shop_url TEXT,
  main_categories TEXT,
  supply_stability TEXT,
  min_order_quantity INTEGER NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  address TEXT,
  cost_visible_level TEXT NOT NULL DEFAULT 'restricted',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remark TEXT
);

CREATE TABLE IF NOT EXISTS "1688_stores" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL DEFAULT '',
  shop_url TEXT,
  owner_user_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remark TEXT
);

CREATE TABLE IF NOT EXISTS "1688_products" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  category_id TEXT,
  product_type TEXT,
  material TEXT,
  craft TEXT,
  color_description TEXT,
  size_description TEXT,
  listing_title TEXT,
  keywords TEXT,
  selling_points TEXT,
  detail_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  listing_status TEXT NOT NULL DEFAULT 'not_listed',
  listing_url TEXT,
  store_id UUID REFERENCES "1688_stores"(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES "1688_suppliers"(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remark TEXT
);

CREATE TABLE IF NOT EXISTS "1688_product_skus" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES "1688_products"(id) ON DELETE CASCADE,
  sku_code TEXT NOT NULL DEFAULT '',
  color TEXT,
  size TEXT,
  specification TEXT,
  supplier_sku_code TEXT,
  platform_sku_code TEXT,
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  suggested_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_order_quantity INTEGER NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  sku_image_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "1688_product_images" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES "1688_products"(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES "1688_product_skus"(id) ON DELETE SET NULL,
  image_type TEXT NOT NULL DEFAULT 'raw_photo',
  image_status TEXT NOT NULL DEFAULT 'pending_photo',
  file_name TEXT,
  file_path TEXT,
  file_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remark TEXT
);

ALTER TABLE "1688_product_skus"
  ADD COLUMN IF NOT EXISTS sku_image_id UUID;

CREATE TABLE IF NOT EXISTS "1688_listing_tasks" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES "1688_products"(id) ON DELETE CASCADE,
  assignee_user_id TEXT,
  store_id UUID REFERENCES "1688_stores"(id) ON DELETE SET NULL,
  task_title TEXT NOT NULL DEFAULT '',
  task_status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  listing_url TEXT,
  failure_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remark TEXT
);

CREATE TABLE IF NOT EXISTS "1688_settings" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_group TEXT NOT NULL DEFAULT '',
  setting_key TEXT NOT NULL DEFAULT '',
  setting_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (setting_group, setting_key)
);

CREATE TABLE IF NOT EXISTS daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL DEFAULT '',
  business_category TEXT NOT NULL DEFAULT '其他',
  record_type TEXT NOT NULL DEFAULT '工作动作',
  importance TEXT NOT NULL DEFAULT '普通',
  ai_memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ai_memory_note TEXT,
  source_device TEXT NOT NULL DEFAULT '电脑端',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS daily_record_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES daily_records(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_1688_product_skus_sku_image'
  ) THEN
    ALTER TABLE "1688_product_skus"
      ADD CONSTRAINT fk_1688_product_skus_sku_image
      FOREIGN KEY (sku_image_id) REFERENCES "1688_product_images"(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_1688_products_code ON "1688_products" (product_code);
CREATE INDEX IF NOT EXISTS idx_1688_products_name ON "1688_products" (product_name);
CREATE INDEX IF NOT EXISTS idx_1688_products_status ON "1688_products" (status);
CREATE INDEX IF NOT EXISTS idx_1688_products_listing_status ON "1688_products" (listing_status);
CREATE INDEX IF NOT EXISTS idx_1688_products_supplier ON "1688_products" (supplier_id);
CREATE INDEX IF NOT EXISTS idx_1688_product_skus_product ON "1688_product_skus" (product_id);
CREATE INDEX IF NOT EXISTS idx_1688_product_skus_code ON "1688_product_skus" (sku_code);
CREATE INDEX IF NOT EXISTS idx_1688_product_images_product ON "1688_product_images" (product_id);
CREATE INDEX IF NOT EXISTS idx_1688_product_images_sku ON "1688_product_images" (sku_id);
CREATE INDEX IF NOT EXISTS idx_1688_product_images_type ON "1688_product_images" (image_type);
CREATE INDEX IF NOT EXISTS idx_1688_product_images_status ON "1688_product_images" (image_status);
CREATE INDEX IF NOT EXISTS idx_1688_listing_tasks_product ON "1688_listing_tasks" (product_id);
CREATE INDEX IF NOT EXISTS idx_1688_listing_tasks_status ON "1688_listing_tasks" (task_status);
CREATE INDEX IF NOT EXISTS idx_1688_listing_tasks_assignee ON "1688_listing_tasks" (assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_1688_settings_group ON "1688_settings" (setting_group);
CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records (record_date);
CREATE INDEX IF NOT EXISTS idx_daily_records_created_by ON daily_records (created_by);
CREATE INDEX IF NOT EXISTS idx_daily_records_type ON daily_records (record_type);
CREATE INDEX IF NOT EXISTS idx_daily_records_category ON daily_records (business_category);
CREATE INDEX IF NOT EXISTS idx_daily_record_attachments_record ON daily_record_attachments (record_id);
