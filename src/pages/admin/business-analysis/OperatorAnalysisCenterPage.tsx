import { useEffect, useMemo, useState } from 'react';
import { salaryFinancialDataSource } from '../../../data-source/salaryFinancialDataSource';
import { referenceDataService } from '../../../services/referenceDataService';
import type { EffectiveNewListingRecord } from '../../../types/effectiveNewListing';
import type { CurrentUser } from '../../../types/auth';
import type { OperatorRecord } from '../../../types/operator';
import type { TemuOrderDetail, TemuOrderImportStore } from '../../../types/order';
import type { OperatorSalaryStatisticRow, OperatorSalaryStoreDetail } from '../../../types/salary';
import type { OperationTaskRecord } from '../../../types/task';
import type { StoreOperatorRelation } from '../../../types/storeOperator';
import type { TrafficAnalysisItem, TrafficAnalysisResultStore } from '../../../types/traffic';
import { filterRecordsByPermission, filterTasksByPermission } from '../../../utils/permissionScope';

type OperatorRow = {
  operatorId: string;
  operatorName: string;
  groupName: string;
  storeNames: Set<string>;
  analysisStores: Set<string>;
  riskStores: Set<string>;
  growthStores: Set<string>;
  maxDrop: number;
  maxGrowth: number;
  openTasks: number;
  doneTasks: number;
};

type EffortStatus = 'normal' | 'attention' | 'empty';

type EffortRow = {
  operatorId: string;
  operatorName: string;
  storeNames: string[];
  effectiveListingCount: number;
  firstOrderCount: number;
  firstOrderRate: number;
  taskCount: number;
  doneTaskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  taskDoneRate: number;
  dataMaintenanceText: string;
  reviewRecordText: string;
  status: EffortStatus;
  statusText: string;
};

type EffectMetricKey =
  | 'salesAmount'
  | 'orderCount'
  | 'visitorCount'
  | 'conversionRate'
  | 'avgOrderValue'
  | 'effectiveNewListingConversionRate'
  | 'firstOrderCount';

type EffectMetricValue = {
  current: number;
  baseline: number;
  changeRate: number | null;
};

type EffectSummary = {
  salesAmount: number;
  orderCount: number;
  visitorCount: number;
  buyerCount: number;
  conversionRate: number;
  avgOrderValue: number;
  effectiveListingCount: number;
  firstOrderCount: number;
  effectiveNewListingConversionRate: number;
};

type EffectComparison = {
  mode: 'trend' | 'period';
  metrics: Record<EffectMetricKey, EffectMetricValue>;
  diagnosis: string;
};

type AveragePriceStoreRow = {
  storeName: string;
  operatorName: string;
  salesAmount: number;
  stockQuantity: number;
  averagePrice: number | null;
};

interface StoreBusinessOrderDailyRecord {
  storeName: string;
  orderDate: string;
  salesAmount: number;
  firstOrderCount: number;
  orderCount: number;
}

interface StoreBusinessOrderDailyResponse {
  records: StoreBusinessOrderDailyRecord[];
}

interface StoreBusinessTrafficRecord {
  storeId?: string;
  storeName: string;
  date: string;
  totalVisitors: number;
  productVisitors: number;
  totalPayBuyers: number;
  totalPayConversionRate: number;
  detailPayConversionRate: number;
}

interface StoreBusinessTrafficResponse {
  records: StoreBusinessTrafficRecord[];
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return response.ok ? await response.json() as T : fallback;
  } catch {
    return fallback;
  }
}

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function previousMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function recentMonths(count = 12) {
  const date = new Date();
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() - index - 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  });
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-');
  return year && monthNumber ? `${year}年${Number(monthNumber)}月` : month || '暂无数据';
}

function toAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return toAmount(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function formatPercent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;
}

function formatOptionalPercent(value: number | null) {
  return value === null ? '暂无数据' : formatPercent(value);
}

function formatOptionalMoney(value: number | null) {
  return value === null ? '暂无数据' : `¥ ${formatMoney(value)}`;
}

function formatOptionalNumber(value: number | null) {
  return value === null ? '暂无数据' : formatNumber(value);
}

function getOperatorKey(operatorId?: string, operatorName?: string) {
  return operatorId || operatorName || 'unassigned';
}

function findRelation(relations: StoreOperatorRelation[], storeName: string, date: string) {
  return relations.find((relation) =>
    relation.status !== 'inactive' &&
    relation.storeName === storeName &&
    (!relation.startDate || relation.startDate <= date) &&
    (!relation.endDate || relation.endDate >= date),
  );
}

function createRow(operatorId: string, operatorName: string, groupName = '-') {
  return {
    operatorId,
    operatorName: operatorName || '未指派运营',
    groupName: groupName || '-',
    storeNames: new Set<string>(),
    analysisStores: new Set<string>(),
    riskStores: new Set<string>(),
    growthStores: new Set<string>(),
    maxDrop: 0,
    maxGrowth: 0,
    openTasks: 0,
    doneTasks: 0,
  } satisfies OperatorRow;
}

function toStoreDetailRows(rows: OperatorSalaryStatisticRow[]) {
  return rows.flatMap((row) => row.storeDetails.map((detail) => ({
    row,
    detail,
  })));
}

function isTaskOpen(task: OperationTaskRecord) {
  return task.status === 'todo' || task.status === 'doing';
}

function isTaskDone(task: OperationTaskRecord) {
  return task.status === 'done';
}

function isTaskOverdue(task: OperationTaskRecord, today: string) {
  return Boolean(task.dueDate && task.dueDate < today && task.status !== 'done' && task.status !== 'closed');
}

function storeMatches(row: OperatorRow, storeId?: string, storeName?: string) {
  const stores = row.storeNames;
  return stores.has(String(storeId ?? '').trim()) || stores.has(String(storeName ?? '').trim());
}

function storeKeyMatches(storeKeys: Set<string>, storeId?: string, storeName?: string) {
  return storeKeys.has(String(storeId ?? '').trim()) || storeKeys.has(String(storeName ?? '').trim());
}

