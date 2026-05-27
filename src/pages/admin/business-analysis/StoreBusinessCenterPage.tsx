import { useEffect, useMemo, useState } from 'react';
import { orderImportStorageDataSource } from '../../../data-source/orderImportStorageDataSource';
import type { CurrentUser } from '../../../types/auth';
import type { OperatorRecord } from '../../../types/operator';
import type { TemuOrderDetail } from '../../../types/order';
import type { StoreRecord } from '../../../types/store';
import type { StoreOperatorRelation } from '../../../types/storeOperator';
import type { TrafficConversionRecord, TrafficConversionStore } from '../../../types/traffic';
import { createStoreMatcher } from '../../../utils/storeStandardization';

type TrendKey = 'newProduct' | 'firstOrder' | 'sales' | 'traffic' | 'conversion';
type TrendTone = 'up' | 'down' | 'flat';

interface StoreMetric {
  currentAvg: number;
  baselineAvg: number;
  changeRate: number;
  teamAverage: number;
  rank: number;
  series: number[];
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
  orders: TemuOrderDetail[];
  trafficRecords: TrafficConversionRecord[];
  relations: StoreOperatorRelation[];
  operators: OperatorRecord[];
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

function normalizeStoreName(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim().toLowerCase();
}

function getProductKey(order: TemuOrderDetail) {
  return [order.productSku, order.skuCode, order.skcCode, order.skc, order.productName]
    .map((value) => String(value ?? '').trim())
    .find(Boolean) || '';
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

function getOrderStoreId(order: TemuOrderDetail, resolveStoreKey: (storeName: string) => { storeId: string; storeName: string }) {
  const storeId = String((order as TemuOrderDetail & { storeId?: string }).storeId ?? '').trim();
  if (storeId) {
    return {
      storeId,
      storeName: order.storeName || storeId,
    };
  }
  return resolveStoreKey(order.storeName);
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
  const currentAvg = average(recentValues);
  const baselineAvg = average(baselineValues);
  const changeRate = calcChangeRate(currentAvg, baselineAvg);
  return {
    currentAvg,
    baselineAvg,
    changeRate,
    series: [...baselineDates.slice(-23), ...recentDates].map((date) => values.get(date) ?? 0),
    tone: getTone(changeRate),
  };
}

function rankMetric(rows: StoreTrendRow[], key: TrendKey) {
  const sorted = [...rows].sort((first, second) => second.metrics[key].changeRate - first.metrics[key].changeRate);
  sorted.forEach((row, index) => {
    row.metrics[key].rank = index + 1;
  });
}

function Sparkline({ values, tone }: { values: number[]; tone: TrendTone }) {
  const width = 96;
  const height = 30;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg className={`store-sparkline store-sparkline-${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="微趋势图">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StoreBusinessCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const [data, setData] = useState<StoreBusinessData>({
    stores: [],
    orders: [],
    trafficRecords: [],
    relations: [],
    operators: [],
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson<StoreRecord[]>('/api/stores', []),
      orderImportStorageDataSource.loadRecentStore({ recentDays: 37, limit: 20000 }),
      fetchJson<TrafficConversionStore>('/api/persistent-data/trafficConversionStore', { records: [], batches: [] }),
      fetchJson<StoreOperatorRelation[]>('/api/store-operator-relations', []),
      fetchJson<OperatorRecord[]>('/api/operators', []),
    ]).then(([stores, orderStore, trafficStore, relations, operators]) => {
      if (!cancelled) {
        setData({
          stores,
          orders: orderStore.batches.flatMap((batch) => batch.orders ?? []),
          trafficRecords: trafficStore.records ?? [],
          relations,
          operators,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const rows = useMemo(() => {
    const dateCandidates = [
      ...data.orders.map((order) => String(order.orderDate || order.orderTime || '').slice(0, 10)),
      ...data.trafficRecords.map((record) => record.date),
    ].filter(Boolean).sort();
    const latestDate = dateCandidates.at(-1) || formatDateKey(new Date());
    const recentDates = getDateRange(latestDate, 7);
    const baselineDates = getDateRange(shiftDate(recentDates[0], -1), 30);
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
    data.orders.forEach((order) => {
      const resolved = getOrderStoreId(order, resolveStoreKey);
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

    const sales = new Map<string, Map<string, number>>();
    const firstOrders = new Map<string, Map<string, number>>();
    const newProducts = new Map<string, Map<string, number>>();
    const traffic = new Map<string, Map<string, number>>();
    const conversion = new Map<string, Map<string, number>>();
    const productFirstDate = new Map<string, { storeId: string; date: string }>();

    data.orders.forEach((order) => {
      const resolved = getOrderStoreId(order, resolveStoreKey);
      const date = String(order.orderDate || order.orderTime || '').slice(0, 10);
      addToDaily(sales, resolved.storeId, date, Number(order.salesAmount) || 0);
      if (order.isFirstOrder) {
        addToDaily(firstOrders, resolved.storeId, date, 1);
      }
      const productKey = getProductKey(order);
      const uniqueKey = productKey ? `${resolved.storeId}|${productKey}` : '';
      const current = uniqueKey ? productFirstDate.get(uniqueKey) : undefined;
      if (uniqueKey && (!current || date < current.date)) {
        productFirstDate.set(uniqueKey, { storeId: resolved.storeId, date });
      }
    });

    productFirstDate.forEach(({ storeId, date }) => addToDaily(newProducts, storeId, date, 1));

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
      const metrics = {
        newProduct: { ...buildMetric(store.id, newProducts, recentDates, baselineDates), teamAverage: 0, rank: 0 },
        firstOrder: { ...buildMetric(store.id, firstOrders, recentDates, baselineDates), teamAverage: 0, rank: 0 },
        sales: { ...buildMetric(store.id, sales, recentDates, baselineDates), teamAverage: 0, rank: 0 },
        traffic: { ...buildMetric(store.id, traffic, recentDates, baselineDates), teamAverage: 0, rank: 0 },
        conversion: { ...buildMetric(store.id, conversion, recentDates, baselineDates), teamAverage: 0, rank: 0 },
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
  }, [data]);

  const overview = useMemo(() => trendConfigs.map((config) => {
    const teamAverage = average(rows.map((row) => row.metrics[config.key].changeRate));
    const series = rows.length === 0
      ? []
      : rows[0].metrics[config.key].series.map((_, index) => average(rows.map((row) => row.metrics[config.key].series[index] ?? 0)));
    return { ...config, teamAverage, tone: getTone(teamAverage), series };
  }), [rows]);

  const teamSize = rows.length || 1;

  return (
    <section className="store-business-page">
      <section className="store-business-hero">
        <div>
          <span>店铺经营趋势分析中心</span>
          <h2>店铺经营中心</h2>
        </div>
        <strong>{rows.length} 家店铺</strong>
      </section>

      <section className="store-trend-overview">
        {overview.map((item) => (
          <article key={item.key} className={`store-trend-summary store-trend-${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.tone === 'up' ? '↑' : item.tone === 'down' ? '↓' : '→'} {formatRate(item.teamAverage)}</strong>
            <small>最近7日 vs 前30日</small>
            <Sparkline values={item.series} tone={item.tone} />
          </article>
        ))}
      </section>

