import { useEffect, useMemo, useState } from 'react';
import type { CurrentUser } from '../../../types/auth';
import type { StoreRecord } from '../../../types/store';
import type { OperatorRecord } from '../../../types/operator';

type KpiCard = {
  key: string;
  name: string;
  weight: number;
  targetValue: number | null;
  currentValue: number | null;
  completionRate: number | null;
  score: number | null;
  status: string;
  unit: string;
};

type WorkbenchAction = {
  priority: '高' | '中' | '低';
  title: string;
  kpi: string;
  impact: string;
  actionLabel: string;
  actionHref: string;
};

type ProductFollowUp = {
  skc: string;
  storeName: string;
  operatorName: string;
  siteJoinDate: string;
  daysOnline: number;
  firstOrderStatus: string;
  firstOrderDate: string;
  salesQuantity: number;
  suggestedAction: string;
};

type KpiTarget = {
  id?: string;
  period: string;
  operatorId: string;
  operatorName: string;
  storeId: string;
  storeName: string;
  salesTarget: number;
  effectiveListingTarget: number;
  firstOrderProductTarget: number;
  expenseRatioTarget: number;
  enabled: boolean;
  remark: string;
  updatedAt?: string;
};

type WorkbenchData = {
  filters: {
    period: string;
    canManage: boolean;
    operators: OperatorRecord[];
    stores: StoreRecord[];
    operatorStoreMap: Record<string, string[]>;
    selectedOperatorId: string;
    selectedStoreId: string;
  };
  dataUpdatedAt: string;
  dataIntegrityStatus: string;
  dataSourceMapping: Array<{ kpi: string; source: string; endpoint: string; confirmed: string }>;
  kpiSummary: { totalScore: number | null; scoreText: string; cards: KpiCard[] };
  todayActions: WorkbenchAction[];
  salesKpi: {
    salesTarget: number | null;
    salesAmount: number;
    completionRate: number | null;
    timeProgress: number;
    progressGap: number | null;
    remainingSales: number | null;
    requiredDailySales: number | null;
    orderCount: number;
    quantity: number;
    storeBreakdown: Array<{ storeName: string; salesAmount: number; orderCount: number }>;
  };
  listingKpi: {
    target: number | null;
    completed: number;
    todayCompleted: number;
    remaining: number | null;
    todaySuggested: number | null;
    completionRate: number | null;
  };
  firstOrderKpi: {
    target: number | null;
    completed: number;
    completionRate: number | null;
    effectiveListingCount: number;
    firstOrderRate: number | null;
    over7NoFirstOrder: number;
  };
  expenseKpi: {
    salesAmount: number;
    adExpense: number;
    afterSaleExpense: number;
    totalExpense: number;
    expenseRatio: number | null;
    adRatio: number | null;
    afterSaleRatio: number | null;
    targetRatio: number | null;
    overTargetRatio: number | null;
    storeBreakdown: Array<{ storeNames: string[]; operatorName: string; operationExpenseAmount: number; operationExpenseRate: number | null }>;
    hasExpenseData: boolean;
  };
  productFollowUps: ProductFollowUp[];
  dataIntegrityWarnings: string[];
};

const defaultTarget: KpiTarget = {
  period: '',
  operatorId: '',
  operatorName: '',
  storeId: '',
  storeName: '',
  salesTarget: 0,
  effectiveListingTarget: 0,
  firstOrderProductTarget: 0,
  expenseRatioTarget: 0.12,
  enabled: true,
  remark: '',
};

