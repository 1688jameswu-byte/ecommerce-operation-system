import { mockDashboardData } from '../data/mockDashboardData';
import type {
  DashboardData,
  FirstOrderDailyTrendItem,
  FirstOrderTrendItem,
  FirstOrderTrendStatus,
  MetricItem,
  RankingItem,
  SalesTrendItem,
  WarningItem,
} from '../types/dashboard';
import type { TemuOrderDetail, TemuOrderImportResult } from '../types/order';
import type { SalesOrderRecord } from '../types/fact';

const UNASSIGNED_OPERATOR = '未分配运营';
const RANKING_LIMIT = 10;
const TREND_DAYS = 30;

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  return toDateKey(date).slice(0, 7);
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function getCurrentDate() {
  return new Date();
}

function getLatestOrderDate(orders: SalesOrderRecord[]) {
  const latestDateKey = orders
    .map((order) => order.date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return latestDateKey ? parseDateKey(latestDateKey) ?? getCurrentDate() : getCurrentDate();
}

function getOrderQuantity(order: SalesOrderRecord) {
  return Number(order.quantity) || 0;
}

function getOrderSalesAmount(order: SalesOrderRecord) {
  const salesAmount = Number(order.salesAmount);

  if (Number.isFinite(salesAmount) && salesAmount > 0) {
    return salesAmount;
  }

  const orderAmount = Number(order.orderAmount);

  if (Number.isFinite(orderAmount) && orderAmount > 0) {
    return orderAmount;
  }

  const rawOrder = order.rawSource as Partial<TemuOrderDetail> | undefined;
  const declarePrice = Number(rawOrder?.declarePrice);
  const quantity = getOrderQuantity(order);

  return Number.isFinite(declarePrice) ? declarePrice * quantity : 0;
}

function sumSales(orders: SalesOrderRecord[]) {
  return orders.reduce((total, order) => total + getOrderSalesAmount(order), 0);
}

function sumQuantity(orders: SalesOrderRecord[]) {
  return orders.reduce((total, order) => total + getOrderQuantity(order), 0);
}

function buildRanking(
  entries: Array<[string, number]>,
  unit: string,
  withGrowth = false,
  limit = RANKING_LIMIT,
): RankingItem[] {
  return entries
    .sort((first, second) => second[1] - first[1])
    .slice(0, limit)
    .map(([name, value], index) => ({
      rank: index + 1,
      name,
      value: Number(value.toFixed(2)),
      unit,
      trend: withGrowth ? 'up' : 'flat',
      growthPercent: withGrowth ? 0 : undefined,
    }));
}

function groupSum(orders: SalesOrderRecord[], getKey: (order: SalesOrderRecord) => string) {
  const result = new Map<string, number>();

  for (const order of orders) {
    const key = getKey(order);
    result.set(key, (result.get(key) ?? 0) + getOrderSalesAmount(order));
  }

  return Array.from(result.entries());
}

function groupCount(orders: SalesOrderRecord[], getKey: (order: SalesOrderRecord) => string) {
  const result = new Map<string, number>();

  for (const order of orders) {
    const key = getKey(order);
    result.set(key, (result.get(key) ?? 0) + 1);
  }

  return Array.from(result.entries());
}

function groupOperatorSales(orders: SalesOrderRecord[]) {
  return groupSum(orders, (order) => order.operatorName || UNASSIGNED_OPERATOR);
}

function groupStoreSales(orders: SalesOrderRecord[]) {
  const totals = new Map<string, { name: string; value: number }>();

  for (const order of orders) {
    const current = totals.get(order.storeId) ?? { name: order.storeName, value: 0 };
    current.value += getOrderSalesAmount(order);
    totals.set(order.storeId, current);
  }

  return Array.from(totals.values()).map((item) => [item.name, item.value] as [string, number]);
}

function getFirstOrderProductKey(order: SalesOrderRecord) {
  const rawOrder = order.rawSource as Partial<TemuOrderDetail> | undefined;
  return String(
    rawOrder?.skc ||
    rawOrder?.skcCode ||
    order.productId ||
    order.sku ||
    rawOrder?.productSku ||
    rawOrder?.skuCode ||
    order.productName ||
    order.sourceKey ||
    '',
  ).trim().toLowerCase();
}

function buildFirstOrderProductRanking(orders: SalesOrderRecord[], endDate: Date) {
  const dateKeySet30 = new Set(getRecentDateKeys(endDate, TREND_DAYS));
  const grouped = new Map<string, { name: string; products: Set<string> }>();

  for (const order of orders) {
    if (!order.isFirstOrder || !dateKeySet30.has(order.date)) {
      continue;
    }

    const productKey = getFirstOrderProductKey(order);
    if (!productKey) {
      continue;
    }

    const operatorName = order.operatorName && order.operatorName !== '未绑定运营'
      ? order.operatorName
      : UNASSIGNED_OPERATOR;
    const operatorKey = order.operatorId && order.operatorId !== '未绑定运营'
      ? order.operatorId
      : operatorName;
    const current = grouped.get(operatorKey) ?? { name: operatorName, products: new Set<string>() };
    current.products.add(productKey);
    grouped.set(operatorKey, current);
  }

  return buildRanking(
    Array.from(grouped.values()).map((item) => [item.name, item.products.size] as [string, number]),
    '款',
    false,
  );
}

function buildSalesTrend(orders: SalesOrderRecord[], endDate: Date): SalesTrendItem[] {
  const dailySales = new Map<string, { salesAmount: number; orderIds: Set<string> }>();

  for (const order of orders) {
    const daily = dailySales.get(order.date) ?? { salesAmount: 0, orderIds: new Set<string>() };
    daily.salesAmount += getOrderSalesAmount(order);
    daily.orderIds.add(order.orderId || order.sourceKey || `${order.storeId}-${order.date}-${daily.orderIds.size}`);
    dailySales.set(order.date, daily);
  }

  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (TREND_DAYS - 1 - index));
    const dateKey = toDateKey(date);
    const daily = dailySales.get(dateKey);

    return {
      date: dateKey.slice(5),
      salesAmount: Number((daily?.salesAmount ?? 0).toFixed(2)),
      orderCount: daily?.orderIds.size ?? 0,
    };
  });
}

