import { operatorDataSource } from '../data-source/operatorDataSource';
import { storeDataSource } from '../data-source/storeDataSource';
import { storeOperatorDataSource } from '../data-source/storeOperatorDataSource';
import type { AnalysisResultRecord, SalesOrderRecord, TrafficMetricRecord } from '../types/fact';
import type { StorePlatform, StoreRecord } from '../types/store';
import type { StoreOperatorRelation } from '../types/storeOperator';
import type { TrafficAnalysisResultLevel, TrafficAnalysisResultType, TrafficMetricField, TrafficWarningLevel, TrafficWarningType } from '../types/traffic';
import { createStoreMatcher } from './storeStandardization';

interface SourceSalesOrder {
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
}

interface SourceTrafficMetric {
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
}

interface SourceAnalysisResult {
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
}

type StoreMatcher = ReturnType<typeof createStoreMatcher>;

function safeLoad<T>(loader: () => T, fallback: T) {
  try {
    return loader();
  } catch {
    return fallback;
  }
}

function normalizeDate(value: string) {
  const text = String(value || '').slice(0, 10);
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : text;
}

function buildDateDimension(value: string) {
  const date = normalizeDate(value);
  if (!date) {
    return { date: value || '', month: '', year: 0, week: '' };
  }

  const parsed = new Date(`${date}T00:00:00`);
  const firstDay = new Date(parsed.getFullYear(), 0, 1);
  const dayIndex = Math.floor((parsed.getTime() - firstDay.getTime()) / 86400000);
  const weekNumber = Math.ceil((dayIndex + firstDay.getDay() + 1) / 7);

  return {
    date,
    month: date.slice(0, 7),
    year: parsed.getFullYear(),
    week: `${parsed.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`,
  };
}

function relationActiveOnDate(relation: StoreOperatorRelation, date: string) {
  return relation.status !== 'inactive' &&
    (!relation.startDate || relation.startDate <= date) &&
    (!relation.endDate || relation.endDate >= date);
}

function findRelation(
  relations: StoreOperatorRelation[],
  storeId: string,
  storeName: string,
  date: string,
) {
  return relations.find((relation) =>
    relationActiveOnDate(relation, date) &&
    (relation.storeId === storeId || relation.storeName === storeName),
  );
}

function buildContext() {
  const stores = safeLoad(() => storeDataSource.load(), []);
  const relations = safeLoad(() => storeOperatorDataSource.load(), []);
  const operators = safeLoad(() => operatorDataSource.load(), []);
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const storeByName = new Map(stores.map((store) => [store.storeName, store]));
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));

  return { stores, relations, storeById, storeByName, operatorById };
}

function resolveStore(
  storeName: string,
  matcher: StoreMatcher,
  storeById: Map<string, StoreRecord>,
  storeByName: Map<string, StoreRecord>,
) {
  const identity = matcher.match(storeName);
  const store = (identity.storeId ? storeById.get(identity.storeId) : undefined) || storeByName.get(identity.storeName);
  const platform = (store?.platform || 'Other') as StorePlatform;

  return {
    storeId: identity.storeId || identity.key,
    storeName: identity.storeName,
    platform,
  };
}

function resolveOperator(
  relations: StoreOperatorRelation[],
  operatorById: ReturnType<typeof buildContext>['operatorById'],
  storeId: string,
  storeName: string,
  date: string,
  fallbackName = '',
) {
  const relation = findRelation(relations, storeId, storeName, date);
  const operator = relation ? operatorById.get(relation.operatorId) : undefined;
  const operatorName = operator?.operatorName || relation?.operatorName || fallbackName || '';

  return {
    operatorId: relation?.operatorId || (operatorName ? `operator-${operatorName}` : ''),
    operatorName,
  };
}