function operatorMatches(row: OperatorRow, operatorId?: string, operatorName?: string) {
  return row.operatorId === String(operatorId ?? '').trim() || row.operatorName === String(operatorName ?? '').trim();
}

function buildEffortStatus(effectiveListingCount: number, taskDoneRate: number, taskCount: number) {
  if (effectiveListingCount === 0 && taskCount === 0) {
    return { status: 'empty' as const, statusText: '暂无数据' };
  }
  if (effectiveListingCount > 0 || taskDoneRate >= 0.7) {
    return { status: 'normal' as const, statusText: '正常' };
  }
  return { status: 'attention' as const, statusText: '需关注' };
}

function toDateValue(dateText?: string) {
  const value = new Date(`${String(dateText ?? '').slice(0, 10)}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : 0;
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function inDateRange(dateText: string, startDate: string, endDate: string) {
  return dateText >= startDate && dateText <= endDate;
}

function changeRate(current: number, baseline: number) {
  return baseline === 0 ? null : ((current - baseline) / Math.abs(baseline)) * 100;
}

function emptyEffectSummary(): EffectSummary {
  return {
    salesAmount: 0,
    orderCount: 0,
    visitorCount: 0,
    buyerCount: 0,
    conversionRate: 0,
    avgOrderValue: 0,
    effectiveListingCount: 0,
    firstOrderCount: 0,
    effectiveNewListingConversionRate: 0,
  };
}

function finalizeEffectSummary(summary: EffectSummary) {
  return {
    ...summary,
    conversionRate: summary.visitorCount > 0 ? (summary.buyerCount / summary.visitorCount) * 100 : 0,
    avgOrderValue: summary.orderCount > 0 ? summary.salesAmount / summary.orderCount : 0,
    effectiveNewListingConversionRate: summary.effectiveListingCount > 0 ? (summary.firstOrderCount / summary.effectiveListingCount) * 100 : 0,
  };
}

function averageEffectSummary(summary: EffectSummary, days: number) {
  if (days <= 0) {
    return summary;
  }

  return finalizeEffectSummary({
    ...summary,
    salesAmount: summary.salesAmount / days,
    orderCount: summary.orderCount / days,
    visitorCount: summary.visitorCount / days,
    buyerCount: summary.buyerCount / days,
    effectiveListingCount: summary.effectiveListingCount / days,
    firstOrderCount: summary.firstOrderCount / days,
  });
}

function buildEffectSummary(params: {
  orderDailyRecords: StoreBusinessOrderDailyRecord[];
  trafficRecords: StoreBusinessTrafficRecord[];
  effectiveNewListings: EffectiveNewListingRecord[];
  storeKeys: Set<string>;
  dateFilter: (date: string) => boolean;
}) {
  const summary = emptyEffectSummary();

  params.orderDailyRecords
    .filter((record) => params.dateFilter(String(record.orderDate || '').slice(0, 10)) && storeKeyMatches(params.storeKeys, undefined, record.storeName))
    .forEach((record) => {
      summary.salesAmount += Number(record.salesAmount) || 0;
      summary.orderCount += Number(record.orderCount) || 0;
      summary.firstOrderCount += Number(record.firstOrderCount) || 0;
    });

  params.trafficRecords
    .filter((record) => params.dateFilter(String(record.date || '').slice(0, 10)) && storeKeyMatches(params.storeKeys, record.storeId, record.storeName))
    .forEach((record) => {
      summary.visitorCount += Number(record.totalVisitors || record.productVisitors) || 0;
      summary.buyerCount += Number(record.totalPayBuyers) || 0;
    });

  summary.effectiveListingCount = params.effectiveNewListings
    .filter((item) => params.dateFilter(String(item.siteJoinDate || item.createdAt || '').slice(0, 10)) && storeKeyMatches(params.storeKeys, item.storeId, item.storeName))
    .length;

  return finalizeEffectSummary(summary);
}

function getOrderDate(order: TemuOrderDetail) {
  return String(order.orderDate || order.orderTime || '').slice(0, 10);
}

function getOrderStockQuantity(order: TemuOrderDetail) {
  const source = order as TemuOrderDetail & Record<string, unknown>;
  const candidates = [
    source['备货数量'],
    source.quantity,
    source.stockQuantity,
    source.prepareQuantity,
    source.backupQuantity,
    source.qty,
  ];
  const value = candidates.map(toAmount).find((item) => item > 0);
  return value ?? 0;
}

function buildAveragePriceRows(params: {
  orderImportStore: TemuOrderImportStore;
  rows: OperatorRow[];
  visibleStoreKeys: Set<string>;
}) {
  const visibleOrders = (params.orderImportStore.batches ?? [])
    .flatMap((batch) => batch.orders ?? [])
    .filter((order) => storeKeyMatches(params.visibleStoreKeys, undefined, order.storeName));
  const latestDate = visibleOrders
    .map(getOrderDate)
    .filter(Boolean)
    .sort((first, second) => toDateValue(second) - toDateValue(first))[0] || '';

  if (!latestDate) {
    return [];
  }

  const startDate = addDays(latestDate, -29);
  const byStore = new Map<string, { storeName: string; salesAmount: number; stockQuantity: number }>();

  visibleOrders
    .filter((order) => inDateRange(getOrderDate(order), startDate, latestDate))
    .forEach((order) => {
      const storeName = String(order.storeName || '').trim();
      if (!storeName) {
        return;
      }
      const current = byStore.get(storeName) ?? { storeName, salesAmount: 0, stockQuantity: 0 };
      current.salesAmount += toAmount(order.salesAmount);
      current.stockQuantity += getOrderStockQuantity(order);
      byStore.set(storeName, current);
    });

  return Array.from(byStore.values())
    .map<AveragePriceStoreRow>((item) => {
      const operatorRow = params.rows.find((row) => storeMatches(row, undefined, item.storeName));
      return {
        storeName: item.storeName,
        operatorName: operatorRow?.operatorName || '暂无数据',
        salesAmount: item.salesAmount,
        stockQuantity: item.stockQuantity,
        averagePrice: item.stockQuantity > 0 ? item.salesAmount / item.stockQuantity : null,
      };
    })
    .sort((first, second) => {
      if (first.averagePrice === null && second.averagePrice === null) {
        return first.storeName.localeCompare(second.storeName);
      }
      if (first.averagePrice === null) {
        return 1;
      }
      if (second.averagePrice === null) {
        return -1;
      }
      return second.averagePrice - first.averagePrice || first.storeName.localeCompare(second.storeName);
    });
}

function buildEffectComparison(current: EffectSummary, baseline: EffectSummary, mode: EffectComparison['mode']): EffectComparison {
  const metrics = {
    salesAmount: { current: current.salesAmount, baseline: baseline.salesAmount, changeRate: changeRate(current.salesAmount, baseline.salesAmount) },
    orderCount: { current: current.orderCount, baseline: baseline.orderCount, changeRate: changeRate(current.orderCount, baseline.orderCount) },
    visitorCount: { current: current.visitorCount, baseline: baseline.visitorCount, changeRate: changeRate(current.visitorCount, baseline.visitorCount) },
    conversionRate: { current: current.conversionRate, baseline: baseline.conversionRate, changeRate: changeRate(current.conversionRate, baseline.conversionRate) },
    avgOrderValue: { current: current.avgOrderValue, baseline: baseline.avgOrderValue, changeRate: changeRate(current.avgOrderValue, baseline.avgOrderValue) },
    effectiveNewListingConversionRate: {
      current: current.effectiveNewListingConversionRate,
      baseline: baseline.effectiveNewListingConversionRate,
      changeRate: changeRate(current.effectiveNewListingConversionRate, baseline.effectiveNewListingConversionRate),
    },
    firstOrderCount: { current: current.firstOrderCount, baseline: baseline.firstOrderCount, changeRate: changeRate(current.firstOrderCount, baseline.firstOrderCount) },
  };
  const declinedReasons = [
    (metrics.visitorCount.changeRate ?? 0) < 0 ? '访客下降' : '',
    (metrics.conversionRate.changeRate ?? 0) < 0 ? '转化率下降' : '',
    (metrics.avgOrderValue.changeRate ?? 0) < 0 ? '客单价下降' : '',
  ].filter(Boolean);
  const salesChange = metrics.salesAmount.changeRate;
  const diagnosis = salesChange === null
    ? '暂无完整趋势数据'
    : salesChange < 0
      ? `销售额下降，主要关注：${declinedReasons.join('、') || '订单结构变化'}`
      : '销售额未下降，继续查看访客、转化率和客单价结构';

  return { mode, metrics, diagnosis };
}

function OperatorAnalysisCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const [items, setItems] = useState<TrafficAnalysisItem[]>([]);
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [relations, setRelations] = useState<StoreOperatorRelation[]>([]);
  const [tasks, setTasks] = useState<OperationTaskRecord[]>([]);
  const [orderImportStore, setOrderImportStore] = useState<TemuOrderImportStore>({ batches: [] });
  const [orderDailyRecords, setOrderDailyRecords] = useState<StoreBusinessOrderDailyRecord[]>([]);
  const [trafficRecords, setTrafficRecords] = useState<StoreBusinessTrafficRecord[]>([]);
  const [effectiveNewListings, setEffectiveNewListings] = useState<EffectiveNewListingRecord[]>([]);
  const [salaryRows, setSalaryRows] = useState<OperatorSalaryStatisticRow[]>([]);
  const [period] = useState(currentMonth());
  const [financePeriod, setFinancePeriod] = useState(previousMonth());
  const [financeMessage, setFinanceMessage] = useState('');
  const financeMonthOptions = useMemo(() => recentMonths(12), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson<TrafficAnalysisResultStore<TrafficAnalysisItem>>('/api/persistent-data/businessAnalysisItems', { items: [], updatedAt: '' }),
      referenceDataService.loadOperators(),
      referenceDataService.loadStoreOperatorRelations(),
      fetchJson<OperationTaskRecord[]>('/api/tasks', []),
      fetchJson<TemuOrderImportStore>('/api/persistent-data/orderImportStore', { batches: [] }),
      fetchJson<StoreBusinessOrderDailyResponse>('/api/persistent-data/orderImportStore?view=store-business-daily&recentDays=62', { records: [] }),
      fetchJson<StoreBusinessTrafficResponse>('/api/persistent-data/trafficConversionStore?view=store-business-traffic&recentDays=62', { records: [] }),
      fetchJson<EffectiveNewListingRecord[]>('/api/effective-new-listings', []),
    ]).then(([analysisStore, nextOperators, nextRelations, nextTasks, nextOrderImportStore, orderStore, trafficStore, nextEffectiveNewListings]) => {
      if (cancelled) {
        return;
      }
      setItems(filterRecordsByPermission(analysisStore.items ?? [], currentUser));
      setOperators(nextOperators.filter((operator) => operator.status !== 'inactive'));
      setRelations(filterRecordsByPermission(nextRelations.filter((relation) => relation.status !== 'inactive'), currentUser));
      setTasks(filterTasksByPermission(nextTasks, currentUser));
      setOrderImportStore(nextOrderImportStore ?? { batches: [] });
      setOrderDailyRecords(orderStore.records ?? []);
      setTrafficRecords(trafficStore.records ?? []);
      setEffectiveNewListings(nextEffectiveNewListings ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    salaryFinancialDataSource.loadOperatorSalaryStatistics({ period: financePeriod })
      .then((data) => {
        if (!cancelled) {
          setSalaryRows(data.records ?? []);
          setFinanceMessage('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSalaryRows([]);
          setFinanceMessage('暂无资金明细数据');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [financePeriod]);

  const rows = useMemo(() => {
    const operatorMap = new Map(operators.map((operator) => [operator.id, operator]));
    const byOperator = new Map<string, OperatorRow>();
    operators.forEach((operator) => {
      byOperator.set(operator.id, createRow(operator.id, operator.operatorName, operator.groupName));
    });

    relations.forEach((relation) => {
      const operator = operatorMap.get(relation.operatorId);
      const key = getOperatorKey(relation.operatorId, relation.operatorName);
      const row = byOperator.get(key) ?? createRow(key, operator?.operatorName || relation.operatorName || '', operator?.groupName);
      if (relation.storeName) {
        row.storeNames.add(relation.storeName);
      }
      byOperator.set(key, row);
    });

    items.forEach((item) => {
      const relation = findRelation(relations, item.storeName, item.date);
      const operator = relation ? operatorMap.get(relation.operatorId) : undefined;
      const key = getOperatorKey(relation?.operatorId, relation?.operatorName);
      const row = byOperator.get(key) ?? createRow(key, operator?.operatorName || relation?.operatorName || '', operator?.groupName);
      row.analysisStores.add(item.storeName);
      row.storeNames.add(item.storeName);
      if (item.resultType === 'risk') {
        row.riskStores.add(item.storeName);
        row.maxDrop = Math.max(row.maxDrop, item.changeRate);
      }
      if (item.resultType === 'opportunity') {
        row.growthStores.add(item.storeName);
        row.maxGrowth = Math.max(row.maxGrowth, item.changeRate);
      }
      byOperator.set(key, row);
    });

    tasks.forEach((task) => {
      const key = getOperatorKey(task.operatorId, task.operatorName);
      const row = byOperator.get(key) ?? createRow(key, task.operatorName || '');
      if (task.storeName) {
        row.storeNames.add(task.storeName);
      }
      if (task.status === 'done') {
        row.doneTasks += 1;
      }
      if (task.status === 'todo' || task.status === 'doing') {
        row.openTasks += 1;
      }
      byOperator.set(key, row);
    });

    return Array.from(byOperator.values())
      .filter((row) => row.storeNames.size > 0 || row.openTasks > 0 || row.doneTasks > 0)
      .sort((first, second) => second.riskStores.size - first.riskStores.size || second.openTasks - first.openTasks || first.operatorName.localeCompare(second.operatorName));
  }, [items, operators, relations, tasks]);

  const financeStoreRows = useMemo(() => toStoreDetailRows(salaryRows), [salaryRows]);
  const financeSummary = useMemo(() => financeStoreRows.reduce((total, item) => ({
    salesAmount: total.salesAmount + toAmount(item.detail.netSalesAmount),
    inflowAmount: total.inflowAmount + toAmount(item.detail.inflowAmount),
    expenseAmount: total.expenseAmount + toAmount(item.detail.expenseAmount),
    platformFee: total.platformFee +
      toAmount(item.detail.promotionServiceFee) +
      toAmount(item.detail.storageServiceFee) +
      toAmount(item.detail.eprFee),
    refundAmount: total.refundAmount + toAmount(item.detail.afterSalesProtectionFee),
    otherExpense: total.otherExpense + toAmount(item.detail.otherExpense),
    netInflowAmount: total.netInflowAmount + toAmount(item.detail.inflowAmount) - toAmount(item.detail.expenseAmount),
    deductibleAmount: total.deductibleAmount + toAmount(item.detail.netSalesAmount),
    operationExpenseAmount: total.operationExpenseAmount + toAmount(item.detail.operationExpenseAmount),
    netSalesAmount: total.netSalesAmount + toAmount(item.detail.netSalesAmount),
    commissionAmount: total.commissionAmount + toAmount(item.detail.commissionAmount),
  }), {
    salesAmount: 0,
    inflowAmount: 0,
    expenseAmount: 0,
    platformFee: 0,
    refundAmount: 0,
    otherExpense: 0,
    netInflowAmount: 0,
    deductibleAmount: 0,
    operationExpenseAmount: 0,
    netSalesAmount: 0,
    commissionAmount: 0,
  }), [financeStoreRows]);

  const orderSummary = useMemo(() => orderDailyRecords
    .filter((record) => String(record.orderDate || '').startsWith(period))
    .reduce((total, record) => ({
      salesAmount: total.salesAmount + (Number(record.salesAmount) || 0),
      orderCount: total.orderCount + (Number(record.orderCount) || 0),
      firstOrderCount: total.firstOrderCount + (Number(record.firstOrderCount) || 0),
    }), {
      salesAmount: 0,
      orderCount: 0,
      firstOrderCount: 0,
    }), [orderDailyRecords, period]);

  const trafficSummary = useMemo(() => trafficRecords
    .filter((record) => String(record.date || '').startsWith(period))
    .reduce((total, record) => ({
      visitorCount: total.visitorCount + (Number(record.totalVisitors || record.productVisitors) || 0),
      buyerCount: total.buyerCount + (Number(record.totalPayBuyers) || 0),
    }), {
      visitorCount: 0,
      buyerCount: 0,
    }), [trafficRecords, period]);

  const effectiveListingCount = useMemo(() => effectiveNewListings
    .filter((item) => String(item.siteJoinDate || item.createdAt || '').startsWith(period))
    .length, [effectiveNewListings, period]);
  const conversionRate = trafficSummary.visitorCount > 0 ? (trafficSummary.buyerCount / trafficSummary.visitorCount) * 100 : 0;
  const taskDoneRate = tasks.length > 0 ? tasks.filter((task) => task.status === 'done').length / tasks.length : 0;
  const riskItems = items.filter((item) => item.resultType === 'risk');
  const growthItems = items.filter((item) => item.resultType === 'opportunity');
  const today = new Date().toISOString().slice(0, 10);
  const openTasks = tasks.filter(isTaskOpen);
  const doneTasks = tasks.filter(isTaskDone);
  const overdueTasks = tasks.filter((task) => isTaskOverdue(task, today));
  const effortRows = useMemo<EffortRow[]>(() => rows.map((row) => {
    const rowEffectiveListings = effectiveNewListings.filter((item) => (
      operatorMatches(row, item.operatorId, item.operatorName) ||
      storeMatches(row, item.storeId, item.storeName)
    ));
    const rowOrderRecords = orderDailyRecords.filter((record) => (
      String(record.orderDate || '').startsWith(period) && storeMatches(row, undefined, record.storeName)
    ));
    const rowTasks = tasks.filter((task) => (
      operatorMatches(row, task.operatorId, task.operatorName) ||
      storeMatches(row, task.storeId, task.storeName)
    ));
    const rowDoneTasks = rowTasks.filter(isTaskDone);
    const rowOpenTasks = rowTasks.filter(isTaskOpen);
    const rowOverdueTasks = rowTasks.filter((task) => isTaskOverdue(task, today));
    const effectiveListingCount = rowEffectiveListings.filter((item) => String(item.siteJoinDate || item.createdAt || '').startsWith(period)).length;
    const firstOrderCount = rowOrderRecords.reduce((total, record) => total + (Number(record.firstOrderCount) || 0), 0);
    const taskCount = rowTasks.length;
    const rowTaskDoneRate = taskCount > 0 ? rowDoneTasks.length / taskCount : 0;
    const status = buildEffortStatus(effectiveListingCount, rowTaskDoneRate, taskCount);

    return {
      operatorId: row.operatorId,
      operatorName: row.operatorName,
      storeNames: Array.from(row.storeNames),
      effectiveListingCount,
      firstOrderCount,
      firstOrderRate: effectiveListingCount > 0 ? firstOrderCount / effectiveListingCount : 0,
      taskCount,
      doneTaskCount: rowDoneTasks.length,
      openTaskCount: rowOpenTasks.length,
      overdueTaskCount: rowOverdueTasks.length,
      taskDoneRate: rowTaskDoneRate,
      dataMaintenanceText: '暂无数据',
      reviewRecordText: '暂无数据',
      ...status,
    };
  }).sort((first, second) => {
    const statusRank: Record<EffortStatus, number> = { attention: 0, empty: 1, normal: 2 };
    return statusRank[first.status] - statusRank[second.status] ||
      second.effectiveListingCount - first.effectiveListingCount ||
      second.doneTaskCount - first.doneTaskCount ||
      first.operatorName.localeCompare(second.operatorName);
  }), [effectiveNewListings, orderDailyRecords, period, rows, tasks, today]);
  const effortSummary = useMemo(() => effortRows.reduce((total, row) => ({
    effectiveListingCount: total.effectiveListingCount + row.effectiveListingCount,
    firstOrderCount: total.firstOrderCount + row.firstOrderCount,
    taskCount: total.taskCount + row.taskCount,
    doneTaskCount: total.doneTaskCount + row.doneTaskCount,
    openTaskCount: total.openTaskCount + row.openTaskCount,
    overdueTaskCount: total.overdueTaskCount + row.overdueTaskCount,
  }), {
    effectiveListingCount: 0,
    firstOrderCount: 0,
    taskCount: 0,
    doneTaskCount: 0,
    openTaskCount: 0,
    overdueTaskCount: 0,
  }), [effortRows]);
  const effortTaskDoneRate = effortSummary.taskCount > 0 ? effortSummary.doneTaskCount / effortSummary.taskCount : 0;
  const effortFirstOrderRate = effortSummary.effectiveListingCount > 0 ? effortSummary.firstOrderCount / effortSummary.effectiveListingCount : 0;
  const visibleStoreKeys = useMemo(() => new Set(rows.flatMap((row) => Array.from(row.storeNames))), [rows]);
  const averagePriceRows = useMemo(() => buildAveragePriceRows({
    orderImportStore,
    rows,
    visibleStoreKeys,
  }), [orderImportStore, rows, visibleStoreKeys]);
  const averagePriceSummary = useMemo(() => {
    const salesAmount = averagePriceRows.reduce((total, row) => total + row.salesAmount, 0);
    const stockQuantity = averagePriceRows.reduce((total, row) => total + row.stockQuantity, 0);
    return {
      salesAmount,
      stockQuantity,
      averagePrice: stockQuantity > 0 ? salesAmount / stockQuantity : null,
    };
  }, [averagePriceRows]);
  const hasAveragePriceStockData = averagePriceSummary.stockQuantity > 0;
  const latestEffectDate = useMemo(() => {
    const dates = [
      ...orderDailyRecords
        .filter((record) => storeKeyMatches(visibleStoreKeys, undefined, record.storeName))
        .map((record) => String(record.orderDate || '').slice(0, 10)),
      ...trafficRecords
        .filter((record) => storeKeyMatches(visibleStoreKeys, record.storeId, record.storeName))
        .map((record) => String(record.date || '').slice(0, 10)),
    ].filter(Boolean);
    return dates.sort((first, second) => toDateValue(second) - toDateValue(first))[0] || '';
  }, [orderDailyRecords, trafficRecords, visibleStoreKeys]);
  const buildEffectForStoreKeys = useMemo(() => (storeKeys: Set<string>) => {
    const periodSummary = buildEffectSummary({
      orderDailyRecords,
      trafficRecords,
      effectiveNewListings,
      storeKeys,
      dateFilter: (date) => String(date || '').startsWith(period),
    });

    if (!latestEffectDate) {
      return buildEffectComparison(periodSummary, emptyEffectSummary(), 'period');
    }

    const recentStart = addDays(latestEffectDate, -6);
    const baselineStart = addDays(latestEffectDate, -36);
    const baselineEnd = addDays(latestEffectDate, -7);
    const recentSummary = buildEffectSummary({
      orderDailyRecords,
      trafficRecords,
      effectiveNewListings,
      storeKeys,
      dateFilter: (date) => inDateRange(date, recentStart, latestEffectDate),
    });
    const baselineSummary = buildEffectSummary({
      orderDailyRecords,
      trafficRecords,
      effectiveNewListings,
      storeKeys,
      dateFilter: (date) => inDateRange(date, baselineStart, baselineEnd),
    });
    const hasTrendData = baselineSummary.salesAmount > 0 ||
      baselineSummary.orderCount > 0 ||
      baselineSummary.visitorCount > 0 ||
      baselineSummary.firstOrderCount > 0;

    return hasTrendData
      ? buildEffectComparison(averageEffectSummary(recentSummary, 7), averageEffectSummary(baselineSummary, 30), 'trend')
      : buildEffectComparison(periodSummary, emptyEffectSummary(), 'period');
  }, [effectiveNewListings, latestEffectDate, orderDailyRecords, period, trafficRecords]);
  const effectComparison = useMemo(() => buildEffectForStoreKeys(visibleStoreKeys), [buildEffectForStoreKeys, visibleStoreKeys]);
  const effectRows = useMemo(() => rows.map((row) => {
    const comparison = buildEffectForStoreKeys(new Set(Array.from(row.storeNames)));
    return { row, comparison };
  }), [buildEffectForStoreKeys, rows]);
  const hasEffectData = effectComparison.metrics.salesAmount.current > 0 ||
    effectComparison.metrics.orderCount.current > 0 ||
    effectComparison.metrics.visitorCount.current > 0 ||
    effectComparison.metrics.firstOrderCount.current > 0;
  const rankingRows = rows
    .slice()
    .sort((first, second) => second.doneTasks - first.doneTasks || second.growthStores.size - first.growthStores.size || first.openTasks - second.openTasks)
    .slice(0, 8);

  const visibleStoreCount = visibleStoreKeys.size;

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>可见运营</span><strong>{rows.length}</strong></article>
        <article><span>可见店铺</span><strong>{visibleStoreCount}</strong></article>
        <article><span>待处理任务</span><strong>{openTasks.length}</strong></article>
        <article><span>资金月份</span><strong>{financePeriod}</strong></article>
      </section>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>运营个人总览</h2>
            <p>当前周期：{formatMonthLabel(period)}；资金数据月份：{formatMonthLabel(financePeriod)}。资金指标来自运营工资统计店铺明细。</p>
          </div>
        </header>
        <section className="import-overview-grid">
          <article><span>运营人数</span><strong>{rows.length}</strong></article>
          <article><span>负责店铺数</span><strong>{visibleStoreCount}</strong></article>
          <article><span>当前周期销售额</span><strong>¥ {formatMoney(orderSummary.salesAmount)}</strong></article>
          <article><span>当前周期订单数</span><strong>{orderSummary.orderCount}</strong></article>
          <article><span>当前周期访客数</span><strong>{trafficSummary.visitorCount}</strong></article>
          <article><span>当前周期转化率</span><strong>{formatPercent(conversionRate)}</strong></article>
          <article title="销售额 ÷ 备货数量，按最近30天统计。"><span>近30天平均售价</span><strong>{averagePriceSummary.averagePrice === null ? '暂无数据' : `¥ ${formatMoney(averagePriceSummary.averagePrice)}`}</strong></article>
          <article><span>{formatMonthLabel(financePeriod)}流入资金</span><strong>¥ {formatMoney(financeSummary.inflowAmount)}</strong></article>
          <article><span>{formatMonthLabel(financePeriod)}流出资金</span><strong>¥ {formatMoney(financeSummary.expenseAmount)}</strong></article>
          <article><span>{formatMonthLabel(financePeriod)}净流入</span><strong>¥ {formatMoney(financeSummary.netInflowAmount)}</strong></article>
          <article><span>有效上新数量</span><strong>{effectiveListingCount}</strong></article>
          <article><span>首单商品数</span><strong>{orderSummary.firstOrderCount}</strong></article>
          <article><span>待处理异常数</span><strong>{riskItems.length}</strong></article>
          <article><span>待处理任务数</span><strong>{openTasks.length}</strong></article>
          <article><span>任务完成率</span><strong>{formatPercent(taskDoneRate * 100)}</strong></article>
        </section>
      </article>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>近30天店铺平均售价排名</h2>
            <p>平均售价 = 销售额 ÷ 备货数量，用于观察店铺商品单件售价水平。该指标不同于客单价，客单价 = 销售额 ÷ 订单数。</p>
          </div>
        </header>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>店铺</th>
                <th>运营</th>
                <th>近30天销售额</th>
                <th>近30天备货数量</th>
                <th>近30天平均售价</th>
              </tr>
            </thead>
            <tbody>
              {hasAveragePriceStockData && averagePriceRows.slice(0, 10).map((row, index) => (
                <tr key={row.storeName}>
                  <td>{index + 1}</td>
                  <td title={row.storeName}><span className="operator-store-names">{row.storeName}</span></td>
                  <td>{row.operatorName}</td>
                  <td>¥ {formatMoney(row.salesAmount)}</td>
                  <td>{formatNumber(row.stockQuantity)}</td>
                  <td>{row.averagePrice === null ? '暂无数据' : `¥ ${formatMoney(row.averagePrice)}`}</td>
                </tr>
              ))}
              {!hasAveragePriceStockData && <tr><td colSpan={6}>暂无近30天备货数量数据</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>努力度分析</h2>
            <p>用于提示运营是否有实际动作，主要看上新、首单、任务处理、异常响应、数据维护和复盘动作，不作为工资计算依据。</p>
          </div>
        </header>
        <section className="import-overview-grid">
          <article><span>有效上新数量</span><strong>{effortSummary.effectiveListingCount}</strong></article>
          <article><span>首单商品数</span><strong>{effortSummary.firstOrderCount}</strong></article>
          <article><span>上新首单率</span><strong>{formatPercent(effortFirstOrderRate * 100)}</strong></article>
          <article><span>任务处理数量</span><strong>{effortSummary.taskCount}</strong></article>
          <article><span>已完成任务数</span><strong>{effortSummary.doneTaskCount}</strong></article>
          <article><span>待处理任务数</span><strong>{effortSummary.openTaskCount}</strong></article>
          <article><span>超时任务数</span><strong>{effortSummary.overdueTaskCount}</strong></article>
          <article><span>任务完成率</span><strong>{formatPercent(effortTaskDoneRate * 100)}</strong></article>
          <article><span>数据维护情况</span><strong>暂无数据</strong></article>
          <article><span>复盘记录数量</span><strong>暂无数据</strong></article>
        </section>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>运营</th>
                <th>负责店铺</th>
                <th>有效上新</th>
                <th>首单商品数</th>
                <th>上新首单率</th>
                <th>已完成任务</th>
                <th>待处理任务</th>
                <th>超时任务</th>
                <th>任务完成率</th>
                <th>努力度状态</th>
              </tr>
            </thead>
            <tbody>
              {effortRows.map((row) => (
                <tr key={row.operatorId}>
                  <td><strong>{row.operatorName}</strong></td>
                  <td><span className="operator-store-names">{row.storeNames.join('、') || '暂无数据'}</span></td>
                  <td>{row.effectiveListingCount}</td>
                  <td>{row.firstOrderCount}</td>
                  <td>{formatPercent(row.firstOrderRate * 100)}</td>
                  <td>{row.doneTaskCount}</td>
                  <td>{row.openTaskCount}</td>
                  <td>{row.overdueTaskCount}</td>
                  <td>{formatPercent(row.taskDoneRate * 100)}</td>
                  <td>{row.statusText}</td>
                </tr>
              ))}
              {effortRows.length === 0 && <tr><td colSpan={10}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>效果分析</h2>
            <p>用于判断运营动作是否带来结果。销售额 = 访客数 × 转化率 × 客单价。</p>
          </div>
          <span>{effectComparison.mode === 'trend' ? '近7日 vs 前30日' : '当前周期汇总'}</span>
        </header>
        <section className="import-overview-grid">
          <article><span>{effectComparison.mode === 'trend' ? '近7日销售额均值' : '销售额'}</span><strong>{hasEffectData ? formatOptionalMoney(effectComparison.metrics.salesAmount.current) : '暂无数据'}</strong></article>
          <article><span>{effectComparison.mode === 'trend' ? '近7日订单均值' : '订单数'}</span><strong>{hasEffectData ? formatOptionalNumber(effectComparison.metrics.orderCount.current) : '暂无数据'}</strong></article>
          <article><span>{effectComparison.mode === 'trend' ? '近7日访客均值' : '访客数'}</span><strong>{hasEffectData ? formatOptionalNumber(effectComparison.metrics.visitorCount.current) : '暂无数据'}</strong></article>
          <article><span>转化率</span><strong>{hasEffectData ? formatPercent(effectComparison.metrics.conversionRate.current) : '暂无数据'}</strong></article>
          <article><span>客单价</span><strong>{hasEffectData ? formatOptionalMoney(effectComparison.metrics.avgOrderValue.current) : '暂无数据'}</strong></article>
          <article><span>销售额变化</span><strong>{formatOptionalPercent(effectComparison.metrics.salesAmount.changeRate)}</strong></article>
          <article><span>访客变化</span><strong>{formatOptionalPercent(effectComparison.metrics.visitorCount.changeRate)}</strong></article>
          <article><span>转化率变化</span><strong>{formatOptionalPercent(effectComparison.metrics.conversionRate.changeRate)}</strong></article>
          <article><span>客单价变化</span><strong>{formatOptionalPercent(effectComparison.metrics.avgOrderValue.changeRate)}</strong></article>
          <article><span>有效上新转化率</span><strong>{hasEffectData ? formatPercent(effectComparison.metrics.effectiveNewListingConversionRate.current) : '暂无数据'}</strong></article>
          <article><span>首单商品数变化</span><strong>{formatOptionalPercent(effectComparison.metrics.firstOrderCount.changeRate)}</strong></article>
          <article><span>结果判断</span><strong>{hasEffectData ? effectComparison.diagnosis : '暂无数据'}</strong></article>
        </section>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>运营</th>
                <th>销售额</th>
                <th>订单数</th>
                <th>访客数</th>
                <th>转化率</th>
                <th>客单价</th>
                <th>销售额变化</th>
                <th>订单数变化</th>
                <th>访客变化</th>
                <th>转化率变化</th>
                <th>客单价变化</th>
                <th>有效上新转化率</th>
                <th>首单变化</th>
                <th>判断</th>
              </tr>
            </thead>
            <tbody>
              {effectRows.map(({ row, comparison }) => {
                const rowHasData = comparison.metrics.salesAmount.current > 0 ||
                  comparison.metrics.orderCount.current > 0 ||
                  comparison.metrics.visitorCount.current > 0 ||
                  comparison.metrics.firstOrderCount.current > 0;
                return (
                  <tr key={row.operatorId}>
                    <td><strong>{row.operatorName}</strong></td>
                    <td>{rowHasData ? formatOptionalMoney(comparison.metrics.salesAmount.current) : '暂无数据'}</td>
                    <td>{rowHasData ? formatOptionalNumber(comparison.metrics.orderCount.current) : '暂无数据'}</td>
                    <td>{rowHasData ? formatOptionalNumber(comparison.metrics.visitorCount.current) : '暂无数据'}</td>
                    <td>{rowHasData ? formatPercent(comparison.metrics.conversionRate.current) : '暂无数据'}</td>
                    <td>{rowHasData ? formatOptionalMoney(comparison.metrics.avgOrderValue.current) : '暂无数据'}</td>
                    <td>{formatOptionalPercent(comparison.metrics.salesAmount.changeRate)}</td>
                    <td>{formatOptionalPercent(comparison.metrics.orderCount.changeRate)}</td>
                    <td>{formatOptionalPercent(comparison.metrics.visitorCount.changeRate)}</td>
                    <td>{formatOptionalPercent(comparison.metrics.conversionRate.changeRate)}</td>
                    <td>{formatOptionalPercent(comparison.metrics.avgOrderValue.changeRate)}</td>
                    <td>{rowHasData ? formatPercent(comparison.metrics.effectiveNewListingConversionRate.current) : '暂无数据'}</td>
                    <td>{formatOptionalPercent(comparison.metrics.firstOrderCount.changeRate)}</td>
                    <td>{rowHasData ? comparison.diagnosis : '暂无数据'}</td>
                  </tr>
                );
              })}
              {effectRows.length === 0 && <tr><td colSpan={14}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>{formatMonthLabel(financePeriod)}店铺资金明细</h2>
            <p>本模块数据来源于运营工资统计中的店铺明细数据，默认展示上月数据，用于帮助运营了解负责店铺的资金表现。具体工资计算仍以薪资绩效模块为准。</p>
          </div>
          <span>{financeStoreRows.length} 个店铺</span>
        </header>
        <section className="operator-form-grid salary-stat-filter-grid">
          <label>
            月份选择
            <select value={financePeriod} onChange={(event) => setFinancePeriod(event.target.value)}>
              {financeMonthOptions.map((month) => (
                <option key={month} value={month}>{formatMonthLabel(month)}</option>
              ))}
            </select>
          </label>
        </section>
        <section className="import-overview-grid">
          <article><span>月份</span><strong>{formatMonthLabel(financePeriod)}</strong></article>
          <article><span>店铺销售额合计</span><strong>¥ {formatMoney(financeSummary.salesAmount)}</strong></article>
          <article><span>流入资金合计</span><strong>¥ {formatMoney(financeSummary.inflowAmount)}</strong></article>
          <article><span>流出资金合计</span><strong>¥ {formatMoney(financeSummary.expenseAmount)}</strong></article>
          <article><span>平台扣费合计</span><strong>¥ {formatMoney(financeSummary.platformFee)}</strong></article>
          <article><span>退款金额合计</span><strong>¥ {formatMoney(financeSummary.refundAmount)}</strong></article>
          <article><span>其他扣费合计</span><strong>¥ {formatMoney(financeSummary.otherExpense)}</strong></article>
          <article><span>净流入合计</span><strong>¥ {formatMoney(financeSummary.netInflowAmount)}</strong></article>
          <article><span>可计提金额合计</span><strong>¥ {formatMoney(financeSummary.deductibleAmount)}</strong></article>
          <article><span>备注</span><strong>暂无数据</strong></article>
        </section>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>月份</th>
                <th>运营</th>
                <th>店铺</th>
                <th>销售额</th>
                <th>流入资金</th>
                <th>流出资金</th>
                <th>平台扣费</th>
                <th>退款金额</th>
                <th>其他扣费</th>
                <th>净流入</th>
                <th>可计提金额</th>
              </tr>
            </thead>
            <tbody>
              {financeStoreRows.map(({ row, detail }: { row: OperatorSalaryStatisticRow; detail: OperatorSalaryStoreDetail }) => {
                const platformFee = toAmount(detail.promotionServiceFee) + toAmount(detail.storageServiceFee) + toAmount(detail.eprFee);
                const netInflowAmount = toAmount(detail.inflowAmount) - toAmount(detail.expenseAmount);
                return (
                  <tr key={`${row.id}-${detail.storeId}`}>
                    <td>{formatMonthLabel(detail.period || row.period || financePeriod)}</td>
                    <td>{row.operatorName || '暂无数据'}</td>
                    <td title={detail.storeName || detail.storeId || '暂无数据'}>{detail.storeName || detail.storeId || '暂无数据'}</td>
                    <td>¥ {formatMoney(detail.netSalesAmount)}</td>
                    <td>¥ {formatMoney(detail.inflowAmount)}</td>
                    <td>¥ {formatMoney(detail.expenseAmount)}</td>
                    <td>¥ {formatMoney(platformFee)}</td>
                    <td>¥ {formatMoney(detail.afterSalesProtectionFee)}</td>
                    <td>¥ {formatMoney(detail.otherExpense)}</td>
                    <td>¥ {formatMoney(netInflowAmount)}</td>
                    <td>¥ {formatMoney(detail.netSalesAmount)}</td>
                  </tr>
                );
              })}
              {financeStoreRows.length > 0 && (
                <tr>
                  <td colSpan={3}><strong>合计</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.salesAmount)}</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.inflowAmount)}</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.expenseAmount)}</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.platformFee)}</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.refundAmount)}</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.otherExpense)}</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.netInflowAmount)}</strong></td>
                  <td><strong>¥ {formatMoney(financeSummary.deductibleAmount)}</strong></td>
                </tr>
              )}
              {financeStoreRows.length === 0 && <tr><td colSpan={11}>{financeMessage || '当前月份暂无店铺资金明细数据'}</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>问题诊断中心</h2>
            <p>展示当前可见范围内的待处理事项和经营分析问题。</p>
          </div>
        </header>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>来源</th>
                <th>店铺</th>
                <th>内容</th>
                <th>负责人</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...riskItems.slice(0, 5).map((item) => ({
                  id: item.id,
                  source: '经营分析',
                  storeName: item.storeName,
                  content: item.content || '暂无数据',
                  operatorName: '-',
                })),
                ...openTasks.slice(0, 5).map((task) => ({
                  id: task.id,
                  source: '运营任务',
                  storeName: task.storeName || '暂无数据',
                  content: task.title || task.suggestion || '暂无数据',
                  operatorName: task.operatorName || '-',
                })),
              ].slice(0, 8).map((item) => (
                <tr key={`${item.source}-${item.id}`}>
                  <td>{item.source}</td>
                  <td>{item.storeName}</td>
                  <td>{item.content}</td>
                  <td>{item.operatorName}</td>
                </tr>
              ))}
              {riskItems.length === 0 && openTasks.length === 0 && <tr><td colSpan={4}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>运营排名与对比</h2>
            <p>先按完成任务、增长店铺和待处理任务做轻量排序。</p>
          </div>
        </header>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>排名</th>
                <th>运营</th>
                <th>负责店铺</th>
                <th>分析店铺</th>
                <th>增长店铺</th>
                <th>已完成任务</th>
                <th>待处理任务</th>
              </tr>
            </thead>
            <tbody>
              {rankingRows.map((row, index) => (
                <tr key={row.operatorId}>
                  <td>{index + 1}</td>
                  <td><strong>{row.operatorName}</strong></td>
                  <td>{row.storeNames.size}</td>
                  <td>{row.analysisStores.size}</td>
                  <td>{row.growthStores.size}</td>
                  <td>{row.doneTasks}</td>
                  <td>{row.openTasks}</td>
                </tr>
              ))}
              {rankingRows.length === 0 && <tr><td colSpan={7}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default OperatorAnalysisCenterPage;
