import { useEffect, useMemo, useState } from 'react';
import {
  metricFieldLabels,
  subscribeTrafficConversionChange,
  trafficConversionDataSource,
  trafficGrowthTypeLabels,
  trafficTypeLabels,
} from '../../../data-source/trafficConversionDataSource';
import { defaultTaskSuggestionTemplates, resolveSuggestionContent } from '../../../data-source/taskSuggestionDataSource';
import { referenceDataService } from '../../../services/referenceDataService';
import {
  TEMU_ORDER_IMPORT_STORAGE_EVENT,
  TEMU_ORDER_IMPORT_STORAGE_KEY,
} from '../../../data-source/orderImportStorageDataSource';
import { taskDataSource } from '../../../data-source/taskDataSource';
import type { AnalysisResultRecord, FactDataQualityReport, SalesOrderRecord } from '../../../types/fact';
import type { OperatorRecord } from '../../../types/operator';
import type { TemuOrderDetail } from '../../../types/order';
import type { OperationTaskRecord } from '../../../types/task';
import type { TaskSuggestionProblemType, TaskSuggestionTemplate } from '../../../types/taskSuggestion';
import type { StoreRecord } from '../../../types/store';
import type { StoreOperatorRelation } from '../../../types/storeOperator';
import type {
  TrafficAnalysisItem,
  TrafficAnalysisResultLevel,
  TrafficAnalysisResultStore,
  TrafficConversionRecord,
  TrafficDailySummaryStore,
  TrafficGrowthOpportunity,
  TrafficMetricField,
  TrafficWarningLevel,
  TrafficWarningResult,
  TrafficWarningType,
} from '../../../types/traffic';
import { buildFactDataQualityReport } from '../../../utils/factDataQuality';
import {
  buildExistingTaskUpdate,
  buildGrowthOpportunityTaskDraft,
  buildRiskWarningTaskDedupKey,
  buildRiskWarningTaskDraft,
  buildTaskCreateUrl,
  findOpenTaskByBusinessKey,
  findOpenTaskByDedupKey,
} from '../../../utils/operationTaskSourceAdapter';
import {
  trafficWarningLevelLabelMap,
} from '../../../utils/operationLanguage';
import { filterRecordsByPermission, filterTasksByPermission } from '../../../utils/permissionScope';
import { buildOrderDetailsFromDailySummary, type OrderDailySummaryRecord } from '../../../utils/orderDailySummaryAdapter';
import { analyzeStoreNameMatches, createStoreMatcher, type StoreMatchCheckReport } from '../../../utils/storeStandardization';
import { buildTrafficRecordsFromDailySummary } from '../../../utils/trafficDailySummaryAdapter';
import { hasPermission } from '../../../auth/permissions';
import type { CurrentUser } from '../../../types/auth';
import { runOperationDiagnosis, type AnomalyResult } from '../../../rules/operationAnomaly';

type OrderDailySummaryResponse = {
  records?: OrderDailySummaryRecord[];
};

type AutoRiskTaskRecord = OperationTaskRecord & {
  autoCreated?: boolean;
  riskLevel?: TrafficWarningLevel;
  anomalyType?: string;
  sourceRuleId?: string;
  recommendation?: string;
};

const DETAIL_RENDER_LIMIT = 100;

const emptyDataQualityReport: FactDataQualityReport = {
  totalRecords: 0,
  missingStoreIdCount: 0,
  missingOperatorIdCount: 0,
  missingPlatformCount: 0,
  missingDateCount: 0,
  issueSamples: [],
};

const emptyStoreMatchReport: StoreMatchCheckReport = {
  matchedCount: 0,
  unmatchedStoreNames: [],
};

function emptyAnalysisData() {
  return {
    riskResults: [] as TrafficWarningResult[],
    growthResults: [] as TrafficGrowthOpportunity[],
    analysisItems: [] as TrafficAnalysisItem[],
    storeMatchReport: emptyStoreMatchReport,
    factDataQualityReport: emptyDataQualityReport,
    suggestionTemplates: [] as TaskSuggestionTemplate[],
  };
}

type WarningAnalysisData = ReturnType<typeof emptyAnalysisData>;
const warningAnalysisDataCache = new Map<string, Promise<WarningAnalysisData>>();

function getWarningAnalysisCacheKey(currentUser: CurrentUser) {
  return [
    currentUser.role,
    currentUser.operatorId ?? '',
    currentUser.username ?? '',
    currentUser.displayName ?? '',
    [...(currentUser.allowedStoreIds ?? [])].sort().join('|'),
  ].join('::');
}