function getRecentDateKeys(endDate: Date, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (days - 1 - index));
    return toDateKey(date);
  });
}

function getFirstOrderStatus(recent7Avg: number, previous30Avg: number): FirstOrderTrendStatus {
  if (previous30Avg <= 0) {
    return 'normal';
  }

  const ratio = recent7Avg / previous30Avg;

  if (ratio < 0.7) {
    return 'danger';
  }

  if (ratio < 0.95) {
    return 'warning';
  }

  return 'normal';
}

function buildFirstOrderTrend(orders: SalesOrderRecord[], endDate: Date) {
  const dateKeys30 = getRecentDateKeys(endDate, TREND_DAYS);
  const dateKeys7 = dateKeys30.slice(-7);
  const dateKeySet30 = new Set(dateKeys30);
  const storeDateCounts = new Map<string, Map<string, number>>();
  const storeNameByKey = new Map<string, string>();
  const dailyCounts = new Map<string, number>();

  for (const order of orders) {
    if (!order.isFirstOrder || !dateKeySet30.has(order.date)) {
      continue;
    }

    const dateCounts = storeDateCounts.get(order.storeId) ?? new Map<string, number>();
    dateCounts.set(order.date, (dateCounts.get(order.date) ?? 0) + 1);
    storeDateCounts.set(order.storeId, dateCounts);
    storeNameByKey.set(order.storeId, order.storeName);
    dailyCounts.set(order.date, (dailyCounts.get(order.date) ?? 0) + 1);
  }

  const stores: FirstOrderTrendItem[] = Array.from(storeDateCounts.entries())
    .map(([storeKey, counts]) => {
      const previous30Total = dateKeys30.reduce((total, date) => total + (counts.get(date) ?? 0), 0);
      const recent7Total = dateKeys7.reduce((total, date) => total + (counts.get(date) ?? 0), 0);
      const previous30Avg = Number((previous30Total / TREND_DAYS).toFixed(2));
      const recent7Avg = Number((recent7Total / 7).toFixed(2));
      const changeRate =
        previous30Avg > 0 ? Number((((recent7Avg - previous30Avg) / previous30Avg) * 100).toFixed(2)) : 0;

      return {
        storeName: storeNameByKey.get(storeKey) ?? storeKey,
        previous30Avg,
        recent7Avg,
        changeRate,
        status: getFirstOrderStatus(recent7Avg, previous30Avg),
      };
    })
    .sort((first, second) => first.changeRate - second.changeRate)
    .slice(0, RANKING_LIMIT);

  const dailyTrend: FirstOrderDailyTrendItem[] = dateKeys30.map((date) => ({
    date: date.slice(5),
    firstOrderCount: dailyCounts.get(date) ?? 0,
  }));

  return { stores, dailyTrend };
}

