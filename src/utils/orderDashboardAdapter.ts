import { mockDashboardData } from '../data/mockDashboardData';
import { storeOperatorDataSource } from '../data-source/storeOperatorDataSource';
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

const UNASSIGNED_OPERATOR = '未分配运营';

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  return toDateKey(date).slice(0, 7);
}

function getCurrentDate() {
  return new Date();
}

function getLatestOrderDate(orders: TemuOrderDetail[]) {
  const latestTime = orders.reduce((latest, order) => {
    const time = new Date(order.orderDate).getTime();

    return Number.isNaN(time) ? latest : Math.max(latest, time);
  }, 0);

  return latestTime > 0 ? new Date(latestTime) : getCurrentDate();
}

function sumSales(orders: TemuOrderDetail[]) {
  return orders.reduce((total, order) => total + order.salesAmount, 0);
}

function countOrderRows(orders: TemuOrderDetail[]) {
  return orders.length;
}

function buildRanking(
  entries: Array<[string, number]>,
  unit: string,
  withGrowth = false,
): RankingItem[] {
  return entries
    .sort((first, second) => second[1] - first[1])
    .slice(0, 10)
    .map(([name, value], index) => ({
      rank: index + 1,
      name,
      value,
      unit,
      trend: withGrowth ? 'up' : 'flat',
      growthPercent: withGrowth ? 0 : undefined,
    }));
}

function groupSum(orders: TemuOrderDetail[], getKey: (order: TemuOrderDetail) => string) {
  const result = new Map<string, number>();

  for (const order of orders) {
    const key = getKey(order);
    result.set(key, (result.get(key) ?? 0) + order.salesAmount);
  }

  return Array.from(result.entries());
}

function groupCount(orders: TemuOrderDetail[], getKey: (order: TemuOrderDetail) => string) {
  const result = new Map<string, number>();

  for (const order of orders) {
    const key = getKey(order);
    result.set(key, (result.get(key) ?? 0) + 1);
  }

  return Array.from(result.entries());
}

function groupOperatorSales(orders: TemuOrderDetail[]) {
  const relations = storeOperatorDataSource.load();
  const operatorByStore = new Map(relations.map((item) => [item.storeName, item.operatorName]));

  return groupSum(orders, (order) => operatorByStore.get(order.storeName) ?? UNASSIGNED_OPERATOR);
}

function buildSalesTrend(orders: TemuOrderDetail[], endDate: Date): SalesTrendItem[] {
  const dailySales = new Map<string, { salesAmount: number; orderIds: Set<string> }>();

  for (const order of orders) {
    const daily = dailySales.get(order.orderDate) ?? { salesAmount: 0, orderIds: new Set<string>() };
    daily.salesAmount += order.salesAmount;
    daily.orderIds.add(order.orderId);
    dailySales.set(order.orderDate, daily);
  }

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (29 - index));
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

function buildFirstOrderTrend(orders: TemuOrderDetail[], endDate: Date) {
  const dateKeys30 = getRecentDateKeys(endDate, 30);
  const dateKeys7 = dateKeys30.slice(-7);
  const dateKeySet30 = new Set(dateKeys30);
  const storeDateCounts = new Map<string, Map<string, number>>();
  const dailyCounts = new Map<string, number>();

  for (const order of orders) {
    if (!order.isFirstOrder || !dateKeySet30.has(order.orderDate)) {
      continue;
    }

    const storeName = order.storeName || '未知店铺';
    const dateCounts = storeDateCounts.get(storeName) ?? new Map<string, number>();
    dateCounts.set(order.orderDate, (dateCounts.get(order.orderDate) ?? 0) + 1);
    storeDateCounts.set(storeName, dateCounts);
    dailyCounts.set(order.orderDate, (dailyCounts.get(order.orderDate) ?? 0) + 1);
  }

  const stores: FirstOrderTrendItem[] = Array.from(storeDateCounts.entries())
    .map(([storeName, counts]) => {
      const previous30Total = dateKeys30.reduce((total, date) => total + (counts.get(date) ?? 0), 0);
      const recent7Total = dateKeys7.reduce((total, date) => total + (counts.get(date) ?? 0), 0);
      const previous30Avg = Number((previous30Total / 30).toFixed(2));
      const recent7Avg = Number((recent7Total / 7).toFixed(2));
      const changeRate =
        previous30Avg > 0 ? Number((((recent7Avg - previous30Avg) / previous30Avg) * 100).toFixed(2)) : 0;

      return {
        storeName,
        previous30Avg,
        recent7Avg,
        changeRate,
        status: getFirstOrderStatus(recent7Avg, previous30Avg),
      };
    })
    .sort((first, second) => first.changeRate - second.changeRate);

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
      content: `近7日首单均值较前30日下降 ${Math.abs(item.changeRate).toFixed(2)}%`,
      time: importedAt.replace('T', ' ').slice(11, 16),
      level: 'critical',
    }));
}