function clearWarningAnalysisDataCache() {
  warningAnalysisDataCache.clear();
}

const levelLabels: Record<TrafficWarningLevel | 'normal' | 'opportunity', string> = {
  warning: trafficWarningLevelLabelMap.warning,
  critical: trafficWarningLevelLabelMap.critical,
  insufficient: trafficWarningLevelLabelMap.insufficient,
  normal: trafficWarningLevelLabelMap.normal,
  opportunity: trafficWarningLevelLabelMap.opportunity,
};

const resultLevelLabels: Record<TrafficAnalysisResultLevel, string> = {
  critical: '严重风险',
  medium_risk: '中度风险',
  slight_fluctuation: '轻微波动',
  normal: '正常',
  opportunity: '增长机会',
  insufficient: '数据不足',
};

function riskSort(first: TrafficWarningResult, second: TrafficWarningResult) {
  const levelRank = { critical: 0, warning: 1, insufficient: 2 };
  const typeRank: Record<TrafficWarningType, number> = { deal: 0, conversion: 1, traffic: 2 };
  return levelRank[first.level] - levelRank[second.level] || second.dropRate - first.dropRate || typeRank[first.type] - typeRank[second.type];
}

function isFormalSalesOrOrderAnomaly(anomaly: AnomalyResult) {
  return (anomaly.ruleId === 'sales-amount-decline-v1' || anomaly.ruleId === 'order-count-decline-v1') &&
    anomaly.sourceMetrics.resultLevel === 'anomaly';
}

