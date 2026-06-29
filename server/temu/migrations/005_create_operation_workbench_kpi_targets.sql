CREATE TABLE IF NOT EXISTS temu_operation_workbench_kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT NOT NULL,
  period TEXT NOT NULL,
  operator_id UUID REFERENCES temu_operators(id) ON DELETE SET NULL,
  legacy_operator_id TEXT,
  operator_name TEXT NOT NULL DEFAULT '',
  store_id UUID REFERENCES temu_stores(id) ON DELETE SET NULL,
  legacy_store_id TEXT,
  store_name TEXT NOT NULL DEFAULT '',
  sales_target NUMERIC(14, 4) NOT NULL DEFAULT 0,
  effective_listing_target NUMERIC(14, 4) NOT NULL DEFAULT 0,
  first_order_product_target NUMERIC(14, 4) NOT NULL DEFAULT 0,
  expense_ratio_target NUMERIC(16, 8) NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  remark TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_temu_workbench_kpi_targets_period
  ON temu_operation_workbench_kpi_targets (period);

CREATE INDEX IF NOT EXISTS idx_temu_workbench_kpi_targets_operator
  ON temu_operation_workbench_kpi_targets (operator_id, period);

CREATE INDEX IF NOT EXISTS idx_temu_workbench_kpi_targets_store
  ON temu_operation_workbench_kpi_targets (store_id, period);

CREATE UNIQUE INDEX IF NOT EXISTS uq_temu_workbench_kpi_target_scope
  ON temu_operation_workbench_kpi_targets (
    period,
    COALESCE(legacy_operator_id, ''),
    COALESCE(legacy_store_id, ''),
    COALESCE(operator_name, ''),
    COALESCE(store_name, '')
  )
  WHERE enabled = TRUE;
