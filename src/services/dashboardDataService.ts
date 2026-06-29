import { dashboardDataSource } from '../data-source';
import type { DashboardData, GrowthOpportunityItem, RankingItem, WarningItem, WarningLevel } from '../types/dashboard';
import type { SalesOrderRecord } from '../types/fact';
import type { OperatorRecord } from '../types/operator';
import type { TemuOrderDetail, TemuOrderImportResult, TemuOrderImportStore } from '../types/order';
import type { StoreRecord } from '../types/store';
import type { StoreOperatorRelation } from '../types/storeOperator';
import type { TrafficAnalysisResultStore, TrafficGrowthOpportunity, TrafficWarningResult, TrafficWarningRuleStore } from '../types/traffic';
import { buildDashboardDataFromOrders } from '../utils/orderDashboardAdapter';
import { createStoreMatcher } from '../utils/storeStandardization';

const levelRank = { critical: 0, high: 1, medium: 2, low: 3 };
const UNBOUND_OPERATOR = '未绑定运营';
const COMPANY_DASHBOARD_SCOPE = 'scope=company-dashboard';
const DASHBOARD_ORDER_RECENT_DAYS = 62;
const DASHBOARD_PLATFORM = 'TEMU';
let dashboardDataCache: DashboardData | null = null;
let dashboardDataPromise: Promise<DashboardData> | null = null;

interface OrderOwnerContext {
  stores: StoreRecord[];
  operators: OperatorRecord[];
  matcher: ReturnType<typeof createStoreMatcher>;
  relations: StoreOperatorRelation[];
  operatorById: Map<string, OperatorRecord>;
}

interface ProductImportRankingRecord {
  storeId: string;
  storeName: string;
  productCount: number;
}

interface ProductImportRankingSummary {
  month: string;
  records: ProductImportRankingRecord[];
}

