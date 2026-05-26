import type { AnalysisResultRecord, SalesOrderRecord, TrafficMetricRecord } from '../../types/fact';

export type PlatformType = 'temu' | 'amazon' | '1688' | 'tiktok' | 'shopify';

export type PlatformRawRecord = Record<string, unknown>;

export interface PlatformAdapterInput {
  platform: PlatformType;
  source?: unknown;
  sourceBatchId?: string;
  salesOrders?: PlatformRawRecord[];
  trafficMetrics?: PlatformRawRecord[];
  analysisResults?: PlatformRawRecord[];
}

export interface PlatformAdapterOutput {
  salesOrders?: SalesOrderRecord[];
  trafficMetrics?: TrafficMetricRecord[];
  analysisResults?: AnalysisResultRecord[];
  warnings?: string[];
}

export interface PlatformAdapter {
  platform: PlatformType;
  adapt(input: PlatformAdapterInput): PlatformAdapterOutput;
}
