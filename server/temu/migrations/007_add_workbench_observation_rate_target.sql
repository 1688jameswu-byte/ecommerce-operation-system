ALTER TABLE temu_operation_workbench_kpi_targets
  ADD COLUMN IF NOT EXISTS observation_achievement_rate_target NUMERIC(16, 8) NOT NULL DEFAULT 0;
