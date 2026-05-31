import { useEffect, useMemo, useState } from 'react';
import { referenceDataService } from '../../../services/referenceDataService';
import type { CurrentUser } from '../../../types/auth';
import type { EffectiveNewListingRecord } from '../../../types/effectiveNewListing';
import type { OperatorRecord } from '../../../types/operator';
import type { StorePlatform, StoreRecord } from '../../../types/store';
import type { StoreOperatorRelation } from '../../../types/storeOperator';
import { getVisibleStores } from '../../../auth/storeVisibility';
import { createStoreMatcher } from '../../../utils/storeStandardization';

type TrendKey = 'newProduct' | 'firstOrder' | 'sales' | 'traffic' | 'conversion';
type TrendTone = 'up' | 'down' | 'flat';
type TrendStatus = 'strongUp' | 'up' | 'stable' | 'down' | 'severeDown';

interface StoreMetric {
  currentAvg: number;
  baselineAvg: number;
  changeRate: number;
  teamAverage: number;
  rank: number;
  series: number[];
  recentValues: number[];
  recentDates: string[];
  recentChartValues: number[];
  recentChartDates: string[];
  baselineValues: number[];
  baselineDates: string[];
  tone: TrendTone;
}

interface StoreTrendRow {
  storeId: string;
  storeName: string;
  platform: string;
  operatorName: string;
  metrics: Record<TrendKey, StoreMetric>;
  score: number;
}

interface StoreBusinessData {
  stores: StoreRecord[];
  orderDailyRecords: StoreBusinessOrderDailyRecord[];
  trafficRecords: StoreBusinessTrafficRecord[];
  effectiveNewListings: EffectiveNewListingRecord[];
  relations: StoreOperatorRelation[];
  operators: OperatorRecord[];
}

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

const trendConfigs: Array<{ key: TrendKey; label: string; unit: string; percentValue?: boolean }> = [
  { key: 'newProduct', label: '上新趋势', unit: '款' },
  { key: 'firstOrder', label: '首单趋势', unit: '单' },
  { key: 'sales', label: '销量趋势', unit: '¥' },
  { key: 'traffic', label: '流量趋势', unit: '人' },
  { key: 'conversion', label: '转化趋势', unit: '%', percentValue: true },
];

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

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return formatDateKey(date);
}

function getDateRange(endDate: string, days: number) {
  return Array.from({ length: days }, (_, index) => shiftDate(endDate, index - days + 1));
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function calcChangeRate(currentAvg: number, baselineAvg: number) {
  if (baselineAvg <= 0) {
    return currentAvg > 0 ? 100 : 0;
  }
  return ((currentAvg - baselineAvg) / baselineAvg) * 100;
}

function getTone(value: number): TrendTone {
  if (value > 1) {
    return 'up';
  }
  if (value < -1) {
    return 'down';
  }
  return 'flat';
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits }) : '-';
}

function formatMetricValue(value: number, config: typeof trendConfigs[number]) {
  if (config.percentValue) {
    return `${formatNumber(value * 100, 2)}%`;
  }
  if (config.key === 'sales') {
    return `¥${formatNumber(value, 0)}`;
  }
  return `${formatNumber(value, 1)}${config.unit}`;
}

function formatRate(value: number) {
  return `${value > 0 ? '+' : ''}${formatNumber(value, 1)}%`;
}

function getStatus(value: number): { key: TrendStatus; label: string } {
  if (value >= 30) {
    return { key: 'strongUp', label: '强增长' };
  }
  if (value >= 10) {
    return { key: 'up', label: '增长' };
  }
  if (value <= -30) {
    return { key: 'severeDown', label: '严重下降' };
  }
  if (value <= -10) {
    return { key: 'down', label: '下降' };
  }
  return { key: 'stable', label: '稳定' };
}

function getComparisonLabel(value: number, teamAverage: number) {
  const diff = value - teamAverage;
  if (Math.abs(diff) < 1) {
    return '接近团队平均';
  }
  return `${diff > 0 ? '高于团队' : '低于团队'} ${formatRate(diff)}`;
}

function normalizeStoreName(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim().toLowerCase();
}