function metric(id: string, value: number, overrides: Partial<MetricItem> = {}): MetricItem {
  const fallback = mockDashboardData.metrics.find((item) => item.id === id);

  return {
    ...fallback!,
    value: Number(value.toFixed(2)),
    growthPercent: undefined,
    trend: 'flat',
    ...overrides,
  };
}

export function buildDashboardDataFromOrders(importResult: TemuOrderImportResult): DashboardData {
  const orders = importResult.orders;
  const displayOrders = importResult.displayOrders ?? orders;
  const reportDate = getLatestOrderDate(orders);
  const currentMonth = toMonthKey(getCurrentDate());

  const monthOrders = orders.filter((order) => order.month === currentMonth);
  const storeNames = new Set(orders.map((order) => order.storeName).filter(Boolean));
  const firstOrderRows = monthOrders.filter((order) => order.isFirstOrder);
  const firstOrderTrend = buildFirstOrderTrend(orders, reportDate);
  const firstOrderDangerCount = firstOrderTrend.stores.filter((item) => item.status === 'danger').length;

  return {
    ...mockDashboardData,
    updatedAt: importResult.importedAt.replace('T', ' ').slice(0, 19),
    dataSource: `Excel订单数据：${importResult.fileName}`,
    statisticsPeriod: currentMonth,
    metrics: [
      metric('yesterdaySalesAmount', sumSales(displayOrders), { compareText: '最新导入批次' }),
      metric('monthlySalesAmount', sumSales(monthOrders), { compareText: 'Excel订单明细' }),
      metric('yesterdayOrderCount', countOrderRows(displayOrders), { compareText: '最新导入批次' }),
      metric('monthlyOrderCount', countOrderRows(monthOrders), { compareText: 'Excel有效明细' }),
      metric('storeCount', storeNames.size, { compareText: `订单店铺 ${storeNames.size}` }),
      metric('abnormalStoreCount', firstOrderDangerCount, { compareText: '首单趋势危险' }),
    ],
    operatorSalesRanking: buildRanking(groupOperatorSales(monthOrders), '¥'),
    storeSalesRanking: buildRanking(groupSum(displayOrders, (order) => order.storeName || '未知店铺'), '¥'),
    newProductRanking: mockDashboardData.newProductRanking,
    firstOrderRanking: buildRanking(groupCount(firstOrderRows, (order) => order.storeName || '未知店铺'), '个'),
    salesTrend30Days: buildSalesTrend(orders, reportDate),
    firstOrderTrendStores: firstOrderTrend.stores,
    firstOrderTrend30Days: firstOrderTrend.dailyTrend,
    storeStatus: {
      total: storeNames.size,
      normal: Math.max(storeNames.size - firstOrderDangerCount, 0),
      abnormal: firstOrderDangerCount,
      closed: 0,
    },
    warnings: [...buildFirstOrderWarnings(firstOrderTrend.stores, importResult.importedAt), ...mockDashboardData.warnings],
  };
}
