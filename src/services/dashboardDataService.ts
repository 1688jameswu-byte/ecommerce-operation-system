import { dashboardDataSource } from '../data-source';
import { operatorDataSource } from '../data-source/operatorDataSource';
import { orderImportStorageDataSource } from '../data-source/orderImportStorageDataSource';
import { storeDataSource } from '../data-source/storeDataSource';
import { storeOperatorDataSource } from '../data-source/storeOperatorDataSource';
import { trafficConversionDataSource } from '../data-source/trafficConversionDataSource';
import type { DashboardData, GrowthOpportunityItem, WarningItem, WarningLevel } from '../types/dashboard';
import type { SalesOrderRecord } from '../types/fact';
import type { OperatorRecord } from '../types/operator';
import type { TemuOrderDetail, TemuOrderImportStore } from '../types/order';
import type { StoreRecord } from '../types/store';
import type { StoreOperatorRelation } from '../types/storeOperator';
import type { TrafficWarningResult } from '../types/traffic';
import { buildDashboardDataFromOrders } from '../utils/orderDashboardAdapter';
import { createStoreMatcher } from '../utils/storeStandardization';

const levelRank = { critical: 0, high: 1, medium: 2, low: 3 };
const UNBOUND_OPERATOR = '未绑定运营';
let dashboardDataCache: DashboardData | null = null;
let dashboardDataPromise: Promise<DashboardData> | null = null;

function toDashboardWarning(result: TrafficWarningResult): WarningItem {
  return {
    id: result.id || `${result.storeName || 'unknown'}-${result.type || 'traffic'}-${result.date || Date.now()}`,
    type: result.type || 'traffic',
    storeName: result.storeName || '-',
    content: result.content || '-',
    time: (result.triggeredAt || result.date || '').replace('T', ' ').slice(11, 16),
    level: (result.level === 'critical' ? 'critical' : 'high') as WarningLevel,
  };
}

function getTrafficWarnings() {
  const ruleStore = trafficConversionDataSource.loadRuleStore();
  return trafficConversionDataSource
    .loadRiskResults()
    .filter((result) => result.level !== 'insufficient')
    .sort((first, second) => {
      const firstLevel = levelRank[toDashboardWarning(first).level];
      const secondLevel = levelRank[toDashboardWarning(second).level];
      return firstLevel - secondLevel || second.dropRate - first.dropRate || second.sortWeight - first.sortWeight;
    })
    .slice(0, ruleStore.settings.displayLimit)
    .map(toDashboardWarning);
}

function getGrowthOpportunities(): GrowthOpportunityItem[] {
  return trafficConversionDataSource.loadGrowthOpportunities().map((item) => ({
    id: item.id || `${item.storeName || 'unknown'}-${item.type || 'traffic'}-${Date.now()}`,
    type: item.type || 'traffic',
    storeName: item.storeName || '-',
    content: item.content || '-',
    growthRate: Number.isFinite(item.growthRate) ? item.growthRate : 0,
  }));
}

function safeTrafficWarnings() {
  try {
    return getTrafficWarnings();
  } catch {
    return [];
  }
}

function safeGrowthOpportunities() {
  try {
    return getGrowthOpportunities();
  } catch {
    return [];
  }
}

function safeLoad<T>(loader: () => T, fallback: T) {
  try {
    return loader();
  } catch {
    return fallback;
  }
}

function relationActiveOnDate(relation: StoreOperatorRelation, date: string) {
  return relation.status === 'active' &&
    relation.role === 'primary' &&
    (!relation.startDate || relation.startDate <= date) &&
    (!relation.endDate || relation.endDate >= date);
}

function buildOrderOwnerContext() {
  const stores = safeLoad<StoreRecord[]>(() => storeDataSource.load(), []);
  const relations = safeLoad<StoreOperatorRelation[]>(() => storeOperatorDataSource.load(), []);
  const operators = safeLoad<OperatorRecord[]>(() => operatorDataSource.load(), []);
  const matcher = createStoreMatcher(stores);
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));

  return { matcher, relations, operatorById };
}

function resolvePrimaryOwner(
  context: ReturnType<typeof buildOrderOwnerContext>,
  storeId: string,
  storeName: string,
  date: string,
) {
  const relation = context.relations.find((item) =>
    relationActiveOnDate(item, date) &&
    (item.storeId === storeId || item.storeName === storeName),
  );
  const operator = relation ? context.operatorById.get(relation.operatorId) : undefined;
  const operatorName = operator?.operatorName || relation?.operatorName || UNBOUND_OPERATOR;

  return {
    operatorId: relation?.operatorId || UNBOUND_OPERATOR,
    operatorName,
  };
}

function toSalesOrder(order: TemuOrderDetail & { batchId?: string }, context: ReturnType<typeof buildOrderOwnerContext>): SalesOrderRecord {
  const date = String(order.orderDate || order.orderTime || '').slice(0, 10);
  const storeIdentity = context.matcher.match(order.storeName);
  const storeId = storeIdentity.storeId || storeIdentity.key;
  const storeName = storeIdentity.storeName;
  const owner = resolvePrimaryOwner(context, storeId, storeName, date);

  return {
    date,
    month: order.month || date.slice(0, 7),
    year: Number(date.slice(0, 4)) || new Date().getFullYear(),
    week: '',
    platform: 'TEMU',
    storeId,
    storeName,
    operatorId: owner.operatorId,
    operatorName: owner.operatorName,
    orderId: order.orderId || order.uniqueKey,
    sku: order.productSku || order.skuCode || order.skc,
    productName: order.productName,
    salesAmount: Number(order.salesAmount) || 0,
    orderAmount: Number(order.salesAmount) || 0,
    quantity: Number(order.quantity) || 0,
    isFirstOrder: Boolean(order.isFirstOrder),
    rawSource: order,
    sourceBatchId: order.batchId,
    sourceKey: order.uniqueKey,
  };
}

function toStandardSalesOrders(store: TemuOrderImportStore): SalesOrderRecord[] {
  const context = buildOrderOwnerContext();

  return store.batches.flatMap((batch) =>
    (batch.orders ?? []).map((order) => toSalesOrder({ ...order, batchId: batch.batchId }, context)),
  );
}

async function buildDashboardData(): Promise<DashboardData> {
  const trafficWarnings = safeTrafficWarnings();
  const growthOpportunities = safeGrowthOpportunities();

  try {
    const orderStore = await orderImportStorageDataSource.loadRecentStore({ recentDays: 30, limit: 500 });
    const orderImportResult = orderImportStorageDataSource.buildImportResult(orderStore);

    if (orderImportResult && orderImportResult.orders.length > 0) {
      return {
        ...buildDashboardDataFromOrders(orderImportResult, toStandardSalesOrders(orderStore)),
        dataSource: '真实数据',
        warnings: trafficWarnings,
        growthOpportunities,
      };
    }
  } catch {
    // Fall back to mock data when production JSON is missing or malformed.
  }

  return {
    ...(await dashboardDataSource.getDashboardData()),
    dataSource: 'Mock 数据',
    warnings: trafficWarnings,
    growthOpportunities,
  };
}

export async function getDashboardData(force = false): Promise<DashboardData> {
  if (dashboardDataPromise) {
    return dashboardDataPromise;
  }

  if (dashboardDataCache && !force) {
    return dashboardDataCache;
  }

  dashboardDataPromise = buildDashboardData()
    .then((data) => {
      dashboardDataCache = data;
      return data;
    })
    .finally(() => {
      dashboardDataPromise = null;
    });

  return dashboardDataPromise;
}
