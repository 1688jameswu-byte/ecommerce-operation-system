import { useEffect, useMemo, useState } from 'react';
import { newProductCenterDataSource, type DashboardResponse, type OperatorOption, type ProductDetailResponse, type ProductSnapshot, type RecommendationRecord, type StoreScopeOption, type TemuStorageStatus } from '../../../data-source/newProductCenterDataSource';
import type { CurrentUser } from '../../../types/auth';

type StoreOption = { id?: string; storeName?: string; platform?: string; status?: string };
type QuickFilter = { key: string; label: string; params: Record<string, string> };

const TAGS = ['高潜新品', '烧钱无单', '有流量无转化', '加购未成交', '低曝光新品', '高费比新品', '自然起量', '已出单新品', '未出单新品', '数据未匹配', '普通新品'];

const QUICK_FILTERS: QuickFilter[] = [
  { key: 'pending', label: '今日待处理', params: { productTag: '烧钱无单' } },
  { key: 'all', label: '全部新品', params: {} },
  { key: 'highPotential', label: '高潜新品', params: { productTag: '高潜新品' } },
  { key: 'burnNoOrder', label: '烧钱无单', params: { productTag: '烧钱无单' } },
  { key: 'trafficNoConversion', label: '有流量无转化', params: { productTag: '有流量无转化' } },
  { key: 'cartNoOrder', label: '加购未成交', params: { productTag: '加购未成交' } },
  { key: 'lowExposure', label: '低曝光新品', params: { productTag: '低曝光新品' } },
  { key: 'naturalGrowth', label: '自然起量', params: { productTag: '自然起量' } },
  { key: 'ordered', label: '已出单新品', params: { isOrdered: 'true' } },
  { key: 'notOrdered', label: '未出单新品', params: { isOrdered: 'false' } },
  { key: 'unmatched', label: '数据未匹配', params: { productTag: '数据未匹配' } },
];

