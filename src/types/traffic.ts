export type TrafficWarningType = 'traffic' | 'conversion' | 'deal';

export type TrafficMetricField =
  | 'productVisitors'
  | 'detailPayConversionRate'
  | 'totalPayBuyers';

export type TrafficWarningLevel = 'warning' | 'critical' | 'insufficient';

export type TrafficImportStatus = 'success' | 'covered' | 'abnormal' | 'missing';

export interface TrafficConversionRecord {
  batchId?: string;
  storeName: string;
  date: string;
  totalViews: number;
  totalVisitors: number;
  totalPayBuyers: number;
  totalPayConversionRate: number;
  totalPayPieces: number;
  productViews: number;
  productVisitors: number;
  detailPayBuyers: number;
  detailPayConversionRate: number;
  storePageViews: number;
  storePageVisitors: number;
  storePagePayBuyers: number;
  storePagePayConversionRate: number;
  importedAt: string;
  fileName: string;
}

export interface TrafficImportBatch {
  id: string;
  importedAt: string;
  storeName: string;
  fileName: string;
  dateStart: string;
  dateEnd: string;
  detailCount: number;
  coveredCount: number;
  newCount: number;
  productVisitorsTotal: number;
  totalPayBuyersTotal: number;
  detailPayConversionRateAvg: number;
  status: TrafficImportStatus;
  recordKeys: string[];
}

export interface TrafficConversionStore {
  records: TrafficConversionRecord[];
  batches?: TrafficImportBatch[];
}

export interface TrafficWarningRuleConfig {
  id: string;
  name: string;
  type: TrafficWarningType;
  metricField: TrafficMetricField;
  yellowThreshold: number;
  redThreshold: number;
  enabled: boolean;
  sortWeight: number;
  remark: string;
}

export interface TrafficGrowthRuleConfig {
  id: string;
  name: string;
  type: TrafficWarningType;
  metricField: TrafficMetricField;
  growthThreshold: number;
  enabled: boolean;
  sortWeight: number;
  remark: string;
}

export interface TrafficWarningSettings {
  displayLimit: number;
}

export interface TrafficWarningRuleStore {
  settings: TrafficWarningSettings;
  rules: TrafficWarningRuleConfig[];
  growthRules: TrafficGrowthRuleConfig[];
}

export interface TrafficWarningResult {
  id: string;
  date: string;
  storeName: string;
  type: TrafficWarningType;
  ruleName: string;
  metricField: TrafficMetricField;
  previous30Avg: number;
  recent7Avg: number;
  dropRate: number;
  level: TrafficWarningLevel;
  triggeredAt: string;
  content: string;
  sortWeight: number;
}

export interface TrafficGrowthOpportunity {
  id: string;
  date: string;
  storeName: string;
  type: TrafficWarningType;
  metricField: TrafficMetricField;
  previous30Avg: number;
  recent7Avg: number;
  growthRate: number;
  content: string;
  sortWeight?: number;
}

export type TrafficAnalysisResultType = 'risk' | 'opportunity' | 'insufficient' | 'normal';

export interface TrafficAnalysisItem {
  id: string;
  date: string;
  storeName: string;
  type: TrafficWarningType;
  metricField: TrafficMetricField;
  previous30Avg: number;
  recent7Avg: number;
  changeRate: number;
  resultType: TrafficAnalysisResultType;
  level: TrafficWarningLevel | 'normal' | 'opportunity';
  content: string;
}
