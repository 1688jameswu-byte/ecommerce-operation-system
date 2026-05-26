export type PlatformCode = 'TEMU' | 'AMAZON' | 'TIKTOK' | 'SHOPIFY' | 'ALL';

export type StandardMetricKey =
  | 'viewCount'
  | 'visitorCount'
  | 'payBuyerCount'
  | 'payConversionRate'
  | 'payItemCount'
  | 'salesAmount'
  | 'viewsPerVisitor'
  | 'itemsPerBuyer'
  | 'avgOrderValue'
  | 'avgItemPrice';

export type RuleType = 'single_metric' | 'multi_metric';

export type AnomalyLevel =
  | 'normal'
  | 'watch'
  | 'warning'
  | 'critical'
  | 'opportunity'
  | 'abnormal_up';

export type PrimaryAnomalyType =
  | 'traffic_drop'
  | 'conversion_drop'
  | 'sales_decline'
  | 'transaction_decline'
  | 'traffic_quality_issue'
  | 'customer_unit_price_drop'
  | 'growth_opportunity'
  | 'risk_fluctuation';

export type BaseOperationRule = {
  platform: PlatformCode;
  ruleCode: string;
  ruleName: string;
  ruleType: RuleType;
  metricKeys: StandardMetricKey[];
  anomalyLevel: AnomalyLevel;
  priority: number;
  conditionDescription: string;
  businessMeaning: string;
  enabled: boolean;
};

export type BaseReasonTree = {
  platform: PlatformCode;
  ruleCode: string;
  ruleName: string;
  primaryAnomalyType: PrimaryAnomalyType;
  coreProblem: string;
  businessMeaning: string;
  possibleReasons: {
    reasonCode: string;
    reasonName: string;
    confidence: 'low' | 'medium' | 'high';
    evidenceNeeded?: string[];
    needHumanCheck: boolean;
  }[];
  enabled: boolean;
};

export type BaseStrategyRule = {
  platform: PlatformCode;
  ruleCode: string;
  ruleName: string;
  primaryAnomalyType: PrimaryAnomalyType;
  actions: {
    actionCode: string;
    actionName: string;
    priority: 'low' | 'medium' | 'high';
    ownerRole: 'operator' | 'leader' | 'admin';
    actionSteps: string[];
    expectedEffect: string;
    riskNote?: string;
  }[];
  enabled: boolean;
};

export type BaseRootCauseRule = {
  platform: PlatformCode;
  ruleCode: string;
  ruleName: string;
  primaryAnomalyType: PrimaryAnomalyType;
  priority: number;
  coreProblem: string;
  businessMeaning: string;
  coreAttribution: string;
  possibleReasons: string[];
  recommendedActions: string[];
  shouldCreateTask: boolean;
  bossAttentionRequired: boolean;
  enabled: boolean;
};

export type PlatformMetricMapping = {
  platform: PlatformCode;
  rawMetricName: string;
  standardMetricKey: StandardMetricKey;
};
