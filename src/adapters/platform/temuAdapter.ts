import type { AnalysisResultRecord, SalesOrderRecord, TrafficMetricRecord } from '../../types/fact';
import type { TrafficAnalysisResultLevel, TrafficAnalysisResultType, TrafficMetricField, TrafficWarningLevel, TrafficWarningType } from '../../types/traffic';
import {
  buildStandardAnalysisResults,
  buildStandardSalesOrders,
  buildStandardTrafficRecords,
} from '../../utils/factDataStandardization';
import type {
  PlatformAdapter,
  PlatformAdapterInput,
  PlatformAdapterOutput,
  PlatformRawRecord,
} from './platformAdapterTypes';

type TemuSourceSalesOrder = {
  orderId?: string;
  uniqueKey?: string;
  sku?: string;
  productId?: string;
  productName?: string;
  storeName: string;
  orderDate: string;
  salesAmount: number;
  orderAmount?: number;
  quantity?: number;
  isFirstOrder?: boolean;
  currency?: string;
  rawSource?: unknown;
  batchId?: string;
  operatorName?: string;
};

type TemuSourceTrafficMetric = {
  batchId?: string;
  storeName: string;
  date: string;
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
};

type TemuSourceAnalysisResult = {
  id?: string;
  storeName: string;
  date: string;
  salesAmount?: number;
  orderCount?: number;
  visitorCount?: number;
  conversionRate?: number;
  avgOrderValue?: number;
  refundRate?: number;
  afterSaleRate?: number;
  adSpend?: number;
  roas?: number;
  type: TrafficWarningType;
  metricField: TrafficMetricField;
  previous30Avg: number;
  recent7Avg: number;
  changeRate: number;
  changeRateText?: string;
  resultType: TrafficAnalysisResultType;
  resultLevel?: TrafficAnalysisResultLevel;
  resultLabel?: string;
  level: TrafficWarningLevel | 'normal' | 'opportunity';
  content: string;
  rawSource?: unknown;
};

function isRecord(value: unknown): value is PlatformRawRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toRawRecords(value: unknown): PlatformRawRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sourceRecords(source: unknown, key: 'orders' | 'records' | 'items') {
  return isRecord(source) ? toRawRecords(source[key]) : [];
}

function batchOrderRecords(source: unknown): PlatformRawRecord[] {
  if (!isRecord(source)) {
    return [];
  }

  return toRawRecords(source.batches).flatMap((batch) => {
    const batchId = String(batch.batchId ?? '');
    return toRawRecords(batch.orders).map((order) => ({ ...order, batchId }));
  });
}

function toText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/%|,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return value === true || text === 'true' || text === '1' || text === 'yes';
}

function withTemuPlatform<T extends SalesOrderRecord | TrafficMetricRecord | AnalysisResultRecord>(records: T[]) {
  return records.map((record) => ({ ...record, platform: 'TEMU' as const }));
}

function salesOrderSources(input: PlatformAdapterInput): TemuSourceSalesOrder[] {
  const records = input.salesOrders?.length
    ? input.salesOrders
    : [...sourceRecords(input.source, 'orders'), ...batchOrderRecords(input.source)];

  return records.map((record) => {
    const orderDate = toText(record.orderDate) || toText(record.orderTime).slice(0, 10);

    return {
      orderId: toText(record.orderId),
      uniqueKey: toText(record.uniqueKey),
      sku: toText(record.skuCode || record.productSku || record.sku),
      productId: toText(record.productId || record.productSku || record.skcCode || record.skc),
      productName: toText(record.productName),
      storeName: toText(record.storeName, 'Unknown Store'),
      orderDate,
      salesAmount: toNumber(record.salesAmount),
      orderAmount: toNumber(record.orderAmount || record.salesAmount),
      quantity: toNumber(record.quantity),
      isFirstOrder: toBoolean(record.isFirstOrder),
      currency: toText(record.currency, 'CNY'),
      rawSource: record,
      batchId: toText(record.batchId || input.sourceBatchId),
      operatorName: toText(record.operatorName),
    };
  });
}