function normalizeStorePlatform(value: unknown): StorePlatform {
  const platform = String(value ?? '').trim();
  return ['TEMU', '1688', 'Amazon', 'TikTok', 'Shopify', 'Other'].includes(platform)
    ? platform as StorePlatform
    : 'Other';
}

function getPrimaryOperator(
  store: StoreRecord,
  relations: StoreOperatorRelation[],
  operators: OperatorRecord[],
) {
  const relation = relations.find((item) =>
    item.status === 'active' &&
    item.role === 'primary' &&
    (item.storeId === store.id || item.storeName === store.storeName),
  );
  const operator = relation ? operators.find((item) => item.id === relation.operatorId) : undefined;
  return operator?.operatorName || relation?.operatorName || '未绑定运营';
}

function addToDaily(
  map: Map<string, Map<string, number>>,
  storeId: string,
  date: string,
  value: number,
) {
  const storeMap = map.get(storeId) ?? new Map<string, number>();
  storeMap.set(date, (storeMap.get(date) ?? 0) + value);
  map.set(storeId, storeMap);
}

function setDaily(
  map: Map<string, Map<string, number>>,
  storeId: string,
  date: string,
  value: number,
) {
  const storeMap = map.get(storeId) ?? new Map<string, number>();
  storeMap.set(date, value);
  map.set(storeId, storeMap);
}

function getEffectiveListingStoreId(
  item: EffectiveNewListingRecord,
  resolveStoreKey: (storeName: string) => { storeId: string; storeName: string },
) {
  const storeId = String(item.storeId ?? '').trim();
  if (storeId) {
    return {
      storeId,
      storeName: item.storeName || storeId,
    };
  }
  return resolveStoreKey(item.storeName ?? '');
}

function buildMetric(
  storeId: string,
  dailyMap: Map<string, Map<string, number>>,
  recentDates: string[],
  baselineDates: string[],
): Omit<StoreMetric, 'teamAverage' | 'rank'> {
  const values = dailyMap.get(storeId) ?? new Map<string, number>();
  const recentValues = recentDates.map((date) => values.get(date) ?? 0);
  const baselineValues = baselineDates.map((date) => values.get(date) ?? 0);
  const recentChartPoints = recentDates.flatMap((date) => values.has(date) ? [{ date, value: values.get(date) ?? 0 }] : []);
  const currentAvg = average(recentValues);
  const baselineAvg = average(baselineValues);
  const changeRate = calcChangeRate(currentAvg, baselineAvg);
  return {
    currentAvg,
    baselineAvg,
    changeRate,
    series: [...baselineDates.slice(-23), ...recentDates].map((date) => values.get(date) ?? 0),
    recentValues,
    recentDates,
    recentChartValues: recentChartPoints.map((item) => item.value),
    recentChartDates: recentChartPoints.map((item) => item.date),
    baselineValues,
    baselineDates,
    tone: getTone(changeRate),
  };
}

function getLatestDailyDate(storeId: string, dailyMaps: Array<Map<string, Map<string, number>>>) {
  return dailyMaps
    .flatMap((dailyMap) => Array.from(dailyMap.get(storeId)?.keys() ?? []))
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}

function getMetricDates(
  storeId: string,
  primaryMap: Map<string, Map<string, number>>,
  fallbackMaps: Array<Map<string, Map<string, number>>>,
) {
  const endDate = getLatestDailyDate(storeId, [primaryMap]) || getLatestDailyDate(storeId, fallbackMaps);
  if (!endDate) {
    return { recentDates: [], baselineDates: [] };
  }

  const recentDates = getDateRange(endDate, 7);
  return {
    recentDates,
    baselineDates: getDateRange(shiftDate(recentDates[0], -1), 30),
  };
}

function rankMetric(rows: StoreTrendRow[], key: TrendKey) {
  const sorted = [...rows].sort((first, second) => second.metrics[key].changeRate - first.metrics[key].changeRate);
  sorted.forEach((row, index) => {
    row.metrics[key].rank = index + 1;
  });
}

