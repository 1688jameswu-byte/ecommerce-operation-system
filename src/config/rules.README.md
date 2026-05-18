# 规则配置规划

当前规则仍在前端配置文件中，后续迁移到数据库 `rule_configs` 表。

已预留规则：

- `kpiRules.ts`：核心指标展示规则。
- `rankingRules.ts`：排行榜口径、周期、单位、是否显示增长。
- `warningRules.ts`：预警类型、默认等级、颜色。
- `storeStatusRules.ts`：店铺状态口径和颜色。

迁移原则：

```text
rule_configs
-> API
-> config adapter
-> dashboardDataService
-> 大屏组件
```

组件只消费规则结果，不直接写业务判断。