function formatMoney(value: unknown) {
  const number = Number(value || 0);
  return `¥ ${number.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function formatRatio(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatDate(value: unknown) {
  const raw = String(value || '');
  return raw ? raw.slice(0, 10) : '-';
}

function stageLabel(daysOnline: number) {
  if (daysOnline <= 3) return '冷启动期';
  if (daysOnline <= 7) return '测试期';
  if (daysOnline <= 14) return '放量观察期';
  if (daysOnline <= 30) return '淘汰/稳定判断期';
  return '常规商品';
}

function priorityForTag(tag: string) {
  if (['数据未匹配', '烧钱无单', '高费比新品'].includes(tag)) return '高';
  if (['有流量无转化', '加购未成交', '低曝光新品'].includes(tag)) return '中';
  if (tag === '普通新品') return '观察';
  return '机会';
}

function reasonFor(item: ProductSnapshot) {
  const tag = item.productTag || '普通新品';
  if (tag === '高潜新品') return `广告订单 ${item.adOrderCount} 单，ROAS ${item.roas === null ? '-' : Number(item.roas).toFixed(2)}。`;
  if (tag === '烧钱无单') return `广告花费 ${formatMoney(item.adSpend)}，点击 ${formatNumber(item.clicks)}，广告订单 ${item.adOrderCount}。`;
  if (tag === '有流量无转化') return `点击 ${formatNumber(item.clicks)}，加购 ${formatNumber(item.addToCartCount)}，广告订单 ${item.adOrderCount}。`;
  if (tag === '加购未成交') return `加购 ${formatNumber(item.addToCartCount)}，广告订单 ${item.adOrderCount}。`;
  if (tag === '自然起量') return `总订单 ${item.orderCount}，广告订单 ${item.adOrderCount}，自然订单 ${item.naturalOrderCount}。`;
  if (tag === '高费比新品') return `ROAS ${item.roas === null ? '-' : Number(item.roas).toFixed(2)}，ACOS ${item.acos === null ? '-' : formatRatio(item.acos)}。`;
  if (tag === '低曝光新品') return `曝光 ${formatNumber(item.impressions)}，广告花费 ${formatMoney(item.adSpend)}。`;
  if (tag === '数据未匹配') return '存在 SPU/SKU 匹配异常，分析结果需要先修复数据关联。';
  return '当前数据不足，继续观察。';
}

function actionFor(tag: string) {
  if (tag === '高潜新品') return '关注库存和预算，具备继续投放价值。';
  if (tag === '烧钱无单') return '建议暂停广告或降低出价，检查价格、主图和详情页。';
  if (tag === '高费比新品') return '建议控制预算或降低出价，检查广告投放效率。';
  if (tag === '有流量无转化') return '建议优化主图、价格和详情页。';
  if (tag === '加购未成交') return '建议检查优惠、价格、配送和下单路径。';
  if (tag === '低曝光新品') return '建议检查广告状态、预算和出价。';
  if (tag === '自然起量') return '自然订单开始增加，观察自然单占比，避免盲目加大广告。';
  if (tag === '数据未匹配') return '请先修复 SPU/SKU 匹配问题，否则分析结果不可信。';
  return '数据不足，继续观察。';
}

function roasStatus(item: ProductSnapshot) {
  const roas = item.roas;
  const target = Number((item as any).targetRoas ?? 0);
  if (roas === null || !target) return '无数据';
  return Number(roas) >= target ? '达标' : '不达标';
}

function buildQuery(params: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

function MetricCards({ summary }: { summary: Record<string, number | null> }) {
  const items = [
    ['今日新品', summary.todayNewCount],
    ['近7天新品', summary.recent7NewCount],
    ['近7天出单率', formatRatio(summary.recent7OrderedRate)],
    ['近30天新品', summary.recent30NewCount],
    ['近30天出单率', formatRatio(summary.recent30OrderedRate)],
    ['近60天出单数', summary.recent60OrderedCount ?? 0],
    ['近60天出单率', formatRatio(summary.recent60OrderedRate)],
    ['广告花费', formatMoney(summary.adSpend)],
    ['广告销售额', formatMoney(summary.adSalesAmount)],
    ['ROAS', summary.roas === null ? '-' : Number(summary.roas).toFixed(2)],
    ['高潜新品', summary.highPotentialCount],
    ['烧钱无单', summary.lossNewCount],
    ['待处理建议', summary.pendingRecommendationCount ?? 0],
    ['数据未匹配', summary.unmatchedCount ?? 0],
  ];
  return <div className="npc-metric-grid">{items.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>;
}

function RankingTable({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return (
    <article className="excel-record-panel npc-panel">
      <h2>{title}</h2>
      <div className="npc-table-wrap">
        <table>
          <thead><tr><th>名称</th><th>新品数</th><th>订单数</th><th>广告花费</th><th>广告销售额</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>{String(row.operatorName || row.storeName || '-')}</td>
                <td>{String(row.newCount || 0)}</td>
                <td>{String(row.orderCount || 0)}</td>
                <td>{formatMoney(row.adSpend)}</td>
                <td>{formatMoney(row.adSalesAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}>暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DashboardView() {
  const [snapshotDate, setSnapshotDate] = useState('');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    newProductCenterDataSource.getBossDashboard(buildQuery({ snapshotDate }))
      .then(setData)
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [snapshotDate]);

  const displayedDate = snapshotDate || data?.dataCutoffDate || data?.snapshotDate || '';

  return (
    <section className="npc-page">
      <div className="npc-toolbar">
        <label>统计日期<input type="date" value={displayedDate} onChange={(event) => setSnapshotDate(event.target.value)} /></label>
        <span className="npc-date-badge">数据截止 {data?.dataCutoffDate || displayedDate || '-'}</span>
        {snapshotDate && <button type="button" onClick={() => setSnapshotDate('')}>使用最新截止日</button>}
        <button type="button" disabled={!displayedDate} onClick={() => newProductCenterDataSource.rebuildSnapshot(displayedDate).then(() => window.location.reload())}>重算快照</button>
      </div>
      {message && <div className="excel-import-error">{message}</div>}
      {data && <MetricCards summary={data.summary} />}
      <div className="npc-two-columns">
        <RankingTable title="运营排名" rows={data?.operatorRanking ?? []} />
        <RankingTable title="店铺排名" rows={data?.storeRanking ?? []} />
      </div>
    </section>
  );
}

function DataHealthPanel({ snapshotDate, dataCutoffDate, storageStatus, productTotal }: { snapshotDate: string; dataCutoffDate?: string; storageStatus: TemuStorageStatus | null; productTotal: number }) {
  const isLate = Boolean(snapshotDate && dataCutoffDate && snapshotDate > dataCutoffDate);
  const showDataCutoffDate = Boolean(dataCutoffDate && dataCutoffDate !== snapshotDate);
  return (
    <article className={`excel-record-panel npc-panel npc-health-panel ${isLate ? 'is-warning' : ''}`}>
      <header className="npc-panel-header">
        <h2>数据健康提示</h2>
        <span>{isLate ? '统计日期晚于数据截止日' : '数据上下文正常'}</span>
      </header>
      <div className="npc-health-grid">
        <span>统计日期<strong>{snapshotDate || dataCutoffDate || '-'}</strong></span>
        {showDataCutoffDate && <span>数据截止日期<strong>{dataCutoffDate || '-'}</strong></span>}
        <span>商品数<strong>{storageStatus?.counts?.products ?? 0}</strong></span>
        <span>SKU 数据<strong>{storageStatus?.counts?.skus ?? 0}</strong></span>
        <span>广告日报<strong>{storageStatus?.counts?.ads ?? 0}</strong></span>
        <span>当前筛选新品<strong>{productTotal}</strong></span>
      </div>
      {isLate && <p>当前统计日期晚于数据截止日期，部分订单/广告数据可能为空，建议切换到数据截止日期。</p>}
    </article>
  );
}

function TaskBoard({ counts, onSelect }: { counts: Record<string, number>; onSelect: (key: string) => void }) {
  const groups: Array<[string, string[]]> = [
    ['高优先级', ['数据未匹配', '烧钱无单', '高费比新品']],
    ['中优先级', ['有流量无转化', '加购未成交', '低曝光新品']],
    ['机会商品', ['高潜新品', '自然起量']],
  ];
  return (
    <article className="excel-record-panel npc-panel npc-task-board">
      <header className="npc-panel-header"><h2>今日待处理任务</h2><span>点击任务筛选下方诊断列表</span></header>
      <div className="npc-task-groups">
        {groups.map(([title, tags]) => (
          <section key={title}>
            <h3>{title}</h3>
            {(tags as string[]).map((tag) => (
              <button type="button" key={tag} onClick={() => onSelect(tag)}>
                <span>{tag}</span><strong>{counts[tag] ?? 0}</strong>
              </button>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}

function QuickFilters({ active, counts, onChange }: { active: string; counts: Record<string, number>; onChange: (key: string) => void }) {
  return (
    <div className="npc-quick-filters">
      {QUICK_FILTERS.map((item) => (
        <button type="button" key={item.key} className={active === item.key ? 'is-active' : ''} onClick={() => onChange(item.key)}>
          {item.label}<strong>{counts[item.key] ?? 0}</strong>
        </button>
      ))}
    </div>
  );
}

function StorePerformance({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <article className="excel-record-panel npc-panel">
      <h2>我的店铺表现</h2>
      <div className="npc-table-wrap">
        <table>
          <thead><tr><th>店铺</th><th>新品数</th><th>订单数</th><th>广告花费</th><th>广告销售额</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.storeId || row.storeName)}>
                <td>{String(row.storeName || '-')}</td>
                <td>{String(row.newCount || 0)}</td>
                <td>{String(row.orderCount || 0)}</td>
                <td>{formatMoney(row.adSpend)}</td>
                <td>{formatMoney(row.adSalesAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5}>暂无店铺表现。</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function WorkbenchView({ currentUser }: { currentUser: CurrentUser }) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [storeName, setStoreName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [tag, setTag] = useState('');
  const [isAdEnabled, setIsAdEnabled] = useState('');
  const [isOrdered, setIsOrdered] = useState('');
  const [appliedSnapshotDate, setAppliedSnapshotDate] = useState('');
  const [appliedStoreName, setAppliedStoreName] = useState('');
  const [appliedOperatorName, setAppliedOperatorName] = useState('');
  const [appliedTag, setAppliedTag] = useState('');
  const [appliedIsAdEnabled, setAppliedIsAdEnabled] = useState('');
  const [appliedIsOrdered, setAppliedIsOrdered] = useState('');
  const [quickKey, setQuickKey] = useState('pending');
  const [page, setPage] = useState(1);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [products, setProducts] = useState<{ records: ProductSnapshot[]; total: number; page?: number; pageSize?: number; snapshotDate?: string; dataCutoffDate?: string }>({ records: [], total: 0 });
  const [storageStatus, setStorageStatus] = useState<TemuStorageStatus | null>(null);
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([]);
  const [operatorStoreOptions, setOperatorStoreOptions] = useState<StoreScopeOption[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    newProductCenterDataSource.getVisibleStores()
      .then((data) => setStores((data.stores || []).filter((store) => store.platform === 'TEMU' && store.status !== 'inactive')))
      .catch(() => setStores([]));
    newProductCenterDataSource.getTemuStorageStatus().then(setStorageStatus).catch(() => setStorageStatus(null));
  }, []);

  const quickParams = QUICK_FILTERS.find((item) => item.key === quickKey)?.params || {};

  useEffect(() => {
    const params: Record<string, string> = {};
    if (snapshotDate) params.snapshotDate = snapshotDate;
    if (storeName) params.storeName = storeName;
    newProductCenterDataSource.getOperatorOptions(buildQuery(params))
      .then((data) => setOperatorOptions(data.operators || []))
      .catch(() => setOperatorOptions([]));
  }, [snapshotDate, storeName]);

  useEffect(() => {
    if (!operatorName) return;
    const exists = operatorOptions.some((operator) => operator.operatorName === operatorName);
    if (!exists) {
      setOperatorName('');
      setPage(1);
    }
  }, [operatorName, operatorOptions]);

  useEffect(() => {
    if (!operatorName) {
      setOperatorStoreOptions([]);
      return;
    }
    const params: Record<string, string> = { operatorName };
    if (snapshotDate) params.snapshotDate = snapshotDate;
    newProductCenterDataSource.getStoreOptions(buildQuery(params))
      .then((data) => setOperatorStoreOptions(data.stores || []))
      .catch(() => setOperatorStoreOptions([]));
  }, [operatorName, snapshotDate]);

  const visibleStoreOptions = useMemo(() => (
    operatorName
      ? operatorStoreOptions.map((store) => ({ id: store.storeId, storeName: store.storeName }))
      : stores
  ), [operatorName, operatorStoreOptions, stores]);

  useEffect(() => {
    if (!storeName || visibleStoreOptions.length === 0) return;
    const exists = visibleStoreOptions.some((store) => store.storeName === storeName);
    if (!exists) {
      setStoreName('');
      setPage(1);
    }
  }, [storeName, visibleStoreOptions]);

  const baseParams = useMemo(() => {
    const params: Record<string, string> = { page: String(page), pageSize: '50' };
    if (appliedSnapshotDate) params.snapshotDate = appliedSnapshotDate;
    if (appliedStoreName) params.storeName = appliedStoreName;
    if (appliedOperatorName) params.operatorName = appliedOperatorName;
    if (appliedTag) params.productTag = appliedTag;
    if (appliedIsAdEnabled) params.isAdEnabled = appliedIsAdEnabled;
    if (appliedIsOrdered) params.isOrdered = appliedIsOrdered;
    return { ...params, ...quickParams };
  }, [appliedIsAdEnabled, appliedIsOrdered, appliedOperatorName, appliedSnapshotDate, appliedStoreName, appliedTag, page, quickParams]);

  useEffect(() => {
    const dashboardParams: Record<string, string> = {};
    if (appliedSnapshotDate) dashboardParams.snapshotDate = appliedSnapshotDate;
    if (appliedStoreName) dashboardParams.storeName = appliedStoreName;
    if (appliedOperatorName) dashboardParams.operatorName = appliedOperatorName;
    newProductCenterDataSource.getOperatorDashboard(buildQuery(dashboardParams))
      .then(setDashboard)
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [appliedOperatorName, appliedSnapshotDate, appliedStoreName]);

  useEffect(() => {
    newProductCenterDataSource.getProducts(buildQuery(baseParams))
      .then(setProducts)
      .catch(() => setProducts({ records: [], total: 0 }));
  }, [baseParams]);

  useEffect(() => {
    const countBase: Record<string, string> = {};
    if (appliedSnapshotDate) countBase.snapshotDate = appliedSnapshotDate;
    if (appliedStoreName) countBase.storeName = appliedStoreName;
    if (appliedOperatorName) countBase.operatorName = appliedOperatorName;
    Promise.all(QUICK_FILTERS.map((filter) => newProductCenterDataSource.getProducts(buildQuery({ ...countBase, ...filter.params, pageSize: '1' })).then((data) => [filter.key, data.total] as const).catch(() => [filter.key, 0] as const)))
      .then((pairs) => setCounts(Object.fromEntries(pairs)));
    Promise.all(TAGS.map((item) => newProductCenterDataSource.getProducts(buildQuery({ ...countBase, productTag: item, pageSize: '1' })).then((data) => [item, data.total] as const).catch(() => [item, 0] as const)))
      .then((pairs) => setCounts((current) => ({ ...current, ...Object.fromEntries(pairs) })));
  }, [appliedOperatorName, appliedSnapshotDate, appliedStoreName]);

  useEffect(() => {
    if (quickKey === 'pending' && counts.pending === 0 && counts.all > 0) {
      setQuickKey('all');
    }
  }, [counts.all, counts.pending, quickKey]);

  const displayedDate = appliedSnapshotDate || products.dataCutoffDate || dashboard?.dataCutoffDate || products.snapshotDate || dashboard?.snapshotDate || '';
  const totalPages = Math.max(1, Math.ceil((products.total || 0) / 50));
  const hasPendingFilterChanges = snapshotDate !== appliedSnapshotDate ||
    storeName !== appliedStoreName ||
    operatorName !== appliedOperatorName ||
    tag !== appliedTag ||
    isAdEnabled !== appliedIsAdEnabled ||
    isOrdered !== appliedIsOrdered;

  const applyWorkbenchFilters = () => {
    setAppliedSnapshotDate(snapshotDate);
    setAppliedStoreName(storeName);
    setAppliedOperatorName(operatorName);
    setAppliedTag(tag);
    setAppliedIsAdEnabled(isAdEnabled);
    setAppliedIsOrdered(isOrdered);
    setPage(1);
  };

  const resetWorkbenchFilters = () => {
    setSnapshotDate('');
    setStoreName('');
    setOperatorName('');
    setTag('');
    setIsAdEnabled('');
    setIsOrdered('');
    setAppliedSnapshotDate('');
    setAppliedStoreName('');
    setAppliedOperatorName('');
    setAppliedTag('');
    setAppliedIsAdEnabled('');
    setAppliedIsOrdered('');
    setPage(1);
  };

  const selectTag = (nextTag: string) => {
    setTag(nextTag);
    setAppliedTag(nextTag);
    setQuickKey('all');
    setPage(1);
  };

  return (
    <section className="npc-page npc-workbench-page">
      <div className="npc-toolbar npc-workbench-toolbar">
        <label className="npc-primary-filter">店铺<select value={storeName} onChange={(event) => { setStoreName(event.target.value); setPage(1); }}><option value="">{operatorName ? '所有店铺' : '全部店铺'}</option>{visibleStoreOptions.map((store) => <option key={store.id || store.storeName} value={store.storeName || ''}>{store.storeName}</option>)}</select></label>
        <label>统计日期<input type="date" value={snapshotDate || displayedDate} onChange={(event) => { setSnapshotDate(event.target.value); setPage(1); }} /></label>
        <label>运营<select value={operatorName} onChange={(event) => { setOperatorName(event.target.value); setPage(1); }}><option value="">全部运营</option>{operatorOptions.map((operator) => <option key={operator.operatorId || operator.operatorName} value={operator.operatorName}>{operator.operatorName}{storeName ? '' : `（${operator.storeCount || 0}店）`}</option>)}</select></label>
        <label>商品标签<select value={tag} onChange={(event) => { setTag(event.target.value); setPage(1); }}><option value="">全部</option>{TAGS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>广告<select value={isAdEnabled} onChange={(event) => { setIsAdEnabled(event.target.value); setPage(1); }}><option value="">全部</option><option value="true">已开广告</option><option value="false">未开广告</option></select></label>
        <label>出单<select value={isOrdered} onChange={(event) => { setIsOrdered(event.target.value); setPage(1); }}><option value="">全部</option><option value="true">已出单</option><option value="false">未出单</option></select></label>
        <button type="button" className="npc-apply-filter-button" disabled={!hasPendingFilterChanges} onClick={applyWorkbenchFilters}>确定筛选</button>
        <button type="button" className="npc-reset-filter-button" onClick={resetWorkbenchFilters}>重置</button>
        <span className="npc-date-badge">数据截止 {dashboard?.dataCutoffDate || products.dataCutoffDate || '-'}</span>
      </div>
      {message && <div className="excel-import-error">{message}</div>}
      <DataHealthPanel snapshotDate={displayedDate} dataCutoffDate={dashboard?.dataCutoffDate || products.dataCutoffDate} storageStatus={storageStatus} productTotal={products.total} />
      {dashboard && <MetricCards summary={dashboard.summary} />}
      <TaskBoard counts={counts} onSelect={selectTag} />
      <div className="npc-two-columns">
        <StorePerformance rows={dashboard?.storeRanking ?? []} />
        <article className="excel-record-panel npc-panel">
          <h2>我的高潜新品</h2>
          <div className="npc-mini-list">
            {products.records.filter((item) => item.productTag === '高潜新品').slice(0, 6).map((item) => (
              <a key={item.id} href={`/new-product-center/products/${item.productId}`}>
                <strong>{item.productName}</strong><span>{item.storeName} / ROAS {item.roas === null ? '-' : Number(item.roas).toFixed(2)}</span>
              </a>
            ))}
            {products.records.filter((item) => item.productTag === '高潜新品').length === 0 && <span>当前筛选下暂无高潜新品。</span>}
          </div>
        </article>
      </div>
      <article className="excel-record-panel npc-panel">
        <header className="npc-panel-header">
          <h2>新品诊断列表</h2>
          <span>{products.total} 条，自然单为系统估算：总订单数 - 子订单数（推广）。</span>
        </header>
        <QuickFilters active={quickKey} counts={counts} onChange={(key) => { setQuickKey(key); setPage(1); }} />
        <ProductTable records={products.records} total={products.total} title="新品诊断列表" />
        <div className="temu-product-record-pagination">
          <span>第 {page}/{totalPages} 页</span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>下一页</button>
          </div>
        </div>
      </article>
    </section>
  );
}

function ProductTable({ records, total, title = '新品诊断列表' }: { records: ProductSnapshot[]; total: number; title?: string }) {
  return (
    <div className="npc-table-wrap npc-product-list-table-wrap">
      <table className="npc-product-list-table npc-diagnosis-table">
        <thead>
          <tr>
            <th>商品</th>
            <th>店铺</th>
            <th>运营</th>
            <th>创建/天数/阶段</th>
            <th>出单</th>
            <th>订单数</th>
            <th>销量</th>
            <th>订单金额</th>
            <th>广告花费</th>
            <th>广告订单</th>
            <th>自然订单</th>
            <th>ROAS</th>
            <th>目标ROAS</th>
            <th>ROAS状态</th>
            <th>点击</th>
            <th>加购</th>
            <th>商品标签</th>
            <th>优先级</th>
            <th>诊断原因</th>
            <th>建议</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr key={item.id}>
              <td><div className="npc-product-cell" title={`${item.productName || '-'} ${item.temuProductId || ''} ${item.temuSpuId || ''}`}>{item.productImageUrl && <img src={item.productImageUrl} alt="" />}<span><strong>{item.productName || '-'}</strong><small>{item.temuProductId || '-'} / {item.temuSpuId || '-'}</small></span></div></td>
              <td>{item.storeName || '-'}</td>
              <td>{item.operatorName || '-'}</td>
              <td>{formatDate(item.firstOnlineAt)} / {item.daysOnline}天 / {stageLabel(item.daysOnline)}</td>
              <td>{item.isOrdered ? '是' : '否'}</td>
              <td>{item.orderCount}</td>
              <td>{String((item as any).orderQuantity ?? '-')}</td>
              <td>{formatMoney(item.orderSalesAmount)}</td>
              <td>{formatMoney(item.adSpend)}</td>
              <td>{item.adOrderCount}</td>
              <td>{item.naturalOrderCount}</td>
              <td>{item.roas === null ? '-' : Number(item.roas).toFixed(2)}</td>
              <td>{(item as any).targetRoas === null || (item as any).targetRoas === undefined ? '-' : Number((item as any).targetRoas).toFixed(2)}</td>
              <td>{roasStatus(item)}</td>
              <td>{formatNumber(item.clicks)}</td>
              <td>{formatNumber(item.addToCartCount)}</td>
              <td><span className="npc-tag">{item.productTag || '普通新品'}</span></td>
              <td><span className={`npc-priority priority-${priorityForTag(item.productTag || '普通新品')}`}>{priorityForTag(item.productTag || '普通新品')}</span></td>
              <td title={reasonFor(item)}>{reasonFor(item)}</td>
              <td title={item.latestRecommendationText || actionFor(item.productTag || '普通新品')}>{item.latestRecommendationText || actionFor(item.productTag || '普通新品')}</td>
              <td><a href={`/new-product-center/products/${item.productId}`}>查看诊断</a></td>
            </tr>
          ))}
          {records.length === 0 && <tr><td colSpan={21}>暂无新品快照，请先导入商品信息或重算快照。</td></tr>}
        </tbody>
      </table>
      {total === 0 && <p className="npc-empty-hint">当前筛选范围没有数据。</p>}
    </div>
  );
}

function RecommendationsView() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState<{ records: RecommendationRecord[]; total: number }>({ records: [], total: 0 });
  const refresh = () => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (status) params.set('status', status);
    newProductCenterDataSource.getRecommendations(`?${params.toString()}`).then(setData).catch(() => setData({ records: [], total: 0 } as any));
  };
  useEffect(refresh, [status]);
  const handle = async (item: RecommendationRecord, nextStatus: string) => {
    await newProductCenterDataSource.handleRecommendation(item.id, { status: nextStatus });
    refresh();
  };
  return (
    <section className="npc-page">
      <div className="npc-toolbar">
        <label>状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{['PENDING','ACCEPTED','IGNORED','EXECUTED','EXPIRED'].map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <article className="excel-record-panel npc-panel">
        <header className="npc-panel-header"><h2>广告建议中心</h2><span>{data.total} 条</span></header>
        <div className="npc-table-wrap">
          <table>
            <thead><tr><th>商品</th><th>标签</th><th>指标</th><th>建议</th><th>原因</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {data.records.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}<br /><small>{item.storeName} / {item.operatorName || '-'}</small></td>
                  <td><span className="npc-tag">{item.productTag || item.problemType}</span></td>
                  <td>{formatMoney(item.adSpend)}<br /><small>ROAS {item.roas === null ? '-' : Number(item.roas).toFixed(2)}</small></td>
                  <td><strong>{item.recommendationText}</strong><br /><small>{item.suggestedAction}</small></td>
                  <td>{item.reasonText}</td>
                  <td>{item.status}</td>
                  <td className="npc-actions">
                    <button type="button" onClick={() => void handle(item, 'ACCEPTED')}>采纳</button>
                    <button type="button" onClick={() => void handle(item, 'IGNORED')}>忽略</button>
                    <button type="button" onClick={() => void handle(item, 'EXECUTED')}>已执行</button>
                    <a href={`/new-product-center/products/${item.productId}`}>详情</a>
                  </td>
                </tr>
              ))}
              {data.records.length === 0 && <tr><td colSpan={7}>暂无广告建议。</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function DetailView({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductDetailResponse | null>(null);
  useEffect(() => {
    newProductCenterDataSource.getProductDetail(productId).then(setData).catch(() => setData(null));
  }, [productId]);
  if (!data?.product) return <section className="excel-record-panel npc-panel">商品不存在或暂无数据。</section>;
  return (
    <section className="npc-page">
      <article className="excel-record-panel npc-panel">
        <h2>{String(data.product.productName || '商品诊断')}</h2>
        <p>{String(data.product.storeName || '-')} / {String(data.product.operatorName || '-')} / {String(data.product.temuSpuId || '-')}</p>
      </article>
      <article className="excel-record-panel npc-panel">
        <header className="npc-panel-header"><h2>核心诊断</h2><span>{data.snapshots.length} 条快照</span></header>
        <ProductTable records={data.snapshots.slice(0, 1)} total={data.snapshots.length} title="核心诊断" />
      </article>
      <div className="npc-two-columns">
        <SimpleTable title="订单趋势" rows={data.orders} columns={['orderDate','orderCount','quantity','salesAmount']} />
        <SimpleTable title="广告趋势" rows={data.ads} columns={['reportDate','adSpend','promoSalesAmount','promoClicks','promoSubOrderCount']} />
      </div>
      <SimpleTable title="建议历史" rows={data.recommendations} columns={['recommendationDate','recommendationType','priority','recommendationText','status']} />
      <SimpleTable title="商品时间线" rows={data.timeline} columns={['eventTime','eventType','title','description']} />
    </section>
  );
}

function SimpleTable({ title, rows, columns }: { title: string; rows: Array<Record<string, any>>; columns: string[] }) {
  return (
    <article className="excel-record-panel npc-panel">
      <h2>{title}</h2>
      <div className="npc-table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? '-')}</td>)}</tr>)}
            {rows.length === 0 && <tr><td colSpan={columns.length}>暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default function NewProductCenterPage({ currentUser }: { currentUser: CurrentUser }) {
  const path = window.location.pathname;
  if (path === '/new-product-center/boss-dashboard') return <DashboardView />;
  if (path === '/new-product-center/ad-recommendations') return <RecommendationsView />;
  if (path.startsWith('/new-product-center/products/')) return <DetailView productId={decodeURIComponent(path.replace('/new-product-center/products/', ''))} />;
  return <WorkbenchView currentUser={currentUser} />;
}