function buildFirstOrderWarnings(items: FirstOrderTrendItem[], importedAt: string): WarningItem[] {
  return items
    .filter((item) => item.status === 'danger')
    .map((item) => ({
      id: `first-order-${item.storeName}`,
      type: 'firstOrder',
      storeName: item.storeName,
      content: `近7日首单均值较近30日下降 ${Math.abs(item.changeRate).toFixed(2)}%`,
      time: importedAt.replace('T', ' ').slice(11, 16),
      level: 'critical',
    }));
}

function metric(id: string, value: number, overrides: Partial<MetricItem> = {}): MetricItem {
  const fallback = mockDashboardData.metrics.find((item: MetricItem) => item.id === id);

  return {
    ...fallback!,
    value: Number(value.toFixed(2)),
    growthPercent: undefined,
    trend: 'flat',
    ...overrides,
  };
}

function toFallbackSalesOrder(order: TemuOrderDetail): SalesOrderRecord {
  return {
    platform: 'Other',
    storeId: order.storeName,
    storeName: order.storeName,
    operatorId: order.operatorName ? `operator-${order.operatorName}` : '',
    operatorName: order.operatorName,
    date: order.orderDate,
    month: order.month,
    year: Number(order.orderDate.slice(0, 4)) || 0,
    week: '',
    orderId: order.orderId,
    salesAmount: order.salesAmount,
    quantity: order.quantity,
    isFirstOrder: order.isFirstOrder,
    sourceKey: order.uniqueKey,
  };
}

export function buildDashboardDataFromOrders(
  importResult: TemuOrderImportResult,
  standardOrders: SalesOrderRecord[] = [],
): DashboardData {
  const orders = standardOrders.length > 0 ? standardOrders : importResult.orders.map(toFallbackSalesOrder);
  const reportDate = getLatestOrderDate(orders);
  const reportDateKey = toDateKey(reportDate);
  const reportDateOrders = orders.filter((order) => order.date === reportDateKey);
  const currentMonth = toMonthKey(reportDate);
  const monthOrders = orders.filter((order) => order.month === currentMonth);
  const storeKeys = new Set(orders.map((order) => order.storeId).filter(Boolean));
  const firstOrderTrend = buildFirstOrderTrend(orders, reportDate);
  const firstOrderDangerCount = firstOrderTrend.stores.filter((item) => item.status === 'danger').length;

  return {
    ...mockDashboardData,
    updatedAt: importResult.importedAt.replace('T', ' ').slice(0, 19),
    dataSource: `Excel订单数据：${importResult.fileName}`,
    statisticsPeriod: currentMonth,
    metrics: [
      metric('yesterdaySalesAmount', sumSales(reportDateOrders), {
        title: '最新订单日销售额',
        unit: '¥',
        compareText: `订单日期 ${reportDateKey}`,
      }),
      metric('monthlySalesAmount', sumSales(monthOrders), {
        title: '本月销售额',
        unit: '¥',
        compareText: `${currentMonth} Excel订单明细`,
      }),
      metric('yesterdayOrderCount', sumQuantity(reportDateOrders), {
        title: '最新订单日订单数',
        compareText: `订单日期 ${reportDateKey}`,
      }),
      metric('monthlyOrderCount', sumQuantity(monthOrders), {
        title: '本月订单数',
        compareText: `${currentMonth} Excel有效明细`,
      }),
      metric('storeCount', storeKeys.size, {
        title: '店铺数量',
        compareText: `订单店铺 ${storeKeys.size}`,
      }),
      metric('abnormalStoreCount', firstOrderDangerCount, {
        title: '异常店铺数',
        compareText: '首单趋势风险',
      }),
    ],
    operatorSalesRanking: buildRanking(groupOperatorSales(monthOrders), '¥'),
    storeSalesRanking: buildRanking(groupStoreSales(monthOrders), '¥'),
    newProductRanking: mockDashboardData.newProductRanking.slice(0, RANKING_LIMIT),
    firstOrderRanking: buildFirstOrderProductRanking(orders, reportDate),
    salesTrend30Days: buildSalesTrend(orders, reportDate),
    firstOrderTrendStores: firstOrderTrend.stores,
    firstOrderTrend30Days: firstOrderTrend.dailyTrend,
    storeStatus: {
      total: storeKeys.size,
      normal: Math.max(storeKeys.size - firstOrderDangerCount, 0),
      abnormal: firstOrderDangerCount,
      closed: 0,
    },
    warnings: [...buildFirstOrderWarnings(firstOrderTrend.stores, importResult.importedAt), ...mockDashboardData.warnings],
    growthOpportunities: mockDashboardData.growthOpportunities,
  };
}