export function buildStandardSalesOrders(orders: SourceSalesOrder[]): SalesOrderRecord[] {
  const context = buildContext();
  const matcher = createStoreMatcher(context.stores);

  return orders.map((order) => {
    const dates = buildDateDimension(order.orderDate);
    const store = resolveStore(order.storeName, matcher, context.storeById, context.storeByName);
    const operator = resolveOperator(context.relations, context.operatorById, store.storeId, store.storeName, dates.date, order.operatorName);

    return {
      ...dates,
      ...store,
      ...operator,
      orderId: order.orderId || order.uniqueKey || '',
      sku: order.sku,
      productId: order.productId,
      productName: order.productName,
      salesAmount: order.salesAmount,
      orderAmount: order.orderAmount ?? order.salesAmount,
      quantity: order.quantity ?? 0,
      isFirstOrder: Boolean(order.isFirstOrder),
      currency: order.currency,
      rawSource: order.rawSource,
      sourceBatchId: order.batchId,
      sourceKey: order.uniqueKey,
    };
  });
}

export function buildStandardTrafficRecords(records: SourceTrafficMetric[]): TrafficMetricRecord[] {
  const context = buildContext();
  const matcher = createStoreMatcher(context.stores);

  return records.map((record) => {
    const dates = buildDateDimension(record.date);
    const store = resolveStore(record.storeName, matcher, context.storeById, context.storeByName);
    const operator = resolveOperator(context.relations, context.operatorById, store.storeId, store.storeName, dates.date);

    return {
      ...dates,
      ...store,
      ...operator,
      productId: record.productId,
      productName: record.productName,
      visitorCount: record.visitorCount ?? record.totalVisitors,
      impressionCount: record.impressionCount ?? record.totalViews,
      clickCount: record.clickCount,
      ctr: record.ctr,
      conversionRate: record.conversionRate ?? record.totalPayConversionRate,
      addToCartRate: record.addToCartRate,
      orderCount: record.orderCount ?? record.totalPayBuyers,
      salesAmount: record.salesAmount,
      totalViews: record.totalViews,
      totalVisitors: record.totalVisitors,
      totalPayBuyers: record.totalPayBuyers,
      totalPayConversionRate: record.totalPayConversionRate,
      totalPayPieces: record.totalPayPieces,
      productViews: record.productViews,
      productVisitors: record.productVisitors,
      detailPayBuyers: record.detailPayBuyers,
      detailPayConversionRate: record.detailPayConversionRate,
      storePageViews: record.storePageViews,
      storePageVisitors: record.storePageVisitors,
      storePagePayBuyers: record.storePagePayBuyers,
      storePagePayConversionRate: record.storePagePayConversionRate,
      rawSource: record.rawSource,
      sourceBatchId: record.batchId,
    };
  });
}

export function buildStandardAnalysisResults(items: SourceAnalysisResult[]): AnalysisResultRecord[] {
  const context = buildContext();
  const matcher = createStoreMatcher(context.stores);

  return items.map((item) => {
    const dates = buildDateDimension(item.date);
    const store = resolveStore(item.storeName, matcher, context.storeById, context.storeByName);
    const operator = resolveOperator(context.relations, context.operatorById, store.storeId, store.storeName, dates.date);

    return {
      ...dates,
      ...store,
      ...operator,
      salesAmount: item.salesAmount,
      orderCount: item.orderCount,
      visitorCount: item.visitorCount,
      conversionRate: item.conversionRate,
      avgOrderValue: item.avgOrderValue,
      refundRate: item.refundRate,
      afterSaleRate: item.afterSaleRate,
      adSpend: item.adSpend,
      roas: item.roas,
      analysisType: item.type,
      metricField: item.metricField,
      previous30Avg: item.previous30Avg,
      recent7Avg: item.recent7Avg,
      changeRate: item.changeRate,
      changeRateText: item.changeRateText,
      resultType: item.resultType,
      resultLevel: item.resultLevel,
      resultLabel: item.resultLabel,
      level: item.level,
      content: item.content,
      rawSource: item.rawSource,
      sourceId: item.id,
    };
  });
}