function getSourceMetricNumber(anomaly: AnomalyResult, key: string) {
  const value = anomaly.sourceMetrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function operationAnomalyToRiskWarning(anomaly: AnomalyResult): TrafficWarningResult {
  const isSalesAmount = anomaly.ruleId === 'sales-amount-decline-v1';
  const dropRate = Number((getSourceMetricNumber(anomaly, 'declineRate') * 100).toFixed(2));
  const metricField = isSalesAmount ? 'salesAmount' : 'orderCount';
  const metricName = isSalesAmount ? '销售额' : '订单数';

  return {
    id: `operation-${anomaly.id}`,
    date: anomaly.date,
    storeName: anomaly.storeName || '未绑定店铺',
    type: 'deal',
    ruleName: anomaly.ruleName,
    metricField,
    previous30Avg: Number(getSourceMetricNumber(anomaly, 'baseline30Avg').toFixed(4)),
    recent7Avg: Number(getSourceMetricNumber(anomaly, 'recent7Avg').toFixed(4)),
    dropRate,
    level: anomaly.severity === 'critical' || anomaly.severity === 'high' ? 'critical' : 'warning',
    triggeredAt: anomaly.createdAt,
    content: `${metricName}最近7日均值较前30日下降 ${dropRate.toFixed(2)}%`,
    sortWeight: isSalesAmount ? 5 : 8,
  };
}

function mergeRiskResults(
  trafficRiskResults: TrafficWarningResult[],
  operationAnomalyRiskResults: TrafficWarningResult[],
) {
  const resultsByKey = new Map<string, TrafficWarningResult>();

  [...trafficRiskResults, ...operationAnomalyRiskResults].forEach((item) => {
    const key = `${item.storeName}|${item.metricField}|${item.date}`;
    const existing = resultsByKey.get(key);
    if (!existing || riskSort(item, existing) < 0) {
      resultsByKey.set(key, item);
    }
  });

  return Array.from(resultsByKey.values()).sort(riskSort);
}

function safeLoad<T>(loader: () => T, fallback: T) {
  try {
    return loader();
  } catch {
    return fallback;
  }
}

function formatMetricValue(metricField: TrafficMetricField, value: number) {
  const isRateMetric = metricField === 'detailPayConversionRate' || /rate|conversion/i.test(metricField);
  return isRateMetric ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
}

function formatChangeRate(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function getAnalysisResultLevel(item: TrafficAnalysisItem): TrafficAnalysisResultLevel {
  if (item.resultLevel) {
    return item.resultLevel;
  }

  if (item.resultType === 'opportunity') {
    return 'opportunity';
  }

  if (item.resultType === 'insufficient' || item.level === 'insufficient') {
    return 'insufficient';
  }

  if (item.level === 'critical') {
    return 'critical';
  }

  if (item.resultType === 'risk' || item.level === 'warning') {
    return 'medium_risk';
  }

  return 'normal';
}

function getAnalysisResultLabel(item: TrafficAnalysisItem) {
  return item.resultLabel || resultLevelLabels[getAnalysisResultLevel(item)];
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildOperationSuggestion(
  type: TrafficWarningType,
  sourceType: 'warning' | 'opportunity',
  templates: TaskSuggestionTemplate[],
) {
  const problemType: TaskSuggestionProblemType = sourceType === 'opportunity' ? 'opportunity' : type;
  return resolveSuggestionContent(templates, problemType);
}

function isOpenTask(task: OperationTaskRecord) {
  return task.status === 'todo' || task.status === 'doing';
}

function isSameRiskTask(task: AutoRiskTaskRecord, warning: TrafficWarningResult) {
  return task.storeName === warning.storeName &&
    task.riskLevel === warning.level &&
    task.anomalyType === warning.metricField;
}

function wasCreatedWithinHours(task: OperationTaskRecord, hours: number) {
  return Boolean(task.createdAt && Date.now() - Date.parse(task.createdAt) < hours * 60 * 60 * 1000);
}

function getAutoCreatedTask(tasks: OperationTaskRecord[], warning: TrafficWarningResult) {
  const dedupKey = buildRiskWarningTaskDedupKey(warning);
  return (tasks as AutoRiskTaskRecord[]).find((task) =>
    task.autoCreated &&
    (task.taskDedupKey === dedupKey || isSameRiskTask(task, warning)),
  );
}

function canAutoCreateCriticalTask(tasks: OperationTaskRecord[], warning: TrafficWarningResult) {
  if (warning.level !== 'critical') {
    return false;
  }

  const draft = buildAutoCriticalTask(warning, '');
  if (findOpenTaskByDedupKey(tasks, buildRiskWarningTaskDedupKey(warning)) || findOpenTaskByBusinessKey(tasks, draft)) {
    return false;
  }

  const sameTasks = (tasks as AutoRiskTaskRecord[]).filter((task) => isSameRiskTask(task, warning));
  return !sameTasks.some(isOpenTask) && !sameTasks.some((task) => task.autoCreated && wasCreatedWithinHours(task, 24));
}

function buildAutoCriticalTask(warning: TrafficWarningResult, recommendation: string): Partial<AutoRiskTaskRecord> {
  const metricName = metricFieldLabels[warning.metricField];

  return {
    title: `${warning.storeName} ${metricName}严重异常`,
    storeName: warning.storeName,
    riskLevel: warning.level,
    anomalyType: warning.metricField,
    sourceRuleId: warning.type,
    sourceType: 'risk_warning',
    sourceId: warning.id,
    taskDedupKey: buildRiskWarningTaskDedupKey(warning),
    latestAnomalyDate: warning.date,
    anomalyDurationDays: 1,
    latestSeverity: warning.level,
    latestTriggerTime: warning.triggeredAt || new Date().toISOString(),
    sourceContent: `最近7日数据较30日均值下降 ${warning.dropRate.toFixed(2)}% ，达到严重风险阈值。`,
    recommendation,
    suggestion: recommendation,
    autoCreated: true,
    priority: 'high',
    status: 'todo',
  };
}

function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  date.setDate(date.getDate() - 1);
  return formatDateKey(date);
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    return response.ok ? (await response.json() as T) : fallback;
  } catch {
    return fallback;
  }
}

async function fetchVisibleStoresFallback(currentUser: CurrentUser): Promise<StoreRecord[]> {
  if (currentUser.role === 'admin') {
    return referenceDataService.loadStores();
  }

  const result = await fetchJson<{ stores?: StoreRecord[] }>('/api/auth/visible-stores', { stores: [] });
  return result.stores ?? [];
}

function buildDateDimension(value: string) {
  const date = String(value || '').slice(0, 10);
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { date, month: '', year: 0, week: '' };
  }

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

function findActiveRelation(relations: StoreOperatorRelation[], storeId: string, storeName: string, date: string) {
  return relations.find((relation) =>
    relation.status !== 'inactive' &&
    (relation.storeId === storeId || relation.storeName === storeName) &&
    (!relation.startDate || relation.startDate <= date) &&
    (!relation.endDate || relation.endDate >= date),
  );
}

function createFactResolver(stores: StoreRecord[], relations: StoreOperatorRelation[], operators: OperatorRecord[]) {
  const matcher = createStoreMatcher(stores);
  const storesById = new Map(stores.map((store) => [store.id, store]));
  const storesByName = new Map(stores.map((store) => [store.storeName, store]));
  const operatorsById = new Map(operators.map((operator) => [operator.id, operator]));

  return (storeName: string, date: string, fallbackOperatorName = '') => {
    const identity = matcher.match(storeName);
    const store = (identity.storeId ? storesById.get(identity.storeId) : undefined) || storesByName.get(identity.storeName);
    const relation = findActiveRelation(relations, store?.id || identity.storeId || identity.key, store?.storeName || identity.storeName, date);
    const operator = relation ? operatorsById.get(relation.operatorId) : undefined;
    const operatorName = operator?.operatorName || relation?.operatorName || fallbackOperatorName || '';

    return {
      storeId: store?.id || identity.storeId || identity.key,
      storeName: store?.storeName || identity.storeName,
      platform: store?.platform || 'Other',
      operatorId: relation?.operatorId || (operatorName ? `operator-${operatorName}` : ''),
      operatorName,
    };
  };
}

function standardizeOrders(
  orders: Array<TemuOrderDetail & { batchId?: string }>,
  stores: StoreRecord[],
  relations: StoreOperatorRelation[],
  operators: OperatorRecord[],
): SalesOrderRecord[] {
  const resolveFact = createFactResolver(stores, relations, operators);
  return orders.map((order) => {
    const dates = buildDateDimension(order.orderDate);
    const fact = resolveFact(order.storeName, dates.date, order.operatorName);
    return {
      ...dates,
      ...fact,
      orderId: order.orderId || order.uniqueKey || '',
      sku: order.productSku || order.skuCode || order.skc,
      productName: order.productName,
      salesAmount: order.salesAmount,
      orderAmount: order.salesAmount,
      quantity: order.quantity ?? 0,
      isFirstOrder: Boolean(order.isFirstOrder),
      sourceBatchId: order.batchId,
      sourceKey: order.uniqueKey,
    };
  });
}

function standardizeTrafficRecords(
  records: TrafficConversionRecord[],
  stores: StoreRecord[],
  relations: StoreOperatorRelation[],
  operators: OperatorRecord[],
) {
  const resolveFact = createFactResolver(stores, relations, operators);
  return records.map((record) => {
    const dates = buildDateDimension(record.date);
    return {
      ...dates,
      ...resolveFact(record.storeName, dates.date),
      visitorCount: record.totalVisitors,
      conversionRate: record.totalPayConversionRate,
      orderCount: record.totalPayBuyers,
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
      sourceBatchId: record.batchId,
    };
  });
}

function standardizeAnalysisItems(
  items: TrafficAnalysisItem[],
  stores: StoreRecord[],
  relations: StoreOperatorRelation[],
  operators: OperatorRecord[],
): AnalysisResultRecord[] {
  const resolveFact = createFactResolver(stores, relations, operators);
  return items.map((item) => {
    const dates = buildDateDimension(item.date);
    return {
      ...dates,
      ...resolveFact(item.storeName, dates.date),
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
      sourceId: item.id,
    };
  });
}

async function loadAnalysisData(currentUser: CurrentUser, options: { force?: boolean } = {}) {
  const cacheKey = getWarningAnalysisCacheKey(currentUser);
  const cached = warningAnalysisDataCache.get(cacheKey);

  if (cached && !options.force) {
    return cached;
  }

  const request = (async () => {
    const [
      orderSummary,
      trafficSummary,
      riskStore,
      growthStore,
      analysisStore,
      stores,
      relations,
      operators,
      suggestionTemplates,
    ] = await Promise.all([
      fetchJson<OrderDailySummaryResponse>('/api/persistent-data/orderImportStore?view=store-business-daily&recentDays=30', { records: [] }),
      fetchJson<TrafficDailySummaryStore>('/api/persistent-data/trafficDailySummary', { items: [], updatedAt: '' }),
      fetchJson<TrafficAnalysisResultStore<TrafficWarningResult>>('/api/persistent-data/riskResults', { items: [], updatedAt: '' }),
      fetchJson<TrafficAnalysisResultStore<TrafficGrowthOpportunity>>('/api/persistent-data/growthOpportunities', { items: [], updatedAt: '' }),
      fetchJson<TrafficAnalysisResultStore<TrafficAnalysisItem>>('/api/persistent-data/businessAnalysisItems', { items: [], updatedAt: '' }),
      fetchVisibleStoresFallback(currentUser),
      currentUser.role === 'admin' ? referenceDataService.loadStoreOperatorRelations() : Promise.resolve([]),
      currentUser.role === 'admin' ? referenceDataService.loadOperators() : Promise.resolve([]),
      fetchJson<TaskSuggestionTemplate[]>('/api/task-suggestion-templates', []),
    ]);
  const orderRecords = buildOrderDetailsFromDailySummary(orderSummary.records ?? []);
  let rawAnalysisItems = analysisStore.items ?? [];
  if (rawAnalysisItems.some((item) => !item.resultLevel || item.changeRateText === undefined || !item.resultLabel)) {
    rawAnalysisItems = trafficConversionDataSource.regenerateAnalysisResults().businessAnalysisItems;
  }
  const analysisItems = filterRecordsByPermission(rawAnalysisItems, currentUser);
  const standardSalesOrders = filterRecordsByPermission(standardizeOrders(orderRecords, stores, relations, operators), currentUser);
  const trafficRecords = buildTrafficRecordsFromDailySummary(trafficSummary.items ?? []);
  const standardTrafficRecords = filterRecordsByPermission(standardizeTrafficRecords(trafficRecords, stores, relations, operators), currentUser);
  const standardAnalysisResults = filterRecordsByPermission(standardizeAnalysisItems(analysisItems, stores, relations, operators), currentUser);
  const operationDiagnosis = runOperationDiagnosis({
    salesOrders: standardSalesOrders,
    trafficMetrics: standardTrafficRecords,
    analysisResults: standardAnalysisResults,
    warnings: [],
    meta: {
      platforms: Array.from(new Set([
        ...standardSalesOrders.map((record) => record.platform),
        ...standardTrafficRecords.map((record) => record.platform),
        ...standardAnalysisResults.map((record) => record.platform),
      ].filter(Boolean))),
      generatedAt: new Date().toISOString(),
      recordCounts: {
        salesOrders: standardSalesOrders.length,
        trafficMetrics: standardTrafficRecords.length,
        analysisResults: standardAnalysisResults.length,
      },
    },
  });
  const storeNames = [
    ...orderRecords.map((order) => order.storeName),
    ...trafficRecords.map((record) => record.storeName),
  ];
  const trafficRiskResults = filterRecordsByPermission(riskStore.items ?? [], currentUser).filter((item) => item.level !== 'insufficient');
  const operationAnomalyRiskResults = operationDiagnosis.anomalies
    .filter(isFormalSalesOrOrderAnomaly)
    .map(operationAnomalyToRiskWarning);
  const riskResults = mergeRiskResults(trafficRiskResults, operationAnomalyRiskResults);
  const growthResults = filterRecordsByPermission(growthStore.items ?? [], currentUser).slice(0, 999);

    return {
      riskResults,
      growthResults,
      analysisItems,
      storeMatchReport: analyzeStoreNameMatches(storeNames, stores),
      factDataQualityReport: buildFactDataQualityReport({
        salesOrders: standardSalesOrders,
        trafficRecords: standardTrafficRecords,
        analysisResults: standardAnalysisResults,
      }),
      suggestionTemplates: suggestionTemplates.length > 0 ? suggestionTemplates : defaultTaskSuggestionTemplates,
    };
  })();

  warningAnalysisDataCache.set(cacheKey, request);
  return request;
}

function WarningResultsPage({ currentUser }: { currentUser: CurrentUser }) {
  const [data, setData] = useState<{
    riskResults: TrafficWarningResult[];
    growthResults: TrafficGrowthOpportunity[];
    analysisItems: TrafficAnalysisItem[];
    storeMatchReport: StoreMatchCheckReport;
    factDataQualityReport: FactDataQualityReport;
    suggestionTemplates: TaskSuggestionTemplate[];
  }>(() => emptyAnalysisData());
  const [tasks, setTasks] = useState<OperationTaskRecord[]>([]);
  const [dateFilter, setDateFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [refreshMessage, setRefreshMessage] = useState('');
  const [isDataQualityExpanded, setIsDataQualityExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (options: { force?: boolean } = {}) => {
      if (options.force) {
        clearWarningAnalysisDataCache();
      }
      const [nextData, nextTasks] = await Promise.all([
        loadAnalysisData(currentUser, options),
        fetchJson<OperationTaskRecord[]>('/api/tasks', []),
      ]);

      if (!cancelled) {
        setData(nextData);
        setTasks(filterTasksByPermission(nextTasks, currentUser));
      }
    };
    void refresh();
    const refreshFromDataChange = () => {
      void refresh({ force: true });
    };
    const unsubscribeTraffic = subscribeTrafficConversionChange(refreshFromDataChange);
    const handleOrderStorageChange = (event: StorageEvent) => {
      if (event.key === TEMU_ORDER_IMPORT_STORAGE_KEY) {
        refreshFromDataChange();
      }
    };
    window.addEventListener(TEMU_ORDER_IMPORT_STORAGE_EVENT, refreshFromDataChange);
    window.addEventListener('storage', handleOrderStorageChange);

    return () => {
      cancelled = true;
      unsubscribeTraffic();
      window.removeEventListener(TEMU_ORDER_IMPORT_STORAGE_EVENT, refreshFromDataChange);
      window.removeEventListener('storage', handleOrderStorageChange);
    };
  }, [currentUser]);

  const { riskResults, growthResults, analysisItems, storeMatchReport, factDataQualityReport, suggestionTemplates } = data;
  const filtered = useMemo(() => analysisItems.filter((item) =>
    (!dateFilter || item.date === dateFilter) &&
    (!storeFilter || item.storeName === storeFilter) &&
    (!typeFilter || item.type === typeFilter) &&
    (!resultFilter || getAnalysisResultLevel(item) === resultFilter),
  ), [analysisItems, dateFilter, resultFilter, storeFilter, typeFilter]);
  const visibleFiltered = useMemo(() => filtered.slice(0, DETAIL_RENDER_LIMIT), [filtered]);
  const dates = useMemo(() => Array.from(new Set(analysisItems.map((item) => item.date))).sort().reverse(), [analysisItems]);
  const stores = useMemo(() => Array.from(new Set(analysisItems.map((item) => item.storeName))).sort(), [analysisItems]);
  const riskStoreCount = useMemo(() => new Set(riskResults.map((item) => item.storeName)).size, [riskResults]);
  const growthStoreCount = useMemo(() => new Set(growthResults.map((item) => item.storeName)).size, [growthResults]);
  const criticalRiskCount = useMemo(() => riskResults.filter((item) => item.level === 'critical').length, [riskResults]);
  const maxGrowth = growthResults[0];
  const maxDrop = riskResults[0];
  // 后续可扩展运营总监、组长、分组权限、仅查看本组；当前先仅管理员可见。
  const isAdmin = currentUser.role === 'admin';
  const canRerunAnalysis = hasPermission(currentUser, 'rerun-analysis');
  const canViewDataQuality = hasPermission(currentUser, 'view-data-quality');
  const canManageStoreData = hasPermission(currentUser, 'manage-store-data');
  const dataQualityIssueCount = factDataQualityReport.missingStoreIdCount +
    factDataQualityReport.missingOperatorIdCount +
    factDataQualityReport.missingPlatformCount +
    factDataQualityReport.missingDateCount +
    storeMatchReport.unmatchedStoreNames.length;
  const handleRegenerate = async () => {
    try {
      trafficConversionDataSource.regenerateAnalysisResults();
      clearWarningAnalysisDataCache();
      setData(await loadAnalysisData(currentUser, { force: true }));
      setRefreshMessage('分析结果已重新生成');
    } catch (error) {
      setRefreshMessage(`分析结果生成失败：${error instanceof Error ? error.message : 'JSON 文件写入失败'}`);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let nextTasks = tasks;
    let changed = false;

    riskResults.forEach((warning) => {
      const draft = buildAutoCriticalTask(
        warning,
        buildOperationSuggestion(warning.type, 'warning', suggestionTemplates),
      );
      const openTask = findOpenTaskByDedupKey(nextTasks, draft.taskDedupKey) || findOpenTaskByBusinessKey(nextTasks, draft);

      if (openTask) {
        if (openTask.latestAnomalyDate === draft.latestAnomalyDate) {
          return;
        }

        const updatedTask = taskDataSource.update(openTask.id, buildExistingTaskUpdate(openTask, draft));
        nextTasks = nextTasks.map((task) => task.id === updatedTask.id ? updatedTask : task);
        changed = true;
        return;
      }

      if (!canAutoCreateCriticalTask(nextTasks, warning)) {
        return;
      }

      const task = taskDataSource.create(draft);
      nextTasks = [...nextTasks, task];
      changed = true;
    });

    if (changed) {
      setTasks(nextTasks);
    }
  }, [isAdmin, riskResults, suggestionTemplates, tasks]);

  return (
    <section className="excel-import-page">
      <div className="analysis-maintenance-bar">
        {canRerunAnalysis && <button type="button" onClick={handleRegenerate}>重新生成分析结果</button>}
        {refreshMessage && <span>{refreshMessage}</span>}
      </div>
      <section className="import-overview-grid">
        <article>
          <span>风险店铺数</span>
          <strong>{riskStoreCount}</strong>
        </article>
        <article>
          <span>增长店铺数</span>
          <strong>{growthStoreCount}</strong>
        </article>
        <article>
          <span>严重风险数</span>
          <strong>{criticalRiskCount}</strong>
        </article>
        <article>
          <span>最大增长店铺</span>
          <strong>{maxGrowth ? `${maxGrowth.storeName} ${maxGrowth.growthRate.toFixed(2)}%` : '-'}</strong>
        </article>
        <article>
          <span>最大下降店铺</span>
          <strong>{maxDrop ? `${maxDrop.storeName} ${maxDrop.dropRate.toFixed(2)}%` : '-'}</strong>
        </article>
      </section>

      {canViewDataQuality && (
      <article className="excel-record-panel store-match-check-panel">
        <header className="data-quality-check-header">
          <div>
            <h2>数据质量检查（{dataQualityIssueCount}项）</h2>
            <p>管理员维护信息，默认收起，不进入普通经营分析视野。</p>
          </div>
          <button type="button" onClick={() => setIsDataQualityExpanded((value) => !value)}>
            {isDataQualityExpanded ? '收起' : '展开'}
          </button>
        </header>
        {isDataQualityExpanded && (
        <div className="data-quality-collapse-body">
        <div className="store-match-check-body">
          <section>
            <strong>未匹配店铺名称</strong>
            {storeMatchReport.unmatchedStoreNames.length > 0 ? (
              <div className="store-match-tags">
                {storeMatchReport.unmatchedStoreNames.map((storeName) => (
                  <span key={storeName}>{storeName}</span>
                ))}
              </div>
            ) : (
              <p>暂无未匹配店铺。</p>
            )}
          </section>
          {canManageStoreData && <a className="store-match-action" href="/admin/stores">去店铺管理新增或修正店铺名称</a>}
        </div>
        <section className="fact-quality-summary">
          <article>
            <span>标准记录</span>
            <strong>{factDataQualityReport.totalRecords}</strong>
          </article>
          <article>
            <span>缺店铺ID</span>
            <strong>{factDataQualityReport.missingStoreIdCount}</strong>
          </article>
          <article>
            <span>缺运营ID</span>
            <strong>{factDataQualityReport.missingOperatorIdCount}</strong>
          </article>
          <article>
            <span>缺平台</span>
            <strong>{factDataQualityReport.missingPlatformCount}</strong>
          </article>
          <article>
            <span>缺日期</span>
            <strong>{factDataQualityReport.missingDateCount}</strong>
          </article>
        </section>
        {factDataQualityReport.issueSamples.length > 0 && (
          <details className="fact-quality-sample-panel">
            <summary>
              <strong>异常数据样本（{factDataQualityReport.issueSamples.length}条）</strong>
              <span>展开查看</span>
            </summary>
            <div className="fact-quality-samples">
              {factDataQualityReport.issueSamples.map((issue, index) => (
                <span key={`${issue.kind}-${issue.storeName}-${issue.date}-${index}`}>
                  {issue.kind} / {issue.storeName || '-'} / {issue.date || '-'}：{issue.missingFields.join(', ')}
                </span>
              ))}
            </div>
          </details>
        )}
        <section className="fact-quality-fix-panel">
          <header>
            <strong>修复建议</strong>
            <div className="fact-quality-actions">
              {canManageStoreData && <a className="store-match-action" href="/admin/stores">去店铺管理</a>}
              {canManageStoreData && <a className="store-match-action" href="/admin/operators">去运营管理</a>}
            </div>
          </header>
          <div className="fact-quality-fix-list">
            <p className={factDataQualityReport.missingStoreIdCount > 0 ? 'need-fix' : 'is-ok'}>
              缺 storeId：{factDataQualityReport.missingStoreIdCount > 0 ? '请到店铺管理中新增店铺或修正店铺名称' : '已正常'}
            </p>
            <p className={factDataQualityReport.missingPlatformCount > 0 ? 'need-fix' : 'is-ok'}>
              缺 platform：{factDataQualityReport.missingPlatformCount > 0 ? '请到店铺管理中补充平台' : '已正常'}
            </p>
            <p className={factDataQualityReport.missingOperatorIdCount > 0 ? 'need-fix' : 'is-ok'}>
              缺 operatorId：{factDataQualityReport.missingOperatorIdCount > 0 ? '请到运营管理中维护店铺-运营关系' : '已正常'}
            </p>
            <p className={factDataQualityReport.missingDateCount > 0 ? 'need-fix' : 'is-ok'}>
              缺 date：{factDataQualityReport.missingDateCount > 0 ? '请检查对应导入源文件中的日期字段' : '已正常'}
            </p>
          </div>
        </section>
        </div>
        )}
      </article>
      )}

      <section className="analysis-two-column">
        <article className="excel-record-panel">
          <header>
            <div>
              <h2>风险预警</h2>
              <p>只展示真正触发阈值的下降数据。</p>
            </div>
            <span>{riskResults.length} 条</span>
          </header>
          <div className="analysis-card-list">
            {riskResults.slice(0, 8).map((item) => {
              const autoTask = getAutoCreatedTask(tasks, item);

              return (
                <section key={item.id} className={`analysis-card analysis-risk-${item.level}`}>
                  <strong>{trafficTypeLabels[item.type]}</strong>
                  <span>{item.storeName}</span>
                  <p>{item.content}</p>
                  <div className="analysis-card-actions">
                    <em>{levelLabels[item.level]} · {item.dropRate.toFixed(2)}%</em>
                    {autoTask ? (
                      <button type="button" disabled>已自动创建</button>
                    ) : (
                      <a href={buildTaskCreateUrl({
                        ...buildRiskWarningTaskDraft({
                          warning: item,
                          suggestion: buildOperationSuggestion(item.type, 'warning', suggestionTemplates),
                        }),
                      })}>创建任务</a>
                    )}
                  </div>
                </section>
              );
            })}
            {riskResults.length === 0 && <div className="import-record-empty">暂无风险预警</div>}
          </div>
        </article>

        <article className="excel-record-panel">
          <header>
            <div>
              <h2>增长机会</h2>
              <p>只展示超过增长规则阈值的上涨数据。</p>
            </div>
            <span>{growthResults.length} 条</span>
          </header>
          <div className="analysis-card-list">
            {growthResults.slice(0, 8).map((item) => (
              <section key={item.id} className="analysis-card analysis-growth">
                <strong>{trafficGrowthTypeLabels[item.type]}</strong>
                <span>{item.storeName}</span>
                <p>{item.content}</p>
                <div className="analysis-card-actions">
                  <em>{item.growthRate.toFixed(2)}%</em>
                  <a href={buildTaskCreateUrl({
                    ...buildGrowthOpportunityTaskDraft({
                      opportunity: item,
                      suggestion: buildOperationSuggestion(item.type, 'opportunity', suggestionTemplates),
                    }),
                  })}>创建任务</a>
                </div>
              </section>
            ))}
            {growthResults.length === 0 && <div className="import-record-empty">暂无增长机会</div>}
          </div>
        </article>
      </section>

      <article className="excel-record-panel">
        <header>
          <div>
            <h2>详细分析列表</h2>
            <p>包含风险问题、增长机会、数据不足和正常结果。</p>
          </div>
          <span>{filtered.length > DETAIL_RENDER_LIMIT ? `${filtered.length} 条，显示前 ${DETAIL_RENDER_LIMIT} 条` : `${filtered.length} 条`}</span>
        </header>
        <section className="import-filter-bar">
          <label>
            日期
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="">全部日期</option>
              {dates.map((date) => <option key={date} value={date}>{date}</option>)}
            </select>
          </label>
          <label>
            店铺
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="">全部店铺</option>
              {stores.map((storeName) => <option key={storeName} value={storeName}>{storeName}</option>)}
            </select>
          </label>
          <label>
            类型
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">全部类型</option>
              {Object.entries(trafficTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            结果
            <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
              <option value="">全部结果</option>
              {Object.entries(resultLevelLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </section>
        <div className="import-record-table-wrap">
          <table className="import-record-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>店铺名称</th>
                <th>分析类型</th>
                <th>监控字段</th>
                <th className="numeric-cell">前30日平均值</th>
                <th className="numeric-cell">近7日平均值</th>
                <th className="numeric-cell">变化幅度</th>
                <th className="result-cell">结果类型</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {visibleFiltered.map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td><strong>{item.storeName}</strong></td>
                  <td>{item.resultType === 'opportunity' ? trafficGrowthTypeLabels[item.type] : trafficTypeLabels[item.type]}</td>
                  <td>{metricFieldLabels[item.metricField]}</td>
                  <td className="numeric-cell">{formatMetricValue(item.metricField, item.previous30Avg)}</td>
                  <td className="numeric-cell">{formatMetricValue(item.metricField, item.recent7Avg)}</td>
                  <td className={`numeric-cell change-rate-cell ${item.changeRate > 0 ? 'is-up' : item.changeRate < 0 ? 'is-down' : 'is-flat'}`}>
                    {item.changeRateText || formatChangeRate(item.changeRate)}
                  </td>
                  <td className="result-cell">
                    <span className={`import-status analysis-result-${getAnalysisResultLevel(item)}`}>{getAnalysisResultLabel(item)}</span>
                  </td>
                  <td>{item.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="import-record-empty">暂无详细分析数据</div>}
        </div>
      </article>
    </section>
  );
}

export default WarningResultsPage;
