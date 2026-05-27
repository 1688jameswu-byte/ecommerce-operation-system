import { useEffect, useMemo, useState } from 'react';
import type { CurrentUser } from '../../../types/auth';
import type { TrafficAnalysisItem, TrafficAnalysisResultStore } from '../../../types/traffic';
import { filterRecordsByPermission } from '../../../utils/permissionScope';

type StoreRow = {
  storeName: string;
  latestDate: string;
  visitorAvg: number;
  conversionAvg: number;
  buyerAvg: number;
  riskCount: number;
  growthCount: number;
  maxDrop: number;
  maxGrowth: number;
};

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

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-';
}

function formatPercent(value: number) {
  return `${formatNumber(value)}%`;
}

function pickMetric(row: StoreRow, item: TrafficAnalysisItem) {
  if (item.metricField === 'productVisitors') {
    row.visitorAvg = item.recent7Avg;
  }
  if (item.metricField === 'detailPayConversionRate') {
    row.conversionAvg = item.recent7Avg * 100;
  }
  if (item.metricField === 'totalPayBuyers') {
    row.buyerAvg = item.recent7Avg;
  }
}

function StoreBusinessCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const [items, setItems] = useState<TrafficAnalysisItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<TrafficAnalysisResultStore<TrafficAnalysisItem>>('/api/persistent-data/businessAnalysisItems', { items: [], updatedAt: '' })
      .then((store) => {
        if (!cancelled) {
          setItems(filterRecordsByPermission(store.items ?? [], currentUser));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const rows = useMemo(() => {
    const byStore = new Map<string, StoreRow>();
    items.forEach((item) => {
      const key = item.storeName || '未识别店铺';
      const row = byStore.get(key) ?? {
        storeName: key,
        latestDate: '',
        visitorAvg: 0,
        conversionAvg: 0,
        buyerAvg: 0,
        riskCount: 0,
        growthCount: 0,
        maxDrop: 0,
        maxGrowth: 0,
      };
      row.latestDate = row.latestDate > item.date ? row.latestDate : item.date;
      if (item.resultType === 'risk') {
        row.riskCount += 1;
        row.maxDrop = Math.max(row.maxDrop, item.changeRate);
      }
      if (item.resultType === 'opportunity') {
        row.growthCount += 1;
        row.maxGrowth = Math.max(row.maxGrowth, item.changeRate);
      }
      pickMetric(row, item);
      byStore.set(key, row);
    });
    return Array.from(byStore.values()).sort((first, second) =>
      second.riskCount - first.riskCount || second.maxDrop - first.maxDrop || first.storeName.localeCompare(second.storeName),
    );
  }, [items]);

  const riskStoreCount = rows.filter((row) => row.riskCount > 0).length;
  const growthStoreCount = rows.filter((row) => row.growthCount > 0).length;
  const maxDropRow = rows.reduce<StoreRow | undefined>((current, row) => (
    !current || row.maxDrop > current.maxDrop ? row : current
  ), undefined);

  return (
    <section className="excel-import-page">
      <section className="import-overview-grid">
        <article><span>分析店铺</span><strong>{rows.length}</strong></article>
        <article><span>风险店铺</span><strong>{riskStoreCount}</strong></article>
        <article><span>增长店铺</span><strong>{growthStoreCount}</strong></article>
        <article><span>最大下降</span><strong>{maxDropRow ? `${maxDropRow.storeName} ${formatPercent(maxDropRow.maxDrop)}` : '-'}</strong></article>
      </section>

      <article className="excel-record-panel operator-performance-panel">
        <header>
          <div>
            <h2>店铺经营趋势</h2>
            <p>按当前账号可见店铺汇总流量、转化、成交、风险和增长机会。</p>
          </div>
          <span>{rows.length} 家</span>
        </header>
        <div className="import-record-table-wrap operator-performance-table-wrap">
          <table className="import-record-table operator-performance-table">
            <thead>
              <tr>
                <th>店铺</th>
                <th>最新日期</th>
                <th>访客7日均值</th>
                <th>转化率7日均值</th>
                <th>支付买家7日均值</th>
                <th>风险项</th>
                <th>增长项</th>
                <th>最大下降</th>
                <th>最大增长</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.storeName}>
                  <td><strong>{row.storeName}</strong></td>
                  <td>{row.latestDate || '-'}</td>
                  <td>{formatNumber(row.visitorAvg)}</td>
                  <td>{formatPercent(row.conversionAvg)}</td>
                  <td>{formatNumber(row.buyerAvg)}</td>
                  <td>{row.riskCount}</td>
                  <td>{row.growthCount}</td>
                  <td>{formatPercent(row.maxDrop)}</td>
                  <td>{formatPercent(row.maxGrowth)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9}>暂无可见店铺经营分析数据</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export default StoreBusinessCenterPage;