function buildStoreTrendRows(data: StoreBusinessData) {
  const storeMatcher = createStoreMatcher(data.stores);
  const resolveStoreKey = (storeName: string) => {
    const identity = storeMatcher.match(storeName);
    return {
      storeId: identity.storeId || identity.key,
      storeName: identity.storeName,
    };
  };
  const storeByName = new Map(data.stores.map((store) => [normalizeStoreName(store.storeName), store]));
  const storeMap = new Map<string, StoreRecord>();

  data.stores.forEach((store) => storeMap.set(store.id, store));
  data.orderDailyRecords.forEach((record) => {
    const resolved = resolveStoreKey(record.storeName);
    if (!storeMap.has(resolved.storeId)) {
      storeMap.set(resolved.storeId, {
        id: resolved.storeId,
        storeName: resolved.storeName,
        platform: 'Other',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      });
    }
  });
  data.effectiveNewListings.forEach((item) => {
    const resolved = getEffectiveListingStoreId(item, resolveStoreKey);
    if (!storeMap.has(resolved.storeId)) {
      storeMap.set(resolved.storeId, {
        id: resolved.storeId,
        storeName: resolved.storeName,
        platform: normalizeStorePlatform(item.platform),
        status: 'active',
        createdAt: '',
        updatedAt: '',
      });
    }
  });

  const sales = new Map<string, Map<string, number>>();
  const firstOrders = new Map<string, Map<string, number>>();
  const newProducts = new Map<string, Map<string, number>>();
  const traffic = new Map<string, Map<string, number>>();
  const conversion = new Map<string, Map<string, number>>();
  const effectiveListingKeys = new Set<string>();

  data.orderDailyRecords.forEach((record) => {
    const resolved = resolveStoreKey(record.storeName);
    addToDaily(sales, resolved.storeId, record.orderDate, Number(record.salesAmount) || 0);
    addToDaily(firstOrders, resolved.storeId, record.orderDate, Number(record.firstOrderCount) || 0);
  });

  data.effectiveNewListings.forEach((item) => {
    const date = String(item.siteJoinDate || '').slice(0, 10);
    const skc = String(item.skc ?? '').trim().toLowerCase();
    if (!date || !skc) {
      return;
    }
    const resolved = getEffectiveListingStoreId(item, resolveStoreKey);
    const uniqueKey = `${resolved.storeId}|${date}|${skc}`;
    if (effectiveListingKeys.has(uniqueKey)) {
      return;
    }
    effectiveListingKeys.add(uniqueKey);
    addToDaily(newProducts, resolved.storeId, date, 1);
  });

  data.trafficRecords.forEach((record) => {
    const store = record.storeId
      ? data.stores.find((item) => item.id === record.storeId)
      : storeByName.get(normalizeStoreName(record.storeName));
    const storeId = store?.id || resolveStoreKey(record.storeName).storeId;
    const visitorValue = Number(record.totalVisitors || record.productVisitors || 0);
    const conversionValue = Number(record.totalPayConversionRate || record.detailPayConversionRate || 0);
    addToDaily(traffic, storeId, record.date, visitorValue);
    setDaily(conversion, storeId, record.date, conversionValue);
  });

  const nextRows: StoreTrendRow[] = Array.from(storeMap.values()).map((store) => {
    const orderFallbackMaps = [newProducts, traffic, conversion];
    const trafficFallbackMaps = [sales, firstOrders, newProducts];
    const listingFallbackMaps = [sales, firstOrders, traffic, conversion];
    const newProductDates = getMetricDates(store.id, newProducts, listingFallbackMaps);
    const firstOrderDates = getMetricDates(store.id, firstOrders, orderFallbackMaps);
    const salesDates = getMetricDates(store.id, sales, orderFallbackMaps);
    const trafficDates = getMetricDates(store.id, traffic, trafficFallbackMaps);
    const conversionDates = getMetricDates(store.id, conversion, trafficFallbackMaps);
    const metrics = {
      newProduct: { ...buildMetric(store.id, newProducts, newProductDates.recentDates, newProductDates.baselineDates), teamAverage: 0, rank: 0 },
      firstOrder: { ...buildMetric(store.id, firstOrders, firstOrderDates.recentDates, firstOrderDates.baselineDates), teamAverage: 0, rank: 0 },
      sales: { ...buildMetric(store.id, sales, salesDates.recentDates, salesDates.baselineDates), teamAverage: 0, rank: 0 },
      traffic: { ...buildMetric(store.id, traffic, trafficDates.recentDates, trafficDates.baselineDates), teamAverage: 0, rank: 0 },
      conversion: { ...buildMetric(store.id, conversion, conversionDates.recentDates, conversionDates.baselineDates), teamAverage: 0, rank: 0 },
    };
    return {
      storeId: store.id,
      storeName: store.storeName,
      platform: store.platform,
      operatorName: getPrimaryOperator(store, data.relations, data.operators),
      metrics,
      score: trendConfigs.reduce((total, config) => total + metrics[config.key].changeRate, 0),
    };
  });

  trendConfigs.forEach((config) => {
    const teamAverage = average(nextRows.map((row) => row.metrics[config.key].changeRate));
    nextRows.forEach((row) => {
      row.metrics[config.key].teamAverage = teamAverage;
    });
    rankMetric(nextRows, config.key);
  });

  return nextRows.sort((first, second) => second.score - first.score || first.storeName.localeCompare(second.storeName));
}