      <section className="store-card-list">
        {rows.map((row) => (
          <article key={row.storeId} className="store-business-card">
            <aside className="store-card-identity">
              <strong>{row.storeName}</strong>
              <span>{row.platform || 'Other'}</span>
              <em>{row.operatorName}</em>
            </aside>
            <section className="store-metric-grid">
              {trendConfigs.map((config) => {
                const metric = row.metrics[config.key];
                return (
                  <div key={config.key} className={`store-metric store-trend-${metric.tone}`}>
                    <header>
                      <span>{config.label}</span>
                      <strong>{metric.tone === 'up' ? '↑' : metric.tone === 'down' ? '↓' : '→'} {formatRate(metric.changeRate)}</strong>
                    </header>
                    <Sparkline values={metric.series} tone={metric.tone} />
                    <div className="store-metric-meta">
                      <span>7日 {formatMetricValue(metric.currentAvg, config)}</span>
                      <span>30日 {formatMetricValue(metric.baselineAvg, config)}</span>
                    </div>
                    <footer>
                      <span>团队 {formatRate(metric.teamAverage)}</span>
                      <b>{metric.rank}/{teamSize}</b>
                    </footer>
                  </div>
                );
              })}
            </section>
          </article>
        ))}
        {rows.length === 0 && (
          <article className="store-business-empty">暂无可见店铺经营趋势数据</article>
        )}
      </section>
    </section>
  );
}

export default StoreBusinessCenterPage;
