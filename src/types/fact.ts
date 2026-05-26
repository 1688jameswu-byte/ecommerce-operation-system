import type { StorePlatform } from './store';
import type { TrafficAnalysisResultType, TrafficMetricField, TrafficWarningLevel, TrafficWarningType } from './traffic';

export interface DateDimension {
  date: string;
  month: string;
  year: number;
  week: string;
}

export interface BaseFactRecord extends DateDimension {
  platform: StorePlatform;
  storeId: string;
  storeName: string;
  operatorId: string;
  operatorName: string;
}

export interface SalesOrderRecord extends BaseFactRecord {
  orderId: string;
  sku?: string;
  productId?: string;
  productName?: string;
  salesAmount: number;
  orderAmount?: number;
  quantity: number;
  isFirstOrder: boolean;
  currency?: string;
  rawSource?: unknown;
  sourceBatchId?: string;
  sourceKey?: string;
}

export interface TrafficMetricRecord extends BaseFactRecord {
  productId?: string;
  productName?: string;
  visitorCount?: number;
  impressionCount?: number;
  clickCount?: number;
  ctr?: number;
  conversionRate?: number;
  addToCartRate?: number;
  orderCount?: number;
  salesAmount?: number;
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
  rawSource?: unknown;
  sourceBatchId?: string;
}

export interface AnalysisResultRecord extends BaseFactRecord {
  salesAmount?: number;
  orderCount?: number;
  visitorCount?: number;
  conversionRate?: number;
  avgOrderValue?: number;
  refundRate?: number;
  afterSaleRate?: number;
  adSpend?: number;
  roas?: number;
  analysisType: TrafficWarningType;
  metricField: TrafficMetricField;
  previous30Avg: number;
  recent7Avg: number;
  changeRate: number;
  resultType: TrafficAnalysisResultType;
  level: TrafficWarningLevel | 'normal' | 'opportunity';
  content: string;
  rawSource?: unknown;
  sourceId?: string;
}

export type FactRecordKind = 'sales' | 'traffic' | 'analysis';

export interface FactDataQualityIssue {
  kind: FactRecordKind;
  storeName: string;
  date: string;
  missingFields: Array<'storeId' | 'operatorId' | 'platform' | 'date'>;
}

export interface FactDataQualityReport {
  totalRecords: number;
  missingStoreIdCount: number;
  missingOperatorIdCount: number;
  missingPlatformCount: number;
  missingDateCount: number;
  issueSamples: FactDataQualityIssue[];
}