function mergeGlobalRankingRows(visibleRows: StoreTrendRow[], globalRows: StoreTrendRow[]) {
  if (globalRows.length === 0) {
    return visibleRows;
  }

  const byStoreId = new Map(globalRows.map((row) => [row.storeId, row]));
  const byStoreName = new Map(globalRows.map((row) => [normalizeStoreName(row.storeName), row]));

  return visibleRows.map((row) => {
    const globalRow = byStoreId.get(row.storeId) ?? byStoreName.get(normalizeStoreName(row.storeName));
    if (!globalRow) {
      return row;
    }

    const metrics = { ...row.metrics };
    trendConfigs.forEach((config) => {
      metrics[config.key] = {
        ...metrics[config.key],
        rank: globalRow.metrics[config.key].rank,
        teamAverage: globalRow.metrics[config.key].teamAverage,
      };
    });

    return { ...row, metrics };
  });
}

function Sparkline({
  values,
  tone,
  percentValue = false,
  emptyText = '数据不足',
}: {
  values: number[];
  tone: TrendTone;
  percentValue?: boolean;
  emptyText?: string;
}) {
  const width = 96;
  const height = 30;

  if (values.length < 2) {
    return <div className="store-sparkline store-sparkline-empty">{emptyText}</div>;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minVisibleRange = percentValue ? 0.002 : 1;
  const visibleRange = Math.max(maxValue - minValue, minVisibleRange);
  const center = (maxValue + minValue) / 2;
  const min = center - visibleRange / 2;
  const max = center + visibleRange / 2;
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg className={`store-sparkline store-sparkline-${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="微趋势图">
      <polygon points={areaPoints} className="store-sparkline-area" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DetailTrendChart({ metric, config }: { metric: StoreMetric; config: typeof trendConfigs[number] }) {
  const width = 680;
  const height = 240;
  const padding = { top: 26, right: 28, bottom: 44, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = metric.recentChartValues;

  if (values.length < 2) {
    return (
      <div className="store-detail-chart store-detail-chart-empty">
        数据不足
      </div>
    );
  }

  const valueRange = [...values, metric.baselineAvg];
  const minValue = Math.min(...valueRange);
  const maxValue = Math.max(...valueRange);
  const minVisibleRange = config.percentValue ? 0.002 : 1;
  const rawRange = maxValue - minValue;
  const visibleRange = Math.max(rawRange, minVisibleRange);
  const center = (maxValue + minValue) / 2;
  const yMin = center - visibleRange / 2 - visibleRange * 0.18;
  const yMax = center + visibleRange / 2 + visibleRange * 0.18;
  const yRange = yMax - yMin || 1;
  const toX = (index: number) => padding.left + (values.length <= 1 ? 0 : (index / (values.length - 1)) * chartWidth);
  const toY = (value: number) => padding.top + chartHeight - ((value - yMin) / yRange) * chartHeight;
  const points = values.map((value, index) => `${toX(index).toFixed(1)},${toY(value).toFixed(1)}`).join(' ');
  const areaPoints = `${padding.left},${padding.top + chartHeight} ${points} ${padding.left + chartWidth},${padding.top + chartHeight}`;
  const baselineY = toY(metric.baselineAvg);

  return (
    <svg className={`store-detail-chart store-sparkline-${metric.tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${config.label}放大趋势图`}>
      <line x1={padding.left} y1={baselineY} x2={padding.left + chartWidth} y2={baselineY} className="store-detail-baseline" />
      <text x={padding.left + chartWidth - 118} y={Math.max(14, baselineY - 8)} className="store-detail-chart-label">
        前30日均值 {formatMetricValue(metric.baselineAvg, config)}
      </text>
      <polygon points={areaPoints} className="store-sparkline-area" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => (
        <g key={`${metric.recentDates[index] ?? index}-${value}`}>
          <circle cx={toX(index)} cy={toY(value)} r="4.2" className="store-detail-point" />
          <text x={toX(index)} y={toY(value) - 10} textAnchor="middle" className="store-detail-chart-value">
            {formatMetricValue(value, config)}
          </text>
          <text x={toX(index)} y={height - 14} textAnchor="middle" className="store-detail-chart-date">
            {(metric.recentChartDates[index] ?? '').slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MetricPanel({
  config,
  metric,
  teamSize,
  onExpand,
  enlarged = false,
}: {
  config: typeof trendConfigs[number];
  metric: StoreMetric;
  teamSize: number;
  onExpand?: () => void;
  enlarged?: boolean;
}) {
  const status = getStatus(metric.changeRate);
  return (
    <div className={`store-metric store-metric-${status.key}${enlarged ? ' store-metric-large' : ''}`}>
      <header>
        <span>{config.label}</span>
        <div>
          <em>{status.label}</em>
          {onExpand && (
            <button type="button" className="store-metric-expand" onClick={onExpand}>
              查看详情
            </button>
          )}
        </div>
      </header>
      <strong className={`store-trend-value store-trend-value-${metric.tone}`}>
        {metric.tone === 'up' ? '↑' : metric.tone === 'down' ? '↓' : '→'} {formatRate(metric.changeRate)}
      </strong>
      <b>排名 {metric.rank}/{teamSize}</b>
      <Sparkline
        values={config.key === 'conversion' ? metric.recentChartValues : metric.series}
        tone={metric.tone}
        percentValue={config.percentValue}
      />
      <div className="store-metric-meta">
        <span>最近7日 {formatMetricValue(metric.currentAvg, config)}</span>
        <span>前30日 {formatMetricValue(metric.baselineAvg, config)}</span>
      </div>
      <footer>
        <span>团队平均 {formatRate(metric.teamAverage)}</span>
        <strong>{getComparisonLabel(metric.changeRate, metric.teamAverage)}</strong>
      </footer>
    </div>
  );
}

function StoreBusinessCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const [selectedMetric, setSelectedMetric] = useState<{
    row: StoreTrendRow;
    config: typeof trendConfigs[number];
  } | null>(null);
  const [data, setData] = useState<StoreBusinessData>({
    stores: [],
    orderDailyRecords: [],
    trafficRecords: [],
    effectiveNewListings: [],
    relations: [],
    operators: [],
  });
  const [rankingData, setRankingData] = useState<StoreBusinessData>({
    stores: [],
    orderDailyRecords: [],
    trafficRecords: [],
    effectiveNewListings: [],
    relations: [],
    operators: [],
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      referenceDataService.loadCompanyStores(),
      fetchJson<StoreBusinessOrderDailyResponse>('/api/persistent-data/orderImportStore?view=store-business-daily&recentDays=37', { records: [] }),
      fetchJson<StoreBusinessTrafficResponse>('/api/persistent-data/trafficConversionStore?view=store-business-traffic&recentDays=37', { records: [] }),
      fetchJson<EffectiveNewListingRecord[]>('/api/effective-new-listings', []),
      referenceDataService.loadCompanyStoreOperatorRelations(),
      referenceDataService.loadCompanyOperators(),
      fetchJson<StoreBusinessOrderDailyResponse>('/api/persistent-data/orderImportStore?view=store-business-daily&recentDays=37&scope=company-dashboard', { records: [] }),
      fetchJson<StoreBusinessTrafficResponse>('/api/persistent-data/trafficConversionStore?view=store-business-traffic&recentDays=37&scope=company-dashboard', { records: [] }),
      fetchJson<EffectiveNewListingRecord[]>('/api/effective-new-listings?scope=company-dashboard', []),
    ]).then(([
      companyStores,
      orderStore,
      trafficStore,
      effectiveNewListings,
      companyRelations,
      companyOperators,
      rankingOrderStore,
      rankingTrafficStore,
      rankingEffectiveNewListings,
    ]) => {
      if (!cancelled) {
        const visibleStores = getVisibleStores(currentUser, companyStores, companyOperators, companyRelations);
        setData({
          stores: visibleStores,
          orderDailyRecords: orderStore.records,
          trafficRecords: trafficStore.records ?? [],
          effectiveNewListings,
          relations: companyRelations,
          operators: companyOperators,
        });
        setRankingData({
          stores: companyStores,
          orderDailyRecords: rankingOrderStore.records,
          trafficRecords: rankingTrafficStore.records ?? [],
          effectiveNewListings: rankingEffectiveNewListings,
          relations: companyRelations,
          operators: companyOperators,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const visibleRows = useMemo(() => buildStoreTrendRows(data), [data]);
  const globalRows = useMemo(() => buildStoreTrendRows(rankingData), [rankingData]);
  const rows = useMemo(() => mergeGlobalRankingRows(visibleRows, globalRows), [visibleRows, globalRows]);
  const teamSize = globalRows.length || rows.length || 1;
  const isAdmin = currentUser.role === 'admin';
  const useLargeLayout = !isAdmin && rows.length <= 4;

  return (
    <section className={`store-business-page${useLargeLayout ? ' store-business-page-large' : ''}`}>
      <section className="store-business-hero">
        <div>
          <span>店铺经营趋势分析中心</span>
          <h2>店铺经营中心</h2>
        </div>
        <strong>{rows.length} 家店铺</strong>
      </section>

      <section className="store-card-list">
        {rows.map((row) => (
          <article key={row.storeId} className="store-business-card">
            <header className="store-card-identity">
              <div>
                <strong>{row.storeName}</strong>
                <span>{row.platform || 'Other'} · {row.operatorName}</span>
              </div>
              <em>{getStatus(Math.min(...trendConfigs.map((config) => row.metrics[config.key].changeRate))).label}</em>
            </header>
            <section className="store-metric-grid">
              {trendConfigs.map((config) => {
                const metric = row.metrics[config.key];
                return (
                  <MetricPanel
                    key={config.key}
                    config={config}
                    metric={metric}
                    teamSize={teamSize}
                    onExpand={() => setSelectedMetric({ row, config })}
                  />
                );
              })}
            </section>
          </article>
        ))}
        {rows.length === 0 && (
          <article className="store-business-empty">暂无可见店铺经营趋势数据</article>
        )}
      </section>

      {selectedMetric && (
        <div className="store-detail-modal" role="dialog" aria-modal="true" aria-label="指标趋势详情">
          <div className="store-detail-backdrop" onClick={() => setSelectedMetric(null)} />
          <article className="store-detail-card">
            <header>
              <div>
                <span>单项趋势详情</span>
                <h3>{selectedMetric.row.storeName} · {selectedMetric.config.label}详情</h3>
                <p>{selectedMetric.row.platform || 'Other'} · {selectedMetric.row.operatorName}</p>
              </div>
              <button type="button" className="store-expand-button" onClick={() => setSelectedMetric(null)}>
                关闭
              </button>
            </header>
            <section className="store-single-detail">
              <MetricPanel
                config={selectedMetric.config}
                metric={selectedMetric.row.metrics[selectedMetric.config.key]}
                teamSize={teamSize}
                enlarged
              />
              <article className="store-detail-chart-panel">
                <DetailTrendChart
                  metric={selectedMetric.row.metrics[selectedMetric.config.key]}
                  config={selectedMetric.config}
                />
                <div className="store-detail-daily-list">
                  <strong>最近7日原始每日数据</strong>
                  {selectedMetric.row.metrics[selectedMetric.config.key].recentValues.map((value, index) => (
                    <span key={`${selectedMetric.row.metrics[selectedMetric.config.key].recentDates[index]}-${value}`}>
                      {selectedMetric.row.metrics[selectedMetric.config.key].recentDates[index]}：{formatMetricValue(value, selectedMetric.config)}
                    </span>
                  ))}
                </div>
              </article>
            </section>
          </article>
        </div>
      )}
    </section>
  );
}

export default StoreBusinessCenterPage;