async function fetchCompanyJson<T>(path: string, fallback: T): Promise<T> {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const separator = path.includes('?') ? '&' : '?';

  try {
    const response = await fetch(`${path}${separator}${COMPANY_DASHBOARD_SCOPE}&t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
    });
    return response.ok ? await response.json() as T : fallback;
  } catch {
    return fallback;
  }
}

function emptyOrderStore(): TemuOrderImportStore {
  return { batches: [] };
}

function isOrderStore(value: unknown): value is TemuOrderImportStore {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as TemuOrderImportStore).batches));
}

async function loadCompanyOrderStore(): Promise<TemuOrderImportStore> {
  const data = await fetchCompanyJson<unknown>(
    `/api/persistent-data/orderImportStore?view=dashboard-orders&recentDays=${DASHBOARD_ORDER_RECENT_DAYS}`,
    emptyOrderStore(),
  );
  return isOrderStore(data) ? data : emptyOrderStore();
}

async function loadCompanyDashboardData(): Promise<DashboardData | null> {
  const data = await fetchCompanyJson<DashboardData | { ok?: false }>('/api/dashboard/company', { ok: false });

  return data && 'metrics' in data && Array.isArray(data.metrics) ? data : null;
}

function buildImportResult(store: TemuOrderImportStore): TemuOrderImportResult | null {
  const batches = store.batches;

  if (batches.length === 0) {
    return null;
  }

  const orders = batches.flatMap((batch) => batch.orders);
  const latestImportedAt = batches
    .map((batch) => batch.importedAt)
    .sort()
    .at(-1)!;
  const latestImportDate = latestImportedAt.slice(0, 10);

  return {
    fileName: `${batches.length}个导入批次`,
    importedAt: latestImportedAt,
    totalRows: orders.length,
    validRows: orders.length,
    duplicateRows: 0,
    orders,
    displayOrders: batches
      .filter((batch) => batch.importedAt.slice(0, 10) === latestImportDate)
      .flatMap((batch) => batch.orders),
  };
}

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

async function getTrafficWarnings() {
  const [ruleStore, riskStore] = await Promise.all([
    fetchCompanyJson<TrafficWarningRuleStore>('/api/persistent-data/trafficWarningRules', { settings: { displayLimit: 5 }, rules: [], growthRules: [] }),
    fetchCompanyJson<TrafficAnalysisResultStore<TrafficWarningResult>>('/api/persistent-data/riskResults', { items: [], updatedAt: '' }),
  ]);

  return (riskStore.items ?? [])
    .filter((result) => result.level !== 'insufficient')
    .sort((first, second) => {
      const firstLevel = levelRank[toDashboardWarning(first).level];
      const secondLevel = levelRank[toDashboardWarning(second).level];
      return firstLevel - secondLevel || second.dropRate - first.dropRate || second.sortWeight - first.sortWeight;
    })
    .slice(0, ruleStore.settings?.displayLimit || 5)
    .map(toDashboardWarning);
}

async function getGrowthOpportunities(): Promise<GrowthOpportunityItem[]> {
  const store = await fetchCompanyJson<TrafficAnalysisResultStore<TrafficGrowthOpportunity>>('/api/persistent-data/growthOpportunities', { items: [], updatedAt: '' });

  return (store.items ?? []).slice(0, 5).map((item) => ({
    id: item.id || `${item.storeName || 'unknown'}-${item.type || 'traffic'}-${Date.now()}`,
    type: item.type || 'traffic',
    storeName: item.storeName || '-',
    content: item.content || '-',
    growthRate: Number.isFinite(item.growthRate) ? item.growthRate : 0,
  }));
}

async function safeTrafficWarnings() {
  try {
    return await getTrafficWarnings();
  } catch {
    return [];
  }
}

async function safeGrowthOpportunities() {
  try {
    return await getGrowthOpportunities();
  } catch {
    return [];
  }
}

function getCurrentMonthKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function loadProductImportRankingSummary(month = getCurrentMonthKey()): Promise<ProductImportRankingSummary> {
  return fetchCompanyJson<ProductImportRankingSummary>(
    `/api/data-import/temu-product-info/ranking-summary?month=${encodeURIComponent(month)}`,
    { month, records: [] },
  );
}

function buildProductImportNewListingRanking(
  items: ProductImportRankingRecord[],
  context: OrderOwnerContext,
  month = getCurrentMonthKey(),
): RankingItem[] {
  const grouped = new Map<string, { name: string; value: number }>();
  const storeIds = new Set(context.stores.map((store) => store.id).filter(Boolean));
  const storeNames = new Set(context.stores.map((store) => store.storeName).filter(Boolean));

  for (const operator of getVisibleOperators(context.operators)) {
    const key = getOperatorRankingKey(operator.id, operator.operatorName);
    grouped.set(key, { name: normalizeOperatorName(operator.operatorName) || operator.id, value: 0 });
  }

  items
    .filter((item) => storeIds.has(item.storeId) || storeNames.has(item.storeName || ''))
    .forEach((item) => {
      const owner = resolvePrimaryOwner(context, item.storeId, item.storeName, `${month}-01`);
      const key = getOperatorRankingKey(owner.operatorId, owner.operatorName);
      if (!key) {
        return;
      }

      const current = grouped.get(key) ?? { name: normalizeOperatorName(owner.operatorName) || owner.operatorId || '-', value: 0 };
      current.value += Number(item.productCount) || 0;
      grouped.set(key, current);
    });

  return Array.from(grouped.values())
    .sort((first, second) => second.value - first.value || first.name.localeCompare(second.name))
    .map((item, index) => ({
      rank: index + 1,
      name: item.name,
      value: item.value,
      unit: '款',
    }));
}

function relationActiveOnDate(relation: StoreOperatorRelation, date: string) {
  return relation.status === 'active' &&
    relation.role === 'primary' &&
    (!relation.startDate || relation.startDate <= date) &&
    (!relation.endDate || relation.endDate >= date);
}

function isActiveOperator(operator: OperatorRecord) {
  const status = String(operator.status ?? '').trim().toLowerCase();
  return !['inactive', 'disabled', 'stopped', 'left', '停用', '离职'].includes(status);
}

function getVisibleOperators(operators: OperatorRecord[]) {
  const hasStatus = operators.some((operator) => String(operator.status ?? '').trim());
  return uniqueOperatorsByName(hasStatus ? operators.filter(isActiveOperator) : operators);
}

function normalizeOperatorName(value: unknown) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u202a-\u202e\ufeff]/g, '').trim();
}

function getOperatorRankingKey(operatorId: unknown, operatorName: unknown) {
  return normalizeOperatorName(operatorName) || String(operatorId ?? '').trim();
}

function uniqueOperatorsByName(operators: OperatorRecord[]) {
  const result: OperatorRecord[] = [];
  const seen = new Set<string>();

  for (const operator of operators) {
    const key = getOperatorRankingKey(operator.id, operator.operatorName);
    if (!key || seen.has(key)) {
      if (key) {
        console.warn(`发现重复运营姓名：${normalizeOperatorName(operator.operatorName) || key}`);
      }
      continue;
    }
    seen.add(key);
    result.push(operator);
  }

  return result;
}

async function buildOrderOwnerContext(): Promise<OrderOwnerContext> {
  const [allStores, allRelations, operators] = await Promise.all([
    fetchCompanyJson<StoreRecord[]>('/api/stores', []),
    fetchCompanyJson<StoreOperatorRelation[]>('/api/store-operator-relations', []),
    fetchCompanyJson<OperatorRecord[]>('/api/operators', []),
  ]);
  const stores = allStores.filter((store) => store.platform === DASHBOARD_PLATFORM);
  const storeIds = new Set(stores.map((store) => store.id).filter(Boolean));
  const storeNames = new Set(stores.map((store) => store.storeName).filter(Boolean));
  const relations = allRelations.filter((relation) =>
    relation.platform === DASHBOARD_PLATFORM ||
    storeIds.has(relation.storeId) ||
    storeNames.has(relation.storeName || ''),
  );
  const operatorIds = new Set(relations.map((relation) => relation.operatorId).filter(Boolean));
  const operatorNames = new Set(relations.map((relation) => normalizeOperatorName(relation.operatorName)).filter(Boolean));
  const dashboardOperators = operators.filter((operator) =>
    operatorIds.has(operator.id) || operatorNames.has(normalizeOperatorName(operator.operatorName)),
  );
  const matcher = createStoreMatcher(stores);
  const operatorById = new Map(dashboardOperators.map((operator) => [operator.id, operator]));

  return { stores, operators: dashboardOperators, matcher, relations, operatorById };
}

function resolvePrimaryOwner(
  context: OrderOwnerContext,
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

function toSalesOrder(order: TemuOrderDetail & { batchId?: string }, context: OrderOwnerContext): SalesOrderRecord {
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

function toStandardSalesOrders(store: TemuOrderImportStore, context: OrderOwnerContext): SalesOrderRecord[] {
  const storeIds = new Set(context.stores.map((item) => item.id).filter(Boolean));
  const storeNames = new Set(context.stores.map((item) => item.storeName).filter(Boolean));

  return store.batches.flatMap((batch) =>
    (batch.orders ?? [])
      .map((order) => toSalesOrder({ ...order, batchId: batch.batchId }, context))
      .filter((order) => storeIds.has(order.storeId) || storeNames.has(order.storeName)),
  );
}

async function buildDashboardData(): Promise<DashboardData> {
  const companyDashboardData = await loadCompanyDashboardData();
  if (companyDashboardData) {
    return companyDashboardData;
  }

  const [trafficWarnings, growthOpportunities, productImportRankingSummary, orderStore, ownerContext] = await Promise.all([
    safeTrafficWarnings(),
    safeGrowthOpportunities(),
    loadProductImportRankingSummary(),
    loadCompanyOrderStore(),
    buildOrderOwnerContext(),
  ]);
  const newProductRanking = buildProductImportNewListingRanking(productImportRankingSummary.records, ownerContext, productImportRankingSummary.month);

  try {
    // Dashboard aggregates need the full imported order history. Keep raw orders
    // inside the service/adapter boundary; React only receives aggregated cards,
    // Top N rankings, and 30-day series. If this grows past ~50k rows, move this
    // aggregation behind the persistent-data API or add a persisted summary cache.
    const orderImportResult = buildImportResult(orderStore);

    if (orderImportResult && orderImportResult.orders.length > 0) {
      return {
        ...buildDashboardDataFromOrders(orderImportResult, toStandardSalesOrders(orderStore, ownerContext), ownerContext.stores, ownerContext.operators),
        dataSource: '真实数据',
        newProductRanking,
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
    newProductRanking,
    firstOrderRanking: [],
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
