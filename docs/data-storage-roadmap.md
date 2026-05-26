# Data Storage Roadmap

当前阶段继续使用 `data/*.json`，不切换 SQLite。

后续满足以下任一条件时再迁移 SQLite：

- 任务、导入批次、分析结果数量明显增长。
- 需要多人同时编辑，JSON 写入冲突变多。
- 需要按店铺、平台、负责人、日期做高频组合查询。
- 需要更可靠的数据关系约束和审计追踪。

建议优先迁移表：

- `stores`
- `operators`
- `store_operator_relations`
- `operation_tasks`
- `import_batches`
- `traffic_records`
- `analysis_results`

迁移原则：

- 先保持现有 API 不变。
- JSON 作为初始导入来源。
- 前端数据结构尽量不变。
- 平台字段以 `platform`、`platformStoreId` 作为多平台扩展基础。