function calculateFirstOrderProductTarget(effectiveListingTarget: number, ratePercent: number) {
  const effectiveTarget = Number.isFinite(effectiveListingTarget) ? Math.max(0, effectiveListingTarget) : 0;
  const normalizedRate = Number.isFinite(ratePercent) ? Math.max(0, ratePercent) : 0;
  return Math.round(effectiveTarget * normalizedRate / 100);
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number | null | undefined, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}${unit}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeKey(value: string | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

function formatCardValue(card: KpiCard, value: number | null) {
  if (card.unit === '¥') return formatAmount(value);
  if (card.unit === '%') return formatPercent(value);
  return formatNumber(value, card.unit);
}

function statusClass(status: string) {
  if (status.includes('严重') || status.includes('缺失')) return 'danger';
  if (status.includes('落后') || status.includes('超标') || status.includes('未设置')) return 'warning';
  return 'ok';
}

function KpiSummaryCards({ data }: { data: WorkbenchData }) {
  return (
    <section className="workbench-summary">
      <article className="workbench-score">
        <span>本月综合 KPI</span>
        <strong>{data.kpiSummary.scoreText}</strong>
        <small>按本月销售额、上新商品数、首单商品数、费用占比四项加权计算</small>
      </article>
      {data.kpiSummary.cards.map((card) => (
        <article className="workbench-kpi-card" key={card.key}>
          <header>
            <div>
              <span>{card.name}</span>
              <small>权重 {card.weight}%</small>
            </div>
            <b className={`workbench-status ${statusClass(card.status)}`}>{card.status}</b>
          </header>
          <strong className="workbench-kpi-main">{formatCardValue(card, card.currentValue)}</strong>
          <div className="workbench-progress" aria-label={`${card.name}完成进度`}>
            <i style={{ width: `${Math.min(Math.max((card.completionRate ?? 0) * 100, 0), 100)}%` }} />
          </div>
          <div className="workbench-kpi-values">
            <span>目标<strong>{formatCardValue(card, card.targetValue)}</strong></span>
            <span>完成率<strong>{formatPercent(card.completionRate)}</strong></span>
            <span>得分<strong>{card.score === null ? '-' : `${card.score.toFixed(1)} / ${card.weight}`}</strong></span>
          </div>
        </article>
      ))}
    </section>
  );
}

function TodayKpiActions({ actions }: { actions: WorkbenchAction[] }) {
  return (
    <article className="excel-record-panel workbench-panel">
      <header><h2>今日重点工作</h2><span>{actions.length} 项</span></header>
      <div className="workbench-action-list">
        {actions.map((item) => (
          <section className="workbench-action-row" key={`${item.kpi}-${item.title}`}>
            <b className={`priority-${item.priority}`}>{item.priority}</b>
            <div className="workbench-action-main">
              <strong>{item.title}</strong>
              <span>{item.impact}</span>
            </div>
            <em>{item.kpi}</em>
            <a href={item.actionHref}>{item.actionLabel}</a>
          </section>
        ))}
        {actions.length === 0 && <div className="admin-home-empty">当前 KPI 没有明显落后项，继续保持日常节奏。</div>}
      </div>
    </article>
  );
}

function DetailPanels({ data }: { data: WorkbenchData }) {
  const panels = [
    {
      title: '本月销售额',
      rows: [
        ['本月动态销售目标', formatAmount(data.salesKpi.salesTarget)],
        ['当前实际销售额', formatAmount(data.salesKpi.salesAmount)],
        ['完成率', formatPercent(data.salesKpi.completionRate)],
        ['时间进度', formatPercent(data.salesKpi.timeProgress)],
        ['进度差距', formatPercent(data.salesKpi.progressGap)],
        ['剩余目标', formatAmount(data.salesKpi.remainingSales)],
        ['剩余日均需完成', formatAmount(data.salesKpi.requiredDailySales)],
      ],
    },
    {
      title: '上新商品数',
      rows: [
        ['本月有效上新目标', formatNumber(data.listingKpi.target, '款')],
        ['已完成有效上新数', formatNumber(data.listingKpi.completed, '款')],
        ['今日已完成', formatNumber(data.listingKpi.todayCompleted, '款')],
        ['还差', formatNumber(data.listingKpi.remaining, '款')],
        ['今日建议上新数', formatNumber(data.listingKpi.todaySuggested, '款')],
      ],
    },
    {
      title: '首单商品数',
      rows: [
        ['本月首单商品目标', formatNumber(data.firstOrderKpi.target, '款')],
        ['当前首单商品数', formatNumber(data.firstOrderKpi.completed, '款')],
        ['首单完成率', formatPercent(data.firstOrderKpi.completionRate)],
        ['本月有效上新数', formatNumber(data.firstOrderKpi.effectiveListingCount, '款')],
        ['首单率', formatPercent(data.firstOrderKpi.firstOrderRate)],
        ['超过7天未首单', formatNumber(data.firstOrderKpi.over7NoFirstOrder, '款')],
      ],
    },
    {
      title: '费用占比',
      rows: [
        ['销售额 / 流入金额', formatAmount(data.expenseKpi.salesAmount)],
        ['广告 / 推广费', formatAmount(data.expenseKpi.adExpense)],
        ['售后费用', formatAmount(data.expenseKpi.afterSaleExpense)],
        ['总费用', formatAmount(data.expenseKpi.totalExpense)],
        ['当前费用占比', data.expenseKpi.hasExpenseData ? formatPercent(data.expenseKpi.expenseRatio) : '暂无费用数据'],
        ['目标费用占比', formatPercent(data.expenseKpi.targetRatio)],
        ['超标比例', formatPercent(data.expenseKpi.overTargetRatio)],
      ],
    },
  ];

  return (
    <section className="workbench-detail-grid">
      {panels.map((panel) => (
        <article className="excel-record-panel workbench-panel workbench-metric-panel" key={panel.title}>
          <header><h2>{panel.title}</h2></header>
          <div className="workbench-detail-list">
            {panel.rows.map(([label, value]) => <span key={label}>{label}<strong>{value}</strong></span>)}
          </div>
        </article>
      ))}
    </section>
  );
}

function ProductFollowUpTable({ rows }: { rows: ProductFollowUp[] }) {
  const [filter, setFilter] = useState('all');
  const visibleRows = useMemo(() => rows.filter((row) => {
    if (filter === 'over7') return row.firstOrderStatus === '未首单' && row.daysOnline > 7;
    if (filter === 'firstOrder') return row.firstOrderStatus === '已首单';
    if (filter === 'new') return row.daysOnline <= 31;
    return true;
  }), [filter, rows]);

  return (
    <article className="excel-record-panel workbench-panel" id="product-follow-ups">
      <header>
        <h2>重点商品跟进</h2>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">全部</option>
          <option value="over7">超过7天未首单</option>
          <option value="firstOrder">已首单</option>
          <option value="new">本月新上</option>
        </select>
      </header>
      <div className="import-record-table-wrap">
        <table className="import-record-table">
          <thead>
            <tr>
              <th>SKC</th>
              <th>店铺</th>
              <th>运营</th>
              <th>加入站点时间</th>
              <th>上站天数</th>
              <th>首单状态</th>
              <th>首单日期</th>
              <th>销售件数</th>
              <th>建议动作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.skc}-${row.storeName}-${row.siteJoinDate}`}>
                <td><strong>{row.skc || '-'}</strong></td>
                <td>{row.storeName || '-'}</td>
                <td>{row.operatorName || '-'}</td>
                <td>{row.siteJoinDate || '-'}</td>
                <td>{row.daysOnline}</td>
                <td><span className={`workbench-table-status ${row.firstOrderStatus === '已首单' ? 'ok' : row.daysOnline > 7 ? 'danger' : 'warning'}`}>{row.firstOrderStatus}</span></td>
                <td>{row.firstOrderDate || '-'}</td>
                <td>{row.salesQuantity}</td>
                <td>{row.suggestedAction}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && <tr><td colSpan={9}>暂无符合条件的商品。</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DataIntegrityPanel({ data }: { data: WorkbenchData }) {
  return (
    <article className="excel-record-panel workbench-panel">
      <header><h2>数据完整性提醒</h2><span>{data.dataIntegrityStatus}</span></header>
      <div className="workbench-warning-list">
        {data.dataIntegrityWarnings.map((item) => <span className="warning" key={item}>{item}</span>)}
        {data.dataIntegrityWarnings.length === 0 && <span className="ok">订单、有效上新、费用和目标配置均已识别。</span>}
      </div>
      <div className="import-record-table-wrap">
        <table className="import-record-table">
          <thead><tr><th>KPI指标</th><th>数据来源</th><th>文件/接口</th><th>是否已确认</th></tr></thead>
          <tbody>
            {data.dataSourceMapping.map((item) => (
              <tr key={item.kpi}>
                <td>{item.kpi}</td>
                <td>{item.source}</td>
                <td>{item.endpoint}</td>
                <td>{item.confirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TargetEditor({ data, onSaved }: { data: WorkbenchData; onSaved: () => void }) {
  const [form, setForm] = useState<KpiTarget>({ ...defaultTarget, period: data.filters.period });
  const [firstOrderRateTarget, setFirstOrderRateTarget] = useState(0);
  const [message, setMessage] = useState('');
  const storeOptions = useMemo(() => {
    if (!form.operatorId) return data.filters.stores;
    const allowedStoreKeys = new Set(data.filters.operatorStoreMap?.[form.operatorId] ?? []);
    return data.filters.stores.filter((store) => allowedStoreKeys.has(store.id) || allowedStoreKeys.has(store.storeName));
  }, [data.filters.operatorStoreMap, data.filters.stores, form.operatorId]);

  if (!data.filters.canManage) return null;

  const save = async () => {
    setMessage('');
    const payload = {
      ...form,
      firstOrderProductTarget: calculateFirstOrderProductTarget(form.effectiveListingTarget, firstOrderRateTarget),
    };
    const response = await fetch('/api/operation-workbench/kpi-targets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '保存失败' })) as { message?: string };
      setMessage(error.message || '保存失败');
      return;
    }
    setMessage('目标已保存');
    onSaved();
  };

  return (
    <article className="excel-record-panel workbench-panel workbench-target-editor">
      <header><h2>KPI 目标配置</h2><span>管理员 / 主管可编辑</span></header>
      <section className="operator-form-grid">
        <label>月份<input type="month" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} /></label>
        <label>运营<select value={form.operatorId} onChange={(event) => {
          const operator = data.filters.operators.find((item) => item.id === event.target.value);
          setForm({ ...form, operatorId: event.target.value, operatorName: operator?.operatorName || '', storeId: '', storeName: '' });
        }}><option value="">全部运营</option>{data.filters.operators.map((item) => <option value={item.id} key={item.id}>{item.operatorName}</option>)}</select></label>
        <label>店铺<select value={form.storeId} onChange={(event) => {
          const store = storeOptions.find((item) => item.id === event.target.value);
          setForm({ ...form, storeId: event.target.value, storeName: store?.storeName || '' });
        }}><option value="">全部店铺</option>{storeOptions.map((item) => <option value={item.id} key={item.id}>{item.storeName}</option>)}</select></label>
        <label>销售额目标<input type="number" value={form.salesTarget} onChange={(event) => setForm({ ...form, salesTarget: Number(event.target.value) })} /></label>
        <label>有效上新目标<input type="number" value={form.effectiveListingTarget} onChange={(event) => {
          const effectiveListingTarget = Number(event.target.value);
          setForm({
            ...form,
            effectiveListingTarget,
            firstOrderProductTarget: calculateFirstOrderProductTarget(effectiveListingTarget, firstOrderRateTarget),
          });
        }} /></label>
        <label>首单率目标(%)<input type="number" min="0" max="100" step="0.1" value={firstOrderRateTarget} onChange={(event) => {
          const rateTarget = Number(event.target.value);
          setFirstOrderRateTarget(rateTarget);
          setForm({
            ...form,
            firstOrderProductTarget: calculateFirstOrderProductTarget(form.effectiveListingTarget, rateTarget),
          });
        }} /></label>
        <label>首单商品目标<input type="number" value={form.firstOrderProductTarget} readOnly /></label>
        <label>费用占比目标<input type="number" step="0.001" value={form.expenseRatioTarget} onChange={(event) => setForm({ ...form, expenseRatioTarget: Number(event.target.value) })} /></label>
        <label className="operator-form-wide">备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
      </section>
      <button type="button" className="import-primary-button" onClick={save}>保存目标</button>
      {message && <div className="excel-import-error">{message}</div>}
    </article>
  );
}

function KpiTargetLedger({ data, refreshKey }: { data: WorkbenchData; refreshKey: number }) {
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerPeriod, setLedgerPeriod] = useState(data.filters.period);

  useEffect(() => {
    setLoading(true);
    void fetchJson<{ records: KpiTarget[] }>('/api/operation-workbench/kpi-targets', { records: [] })
      .then((result) => setTargets(Array.isArray(result.records) ? result.records : []))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    setLedgerPeriod(data.filters.period);
  }, [data.filters.period]);

  if (!data.filters.canManage) return null;

  const operatorNameById = new Map(data.filters.operators.map((operator) => [String(operator.id), operator.operatorName]));
  const operatorNamesByStoreKey = new Map<string, string[]>();
  for (const operator of data.filters.operators) {
    const storeKeys = data.filters.operatorStoreMap?.[operator.id] ?? [];
    for (const storeKey of storeKeys) {
      const key = normalizeKey(storeKey);
      if (!key) continue;
      const names = operatorNamesByStoreKey.get(key) ?? [];
      if (!names.includes(operator.operatorName)) names.push(operator.operatorName);
      operatorNamesByStoreKey.set(key, names);
    }
  }

  const periodTargets = targets
    .filter((target) => target.enabled !== false && target.period === ledgerPeriod)
    .sort((first, second) => Date.parse(second.updatedAt || '') - Date.parse(first.updatedAt || ''));

  const rows = data.filters.stores.map((store) => {
    const storeKeys = [store.id, store.storeName].map(normalizeKey).filter(Boolean);
    const matched = periodTargets.find((target) => {
      const targetStoreKeys = [target.storeId, target.storeName].map(normalizeKey).filter(Boolean);
      const storeMatched = targetStoreKeys.some((key) => storeKeys.includes(key));
      if (!storeMatched) return false;
      if (!data.filters.selectedOperatorId) return true;
      return target.operatorId === data.filters.selectedOperatorId || target.operatorName === operatorNameById.get(data.filters.selectedOperatorId);
    });
    const firstOrderRate = matched?.effectiveListingTarget
      ? matched.firstOrderProductTarget / matched.effectiveListingTarget
      : null;
    const operatorNames = matched?.operatorName
      ? [matched.operatorName]
      : uniqueText([...(operatorNamesByStoreKey.get(normalizeKey(store.id)) ?? []), ...(operatorNamesByStoreKey.get(normalizeKey(store.storeName)) ?? [])]);

    return {
      storeName: store.storeName || store.id,
      operatorName: operatorNames.join('、') || '-',
      target: matched,
      firstOrderRate,
    };
  });

  return (
    <article className="excel-record-panel workbench-panel workbench-target-ledger">
      <header>
        <h2>店铺 KPI 配置台账</h2>
        <div className="workbench-ledger-tools">
          <label>月份<input type="month" value={ledgerPeriod} onChange={(event) => setLedgerPeriod(event.target.value)} /></label>
          <span>{loading ? '读取中' : `${rows.length} 个店铺`}</span>
        </div>
      </header>
      <div className="import-record-table-wrap">
        <table className="import-record-table">
          <thead>
            <tr>
              <th>月份</th>
              <th>店铺</th>
              <th>运营</th>
              <th>配置状态</th>
              <th>销售额目标</th>
              <th>有效上新目标</th>
              <th>首单率目标</th>
              <th>首单商品目标</th>
              <th>费用占比目标</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.storeName}>
                <td>{ledgerPeriod}</td>
                <td><strong>{row.storeName}</strong></td>
                <td>{row.operatorName}</td>
                <td><span className={`workbench-table-status ${row.target ? 'ok' : 'warning'}`}>{row.target ? '已配置' : '未配置'}</span></td>
                <td>{formatAmount(row.target?.salesTarget)}</td>
                <td>{formatNumber(row.target?.effectiveListingTarget, '款')}</td>
                <td>{formatPercent(row.firstOrderRate)}</td>
                <td>{formatNumber(row.target?.firstOrderProductTarget, '款')}</td>
                <td>{formatPercent(row.target?.expenseRatioTarget)}</td>
                <td>{row.target?.updatedAt ? row.target.updatedAt.replace('T', ' ').slice(0, 19) : '-'}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={10}>当前范围暂无可见店铺。</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function uniqueText(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function WorkbenchPage({ currentUser }: { currentUser: CurrentUser; visibleStoreIds: string[]; visibleStoreNames: string[] }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [operatorId, setOperatorId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetRefreshKey, setTargetRefreshKey] = useState(0);

  const loadData = () => {
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (operatorId) params.set('operatorId', operatorId);
    if (storeId) params.set('storeId', storeId);
    void fetchJson<WorkbenchData | null>(`/api/operation-workbench/kpi-dashboard?${params.toString()}`, null)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [period, operatorId, storeId]);

  const canManage = data?.filters.canManage ?? currentUser.role !== 'operator';

  return (
    <section className="workbench-page">
      <section className="excel-record-panel workbench-filter-bar">
        <label>月份<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        {canManage && (
          <label>运营<select value={operatorId} onChange={(event) => {
            setOperatorId(event.target.value);
            setStoreId('');
          }}>
            <option value="">全部运营</option>
            {(data?.filters.operators ?? []).map((item) => <option key={item.id} value={item.id}>{item.operatorName}</option>)}
          </select></label>
        )}
        <label>店铺<select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          <option value="">全部店铺</option>
          {(data?.filters.stores ?? []).map((item) => <option key={item.id} value={item.id}>{item.storeName}</option>)}
        </select></label>
        <span>数据更新时间<strong>{data?.dataUpdatedAt ? data.dataUpdatedAt.replace('T', ' ').slice(0, 19) : '-'}</strong></span>
        <span>完整性<strong>{data?.dataIntegrityStatus ?? '-'}</strong></span>
      </section>

      {loading && <div className="admin-route-loading">加载 KPI 工作台...</div>}
      {!loading && !data && <section className="excel-record-panel admin-permission-empty">工作台数据读取失败，请稍后重试。</section>}
      {data && (
        <>
          <KpiSummaryCards data={data} />
          <TodayKpiActions actions={data.todayActions} />
          <DetailPanels data={data} />
          <ProductFollowUpTable rows={data.productFollowUps} />
          <DataIntegrityPanel data={data} />
          <KpiTargetLedger data={data} refreshKey={targetRefreshKey} />
          <TargetEditor data={data} onSaved={() => {
            setTargetRefreshKey((value) => value + 1);
            loadData();
          }} />
        </>
      )}
    </section>
  );
}

export default WorkbenchPage;
