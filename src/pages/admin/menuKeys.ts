export const menuKeys = {
  dashboard: 'dashboard',
  dataCenter: 'data-center',
  orderSalesImport: 'order-sales-import',
  effectiveNewListings: 'effective-new-listings',
  trafficConversionImport: 'traffic-conversion-import',
  dataManagement: 'data-management',
  dataBackup: 'data-backup',
  storeData: 'store-data',
  operationData: 'operation-data',
  analysisResults: 'analysis-results',
  storeManagement: 'store-management',
  operatorManagement: 'operator-management',
  accountManagement: 'account-management',
  businessAnalysis: 'business-analysis',
  businessAnalysisCenter: 'business-analysis-center',
  storeBusinessCenter: 'store-business-center',
  operatorAnalysisCenter: 'operator-analysis-center',
  operationDiagnosis: 'operation-diagnosis',
  aiOperationAnalysis: 'ai-operation-analysis',
  operatorPerformance: 'operator-performance',
  growthOpportunities: 'growth-opportunities',
  operationLoop: 'operation-loop',
  operationTasks: 'operation-tasks',
  taskSuggestions: 'task-suggestions',
  ruleCenter: 'rule-center',
  kpiRules: 'kpi-rules',
  rankingRules: 'ranking-rules',
  businessRules: 'business-rules',
  anomalyRules: 'anomaly-rules',
  dataSource: 'data-source',
  dataSourceConfig: 'data-source-config',
  salaryPerformance: 'salary-performance',
  salaryEmployees: 'salary-employees',
  salaryPeriods: 'salary-periods',
  salaryImportTemplates: 'salary-import-templates',
  salaryAttendanceImport: 'salary-attendance-import',
  salaryPieceworkImport: 'salary-piecework-import',
  salaryDetails: 'salary-details',
  salaryPlan: 'salary-plan',
} as const;

export type MenuKey = typeof menuKeys[keyof typeof menuKeys];

export const menuGroups: { key: MenuKey; label: string; children: { key: MenuKey; label: string }[] }[] = [
  { key: menuKeys.dashboard, label: '我的工作台', children: [{ key: menuKeys.dashboard, label: '我的工作台' }] },
  {
    key: menuKeys.dataCenter,
    label: '数据中心',
    children: [
      { key: menuKeys.orderSalesImport, label: '订单销售导入' },
      { key: menuKeys.effectiveNewListings, label: '有效上新录入' },
      { key: menuKeys.trafficConversionImport, label: '流量转化导入' },
      { key: menuKeys.dataManagement, label: '数据管理' },
      { key: menuKeys.dataBackup, label: '数据备份' },
    ],
  },
  {
    key: menuKeys.storeManagement,
    label: '店铺管理',
    children: [{ key: menuKeys.storeManagement, label: '店铺管理' }],
  },
  {
    key: menuKeys.operatorManagement,
    label: '运营管理',
    children: [{ key: menuKeys.operatorManagement, label: '运营管理' }],
  },
  {
    key: menuKeys.accountManagement,
    label: '账号管理',
    children: [{ key: menuKeys.accountManagement, label: '账号管理' }],
  },
  {
    key: menuKeys.businessAnalysis,
    label: '经营分析',
    children: [
      { key: menuKeys.storeBusinessCenter, label: '店铺经营中心' },
      { key: menuKeys.operatorAnalysisCenter, label: '运营分析中心' },
      { key: menuKeys.businessAnalysisCenter, label: '风险诊断中心' },
      { key: menuKeys.operationDiagnosis, label: '异常结果中心' },
      { key: menuKeys.aiOperationAnalysis, label: 'AI运营分析' },
      { key: menuKeys.growthOpportunities, label: '增长机会' },
    ],
  },
  {
    key: menuKeys.operationLoop,
    label: '运营闭环',
    children: [
      { key: menuKeys.operationTasks, label: '运营任务中心' },
      { key: menuKeys.taskSuggestions, label: '处理建议模板' },
    ],
  },
  {
    key: menuKeys.ruleCenter,
    label: '规则中心',
    children: [
      { key: menuKeys.kpiRules, label: 'KPI规则' },
      { key: menuKeys.rankingRules, label: '排名规则' },
      { key: menuKeys.businessRules, label: '经营规则' },
      { key: menuKeys.anomalyRules, label: '异常规则' },
    ],
  },
  {
    key: menuKeys.dataSource,
    label: '数据源',
    children: [{ key: menuKeys.dataSourceConfig, label: '数据源配置' }],
  },
  {
    key: menuKeys.salaryPerformance,
    label: '薪资绩效',
    children: [
      { key: menuKeys.salaryEmployees, label: '员工档案' },
      { key: menuKeys.salaryPeriods, label: '工资周期' },
      { key: menuKeys.salaryImportTemplates, label: '导入模板配置' },
      { key: menuKeys.salaryAttendanceImport, label: '打卡记录导入' },
      { key: menuKeys.salaryPieceworkImport, label: '计件工资导入' },
      { key: menuKeys.salaryDetails, label: '工资明细中心' },
      { key: menuKeys.salaryPlan, label: '薪资系统规划' },
    ],
  },
];

export const menuOptions = menuGroups.flatMap((group) => group.children);
export const allMenuKeys = Array.from(new Set([
  ...menuGroups.map((group) => group.key),
  ...menuOptions.map((item) => item.key),
]));