function trafficMetricSources(input: PlatformAdapterInput): TemuSourceTrafficMetric[] {
  const records = input.trafficMetrics?.length ? input.trafficMetrics : sourceRecords(input.source, 'records');

  return records.map((record) => ({
    batchId: toText(record.batchId || input.sourceBatchId),
    storeName: toText(record.storeName, 'Unknown Store'),
    date: toText(record.date),
    productId: toText(record.productId),
    productName: toText(record.productName),
    visitorCount: toNumber(record.visitorCount || record.totalVisitors),
    impressionCount: toNumber(record.impressionCount || record.totalViews),
    clickCount: toNumber(record.clickCount),
    ctr: toNumber(record.ctr),
    conversionRate: toNumber(record.conversionRate || record.totalPayConversionRate),
    addToCartRate: toNumber(record.addToCartRate),
    orderCount: toNumber(record.orderCount || record.totalPayBuyers),
    salesAmount: toNumber(record.salesAmount),
    totalViews: toNumber(record.totalViews),
    totalVisitors: toNumber(record.totalVisitors),
    totalPayBuyers: toNumber(record.totalPayBuyers),
    totalPayConversionRate: toNumber(record.totalPayConversionRate),
    totalPayPieces: toNumber(record.totalPayPieces),
    productViews: toNumber(record.productViews),
    productVisitors: toNumber(record.productVisitors),
    detailPayBuyers: toNumber(record.detailPayBuyers),
    detailPayConversionRate: toNumber(record.detailPayConversionRate),
    storePageViews: toNumber(record.storePageViews),
    storePageVisitors: toNumber(record.storePageVisitors),
    storePagePayBuyers: toNumber(record.storePagePayBuyers),
    storePagePayConversionRate: toNumber(record.storePagePayConversionRate),
    rawSource: record,
  }));
}

function analysisResultSources(input: PlatformAdapterInput, warnings: string[]): TemuSourceAnalysisResult[] {
  const records = input.analysisResults?.length ? input.analysisResults : sourceRecords(input.source, 'items');

  return records.flatMap((record) => {
    const type = record.type as TrafficWarningType;
    const metricField = record.metricField as TrafficMetricField;
    const resultType = record.resultType as TrafficAnalysisResultType;
    const level = record.level as TrafficWarningLevel | 'normal' | 'opportunity';

    if (!type || !metricField || !resultType || !level) {
      warnings.push('TEMU analysis record skipped because required analysis fields are missing.');
      return [];
    }

    return [{
      id: toText(record.id),
      storeName: toText(record.storeName, 'Unknown Store'),
      date: toText(record.date),
      salesAmount: toNumber(record.salesAmount),
      orderCount: toNumber(record.orderCount),
      visitorCount: toNumber(record.visitorCount),
      conversionRate: toNumber(record.conversionRate),
      avgOrderValue: toNumber(record.avgOrderValue),
      refundRate: toNumber(record.refundRate),
      afterSaleRate: toNumber(record.afterSaleRate),
      adSpend: toNumber(record.adSpend),
      roas: toNumber(record.roas),
      type,
      metricField,
      previous30Avg: toNumber(record.previous30Avg),
      recent7Avg: toNumber(record.recent7Avg),
      changeRate: toNumber(record.changeRate),
      changeRateText: toText(record.changeRateText),
      resultType,
      resultLevel: record.resultLevel as TrafficAnalysisResultLevel | undefined,
      resultLabel: toText(record.resultLabel),
      level,
      content: toText(record.content),
      rawSource: record,
    }];
  });
}

export class TEMUAdapter implements PlatformAdapter {
  platform = 'temu' as const;

  adapt(input: PlatformAdapterInput): PlatformAdapterOutput {
    const warnings: string[] = [];
    const salesOrders = withTemuPlatform(buildStandardSalesOrders(salesOrderSources(input)));
    const trafficMetrics = withTemuPlatform(buildStandardTrafficRecords(trafficMetricSources(input)));
    const analysisResults = withTemuPlatform(buildStandardAnalysisResults(analysisResultSources(input, warnings)));

    return {
      salesOrders,
      trafficMetrics,
      analysisResults,
      warnings,
    };
  }
}
