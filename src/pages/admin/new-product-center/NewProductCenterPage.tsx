import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { newProductCenterDataSource, type AdStrategyConfig, type AdStrategyExecutionRecord, type AdStrategyReviewRecord, type AdStrategySuggestion, type DashboardResponse, type OperatorOption, type ProductDetailResponse, type ProductSnapshot, type RecommendationRecord, type StoreScopeOption, type TemuStorageStatus } from '../../../data-source/newProductCenterDataSource';
import type { CurrentUser } from '../../../types/auth';

type StoreOption = { id?: string; dbId?: string; storeName?: string; platform?: string; status?: string };
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

function formatInteger(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('zh-CN') : '-';
}

function formatRatio(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatRoas(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '-';
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

function IconSymbol({ name }: { name: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const icons: Record<string, ReactNode> = {
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" {...common} /><path d="M8 3v4M16 3v4M4 10h16" {...common} /></>,
    briefcase: <><rect x="4" y="7" width="16" height="12" rx="2" {...common} /><path d="M9 7V5h6v2M9 13h6" {...common} /></>,
    cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" {...common} /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" {...common} /></>,
    bars: <><path d="M6 19V9M12 19V5M18 19v-7" {...common} /><rect x="4" y="9" width="4" height="10" rx="1" {...common} /><rect x="10" y="5" width="4" height="14" rx="1" {...common} /><rect x="16" y="12" width="4" height="7" rx="1" {...common} /></>,
    filter: <><path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" {...common} /></>,
    trend: <><path d="M4 17 9 12l4 4 7-9" {...common} /><path d="M15 7h5v5" {...common} /></>,
    line: <><path d="M4 16c3-8 6 2 9-5 2-5 4-2 7-6" {...common} /></>,
    megaphone: <><path d="M4 13h3l9 4V7l-9 4H4v2Z" {...common} /><path d="M7 13v5M18 9c1 1 1 5 0 6" {...common} /></>,
    diamond: <><path d="M12 3 21 9l-9 12L3 9l9-6Z" {...common} /><path d="M3 9h18M9 9l3 12 3-12M8 3l-5 6M16 3l5 6" {...common} /></>,
    flame: <><path d="M12 21c4 0 7-3 7-7 0-3-2-5-4-7 0 3-2 4-3 5 0-4-2-7-5-9 1 5-2 7-2 11 0 4 3 7 7 7Z" {...common} /></>,
    message: <><path d="M5 5h14v10H8l-3 4V5Z" {...common} /><path d="M8 9h8M8 12h5" {...common} /></>,
    database: <><ellipse cx="12" cy="5" rx="7" ry="3" {...common} /><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" {...common} /></>,
    box: <><path d="M4 8 12 3l8 5v8l-8 5-8-5V8Z" {...common} /><path d="m4 8 8 5 8-5M12 13v8" {...common} /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name] || icons.box}</svg>;
}

function MiniTrendSparkline({ data = [], color = 'blue', height = 54, showArea = true }: { data?: number[]; color?: 'blue' | 'green' | 'orange' | 'purple'; height?: number; showArea?: boolean }) {
  const values = data.filter((value) => Number.isFinite(value));
  const width = 240;
  const path = values.length > 1
    ? values.map((value, index) => {
      const max = Math.max(...values);
      const min = Math.min(...values);
      const range = max - min || 1;
      const x = (index / (values.length - 1)) * width;
      const y = height - 8 - ((value - min) / range) * (height - 18);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ')
    : `M0,${height - 12} C40,${height - 18} 55,${height - 2} 92,${height - 12} S150,${height - 30} 188,${height - 18} S220,${height - 14} ${width},${height - 34}`;
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg className={`npc-sparkline npc-sparkline-${color}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="趋势展示（视觉辅助）">
      <title>趋势展示（视觉辅助）</title>
      {showArea && <path className="npc-sparkline-area" d={areaPath} />}
      <path className="npc-sparkline-line" d={path} />
    </svg>
  );
}

function OverviewMetricCard({ tone, icon, title, metrics, footer }: { tone: 'blue' | 'green' | 'orange' | 'purple'; icon: string; title: string; metrics: Array<[string, ReactNode]>; footer?: ReactNode }) {
  return (
    <article className={`npc-overview-card npc-overview-card-${tone}`}>
      <header>
        <span className="npc-circle-icon"><IconSymbol name={icon} /></span>
        <h3>{title}</h3>
      </header>
      <div className="npc-overview-metrics">
        {metrics.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value ?? 0}</strong>
          </span>
        ))}
      </div>
      {footer || <MiniTrendSparkline color={tone} />}
    </article>
  );
}

function NewProductOverviewSection({ summary }: { summary: Record<string, number | null> }) {
  return (
    <article className="excel-record-panel npc-panel npc-overview-section">
      <h2>新品表现总览</h2>
      <div className="npc-overview-grid">
        <OverviewMetricCard
          tone="blue"
          icon="box"
          title="新品规模"
          metrics={[['今日新品', summary.todayNewCount ?? 0], ['近7天新品', summary.recent7NewCount ?? 0]]}
        />
        <OverviewMetricCard
          tone="green"
          icon="trend"
          title="30天表现"
          metrics={[['近30天新品', summary.recent30NewCount ?? 0], ['近30天出单数', summary.recent30OrderedCount ?? 0], ['近30天出单率', formatRatio(summary.recent30OrderedRate)]]}
        />
        <OverviewMetricCard
          tone="orange"
          icon="line"
          title="60天表现"
          metrics={[['近60天出单数', summary.recent60OrderedCount ?? 0], ['近60天出单率', formatRatio(summary.recent60OrderedRate)]]}
        />
        <OverviewMetricCard
          tone="purple"
          icon="megaphone"
          title="广告表现"
          metrics={[['广告花费', formatMoney(summary.adSpend)], ['广告销售额', formatMoney(summary.adSalesAmount)], ['ROAS', summary.roas === null ? '-' : formatRoas(summary.roas)]]}
          footer={<div className="npc-ad-status-bar"><i />当前广告数据正常</div>}
        />
      </div>
    </article>
  );
}

function SecondaryMetricStrip({ summary, onSelect }: { summary: Record<string, number | null>; onSelect: (tag: string) => void }) {
  const items = [
    { label: '高潜新品', value: summary.highPotentialCount ?? 0, icon: 'diamond', tone: 'blue', tag: '高潜新品' },
    { label: '烧钱无单', value: summary.lossNewCount ?? 0, icon: 'flame', tone: 'red', tag: '烧钱无单' },
    { label: '待处理建议', value: summary.pendingRecommendationCount ?? 0, icon: 'message', tone: 'orange', tag: '' },
    { label: '数据未匹配', value: summary.unmatchedCount ?? 0, icon: 'database', tone: 'purple', tag: '数据未匹配' },
  ];
  return (
    <div className="npc-secondary-strip">
      {items.map((item) => (
        <button
          type="button"
          key={item.label}
          className={`npc-secondary-item npc-secondary-${item.tone}`}
          onClick={() => {
            if (item.tag) onSelect(item.tag);
            else window.location.href = '/new-product-center/ad-recommendations';
          }}
        >
          <span className="npc-circle-icon"><IconSymbol name={item.icon} /></span>
          <b>{item.label}</b>
          <strong>{item.value}</strong>
          <em>›</em>
        </button>
      ))}
    </div>
  );
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
      {data && <NewProductOverviewSection summary={data.summary} />}
      <div className="npc-two-columns">
        <RankingTable title="运营排名" rows={data?.operatorRanking ?? []} />
        <RankingTable title="店铺排名" rows={data?.storeRanking ?? []} />
      </div>
    </section>
  );
}

function DataHealthPanel({ snapshotDate, dataCutoffDate, storageStatus, productTotal, healthCounts }: { snapshotDate: string; dataCutoffDate?: string; storageStatus: TemuStorageStatus | null; productTotal: number; healthCounts?: Record<string, number | null> }) {
  const isLate = Boolean(snapshotDate && dataCutoffDate && snapshotDate > dataCutoffDate);
  const productCount = healthCounts?.baseProductCount ?? storageStatus?.counts?.products ?? 0;
  const skuCount = healthCounts?.baseSkuCount ?? storageStatus?.counts?.skus ?? 0;
  const adCount = healthCounts?.baseAdCount ?? storageStatus?.counts?.ads ?? 0;
  const cards = [
    { label: '统计日期', value: snapshotDate || dataCutoffDate || '-', icon: 'calendar', tone: 'blue' },
    { label: '商品数', value: productCount, icon: 'briefcase', tone: 'green' },
    { label: 'SKU 数据', value: skuCount, icon: 'cube', tone: 'purple' },
    { label: '广告日报', value: adCount, icon: 'bars', tone: 'orange' },
    { label: '当前筛选新品', value: productTotal, icon: 'filter', tone: 'cyan' },
  ];
  return (
    <article className={`excel-record-panel npc-panel npc-health-panel ${isLate ? 'is-warning' : ''}`}>
      <header className="npc-panel-header">
        <h2>数据健康提示</h2>
        <span>{isLate ? '统计日期晚于数据截止日' : '数据上下文正常'}</span>
      </header>
      <div className="npc-health-grid">
        {cards.map((card) => (
          <span key={card.label} className={`npc-health-card npc-health-${card.tone}`}>
            <i className="npc-circle-icon"><IconSymbol name={card.icon} /></i>
            <em>{card.label}</em>
            <strong>{card.value}</strong>
          </span>
        ))}
      </div>
      {isLate && <p>当前统计日期晚于数据截止日期，部分订单/广告数据可能为空，建议切换到数据截止日期。</p>}
    </article>
  );
}

function TaskBoard({ counts }: { counts: Record<string, number>; onSelect: (key: string) => void }) {
  const groups = [
    { title: '高优先级', label: '风险', metric: '投放过激进', note: '进入广告策略中心处理', tone: 'red', count: counts['投放过激进'] ?? 0 },
    { title: '中优先级', label: '观察', metric: '投放过保守', note: '进入广告策略中心处理', tone: 'orange', count: counts['投放过保守'] ?? 0 },
    { title: '机会商品', label: '机会', metric: '高潜新品', note: '进入广告策略中心处理', tone: 'green', count: counts['高潜新品'] ?? 0 },
  ];
  const openStrategy = (type: string) => {
    window.location.href = `/new-product-center/ad-recommendations?type=${encodeURIComponent(type)}`;
  };
  return (
    <article className="excel-record-panel npc-panel npc-task-board">
      <header className="npc-panel-header"><h2>今日待处理任务</h2><span>点击任务进入广告策略中心</span></header>
      <div className="npc-task-groups">
        {groups.map((group) => (
          <section key={group.title} className={`npc-task-card npc-task-${group.tone}`}>
            <header>
              <h3>{group.title}</h3>
              <b>{group.label}</b>
            </header>
            <button type="button" onClick={() => openStrategy(group.metric)}>
              <span>{group.metric}<small>{group.note}</small></span>
              <strong>{group.count}</strong>
              <em>›</em>
            </button>
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
          <thead><tr><th>店铺</th><th>近7天新品</th><th>近30天新品</th><th>近60天出单数</th><th>订单明细数</th><th>广告花费</th><th>广告销售额</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.storeId || row.storeName)}>
                <td>{String(row.storeName || '-')}</td>
                <td>{String(row.recent7NewCount || 0)}</td>
                <td>{String(row.recent30NewCount || 0)}</td>
                <td>{String(row.recent60OrderedCount || 0)}</td>
                <td>{String(row.orderCount || 0)}</td>
                <td>{formatMoney(row.adSpend)}</td>
                <td>{formatMoney(row.adSalesAmount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7}>暂无店铺表现。</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function WorkbenchView({ currentUser }: { currentUser: CurrentUser }) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [storeId, setStoreId] = useState('');
  const [storeSearchText, setStoreSearchText] = useState('');
  const [storeSearchOpen, setStoreSearchOpen] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [tag, setTag] = useState('');
  const [isAdEnabled, setIsAdEnabled] = useState('');
  const [isOrdered, setIsOrdered] = useState('');
  const [appliedSnapshotDate, setAppliedSnapshotDate] = useState('');
  const [appliedStoreId, setAppliedStoreId] = useState('');
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
      .then((data) => setStores((data.stores || [])
        .filter((store) => store.platform === 'TEMU' && store.status !== 'inactive')
        .map((store) => ({ ...store, id: store.dbId || store.id }))))
      .catch(() => setStores([]));
    newProductCenterDataSource.getTemuStorageStatus().then(setStorageStatus).catch(() => setStorageStatus(null));
  }, []);

  const quickParams = QUICK_FILTERS.find((item) => item.key === quickKey)?.params || {};

  useEffect(() => {
    const params: Record<string, string> = {};
    if (snapshotDate) params.snapshotDate = snapshotDate;
    if (storeId) params.storeId = storeId;
    newProductCenterDataSource.getOperatorOptions(buildQuery(params))
      .then((data) => setOperatorOptions(data.operators || []))
      .catch(() => setOperatorOptions([]));
  }, [snapshotDate, storeId]);

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

  const selectedStore = useMemo(() => (
    visibleStoreOptions.find((store) => store.id === storeId)
  ), [storeId, visibleStoreOptions]);

  const filteredStoreOptions = useMemo(() => {
    const keyword = storeSearchText.trim().toLowerCase();
    if (!keyword) return visibleStoreOptions.slice(0, 20);
    return visibleStoreOptions
      .filter((store) => String(store.storeName || '').toLowerCase().includes(keyword))
      .slice(0, 20);
  }, [storeSearchText, visibleStoreOptions]);

  useEffect(() => {
    if (!storeId) {
      setStoreSearchText('');
      return;
    }
    if (selectedStore?.storeName) {
      setStoreSearchText(selectedStore.storeName);
    }
  }, [selectedStore, storeId]);

  useEffect(() => {
    if (!storeId || visibleStoreOptions.length === 0) return;
    const exists = visibleStoreOptions.some((store) => store.id === storeId);
    if (!exists) {
      setStoreId('');
      setPage(1);
    }
  }, [storeId, visibleStoreOptions]);

  const baseParams = useMemo(() => {
    const params: Record<string, string> = { page: String(page), pageSize: '50' };
    if (appliedSnapshotDate) params.snapshotDate = appliedSnapshotDate;
    if (appliedStoreId) params.storeId = appliedStoreId;
    if (appliedOperatorName) params.operatorName = appliedOperatorName;
    if (appliedTag) params.productTag = appliedTag;
    if (appliedIsAdEnabled) params.isAdEnabled = appliedIsAdEnabled;
    if (appliedIsOrdered) params.isOrdered = appliedIsOrdered;
    return { ...params, ...quickParams };
  }, [appliedIsAdEnabled, appliedIsOrdered, appliedOperatorName, appliedSnapshotDate, appliedStoreId, appliedTag, page, quickParams]);

  useEffect(() => {
    const dashboardParams: Record<string, string> = {};
    if (appliedSnapshotDate) dashboardParams.snapshotDate = appliedSnapshotDate;
    if (appliedStoreId) dashboardParams.storeId = appliedStoreId;
    if (appliedOperatorName) dashboardParams.operatorName = appliedOperatorName;
    newProductCenterDataSource.getOperatorDashboard(buildQuery(dashboardParams))
      .then(setDashboard)
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [appliedOperatorName, appliedSnapshotDate, appliedStoreId]);

  useEffect(() => {
    newProductCenterDataSource.getProducts(buildQuery(baseParams))
      .then(setProducts)
      .catch(() => setProducts({ records: [], total: 0 }));
  }, [baseParams]);

  useEffect(() => {
    const countBase: Record<string, string> = {};
    if (appliedSnapshotDate) countBase.snapshotDate = appliedSnapshotDate;
    if (appliedStoreId) countBase.storeId = appliedStoreId;
    if (appliedOperatorName) countBase.operatorName = appliedOperatorName;
    Promise.all(QUICK_FILTERS.map((filter) => newProductCenterDataSource.getProducts(buildQuery({ ...countBase, ...filter.params, pageSize: '1' })).then((data) => [filter.key, data.total] as const).catch(() => [filter.key, 0] as const)))
      .then((pairs) => setCounts(Object.fromEntries(pairs)));
    Promise.all(TAGS.map((item) => newProductCenterDataSource.getProducts(buildQuery({ ...countBase, productTag: item, pageSize: '1' })).then((data) => [item, data.total] as const).catch(() => [item, 0] as const)))
      .then((pairs) => setCounts((current) => ({ ...current, ...Object.fromEntries(pairs) })));
    newProductCenterDataSource.getAdStrategyCounts(buildQuery(countBase))
      .then((data) => setCounts((current) => ({ ...current, ...(data.counts || {}) })))
      .catch(() => undefined);
  }, [appliedOperatorName, appliedSnapshotDate, appliedStoreId]);

  useEffect(() => {
    if (quickKey === 'pending' && counts.pending === 0 && counts.all > 0) {
      setQuickKey('all');
    }
  }, [counts.all, counts.pending, quickKey]);

  const displayedDate = appliedSnapshotDate || products.dataCutoffDate || dashboard?.dataCutoffDate || products.snapshotDate || dashboard?.snapshotDate || '';
  const totalPages = Math.max(1, Math.ceil((products.total || 0) / 50));
  const isAdmin = currentUser.role === 'admin';
  const readonlyOperator = operatorOptions[0];
  const readonlyOperatorName = readonlyOperator?.operatorName || currentUser.displayName || currentUser.username || '-';
  const readonlyOperatorStoreCount = visibleStoreOptions.length || readonlyOperator?.storeCount || 0;
  const applyStoreFilter = (nextStoreId: string, nextStoreName = '') => {
    setStoreId(nextStoreId);
    setAppliedStoreId(nextStoreId);
    setStoreSearchText(nextStoreName);
    setStoreSearchOpen(false);
    setPage(1);
  };

  const selectOperatorFilter = (nextOperatorName: string) => {
    setOperatorName(nextOperatorName);
    setAppliedOperatorName(nextOperatorName);
    setStoreId('');
    setAppliedStoreId('');
    setStoreSearchText('');
    setPage(1);
  };

  const clearStoreFilter = (keepOpen = true) => {
    setStoreId('');
    setAppliedStoreId('');
    setStoreSearchText('');
    setStoreSearchOpen(keepOpen);
    setPage(1);
  };

  const submitStoreSearch = () => {
    const keyword = storeSearchText.trim();
    if (!keyword) {
      clearStoreFilter();
      return;
    }
    const exact = visibleStoreOptions.find((store) => String(store.storeName || '').toLowerCase() === keyword.toLowerCase());
    const target = exact || filteredStoreOptions[0];
    if (target?.id) {
      applyStoreFilter(target.id, target.storeName || '');
    } else {
      setStoreSearchOpen(true);
    }
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
        <label className="npc-primary-filter npc-store-search-filter">店铺
          <span className="npc-store-search-box">
            <input
              type="text"
              value={storeSearchText}
              placeholder={operatorName ? '搜索我的店铺' : '搜索店铺'}
              onChange={(event) => {
                setStoreSearchText(event.target.value);
                setStoreSearchOpen(true);
              }}
              onFocus={() => setStoreSearchOpen(true)}
              onClick={() => setStoreSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setStoreSearchOpen(false), 120)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitStoreSearch();
                }
                if (event.key === 'Escape') {
                  setStoreSearchOpen(false);
                }
              }}
            />
            {storeSearchText && (
              <button type="button" className="npc-store-clear-button" aria-label="清空店铺筛选" onMouseDown={(event) => event.preventDefault()} onClick={() => clearStoreFilter(true)}>×</button>
            )}
            <button type="button" className="npc-store-search-button" aria-label="搜索店铺" onMouseDown={(event) => event.preventDefault()} onClick={submitStoreSearch}>⌕</button>
            {storeSearchOpen && (
              <span className="npc-store-search-menu">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => clearStoreFilter(false)}>{operatorName ? '所有店铺' : '全部店铺'}</button>
                {filteredStoreOptions.map((store) => (
                  <button
                    type="button"
                    key={store.id || store.storeName}
                    className={store.id === storeId ? 'is-active' : ''}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyStoreFilter(store.id || '', store.storeName || '')}
                  >
                    {store.storeName}
                  </button>
                ))}
                {filteredStoreOptions.length === 0 && <span className="npc-store-search-empty">没有匹配店铺</span>}
              </span>
            )}
          </span>
        </label>
        <label>统计日期<input type="date" value={snapshotDate || displayedDate} onChange={(event) => { setSnapshotDate(event.target.value); setAppliedSnapshotDate(event.target.value); setPage(1); }} /></label>
        {isAdmin ? (
          <label>运营<select value={operatorName} onChange={(event) => selectOperatorFilter(event.target.value)}><option value="">全部运营</option>{operatorOptions.map((operator) => <option key={operator.operatorId || operator.operatorName} value={operator.operatorName}>{operator.operatorName}{storeId ? '' : `（${operator.storeCount || 0}店）`}</option>)}</select></label>
        ) : (
          <label>运营<span className="npc-readonly-filter">{readonlyOperatorName}（{readonlyOperatorStoreCount}店）</span></label>
        )}
        <label>商品标签<select value={tag} onChange={(event) => { setTag(event.target.value); setAppliedTag(event.target.value); setPage(1); }}><option value="">全部</option>{TAGS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>广告<select value={isAdEnabled} onChange={(event) => { setIsAdEnabled(event.target.value); setAppliedIsAdEnabled(event.target.value); setPage(1); }}><option value="">全部</option><option value="true">已开广告</option><option value="false">未开广告</option></select></label>
        <label>出单<select value={isOrdered} onChange={(event) => { setIsOrdered(event.target.value); setAppliedIsOrdered(event.target.value); setPage(1); }}><option value="">全部</option><option value="true">已出单</option><option value="false">未出单</option></select></label>
        <span className="npc-date-badge">数据截止 {dashboard?.dataCutoffDate || products.dataCutoffDate || '-'}</span>
      </div>
      {message && <div className="excel-import-error">{message}</div>}
      <DataHealthPanel snapshotDate={displayedDate} dataCutoffDate={dashboard?.dataCutoffDate || products.dataCutoffDate} storageStatus={storageStatus} productTotal={products.total} healthCounts={dashboard?.summary} />
      {dashboard && <NewProductOverviewSection summary={dashboard.summary} />}
      {dashboard && <SecondaryMetricStrip summary={dashboard.summary} onSelect={selectTag} />}
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
        <div className="npc-diagnosis-list-filters">
          {isAdmin ? (
            <label>运营
              <select value={operatorName} onChange={(event) => selectOperatorFilter(event.target.value)}>
                <option value="">全部运营</option>
                {operatorOptions.map((operator) => (
                  <option key={operator.operatorId || operator.operatorName} value={operator.operatorName}>
                    {operator.operatorName}{storeId ? '' : `（${operator.storeCount || 0}店）`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>运营<span className="npc-readonly-filter">{readonlyOperatorName}</span></label>
          )}
          <label>店铺
            <select
              value={storeId}
              onChange={(event) => {
                const nextStoreId = event.target.value;
                const nextStore = visibleStoreOptions.find((store) => store.id === nextStoreId);
                if (nextStoreId) {
                  applyStoreFilter(nextStoreId, nextStore?.storeName || '');
                } else {
                  clearStoreFilter(false);
                }
              }}
            >
              <option value="">{operatorName ? '该运营全部店铺' : '全部店铺'}</option>
              {visibleStoreOptions.map((store) => (
                <option key={store.id || store.storeName} value={store.id || ''}>{store.storeName}</option>
              ))}
            </select>
          </label>
        </div>
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
            <th>SPU ID</th>
            <th>SKC ID</th>
            <th>SKU ID</th>
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
              <td title={item.temuSpuId || '-'}>{item.temuSpuId || '-'}</td>
              <td title={item.skcIds || '-'}>{item.skcIds || '-'}</td>
              <td title={item.skuIds || '-'}>{item.skuIds || '-'}</td>
              <td>{item.storeName || '-'}</td>
              <td>{item.operatorName || '-'}</td>
              <td>{formatDate(item.firstOnlineAt)} / {item.daysOnline}天 / {stageLabel(item.daysOnline)}</td>
              <td>{item.isOrdered ? '是' : '否'}</td>
              <td>{formatInteger(item.orderCount)}</td>
              <td>{formatInteger((item as any).orderQuantity)}</td>
              <td>{formatMoney(item.orderSalesAmount)}</td>
              <td>{formatMoney(item.adSpend)}</td>
              <td>{formatInteger(item.adOrderCount)}</td>
              <td>{formatInteger(item.naturalOrderCount)}</td>
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
          {records.length === 0 && <tr><td colSpan={24}>暂无新品快照，请先导入商品信息或重算快照。</td></tr>}
        </tbody>
      </table>
      {total === 0 && <p className="npc-empty-hint">当前筛选范围没有数据。</p>}
    </div>
  );
}

type StrategyTabKey = 'pending' | 'config' | 'execution' | 'review';

function StrategyStatusBadge({ value }: { value?: string }) {
  const normalized = value || 'PENDING';
  const tone = normalized === 'EXECUTED' || normalized === 'ACCEPTED'
    ? 'success'
    : normalized === 'IGNORED' || normalized === 'EXPIRED'
      ? 'muted'
      : 'warning';
  return <span className={`npc-strategy-status npc-strategy-status-${tone}`}>{normalized}</span>;
}

function StrategyEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="npc-strategy-empty">
      <div className="npc-strategy-empty-icon">i</div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function RecommendationsView() {
  const initialType = new URLSearchParams(window.location.search).get('type') || '';
  const [activeTab, setActiveTab] = useState<StrategyTabKey>('pending');
  const [status, setStatus] = useState('PENDING');
  const [type, setType] = useState(initialType);
  const [page, setPage] = useState(1);
  const [config, setConfig] = useState<AdStrategyConfig | null>(null);
  const [pending, setPending] = useState<{ records: AdStrategySuggestion[]; total: number; page?: number; pageSize?: number }>({ records: [], total: 0 });
  const [execution, setExecution] = useState<{ records: AdStrategyExecutionRecord[]; total: number; page?: number; pageSize?: number }>({ records: [], total: 0 });
  const [review, setReview] = useState<{ records: AdStrategyReviewRecord[]; total: number; page?: number; pageSize?: number }>({ records: [], total: 0 });
  const [message, setMessage] = useState('');
  const strategyTypes = ['烧钱无单', '高费比新品', '有流量无转化', '加购未成交', '低曝光新品', '高潜新品', '投放过保守', '投放过激进', '应调至竞争力强', '应调至竞争力中', '应调至竞争力弱', '应调至自定义12', '建议延长测试', '建议提前控本', '建议转入常规商品', '建议暂停/优化'];

  useEffect(() => {
    newProductCenterDataSource.getAdStrategyConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const refreshPending = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    newProductCenterDataSource.getAdStrategyPending(`?${params.toString()}`).then(setPending).catch((error) => {
      setMessage(error instanceof Error ? error.message : String(error));
      setPending({ records: [], total: 0 });
    });
  };

  useEffect(() => {
    if (activeTab === 'pending') refreshPending();
    if (activeTab === 'execution') {
      newProductCenterDataSource.getAdStrategyExecution(buildQuery({ page: String(page), pageSize: '50' }))
        .then(setExecution)
        .catch(() => setExecution({ records: [], total: 0 }));
    }
    if (activeTab === 'review') {
      newProductCenterDataSource.getAdStrategyReview(buildQuery({ page: String(page), pageSize: '50' }))
        .then(setReview)
        .catch(() => setReview({ records: [], total: 0 }));
    }
  }, [activeTab, page, status, type]);

  const handle = async (item: AdStrategySuggestion, nextStatus: string) => {
    if (item.generated) {
      setMessage('阶段策略建议为系统实时诊断结果，请进入商品详情查看诊断，并在 TEMU 后台手动执行。');
      return;
    }
    await newProductCenterDataSource.handleRecommendation(item.id, { status: nextStatus });
    refreshPending();
  };

  const tabItems: Array<{ key: StrategyTabKey; label: string; description: string; count: number; tone: string }> = [
    { key: 'pending', label: '待处理建议', description: '系统发现广告问题', count: pending.total, tone: 'blue' },
    { key: 'config', label: '阶段策略配置', description: '运营配置阶段策略', count: config?.stages?.length || 0, tone: 'violet' },
    { key: 'execution', label: '阶段执行检查', description: '检查是否完成执行', count: execution.total, tone: 'amber' },
    { key: 'review', label: '阶段效果复盘', description: '复盘阶段投放效果', count: review.total, tone: 'green' },
  ];
  const activeTotal = activeTab === 'pending' ? pending.total : activeTab === 'execution' ? execution.total : review.total;
  const totalPages = Math.max(1, Math.ceil((activeTotal || 0) / 50));
  const tabButton = (key: StrategyTabKey, label: string) => {
    const item = tabItems.find((tab) => tab.key === key);
    return (
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === key}
        className={`npc-strategy-tab npc-strategy-tab-${item?.tone || 'blue'}${activeTab === key ? ' is-active' : ''}`}
        onClick={() => { setActiveTab(key); setPage(1); }}
      >
        <span className="npc-strategy-tab-index">{tabItems.findIndex((tab) => tab.key === key) + 1}</span>
        <span className="npc-strategy-tab-copy">
          <strong>{label}</strong>
          <small>{item?.description}</small>
        </span>
        <span className="npc-strategy-tab-count">{item?.count ?? 0}</span>
      </button>
    );
  };

  return (
    <section className="npc-page npc-ad-strategy-page">
      <article className="npc-strategy-hero">
        <div>
          <span className="npc-strategy-kicker">广告策略闭环中心</span>
          <h1>广告策略中心</h1>
          <p>根据广告消耗、订单、ROAS 和出单表现，辅助运营完成广告策略调整闭环。</p>
        </div>
        <div className="npc-strategy-hero-steps" aria-label="广告策略闭环流程">
          <span>发现问题</span>
          <span>生成建议</span>
          <span>人工执行</span>
          <span>效果复盘</span>
        </div>
      </article>
      <article className="excel-record-panel npc-panel npc-strategy-notice">
        <strong>执行说明</strong>
        <span>系统不会自动修改 TEMU 后台广告设置，只生成建议和执行检查。运营仍需在 TEMU 后台手动调整目标ROAS；系统通过后续广告日报中的“自然周目标ROAS（推广）”字段验证是否已执行。</span>
      </article>
      <div className="npc-strategy-tabs">
        {tabButton('pending', '待处理建议')}
        {tabButton('config', '阶段策略配置')}
        {tabButton('execution', '阶段执行检查')}
        {tabButton('review', '阶段效果复盘')}
      </div>
      {message && <div className="excel-import-error">{message}</div>}

      {activeTab === 'pending' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>待处理建议</h2><span>{pending.total} 条</span></header>
          <div className="npc-toolbar">
            <label>建议类型<select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">全部</option>{strategyTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>状态<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">全部</option>{['PENDING', 'ACCEPTED', 'IGNORED', 'EXECUTED', 'EXPIRED'].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="npc-table-wrap npc-strategy-table-wrap">
            <table>
              <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>上架天数</th><th>当前阶段</th><th>计划目标ROAS</th><th>实际目标ROAS</th><th>广告花费</th><th>广告订单</th><th>自然订单</th><th>ROAS</th><th>目标ROAS</th><th>诊断原因</th><th>建议动作</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {pending.records.map((item) => (
                  <tr key={item.id}>
                    <td title={item.productName || '-'}>{item.productName || '-'}</td>
                    <td>{item.storeName || '-'}</td>
                    <td>{item.operatorName || '-'}</td>
                    <td>{item.daysOnline ?? '-'}</td>
                    <td>{item.currentStage || '-'}</td>
                    <td>{formatRoas(item.plannedTargetRoas)}</td>
                    <td>{formatRoas(item.actualTargetRoas)}</td>
                    <td>{formatMoney(item.adSpend)}</td>
                    <td>{item.adOrderCount ?? 0}</td>
                    <td>{item.naturalOrderCount ?? 0}</td>
                    <td>{formatRoas(item.roas)}</td>
                    <td>{formatRoas(item.targetRoas)}</td>
                    <td title={item.reasonText || ''}>{item.reasonText || item.problemType || '-'}</td>
                    <td title={item.suggestedAction || ''}>{item.suggestedAction || item.recommendationText || '-'}</td>
                    <td><StrategyStatusBadge value={item.status} /></td>
                    <td className="npc-actions">
                      <button type="button" onClick={() => void handle(item, 'ACCEPTED')}>采纳</button>
                      <button type="button" onClick={() => void handle(item, 'IGNORED')}>忽略</button>
                      <button type="button" onClick={() => void handle(item, 'EXECUTED')}>标记已执行</button>
                      <a href={`/new-product-center/products/${item.productId}`}>查看诊断</a>
                    </td>
                  </tr>
                ))}
                {pending.records.length === 0 && (
                  <tr className="npc-strategy-empty-row">
                    <td colSpan={16}>
                      <StrategyEmptyState
                        title="暂无待处理建议"
                        description="当前筛选条件下没有需要处理的广告策略建议。你可以切换建议类型、状态，或确认广告日报数据是否已导入。"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeTab === 'config' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>阶段策略配置</h2><span>默认新品 30 天广告阶段策略</span></header>
          <div className="npc-stage-card-grid">
            {(config?.stages || []).map((stage, index) => (
              <section key={stage.key}>
                <h3>第{index + 1}阶段：{stage.name}</h3>
                <p>上架第 {stage.dayStart}-{stage.dayEnd} 天</p>
                <strong>{stage.bidLevel}</strong>
                <span>目标ROAS：{formatRoas(stage.targetRoas)}</span>
                <small>{stage.goal}</small>
              </section>
            ))}
          </div>
          <div className="npc-threshold-grid">
            <label>烧钱无单花费阈值<input value={config?.thresholds.burnNoOrderSpend ?? 5} readOnly /></label>
            <label>点击阈值<input value={config?.thresholds.clickThreshold ?? 30} readOnly /></label>
            <label>加购阈值<input value={config?.thresholds.addToCartThreshold ?? 3} readOnly /></label>
            <label>低曝光阈值<input value={config?.thresholds.lowExposureThreshold ?? 50} readOnly /></label>
            <label>投放过保守<input value="实际目标ROAS > 计划目标ROAS × 1.2" readOnly /></label>
            <label>投放过激进<input value="实际目标ROAS < 计划目标ROAS × 0.8" readOnly /></label>
          </div>
        </article>
      )}

      {activeTab === 'execution' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>阶段执行检查</h2><span>{execution.total} 条</span></header>
          <div className="npc-table-wrap npc-strategy-table-wrap">
            <table>
              <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>上架天数</th><th>当前阶段</th><th>计划目标ROAS</th><th>实际目标ROAS</th><th>执行状态</th><th>阶段效果</th><th>下一步动作</th></tr></thead>
              <tbody>
                {execution.records.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName || '-'}</td><td>{item.storeName || '-'}</td><td>{item.operatorName || '-'}</td><td>{item.daysOnline}</td><td>{item.currentStage || '-'}</td><td>{formatRoas(item.plannedTargetRoas)}</td><td>{formatRoas(item.actualTargetRoas)}</td><td><StrategyStatusBadge value={item.executionStatus} /></td><td>{item.stageEffect || '-'}</td><td>{item.nextAction || '-'}</td>
                  </tr>
                ))}
                {execution.records.length === 0 && (
                  <tr className="npc-strategy-empty-row">
                    <td colSpan={10}>
                      <StrategyEmptyState title="暂无阶段执行检查数据" description="当前没有可检查的阶段执行记录，请确认广告日报数据和新品基础数据是否已导入。" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeTab === 'review' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>阶段效果复盘</h2><span>{review.total} 条</span></header>
          <StageReviewTable rows={review.records} />
        </article>
      )}
      {activeTab !== 'config' && (
        <div className="temu-product-record-pagination npc-strategy-pagination">
          <span>第 {page}/{totalPages} 页</span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>下一页</button>
          </div>
        </div>
      )}
    </section>
  );
}

function StageReviewTable({ rows }: { rows: AdStrategyReviewRecord[] }) {
  return (
    <div className="npc-table-wrap npc-strategy-table-wrap">
      <table>
        <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>阶段名称</th><th>阶段日期</th><th>计划目标ROAS</th><th>实际目标ROAS</th><th>广告花费</th><th>广告销售额</th><th>广告订单</th><th>自然订单</th><th>曝光</th><th>点击</th><th>加购</th><th>ROAS</th><th>系统判断</th><th>运营动作</th></tr></thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={`${item.productId || index}-${item.stageName}`}>
              <td>{item.productName || '-'}</td><td>{item.storeName || '-'}</td><td>{item.operatorName || '-'}</td><td>{item.stageName || '-'}</td><td>{item.stageDate || '-'}</td><td>{formatRoas(item.plannedTargetRoas)}</td><td>{formatRoas(item.actualTargetRoas)}</td><td>{formatMoney(item.adSpend)}</td><td>{formatMoney(item.adSalesAmount)}</td><td>{item.adOrderCount ?? 0}</td><td>{item.naturalOrderCount ?? 0}</td><td>{formatNumber(item.impressions)}</td><td>{formatNumber(item.clicks)}</td><td>{formatNumber(item.addToCartCount)}</td><td>{formatRoas(item.roas)}</td><td>{item.systemJudgement || '-'}</td><td>{item.operatorAction || '-'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="npc-strategy-empty-row">
              <td colSpan={17}>
                <StrategyEmptyState title="暂无阶段效果复盘数据" description="当前没有可复盘的阶段效果数据，请确认广告日报和订单数据是否已完整导入。" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
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
      <article className="excel-record-panel npc-panel">
        <header className="npc-panel-header"><h2>广告阶段复盘</h2><span>{data.adStageReview?.length || 0} 个阶段</span></header>
        <StageReviewTable rows={data.adStageReview || []} />
      </article>
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
