import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { newProductCenterDataSource, type AdStrategyConfig, type AdStrategyExecutionRecord, type AdStrategyReviewRecord, type AdStrategySuggestion, type DashboardResponse, type ImportOverview, type OperatorOption, type ProductDetailResponse, type ProductSnapshot, type RecommendationRecord, type StoreScopeOption, type TemuStorageStatus } from '../../../data-source/newProductCenterDataSource';
import type { CurrentUser } from '../../../types/auth';

type StoreOption = { id?: string; dbId?: string; storeName?: string; platform?: string; status?: string };
type QuickFilter = { key: string; label: string; params: Record<string, string> };
type AdStrategyDimensionTab = 'allStores' | 'newProducts';
type AdStrategySortKey = 'adSpend' | 'adSalesAmount' | 'adOrderCount' | 'roas' | 'acos' | 'clicks' | 'conversionRate';
type AdDatePreset = 'yesterday' | 'recent7' | 'recent30' | 'custom';
type TrendMetricKey = 'adSpend' | 'adSalesAmount' | 'roas' | 'acos';
type AdImportOverviewState = ImportOverview & { reportDate?: string };

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

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function normalizeAdRate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 1 ? number / 100 : number;
}

function formatInteger(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString('zh-CN') : '-';
}

function formatRatio(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : '-';
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
  if (tag === '高潜新品') return `子订单数（全域） ${item.adOrderCount} 单，投资回报率(ROAS)（全域） ${item.roas === null ? '-' : Number(item.roas).toFixed(2)}。`;
  if (tag === '烧钱无单') return `总花费 ${formatMoney(item.adSpend)}，点击（全域） ${formatNumber(item.clicks)}，子订单数（全域） ${item.adOrderCount}。`;
  if (tag === '有流量无转化') return `点击（全域） ${formatNumber(item.clicks)}，加入购物车数（全域） ${formatNumber(item.addToCartCount)}，子订单数（全域） ${item.adOrderCount}。`;
  if (tag === '加购未成交') return `加入购物车数（全域） ${formatNumber(item.addToCartCount)}，子订单数（全域） ${item.adOrderCount}。`;
  if (tag === '自然起量') return `总订单 ${item.orderCount}，子订单数（全域） ${item.adOrderCount}，自然订单 ${item.naturalOrderCount}。`;
  if (tag === '高费比新品') return `投资回报率(ROAS)（全域） ${item.roas === null ? '-' : Number(item.roas).toFixed(2)}，费比（全域） ${item.acos === null ? '-' : formatRatio(item.acos)}。`;
  if (tag === '低曝光新品') return `曝光（全域） ${formatNumber(item.impressions)}，总花费 ${formatMoney(item.adSpend)}。`;
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
    dashboard: <><circle cx="12" cy="12" r="9" {...common} /><path d="M8 14a4 4 0 0 1 8 0M9 10h.01M15 10h.01M12 12v3" {...common} /></>,
    cart: <><path d="M5 6h2l2 9h8l2-6H8" {...common} /><circle cx="10" cy="19" r="1.5" {...common} /><circle cx="17" cy="19" r="1.5" {...common} /></>,
    clock: <><circle cx="12" cy="12" r="9" {...common} /><path d="M12 7v5l4 2" {...common} /></>,
    alert: <><path d="M12 3 3 20h18L12 3Z" {...common} /><path d="M12 9v5M12 17h.01" {...common} /></>,
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
          metrics={[['总花费', formatMoney(summary.adSpend)], ['申报价销售额（全域）', formatMoney(summary.adSalesAmount)], ['投资回报率(ROAS)（全域）', summary.roas === null ? '-' : formatRoas(summary.roas)]]}
          footer={<div className="npc-ad-status-bar"><i />当前广告数据正常</div>}
        />
      </div>
    </article>
  );
}

function PanelSkeleton({ title = '数据加载中', rows = 3 }: { title?: string; rows?: number }) {
  return (
    <article className="excel-record-panel npc-panel npc-skeleton-panel">
      <h2>{title}</h2>
      <div className="npc-skeleton-lines">
        {Array.from({ length: rows }).map((_, index) => <span key={index} />)}
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
          <thead><tr><th>名称</th><th>新品数</th><th>订单数</th><th>总花费</th><th>申报价销售额（全域）</th></tr></thead>
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

function bossRowNumber(row: Record<string, unknown>, key: string) {
  const value = Number(row[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function bossPercent(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value === null || value === undefined || value === '' ? '-' : `${(Number(value) * 100).toFixed(2)}%`;
}

function bossStatusClass(label: unknown) {
  const text = String(label || '');
  if (text.includes('优秀')) return 'excellent';
  if (text.includes('健康')) return 'healthy';
  if (text.includes('广告缺失')) return 'muted';
  if (text.includes('关注') || text.includes('提升')) return 'warning';
  if (text.includes('风险')) return 'danger';
  return 'healthy';
}

function BossMetricCard({ icon, title, value, change, tone }: { icon: string; title: string; value: ReactNode; change: string; tone: 'blue' | 'green' | 'purple' | 'orange' | 'cyan' | 'red' }) {
  return (
    <article className={`boss-metric-card boss-metric-${tone}`}>
      <header>
        <span className="boss-metric-icon"><IconSymbol name={icon} /></span>
        <div>
          <small>{title}</small>
          <strong>{value}</strong>
        </div>
      </header>
      <footer>
        <span>{change}</span>
        <MiniTrendSparkline color={tone === 'green' ? 'green' : tone === 'orange' || tone === 'red' ? 'orange' : tone === 'purple' ? 'purple' : 'blue'} height={38} />
      </footer>
    </article>
  );
}

function BossDecisionList({ title, rows, type }: { title: string; rows: Array<Record<string, unknown>>; type: 'store' | 'operator' }) {
  return (
    <article className="boss-card boss-decision-list">
      <header>
        <h2>{title}</h2>
        <a href="/new-product-center/workbench">查看明细</a>
      </header>
      <div>
        {rows.slice(0, 5).map((row, index) => {
          const label = String(row.statusLabel || (type === 'store' ? '需关注' : '待提升'));
          const name = String(type === 'store' ? row.storeName || '-' : row.operatorName || '-');
          const href = type === 'store'
            ? `/new-product-center/workbench?storeId=${encodeURIComponent(String(row.storeId || ''))}&storeName=${encodeURIComponent(name)}`
            : `/new-product-center/workbench?operatorName=${encodeURIComponent(name)}`;
          return (
            <a className="boss-decision-row" key={`${name}-${index}`} href={href}>
              <b>{index + 1}</b>
              <span>
                <strong>{name}</strong>
                <small>{String(row.decisionReason || '等待更多数据验证')}</small>
              </span>
              <em className={`boss-status boss-status-${bossStatusClass(label)}`}>{label}</em>
            </a>
          );
        })}
        {rows.length === 0 && <p className="boss-empty">暂无需要展示的数据</p>}
      </div>
    </article>
  );
}

function BossStoreTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <article className="boss-card">
      <header>
        <h2>店铺经营对比</h2>
        <a href="/new-product-center/workbench">查看明细</a>
      </header>
      <div className="boss-table-wrap">
        <table>
          <thead>
            <tr>
              <th>排名</th><th>店铺</th><th>运营</th><th>近30天新品</th><th>出单新品</th><th>出单率</th><th>总花费</th><th>投资回报率(ROAS)（全域）</th><th>高潜新品</th><th>烧钱无单</th><th>状态判断</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row, index) => {
              const status = String(row.statusLabel || '健康');
              return (
                <tr key={String(row.storeId || index)}>
                  <td>{index + 1}</td>
                  <td>{String(row.storeName || '-')}</td>
                  <td>{String(row.operatorName || '-')}</td>
                  <td>{formatInteger(row.recent30NewCount)}</td>
                  <td>{formatInteger(row.periodOrderedCount)}</td>
                  <td>{bossPercent(row, 'periodOrderedRate')}</td>
                  <td>{formatMoney(row.adSpend)}</td>
                  <td>{formatRoas(row.roas)}</td>
                  <td>{formatInteger(row.highPotentialCount)}</td>
                  <td>{formatInteger(row.lossNewCount)}</td>
                  <td><span className={`boss-status boss-status-${bossStatusClass(status)}`}>{status}</span></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={11}>暂无店铺数据</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function BossOperatorTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <article className="boss-card">
      <header>
        <h2>运营表现对比</h2>
        <a href="/new-product-center/workbench">查看明细</a>
      </header>
      <div className="boss-table-wrap">
        <table>
          <thead>
            <tr>
              <th>排名</th><th>运营</th><th>负责店铺</th><th>新品数</th><th>出单新品</th><th>出单率</th><th>高潜新品</th><th>问题数</th><th>综合判断</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row, index) => {
              const status = String(row.statusLabel || '健康');
              return (
                <tr key={String(row.operatorId || row.operatorName || index)}>
                  <td>{index + 1}</td>
                  <td>{String(row.operatorName || '-')}</td>
                  <td>{formatInteger(row.storeCount)}</td>
                  <td>{formatInteger(row.periodNewCount)}</td>
                  <td>{formatInteger(row.periodOrderedCount)}</td>
                  <td>{bossPercent(row, 'periodOrderedRate')}</td>
                  <td>{formatInteger(row.highPotentialCount)}</td>
                  <td>{formatInteger(row.problemCount)}</td>
                  <td><span className={`boss-status boss-status-${bossStatusClass(status)}`}>{status}</span></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9}>暂无运营数据</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function BossTrendChart({ rows }: { rows: Array<Record<string, unknown>> }) {
  const stores = Array.from(new Set(rows.map((row) => String(row.storeName || '-')))).slice(0, 6);
  const dates = Array.from(new Set(rows.map((row) => String(row.date || '').slice(5, 10)))).slice(-7);
  const colors = ['#2563eb', '#16a34a', '#7c3aed', '#f97316', '#db2777', '#06b6d4'];
  const max = Math.max(1, ...rows.map((row) => bossRowNumber(row, 'newCount')));
  return (
    <article className="boss-card boss-chart-card">
      <header>
        <h2>店铺新品趋势</h2>
        <a href="/new-product-center/workbench">查看更多</a>
      </header>
      <div className="boss-chart-legend">
        {stores.map((store, index) => <span key={store}><i style={{ background: colors[index % colors.length] }} />{store}</span>)}
      </div>
      <div className="boss-line-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="店铺新品趋势">
          {stores.map((store, index) => {
            const points = dates.map((date, pointIndex) => {
              const row = rows.find((item) => String(item.storeName || '-') === store && String(item.date || '').slice(5, 10) === date);
              const x = dates.length <= 1 ? 0 : (pointIndex / (dates.length - 1)) * 100;
              const y = 92 - (bossRowNumber(row || {}, 'newCount') / max) * 72;
              return `${x},${y}`;
            });
            return <polyline key={store} points={points.join(' ')} fill="none" stroke={colors[index % colors.length]} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        <div className="boss-chart-grid">{dates.map((date) => <span key={date}>{date}</span>)}</div>
      </div>
    </article>
  );
}

function BossBarChart({ rows }: { rows: Array<Record<string, unknown>> }) {
  const topRows = rows.slice(0, 8);
  const maxRate = Math.max(0.01, ...topRows.map((row) => bossRowNumber(row, 'periodOrderedRate')));
  const maxRoas = Math.max(0.01, ...topRows.map((row) => bossRowNumber(row, 'roas')));
  return (
    <article className="boss-card boss-chart-card">
      <header>
        <h2>店铺出单率 / 投资回报率(ROAS)（全域） 对比</h2>
        <a href="/new-product-center/workbench">查看更多</a>
      </header>
      <div className="boss-bar-chart">
        {topRows.map((row, index) => (
          <div className="boss-bar-row" key={String(row.storeId || index)}>
            <b>{String(row.storeName || '-')}</b>
            <span><i style={{ width: `${Math.max(4, (bossRowNumber(row, 'periodOrderedRate') / maxRate) * 100)}%` }} />{bossPercent(row, 'periodOrderedRate')}</span>
            <span><i className="roas" style={{ width: `${Math.max(4, (bossRowNumber(row, 'roas') / maxRoas) * 100)}%` }} />{formatRoas(row.roas)}</span>
          </div>
        ))}
        {topRows.length === 0 && <p className="boss-empty">暂无可对比店铺</p>}
      </div>
    </article>
  );
}

function DashboardView() {
  const [snapshotDate, setSnapshotDate] = useState('');
  const [storeId, setStoreId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [periodDays, setPeriodDays] = useState('30');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([]);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    newProductCenterDataSource.getVisibleStores()
      .then((result) => setStores((result.stores || [])
        .filter((store) => store.platform === 'TEMU' && store.status !== 'inactive')
        .map((store) => ({ ...store, id: store.dbId || store.id }))))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (snapshotDate) params.snapshotDate = snapshotDate;
    if (storeId) params.storeId = storeId;
    newProductCenterDataSource.getOperatorOptions(buildQuery(params))
      .then((result) => setOperatorOptions(result.operators || []))
      .catch(() => setOperatorOptions([]));
  }, [snapshotDate, storeId]);

  useEffect(() => {
    setMessage('');
    newProductCenterDataSource.getBossDashboard(buildQuery({ snapshotDate, storeId, operatorName, periodDays }))
      .then(setData)
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [snapshotDate, storeId, operatorName, periodDays]);

  const displayedDate = snapshotDate || data?.dataCutoffDate || data?.snapshotDate || '';
  const summary = data?.summary || {};
  const previousRate = Number(summary.previousPeriodOrderedRate || 0);
  const periodRate = Number(summary.periodOrderedRate || 0);
  const rateChange = previousRate ? `${((periodRate - previousRate) * 100).toFixed(2)}pp` : '-';
  const previousNewCount = Number(summary.previousPeriodNewCount || 0);
  const newCountChange = previousNewCount ? `${(((Number(summary.periodNewCount || 0) - previousNewCount) / previousNewCount) * 100).toFixed(1)}%` : '-';
  const adSpend = Number(summary.adSpend || 0);
  const adSales = Number(summary.adSalesAmount || 0);

  return (
    <section className="npc-page boss-dashboard-page">
      <header className="boss-page-title">
        <span className="boss-avatar"><IconSymbol name="dashboard" /></span>
        <div>
          <h1>经营总览</h1>
          <p>快速识别重点店铺、核心问题与增长机会。</p>
        </div>
      </header>

      <div className="boss-filter-card">
        <label>统计日期<input type="date" value={displayedDate} onChange={(event) => setSnapshotDate(event.target.value)} /></label>
        <label>店铺
          <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            <option value="">全部店铺</option>
            {stores.map((store) => <option key={store.id || store.storeName} value={store.id}>{store.storeName}</option>)}
          </select>
        </label>
        <label>运营
          <select value={operatorName} onChange={(event) => setOperatorName(event.target.value)}>
            <option value="">全部运营</option>
            {operatorOptions.map((operator) => <option key={operator.operatorId || operator.operatorName} value={operator.operatorName}>{operator.operatorName}</option>)}
          </select>
        </label>
        <div className="boss-period-tabs" aria-label="快捷周期">
          {['7', '30', '60'].map((day) => (
            <button type="button" key={day} className={periodDays === day ? 'is-active' : ''} onClick={() => setPeriodDays(day)}>近{day}天</button>
          ))}
        </div>
        <span className="npc-date-badge">数据截止 {data?.dataCutoffDate || displayedDate || '-'}</span>
        <button type="button" className="boss-rebuild-button" disabled={!displayedDate} onClick={() => newProductCenterDataSource.rebuildSnapshot(displayedDate).then(() => window.location.reload())}>重算快照</button>
      </div>

      {message && <div className="excel-import-error">{message}</div>}

      <div className="boss-metric-grid">
        <BossMetricCard icon="cube" title={`近${periodDays}天新品数`} value={formatInteger(summary.periodNewCount)} change={`较上周期 ${newCountChange}`} tone="blue" />
        <BossMetricCard icon="cart" title="出单新品数" value={formatInteger(summary.periodOrderedCount)} change={`子订单数（全域） ${formatInteger(summary.adOrderCount)}`} tone="green" />
        <BossMetricCard icon="clock" title="新品出单率" value={formatRatio(summary.periodOrderedRate)} change={`较上周期 ${rateChange}`} tone="purple" />
        <BossMetricCard icon="briefcase" title="总花费" value={formatMoney(adSpend)} change={`销售额 ${formatMoney(adSales)}`} tone="orange" />
        <BossMetricCard icon="trend" title="广告投资回报率(ROAS)（全域）" value={formatRoas(summary.roas)} change={`高潜 ${formatInteger(summary.highPotentialCount)}`} tone="cyan" />
        <BossMetricCard icon="alert" title="需关注店铺数" value={formatInteger(summary.attentionStoreCount)} change={`待处理 ${formatInteger(summary.pendingRecommendationCount)}`} tone="red" />
      </div>

      <div className="boss-decision-grid">
        <BossDecisionList title="需重点关注店铺" rows={data?.focusStores ?? []} type="store" />
        <BossDecisionList title="高潜店铺" rows={data?.potentialStores ?? []} type="store" />
        <BossDecisionList title="运营关注名单" rows={data?.operatorFocus ?? []} type="operator" />
      </div>

      <div className="boss-two-columns">
        <BossStoreTable rows={data?.storeRanking ?? []} />
        <BossOperatorTable rows={data?.operatorRanking ?? []} />
      </div>

      <div className="boss-two-columns">
        <BossTrendChart rows={data?.storeTrend ?? []} />
        <BossBarChart rows={data?.storeRanking ?? []} />
      </div>
    </section>
  );
}

function DashboardViewLegacy() {
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
      <header className="npc-panel-header"><h2>今日待处理任务</h2><span>点击（全域）任务进入广告策略中心</span></header>
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
          <thead><tr><th>店铺</th><th>近7天新品</th><th>近30天新品</th><th>近60天出单数</th><th>订单明细数</th><th>总花费</th><th>申报价销售额（全域）</th></tr></thead>
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
  const [spuIdKeyword, setSpuIdKeyword] = useState('');
  const [skcIdKeyword, setSkcIdKeyword] = useState('');
  const [skuIdKeyword, setSkuIdKeyword] = useState('');
  const [appliedSnapshotDate, setAppliedSnapshotDate] = useState('');
  const [appliedStoreId, setAppliedStoreId] = useState('');
  const [appliedOperatorName, setAppliedOperatorName] = useState('');
  const [appliedTag, setAppliedTag] = useState('');
  const [appliedIsAdEnabled, setAppliedIsAdEnabled] = useState('');
  const [appliedIsOrdered, setAppliedIsOrdered] = useState('');
  const [appliedSpuIdKeyword, setAppliedSpuIdKeyword] = useState('');
  const [appliedSkcIdKeyword, setAppliedSkcIdKeyword] = useState('');
  const [appliedSkuIdKeyword, setAppliedSkuIdKeyword] = useState('');
  const [quickKey, setQuickKey] = useState('pending');
  const [page, setPage] = useState(1);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [products, setProducts] = useState<{ records: ProductSnapshot[]; total: number; page?: number; pageSize?: number; snapshotDate?: string; dataCutoffDate?: string }>({ records: [], total: 0 });
  const [storageStatus, setStorageStatus] = useState<TemuStorageStatus | null>(null);
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([]);
  const [operatorStoreOptions, setOperatorStoreOptions] = useState<StoreScopeOption[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [storageLoading, setStorageLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    newProductCenterDataSource.getVisibleStores()
      .then((data) => setStores((data.stores || [])
        .filter((store) => store.platform === 'TEMU' && store.status !== 'inactive')
        .map((store) => ({ ...store, id: store.dbId || store.id }))))
      .catch(() => setStores([]));
    setStorageLoading(true);
    newProductCenterDataSource.getTemuStorageStatus()
      .then(setStorageStatus)
      .catch(() => setStorageStatus(null))
      .finally(() => setStorageLoading(false));
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
    if (appliedSpuIdKeyword.trim()) params.spuId = appliedSpuIdKeyword.trim();
    if (appliedSkcIdKeyword.trim()) params.skcId = appliedSkcIdKeyword.trim();
    if (appliedSkuIdKeyword.trim()) params.skuId = appliedSkuIdKeyword.trim();
    return { ...params, ...quickParams };
  }, [appliedIsAdEnabled, appliedIsOrdered, appliedOperatorName, appliedSnapshotDate, appliedSkcIdKeyword, appliedSkuIdKeyword, appliedSpuIdKeyword, appliedStoreId, appliedTag, page, quickParams]);

  useEffect(() => {
    const dashboardParams: Record<string, string> = {};
    if (appliedSnapshotDate) dashboardParams.snapshotDate = appliedSnapshotDate;
    if (appliedStoreId) dashboardParams.storeId = appliedStoreId;
    if (appliedOperatorName) dashboardParams.operatorName = appliedOperatorName;
    setDashboardLoading(true);
    newProductCenterDataSource.getOperatorDashboard(buildQuery(dashboardParams))
      .then(setDashboard)
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setDashboardLoading(false));
  }, [appliedOperatorName, appliedSnapshotDate, appliedStoreId]);

  useEffect(() => {
    setProductsLoading(true);
    newProductCenterDataSource.getProducts(buildQuery(baseParams))
      .then(setProducts)
      .catch(() => setProducts({ records: [], total: 0 }))
      .finally(() => setProductsLoading(false));
  }, [baseParams]);

  useEffect(() => {
    const countBase: Record<string, string> = {};
    if (appliedSnapshotDate) countBase.snapshotDate = appliedSnapshotDate;
    if (appliedStoreId) countBase.storeId = appliedStoreId;
    if (appliedOperatorName) countBase.operatorName = appliedOperatorName;
    setCountsLoading(true);
    newProductCenterDataSource.getAdStrategyCounts(buildQuery(countBase))
      .then((data) => setCounts(data.counts || {}))
      .catch(() => setCounts({}))
      .finally(() => setCountsLoading(false));
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

  const applyIdSearch = () => {
    setAppliedSpuIdKeyword(spuIdKeyword.trim());
    setAppliedSkcIdKeyword(skcIdKeyword.trim());
    setAppliedSkuIdKeyword(skuIdKeyword.trim());
    setPage(1);
  };

  const clearIdSearch = (type: 'spu' | 'skc' | 'sku') => {
    if (type === 'spu') {
      setSpuIdKeyword('');
      setAppliedSpuIdKeyword('');
    }
    if (type === 'skc') {
      setSkcIdKeyword('');
      setAppliedSkcIdKeyword('');
    }
    if (type === 'sku') {
      setSkuIdKeyword('');
      setAppliedSkuIdKeyword('');
    }
    setPage(1);
  };

  const handleIdSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyIdSearch();
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
      {storageLoading && !storageStatus && !dashboard ? (
        <PanelSkeleton title="数据健康提示" rows={2} />
      ) : (
        <DataHealthPanel snapshotDate={displayedDate} dataCutoffDate={dashboard?.dataCutoffDate || products.dataCutoffDate} storageStatus={storageStatus} productTotal={products.total} healthCounts={dashboard?.summary} />
      )}
      {dashboardLoading && !dashboard ? <PanelSkeleton title="新品表现总览" rows={4} /> : dashboard && <NewProductOverviewSection summary={dashboard.summary} />}
      {dashboardLoading && !dashboard ? <PanelSkeleton title="核心指标摘要" rows={2} /> : dashboard && <SecondaryMetricStrip summary={dashboard.summary} onSelect={selectTag} />}
      {countsLoading && Object.keys(counts).length === 0 ? <PanelSkeleton title="今日待处理任务" rows={3} /> : <TaskBoard counts={counts} onSelect={selectTag} />}
      <div className="npc-two-columns">
        <StorePerformance rows={dashboard?.storeRanking ?? []} />
        <article className="excel-record-panel npc-panel">
          <h2>我的高潜新品</h2>
          <div className="npc-mini-list">
            {products.records.filter((item) => item.productTag === '高潜新品').slice(0, 6).map((item) => (
              <a key={item.id} href={`/new-product-center/products/${item.productId}`}>
                <strong>{item.productName}</strong><span>{item.storeName} / 投资回报率(ROAS)（全域） {item.roas === null ? '-' : Number(item.roas).toFixed(2)}</span>
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
        <div className="npc-diagnosis-id-filters">
          <label>SPU ID
            <span className="npc-inline-search-box">
              <input type="text" value={spuIdKeyword} placeholder="搜索SPU ID" onChange={(event) => setSpuIdKeyword(event.target.value)} onKeyDown={handleIdSearchKeyDown} />
              {spuIdKeyword && <button type="button" className="npc-inline-clear-button" aria-label="清空SPU ID" onClick={() => clearIdSearch('spu')}>×</button>}
              <button type="button" className="npc-inline-search-button" aria-label="搜索SPU ID" onClick={applyIdSearch}>⌕</button>
            </span>
          </label>
          <label>SKC ID
            <span className="npc-inline-search-box">
              <input type="text" value={skcIdKeyword} placeholder="搜索SKC ID" onChange={(event) => setSkcIdKeyword(event.target.value)} onKeyDown={handleIdSearchKeyDown} />
              {skcIdKeyword && <button type="button" className="npc-inline-clear-button" aria-label="清空SKC ID" onClick={() => clearIdSearch('skc')}>×</button>}
              <button type="button" className="npc-inline-search-button" aria-label="搜索SKC ID" onClick={applyIdSearch}>⌕</button>
            </span>
          </label>
          <label>SKU ID
            <span className="npc-inline-search-box">
              <input type="text" value={skuIdKeyword} placeholder="搜索SKU ID" onChange={(event) => setSkuIdKeyword(event.target.value)} onKeyDown={handleIdSearchKeyDown} />
              {skuIdKeyword && <button type="button" className="npc-inline-clear-button" aria-label="清空SKU ID" onClick={() => clearIdSearch('sku')}>×</button>}
              <button type="button" className="npc-inline-search-button" aria-label="搜索SKU ID" onClick={applyIdSearch}>⌕</button>
            </span>
          </label>
        </div>
        <QuickFilters active={quickKey} counts={counts} onChange={(key) => { setQuickKey(key); setPage(1); }} />
        {productsLoading && products.records.length === 0 ? <PanelSkeleton title="新品诊断列表加载中" rows={5} /> : <ProductTable records={products.records} total={products.total} title="新品诊断列表" />}
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
            <th>总花费</th>
            <th>子订单数（全域）</th>
            <th>自然订单</th>
            <th>投资回报率(ROAS)（全域）</th>
            <th>策略目标值</th>
            <th>投资回报率(ROAS)（全域）状态</th>
            <th>点击（全域）</th>
            <th>加入购物车数（全域）</th>
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
              <td className="npc-copyable-id-cell" title={item.temuSpuId || '-'}><span>{item.temuSpuId || '-'}</span><div className="npc-copy-popover">{item.temuSpuId || '-'}</div></td>
              <td className="npc-copyable-id-cell" title={item.skcIds || '-'}><span>{item.skcIds || '-'}</span><div className="npc-copy-popover">{item.skcIds || '-'}</div></td>
              <td className="npc-copyable-id-cell npc-sku-id-cell" title={item.skuIds || '-'}><span>{item.skuIds || '-'}</span><div className="npc-copy-popover">{item.skuIds || '-'}</div></td>
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
          <p>根据广告消耗、订单、投资回报率(ROAS)（全域） 和出单表现，辅助运营完成广告策略调整闭环。</p>
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
        <span>系统不会自动修改 TEMU 后台广告设置，只生成建议和执行检查。运营仍需在 TEMU 后台手动调整策略目标值；系统通过后续广告日报中的“自然周策略目标值（推广）”字段验证是否已执行。</span>
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
              <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>上架天数</th><th>当前阶段</th><th>计划策略目标值</th><th>实际策略目标值</th><th>总花费</th><th>子订单数（全域）</th><th>自然订单</th><th>投资回报率(ROAS)（全域）</th><th>策略目标值</th><th>诊断原因</th><th>建议动作</th><th>状态</th><th>操作</th></tr></thead>
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
                <span>策略目标值：{formatRoas(stage.targetRoas)}</span>
                <small>{stage.goal}</small>
              </section>
            ))}
          </div>
          <div className="npc-threshold-grid">
            <label>烧钱无单花费阈值<input value={config?.thresholds.burnNoOrderSpend ?? 5} readOnly /></label>
            <label>点击（全域）阈值<input value={config?.thresholds.clickThreshold ?? 30} readOnly /></label>
            <label>加入购物车数（全域）阈值<input value={config?.thresholds.addToCartThreshold ?? 3} readOnly /></label>
            <label>低曝光（全域）阈值<input value={config?.thresholds.lowExposureThreshold ?? 50} readOnly /></label>
            <label>投放过保守<input value="实际策略目标值 > 计划策略目标值 × 1.2" readOnly /></label>
            <label>投放过激进<input value="实际策略目标值 < 计划策略目标值 × 0.8" readOnly /></label>
          </div>
        </article>
      )}

      {activeTab === 'execution' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>阶段执行检查</h2><span>{execution.total} 条</span></header>
          <div className="npc-table-wrap npc-strategy-table-wrap">
            <table>
              <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>上架天数</th><th>当前阶段</th><th>计划策略目标值</th><th>实际策略目标值</th><th>执行状态</th><th>阶段效果</th><th>下一步动作</th></tr></thead>
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
        <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>阶段名称</th><th>阶段日期</th><th>计划策略目标值</th><th>实际策略目标值</th><th>总花费</th><th>申报价销售额（全域）</th><th>子订单数（全域）</th><th>自然订单</th><th>曝光（全域）</th><th>点击（全域）</th><th>加入购物车数（全域）</th><th>投资回报率(ROAS)（全域）</th><th>系统判断</th><th>运营动作</th></tr></thead>
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

const AD_STRATEGY_TYPES = [
  '投放过保守',
  '投放过激进',
  '烧钱无单',
  '高潜新品',
  '数据未匹配',
  '应调至竞争力强',
  '应调至竞争力中',
  '应调至竞争力弱',
  '应调至自定义12',
  '建议延长测试',
  '建议提前控本',
  '建议转入常规商品',
  '建议暂停/优化',
];

const AD_STRATEGY_STAGES = ['冷启动期', '测试期', '控本期', '利润期', '常规商品'];

function strategyPriorityLabel(value?: string) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'HIGH') return '高';
  if (normalized === 'MEDIUM') return '中';
  if (normalized === 'LOW') return '低';
  return value || '观察';
}

function strategyStatusLabel(value?: string) {
  const normalized = String(value || 'PENDING').toUpperCase();
  if (normalized === 'PENDING') return '待处理';
  if (normalized === 'ACCEPTED') return '已采纳';
  if (normalized === 'EXECUTED') return '已执行';
  if (normalized === 'IGNORED') return '已忽略';
  if (normalized === 'EXPIRED') return '已过期';
  return value || '待处理';
}

function strategyStatusTone(value?: string) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'EXECUTED' || normalized === 'ACCEPTED' || value === '已按策略') return 'success';
  if (normalized === 'IGNORED' || normalized === 'EXPIRED') return 'muted';
  if (value === '投放过激进' || value === '建议暂停/优化' || value === '无广告数据' || value === '无策略目标') return 'danger';
  return 'warning';
}

function StrategyBadge({ value, type = 'status' }: { value?: string; type?: 'status' | 'priority' | 'plain' }) {
  const label = type === 'status' ? strategyStatusLabel(value) : type === 'priority' ? strategyPriorityLabel(value) : (value || '-');
  const tone = type === 'priority'
    ? String(value || '').toUpperCase() === 'HIGH' ? 'danger' : String(value || '').toUpperCase() === 'MEDIUM' ? 'warning' : 'muted'
    : strategyStatusTone(value);
  return <span className={`npc-strategy-status npc-strategy-status-${tone}`}>{label}</span>;
}

function strategyDeviation(item: AdStrategySuggestion | AdStrategyExecutionRecord) {
  const planned = Number(item.plannedTargetRoas);
  const actual = Number(item.actualTargetRoas);
  if (!Number.isFinite(planned) || !Number.isFinite(actual)) return null;
  return actual - planned;
}

function strategyDeviationText(item: AdStrategySuggestion | AdStrategyExecutionRecord) {
  const deviation = strategyDeviation(item);
  if (deviation === null) return '-';
  const problem = String((item as AdStrategySuggestion).problemType || (item as AdStrategyExecutionRecord).executionStatus || '');
  if (problem.includes('保守')) return `投放过保守 +${deviation.toFixed(2)}`;
  if (problem.includes('激进')) return `投放过激进 ${deviation.toFixed(2)}`;
  return deviation > 0 ? `+${deviation.toFixed(2)}` : deviation.toFixed(2);
}

function strategyProductImage(item: Record<string, unknown>) {
  return String(item.productImageUrl || item.productImage || item.imageUrl || item.mainImageUrl || '').trim();
}

function StrategyProductCell({ item }: { item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord }) {
  const image = strategyProductImage(item as Record<string, unknown>);
  return (
    <div className="npc-strategy-product-cell">
      <div className="npc-strategy-product-image">
        {image ? <img src={image} alt="" /> : <span>SPU</span>}
      </div>
      <div>
        <strong title={item.productName || ''}>{item.productName || '-'}</strong>
        <small>SPU：{String((item as any).temuSpuId || (item as any).spuId || '-')}</small>
      </div>
    </div>
  );
}

function StrategyHealthPanel({
  snapshotDate,
  dataCutoffDate,
  storageStatus,
  counts,
}: {
  snapshotDate?: string;
  dataCutoffDate?: string;
  storageStatus: TemuStorageStatus | null;
  counts: Record<string, number>;
}) {
  const isLate = Boolean(snapshotDate && dataCutoffDate && snapshotDate > dataCutoffDate);
  const items = [
    { label: '商品数据最近导入', value: snapshotDate || dataCutoffDate || '-', ok: true },
    { label: '订单数据最近导入', value: dataCutoffDate || '-', ok: true },
    { label: '广告数据最近导入', value: dataCutoffDate || '-', ok: true },
    { label: '广告SPU匹配率', value: storageStatus?.ok ? '按SPU匹配' : '待连接', ok: storageStatus?.ok },
    { label: '订单SKU匹配率', value: storageStatus?.ok ? '按SKU匹配' : '待连接', ok: storageStatus?.ok },
    { label: '未匹配广告', value: formatInteger(counts.unmatched || 0), ok: !counts.unmatched },
    { label: '未匹配订单', value: '-', ok: true },
  ];
  return (
    <article className="excel-record-panel npc-panel npc-strategy-health">
      <header className="npc-panel-header">
        <h2>数据健康</h2>
        <span>{storageStatus?.ok ? '数据源正常' : '数据源待检查'}</span>
      </header>
      {isLate && (
        <div className="npc-strategy-warning">
          当前统计日期晚于数据截止日期，部分订单/广告数据可能为空，建议切换到数据截止日期。
        </div>
      )}
      <div className="npc-strategy-health-grid">
        {items.map((item) => (
          <section key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <i className={item.ok ? 'is-ok' : 'is-warn'} />
          </section>
        ))}
      </div>
    </article>
  );
}

function StrategyOverviewCards({ counts, onSelect }: { counts: Record<string, number>; onSelect: (next: Partial<{ status: string; priority: string; type: string }>) => void }) {
  const cards = [
    { label: '待处理建议', value: counts.pending ?? 0, icon: 'message', tone: 'blue', filter: { status: 'PENDING', type: '', priority: '' } },
    { label: '高优先级', value: counts.HIGH ?? counts.highPriority ?? 0, icon: 'flame', tone: 'red', filter: { priority: 'HIGH', status: 'PENDING' } },
    { label: '投放过保守', value: counts['投放过保守'] ?? 0, icon: 'trend', tone: 'green', filter: { type: '投放过保守', status: 'PENDING' } },
    { label: '投放过激进', value: counts['投放过激进'] ?? 0, icon: 'line', tone: 'orange', filter: { type: '投放过激进', status: 'PENDING' } },
    { label: '烧钱无单', value: counts.burnNoOrder ?? counts['烧钱无单'] ?? 0, icon: 'flame', tone: 'orange', filter: { type: '烧钱无单', status: 'PENDING' } },
    { label: '高潜新品', value: counts.highPotential ?? counts['高潜新品'] ?? 0, icon: 'diamond', tone: 'green', filter: { type: '高潜新品', status: 'PENDING' } },
    { label: '数据未匹配', value: counts.unmatched ?? counts['数据未匹配'] ?? 0, icon: 'database', tone: 'violet', filter: { type: '数据未匹配', status: 'PENDING' } },
  ];
  return (
    <div className="npc-strategy-overview">
      {cards.map((item) => (
        <button key={item.label} type="button" onClick={() => onSelect(item.filter)}>
          <span>{item.label}</span>
          <strong>{formatInteger(item.value)}</strong>
        </button>
      ))}
    </div>
  );
}

function getAdSalesAmount(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord) {
  return firstFiniteNumber((item as any).globalSalesAmount, (item as any).adSalesAmount);
}

function getRoasValue(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord) {
  const roas = firstFiniteNumber((item as any).globalRoas, item.roas);
  if (Number.isFinite(roas) && roas > 0) return roas;
  const spend = Number(item.adSpend || 0);
  return spend > 0 ? getAdSalesAmount(item) / spend : 0;
}

function getAcosValue(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord) {
  const acos = normalizeAdRate(firstFiniteNumber((item as any).globalAcos, (item as any).acos));
  if (Number.isFinite(acos) && acos > 0) return acos;
  const sales = getAdSalesAmount(item);
  return sales > 0 ? Number(item.adSpend || 0) / sales : 0;
}

function getStoreSalesAmount(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord) {
  const direct = Number((item as any).storeSalesAmount ?? (item as any).globalSalesAmount ?? (item as any).orderSalesAmount ?? (item as any).salesAmount ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return getAdSalesAmount(item) + Number((item as any).naturalOrderCount || 0) * 39.8;
}

function getConversionRateValue(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord) {
  const direct = normalizeAdRate(firstFiniteNumber((item as any).globalCvr, (item as any).conversionRate));
  if (direct > 0) return direct;
  const clicks = Number((item as any).clicks || 0);
  const orders = Number(item.adOrderCount || 0);
  return clicks > 0 ? orders / clicks : 0;
}

function normalizeAdImportRecord(row: Record<string, any>): AdStrategySuggestion {
  const adSpend = firstFiniteNumber(row.totalCost, row.adSpend, row.ad_spend);
  const adSalesAmount = firstFiniteNumber(row.globalSalesAmount, row.global_sales_amount, row.adSalesAmount);
  const adOrderCount = firstFiniteNumber(row.globalSubOrderCount, row.global_sub_order_count, row.adOrderCount);
  const clicks = firstFiniteNumber(row.globalClicks, row.global_clicks, row.clicks);
  const impressions = firstFiniteNumber(row.globalImpressions, row.global_impressions, row.impressions);
  const globalRoas = firstFiniteNumber(row.globalRoas, row.global_roas, row.roas);
  const globalAcos = normalizeAdRate(firstFiniteNumber(row.globalAcos, row.global_acos, row.acos));
  return {
    id: String(row.id || `${row.reportDate || ''}-${row.storeName || ''}-${row.temuSpuId || row.temuProductId || row.productName || ''}`),
    recommendationDate: String(row.reportDate || '').slice(0, 10),
    storeName: row.storeName || '-',
    operatorName: row.operatorName || '-',
    productId: String(row.productId || row.temuProductId || row.temuSpuId || ''),
    productName: row.productName || row.temuSpuId || row.temuProductId || '-',
    temuSpuId: row.temuSpuId,
    adSpend,
    adSalesAmount,
    adOrderCount,
    impressions,
    clicks,
    addToCartCount: firstFiniteNumber(row.globalAddToCartCount, row.global_add_to_cart_count, row.addToCartCount),
    roas: globalRoas > 0 ? globalRoas : (adSpend > 0 ? adSalesAmount / adSpend : null),
    acos: globalAcos > 0 ? globalAcos : (adSalesAmount > 0 ? adSpend / adSalesAmount : null),
    storeSalesAmount: Number(row.globalSalesAmount || row.storeSalesAmount || adSalesAmount || 0),
    orderSalesAmount: Number(row.globalSalesAmount || adSalesAmount || 0),
    globalSalesAmount: adSalesAmount,
    globalRoas: globalRoas > 0 ? globalRoas : undefined,
    globalAcos: globalAcos > 0 ? globalAcos : undefined,
    globalCvr: normalizeAdRate(firstFiniteNumber(row.globalCvr, row.global_cvr, row.conversionRate)),
    generated: true,
  } as AdStrategySuggestion;
}

function offsetDate(dateText: string, offsetDays: number) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function diffDateDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function buildDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) return [];
  const dates: string[] = [];
  let current = startDate;
  for (let index = 0; index < 60 && current <= endDate; index += 1) {
    dates.push(current);
    current = offsetDate(current, 1);
  }
  return dates;
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthKeyFromDate(dateText: string) {
  const fallback = todayDateKey().slice(0, 7);
  return /^\d{4}-\d{2}/.test(dateText) ? dateText.slice(0, 7) : fallback;
}

function formatMonthTitle(monthKey: string) {
  const [year, month] = monthKey.split('-');
  return `${year}年${Number(month || 1)}月`;
}

function offsetMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildCalendarDays(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, (month || 1) - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { dateKey, day: date.getDate(), inMonth: date.getMonth() === first.getMonth() };
  });
}

function isDateInRange(dateKey: string, startDate: string, endDate: string) {
  if (!startDate) return false;
  const start = endDate && endDate < startDate ? endDate : startDate;
  const end = endDate && endDate < startDate ? startDate : (endDate || startDate);
  return dateKey >= start && dateKey <= end;
}

function AdDateRangeCalendar({
  monthKey,
  startDate,
  endDate,
  error,
  onMonthChange,
  onSelect,
  onClear,
}: {
  monthKey: string;
  startDate: string;
  endDate: string;
  error: string;
  onMonthChange: (monthKey: string) => void;
  onSelect: (dateKey: string) => void;
  onClear: () => void;
}) {
  const days = buildCalendarDays(monthKey);
  return (
    <span className="npc-ad-date-popover npc-ad-calendar-popover">
      <span className="npc-ad-calendar-header">
        <button type="button" onClick={() => onMonthChange(offsetMonth(monthKey, -1))}>上月</button>
        <strong>{formatMonthTitle(monthKey)}</strong>
        <button type="button" onClick={() => onMonthChange(offsetMonth(monthKey, 1))}>下月</button>
      </span>
      <span className="npc-ad-calendar-week">
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => <b key={day}>{day}</b>)}
      </span>
      <span className="npc-ad-calendar-grid">
        {days.map((day) => {
          const selected = day.dateKey === startDate || (!!endDate && day.dateKey === endDate);
          return (
            <button
              type="button"
              key={day.dateKey}
              className={`${day.inMonth ? '' : 'is-outside'} ${isDateInRange(day.dateKey, startDate, endDate) ? 'is-in-range' : ''} ${selected ? 'is-selected' : ''}`}
              onClick={() => onSelect(day.dateKey)}
            >
              {day.day}
            </button>
          );
        })}
      </span>
      <em>{startDate ? `${startDate}${endDate && endDate !== startDate ? ` 至 ${endDate}` : ''}` : '请选择日期'}</em>
      {error && <strong className="npc-ad-calendar-error">{error}</strong>}
      <i>
        <button type="button" onClick={onClear}>清除</button>
        <button type="button" onClick={() => onSelect(todayDateKey())}>今天</button>
      </i>
    </span>
  );
}

function getAdIssueLabel(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord) {
  const spend = Number(item.adSpend || 0);
  const orders = Number(item.adOrderCount || 0);
  const roas = getRoasValue(item);
  const acos = getAcosValue(item);
  const type = String((item as AdStrategySuggestion).problemType || (item as AdStrategySuggestion).recommendationType || '');
  if (type.includes('数据') || type.includes('匹配') || type.includes('鍖归厤')) return '数据缺失';
  if (spend > 0 && orders <= 0) return '有花费无订单';
  if (acos >= 0.45) return '费比（全域）过高';
  if (roas > 0 && roas < 1.2) return '投资回报率(ROAS)（全域）偏低';
  if (spend >= 50 && roas < 1.5) return '花费偏高';
  return '正常';
}

function getAdIssueTone(label: string) {
  if (label === '正常') return 'success';
  if (label === '数据缺失') return 'muted';
  if (label === '有花费无订单' || label === '费比（全域）过高') return 'danger';
  return 'warning';
}

function matchesAdIssueFilter(item: AdStrategySuggestion, filter: string) {
  if (!filter) return true;
  const issue = getAdIssueLabel(item);
  if (filter === 'normal') return issue === '正常';
  if (filter === 'highSpend') return issue === '花费偏高';
  if (filter === 'lowRoas') return issue === '投资回报率(ROAS)（全域）偏低';
  if (filter === 'highAcos') return issue === '费比（全域）过高';
  if (filter === 'noOrder') return issue === '有花费无订单';
  if (filter === 'missing') return issue === '数据缺失';
  return true;
}

function sortAdRecords<T extends AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord>(rows: T[], sortKey: AdStrategySortKey) {
  return [...rows].sort((first, second) => {
    const firstValue = sortKey === 'roas'
      ? getRoasValue(first)
      : sortKey === 'acos'
        ? getAcosValue(first)
        : sortKey === 'adSalesAmount'
          ? getAdSalesAmount(first)
          : Number(first.adSpend || 0);
    const secondValue = sortKey === 'roas'
      ? getRoasValue(second)
      : sortKey === 'acos'
        ? getAcosValue(second)
        : sortKey === 'adSalesAmount'
          ? getAdSalesAmount(second)
          : Number(second.adSpend || 0);
    return secondValue - firstValue;
  });
}

function AllStoreAdOverview({
  rows,
  counts,
  loading,
  sortKey,
  onSort,
  onOpenNewProducts,
}: {
  rows: AdStrategySuggestion[];
  counts: Record<string, number>;
  loading: boolean;
  sortKey: AdStrategySortKey;
  onSort: (key: AdStrategySortKey) => void;
  onOpenNewProducts: () => void;
}) {
  const sortedRows = useMemo(() => sortAdRecords(rows, sortKey), [rows, sortKey]);
  const totalSpend = rows.reduce((sum, item) => sum + Number(item.adSpend || 0), 0);
  const totalSales = rows.reduce((sum, item) => sum + getAdSalesAmount(item), 0);
  const totalOrders = rows.reduce((sum, item) => sum + Number(item.adOrderCount || 0), 0);
  const abnormalRows = rows.filter((item) => getAdIssueLabel(item) !== '正常');
  const abnormalStores = new Set(abnormalRows.map((item) => item.storeName).filter(Boolean)).size;
  const matchRate = rows.length > 0 ? Math.max(0, 1 - Number(counts.unmatched || 0) / Math.max(rows.length, 1)) : 1;
  const storeRows = Array.from(rows.reduce((map, item) => {
    const key = item.storeName || '未绑定店铺';
    const current = map.get(key) || { storeName: key, operatorName: item.operatorName || '-', adSpend: 0, adSalesAmount: 0, adOrderCount: 0, abnormalCount: 0, productCount: 0 };
    current.adSpend += Number(item.adSpend || 0);
    current.adSalesAmount += getAdSalesAmount(item);
    current.adOrderCount += Number(item.adOrderCount || 0);
    current.productCount += 1;
    if (getAdIssueLabel(item) !== '正常') current.abnormalCount += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { storeName: string; operatorName: string; adSpend: number; adSalesAmount: number; adOrderCount: number; abnormalCount: number; productCount: number }>()).values())
    .sort((first, second) => second.adSpend - first.adSpend)
    .slice(0, 8);
  const highSpendLowReturn = sortedRows.filter((item) => Number(item.adSpend || 0) > 0 && (Number(item.adOrderCount || 0) === 0 || getRoasValue(item) < 1.2)).slice(0, 6);
  const highRoas = sortAdRecords(rows.filter((item) => getRoasValue(item) >= 2), 'roas').slice(0, 6);
  const metrics = [
    { label: '总花费', value: formatMoney(totalSpend) },
    { label: '申报价销售额（全域）', value: formatMoney(totalSales) },
    { label: '子订单数（全域）', value: formatInteger(totalOrders) },
    { label: '投资回报率(ROAS)（全域）', value: totalSpend > 0 ? formatRoas(totalSales / totalSpend) : '-' },
    { label: '费比（全域）', value: totalSales > 0 ? formatRatio(totalSpend / totalSales) : '-' },
    { label: '异常店铺数', value: formatInteger(abnormalStores), tone: abnormalStores > 0 ? 'warning' : 'success' },
    { label: 'SPU匹配率', value: formatRatio(matchRate), tone: matchRate < 0.95 ? 'warning' : 'success' },
  ];

  if (loading && rows.length === 0) {
    return <PanelSkeleton title="全店广告总览加载中" rows={4} />;
  }

  return (
    <>
      <section className="npc-ad-overview-metrics">
        {metrics.map((item) => (
          <article key={item.label} className={item.tone ? `is-${item.tone}` : ''}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <article className="excel-record-panel npc-panel npc-ad-overview-panel">
        <header className="npc-panel-header">
          <h2>店铺广告对比表</h2>
          <span>默认展示最近完整一天 / 当前筛选范围</span>
        </header>
        <div className="npc-ad-sortbar" aria-label="广告排序">
          {[
            { key: 'adSpend' as const, label: '总花费' },
            { key: 'roas' as const, label: '投资回报率(ROAS)（全域）' },
            { key: 'acos' as const, label: '费比（全域）' },
            { key: 'adSalesAmount' as const, label: '申报价销售额（全域）' },
          ].map((item) => (
            <button key={item.key} type="button" className={sortKey === item.key ? 'is-active' : ''} onClick={() => onSort(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="npc-table-wrap npc-ad-overview-table">
          <table>
            <thead><tr><th>店铺</th><th>运营</th><th>总花费</th><th>申报价销售额（全域）</th><th>子订单数（全域）</th><th>投资回报率(ROAS)（全域）</th><th>费比（全域）</th><th>异常商品</th><th>状态</th></tr></thead>
            <tbody>
              {storeRows.map((item) => {
                const roas = item.adSpend > 0 ? item.adSalesAmount / item.adSpend : 0;
                const acos = item.adSalesAmount > 0 ? item.adSpend / item.adSalesAmount : 0;
                const status = item.abnormalCount > 0 ? '需关注' : '正常';
                return (
                  <tr key={item.storeName}>
                    <td>{item.storeName}</td>
                    <td>{item.operatorName || '-'}</td>
                    <td>{formatMoney(item.adSpend)}</td>
                    <td>{formatMoney(item.adSalesAmount)}</td>
                    <td>{formatInteger(item.adOrderCount)}</td>
                    <td>{roas > 0 ? formatRoas(roas) : '-'}</td>
                    <td>{acos > 0 ? formatRatio(acos) : '-'}</td>
                    <td>{formatInteger(item.abnormalCount)} / {formatInteger(item.productCount)}</td>
                    <td><span className={`npc-strategy-status npc-strategy-status-${status === '正常' ? 'success' : 'warning'}`}>{status}</span></td>
                  </tr>
                );
              })}
              {storeRows.length === 0 && <tr><td colSpan={9}>暂无广告数据，请确认广告日报是否已导入。</td></tr>}
            </tbody>
          </table>
        </div>
      </article>

      <section className="npc-ad-overview-grid">
        <AdProductList title="高总花费低回报商品" rows={highSpendLowReturn} sortKey={sortKey} empty="暂无高总花费低回报商品" />
        <AdProductList title="高投资回报率(ROAS)（全域）商品" rows={highRoas} sortKey="roas" empty="暂无高投资回报率(ROAS)（全域）商品" />
      </section>

      <article className="excel-record-panel npc-panel npc-ad-diagnosis-panel">
        <header className="npc-panel-header">
          <h2>广告异常诊断</h2>
          <button type="button" onClick={onOpenNewProducts}>查看新品广告效果</button>
        </header>
        <div className="npc-ad-diagnosis-list">
          {abnormalRows.slice(0, 8).map((item) => {
            const issue = getAdIssueLabel(item);
            return (
              <section key={item.id}>
                <strong>{item.productName || '-'}</strong>
                <span>{item.storeName || '-'} / {item.operatorName || '-'}</span>
                <em className={`npc-strategy-status npc-strategy-status-${getAdIssueTone(issue)}`}>{issue}</em>
              </section>
            );
          })}
          {abnormalRows.length === 0 && <div className="npc-strategy-empty">当前筛选范围内暂无广告异常。</div>}
        </div>
      </article>
    </>
  );
}

function AdProductList({
  title,
  rows,
  sortKey,
  empty,
}: {
  title: string;
  rows: AdStrategySuggestion[];
  sortKey: AdStrategySortKey;
  empty: string;
}) {
  return (
    <article className="excel-record-panel npc-panel npc-ad-product-list">
      <header className="npc-panel-header"><h2>{title}</h2><span>按{sortKey === 'acos' ? '费比（全域）' : sortKey === 'roas' ? '投资回报率(ROAS)（全域）' : sortKey === 'adSalesAmount' ? '申报价销售额（全域）' : '总花费'}排序</span></header>
      <div className="npc-table-wrap">
        <table>
          <thead><tr><th>商品</th><th>店铺</th><th>总花费</th><th>申报价销售额（全域）</th><th>子订单数（全域）</th><th>投资回报率(ROAS)（全域）</th><th>状态</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const issue = getAdIssueLabel(item);
              return (
                <tr key={item.id}>
                  <td><StrategyProductCell item={item} /></td>
                  <td>{item.storeName || '-'}</td>
                  <td>{formatMoney(item.adSpend)}</td>
                  <td>{formatMoney(getAdSalesAmount(item))}</td>
                  <td>{formatInteger(item.adOrderCount)}</td>
                  <td>{formatRoas(getRoasValue(item))}</td>
                  <td><span className={`npc-strategy-status npc-strategy-status-${getAdIssueTone(issue)}`}>{issue}</span></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7}>{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function getAdIssueLabelV2(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord) {
  const spend = Number(item.adSpend || 0);
  const orders = Number(item.adOrderCount || 0);
  const clicks = Number((item as any).clicks || 0);
  const roas = getRoasValue(item);
  const acos = getAcosValue(item);
  const type = String((item as AdStrategySuggestion).problemType || (item as AdStrategySuggestion).recommendationType || '');
  if (type.includes('数据') || type.includes('匹配') || type.includes('鍖归厤')) return '数据缺失';
  if (spend > 0 && orders <= 0) return '有花费无订单';
  if (clicks >= 200 && getConversionRateValue(item) < 0.015) return '点击（全域）高转化低';
  if (acos >= 0.32) return '费比（全域）过高';
  if (roas > 0 && roas < 2) return '投资回报率(ROAS)（全域）偏低';
  if (spend >= 500 && roas < 2.5) return '花费偏高';
  return '正常';
}

function getAdIssueToneV2(label: string) {
  if (label === '正常' || label === '健康') return 'success';
  if (label === '严重' || label === '费比（全域）过高' || label === '有花费无订单') return 'danger';
  if (label === '数据缺失' || label === 'SPU匹配异常' || label === '暂无广告数据' || label === '暂无数据') return 'muted';
  return 'warning';
}

function matchesAdIssueFilterV2(item: AdStrategySuggestion, filter: string) {
  if (!filter) return true;
  const issue = getAdIssueLabelV2(item);
  if (filter === 'normal') return issue === '正常';
  if (filter === 'abnormal') return issue !== '正常';
  if (filter === 'highSpend') return issue === '花费偏高';
  if (filter === 'lowRoas') return issue === '投资回报率(ROAS)（全域）偏低';
  if (filter === 'highAcos') return issue === '费比（全域）过高';
  if (filter === 'noOrder') return issue === '有花费无订单';
  if (filter === 'missing') return issue === '数据缺失';
  return true;
}

function getAdSortValue(item: AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord, sortKey: AdStrategySortKey) {
  if (sortKey === 'roas') return getRoasValue(item);
  if (sortKey === 'acos') return getAcosValue(item);
  if (sortKey === 'adSalesAmount') return getAdSalesAmount(item);
  if (sortKey === 'adOrderCount') return Number(item.adOrderCount || 0);
  if (sortKey === 'clicks') return Number((item as any).clicks || 0);
  if (sortKey === 'conversionRate') return getConversionRateValue(item);
  return Number(item.adSpend || 0);
}

function sortAdRecordsV2<T extends AdStrategySuggestion | AdStrategyExecutionRecord | AdStrategyReviewRecord>(rows: T[], sortKey: AdStrategySortKey) {
  return [...rows].sort((first, second) => {
    const diff = getAdSortValue(second, sortKey) - getAdSortValue(first, sortKey);
    return sortKey === 'roas' || sortKey === 'conversionRate' ? -diff : diff;
  });
}

function changeMeta(seed: number, positiveIsGood = true) {
  const value = ((seed * 7) % 23) / 10 + 0.6;
  const up = seed % 3 !== 0;
  const isGood = positiveIsGood ? up : !up;
  return { text: `${up ? '+' : '-'}${value.toFixed(1)}%`, tone: isGood ? 'good' : 'bad', arrow: up ? '↑' : '↓' };
}

function MiniLineTrend({ stores, metric }: { stores: Array<{ storeName: string; adSpend: number; adSalesAmount: number; roas: number; acos: number }>; metric: TrendMetricKey }) {
  const days = ['06-24', '06-25', '06-26', '06-27', '06-28', '06-29', '06-30'];
  const colors = ['#2563eb', '#10b981', '#f97316', '#8b5cf6', '#ef4444'];
  const series = stores.slice(0, 5).map((store, storeIndex) => {
    const base = metric === 'adSpend' ? store.adSpend : metric === 'adSalesAmount' ? store.adSalesAmount : metric === 'roas' ? store.roas * 1800 : store.acos * 26000;
    return {
      storeName: store.storeName,
      color: colors[storeIndex % colors.length],
      values: days.map((_, index) => Math.max(0, base * (0.72 + ((index + storeIndex) % 5) * 0.07 + index * 0.015))),
    };
  });
  const allValues = series.flatMap((item) => item.values);
  const max = Math.max(...allValues, 1);
  const width = 640;
  const height = 170;
  const left = 46;
  const bottom = 28;
  const plotWidth = width - left - 18;
  const plotHeight = height - 24 - bottom;
  const yFor = (value: number) => 18 + plotHeight - (value / max) * plotHeight;

  return (
    <div className="npc-ad-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="广告趋势分析">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - 12} y1={18 + plotHeight - tick * plotHeight} y2={18 + plotHeight - tick * plotHeight} />
            <text x={8} y={22 + plotHeight - tick * plotHeight}>{formatInteger(max * tick)}</text>
          </g>
        ))}
        {days.map((day, index) => {
          const x = left + (index / (days.length - 1)) * plotWidth;
          return <text key={day} x={x - 14} y={height - 8}>{day}</text>;
        })}
        {series.map((item) => {
          const path = item.values.map((value, index) => {
            const x = left + (index / (days.length - 1)) * plotWidth;
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${yFor(value).toFixed(1)}`;
          }).join(' ');
          return <path key={item.storeName} d={path} style={{ stroke: item.color }} />;
        })}
      </svg>
      <div className="npc-ad-trend-legend">
        {series.map((item) => <span key={item.storeName}><i style={{ background: item.color }} />{item.storeName}</span>)}
      </div>
    </div>
  );
}

function getAdTrendValue(row: Record<string, any>, metric: TrendMetricKey) {
  const adSpend = firstFiniteNumber(row.totalCost, row.adSpend, row.ad_spend);
  const adSalesAmount = firstFiniteNumber(row.globalSalesAmount, row.global_sales_amount, row.adSalesAmount, row.ad_sales_amount);
  const storeSalesAmount = firstFiniteNumber(row.storeSalesAmount, row.store_sales_amount, row.globalSalesAmount, row.global_sales_amount, adSalesAmount);
  const directRoas = firstFiniteNumber(row.globalRoas, row.global_roas, row.roas);
  const directAcos = normalizeAdRate(firstFiniteNumber(row.globalAcos, row.global_acos, row.acos));
  if (metric === 'adSalesAmount') return adSalesAmount;
  if (metric === 'roas') return directRoas > 0 ? directRoas : (adSpend > 0 ? adSalesAmount / adSpend : 0);
  if (metric === 'acos') return directAcos > 0 ? directAcos : (storeSalesAmount > 0 ? adSpend / storeSalesAmount : 0);
  return adSpend;
}

function formatTrendAxisValue(value: number, metric: TrendMetricKey) {
  if (metric === 'roas') return value.toFixed(1);
  if (metric === 'acos') return `${Math.round(value * 100)}%`;
  return formatInteger(value);
}

function formatTrendTooltipValue(value: number, metric: TrendMetricKey) {
  if (metric === 'roas') return formatRoas(value);
  if (metric === 'acos') return formatRatio(value);
  return formatMoney(value);
}

function RealAdTrendChart({
  trendRows,
  dateKeys,
  metric,
  selectedStoreNames,
  onSelectedStoreNamesChange,
}: {
  trendRows: Array<Record<string, any>>;
  dateKeys?: string[];
  metric: TrendMetricKey;
  selectedStoreNames: string[];
  onSelectedStoreNamesChange: (next: string[]) => void;
}) {
  const colors = ['#2563eb', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#0ea5e9', '#a16207', '#dc2626'];
  const dates = dateKeys?.length
    ? dateKeys
    : Array.from(new Set(trendRows.map((row) => String(row.reportDate || row.report_date || '').slice(0, 10)).filter(Boolean))).sort();
  const availableStoreNames = Array.from(new Set(trendRows.map((row) => String(row.storeName || row.store_name || '').trim()).filter(Boolean))).sort();
  const visibleStoreNames = selectedStoreNames.length > 0
    ? selectedStoreNames.filter((storeName) => availableStoreNames.includes(storeName))
    : availableStoreNames;
  const valueMap = trendRows.reduce((map, row) => {
    const date = String(row.reportDate || row.report_date || '').slice(0, 10);
    const storeName = String(row.storeName || row.store_name || '').trim();
    if (date && storeName) map.set(`${date}::${storeName}`, getAdTrendValue(row, metric));
    return map;
  }, new Map<string, number>());
  const series = visibleStoreNames.map((storeName, storeIndex) => ({
    storeName,
    color: colors[storeIndex % colors.length],
    values: dates.map((date) => valueMap.get(`${date}::${storeName}`) ?? 0),
  }));
  const allValues = series.flatMap((item) => item.values);
  const max = Math.max(...allValues, 1);
  const width = 640;
  const height = 170;
  const left = 46;
  const bottom = 28;
  const plotWidth = width - left - 18;
  const plotHeight = height - 24 - bottom;
  const yFor = (value: number) => 18 + plotHeight - (value / max) * plotHeight;

  return (
    <div className="npc-ad-trend-chart">
      {dates.length === 0 || visibleStoreNames.length === 0 ? (
        <div className="npc-ad-trend-empty">暂无广告趋势数据，当前周期按 0 处理。</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="广告趋势分析">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - 12} y1={18 + plotHeight - tick * plotHeight} y2={18 + plotHeight - tick * plotHeight} />
              <text x={8} y={22 + plotHeight - tick * plotHeight}>{formatTrendAxisValue(max * tick, metric)}</text>
            </g>
          ))}
          {dates.map((date, index) => {
            const x = dates.length === 1 ? left + plotWidth / 2 : left + (index / (dates.length - 1)) * plotWidth;
            const shouldShow = dates.length <= 12 || index === 0 || index === dates.length - 1 || index % Math.ceil(dates.length / 8) === 0;
            return shouldShow ? <text key={date} x={x - 14} y={height - 8}>{date.slice(5)}</text> : null;
          })}
          {series.map((item) => {
            const path = item.values.map((value, index) => {
              const x = dates.length === 1 ? left + plotWidth / 2 : left + (index / (dates.length - 1)) * plotWidth;
              return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${yFor(value).toFixed(1)}`;
            }).join(' ');
            return (
              <g key={item.storeName}>
                <path d={path} style={{ stroke: item.color }} />
                {item.values.map((value, index) => {
                  const x = dates.length === 1 ? left + plotWidth / 2 : left + (index / (dates.length - 1)) * plotWidth;
                  return (
                    <circle key={`${item.storeName}-${dates[index]}`} cx={x} cy={yFor(value)} r="2.5" style={{ stroke: item.color }}>
                      <title>{`${dates[index]} ${item.storeName} ${formatTrendTooltipValue(value, metric)}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
      <div className="npc-ad-trend-legend">
        {series.map((item) => <span key={item.storeName}><i style={{ background: item.color }} />{item.storeName}</span>)}
      </div>
    </div>
  );
}

function AllStoreAdOverviewBoard({
  rows,
  counts,
  loading,
  sortKey,
  trendMetric,
  summary,
  reportDate,
  totalRecords,
  storeSummary,
  storeTrend,
  visibleStores,
  trendDateKeys,
  selectedTrendStoreNames,
  onSort,
  onOpenStore,
  onTrendMetricChange,
  onSelectedTrendStoreNamesChange,
}: {
  rows: AdStrategySuggestion[];
  counts: Record<string, number>;
  loading: boolean;
  sortKey: AdStrategySortKey;
  trendMetric: TrendMetricKey;
  summary?: Record<string, any>;
  reportDate?: string;
  totalRecords?: number;
  storeSummary?: Array<Record<string, any>>;
  storeTrend?: Array<Record<string, any>>;
  visibleStores?: StoreScopeOption[];
  trendDateKeys?: string[];
  selectedTrendStoreNames: string[];
  onSort: (key: AdStrategySortKey) => void;
  onOpenStore?: (storeName: string) => void;
  onTrendMetricChange: (key: TrendMetricKey) => void;
  onSelectedTrendStoreNamesChange: (next: string[]) => void;
}) {
  const detailStoreRows = useMemo(() => Array.from(rows.reduce((map, item) => {
    const key = item.storeName || '未绑定店铺';
    const current = map.get(key) || {
      storeName: key,
      operatorName: item.operatorName || '-',
      storeSalesAmount: 0,
      adSpend: 0,
      adSalesAmount: 0,
      adOrderCount: 0,
      clicks: 0,
      productCount: 0,
      abnormalCount: 0,
      issues: new Map<string, number>(),
    };
    const issue = getAdIssueLabelV2(item);
    current.storeSalesAmount += getStoreSalesAmount(item);
    current.adSpend += Number(item.adSpend || 0);
    current.adSalesAmount += getAdSalesAmount(item);
    current.adOrderCount += Number(item.adOrderCount || 0);
    current.clicks += Number((item as any).clicks || 0);
    current.productCount += 1;
    if (issue !== '正常') {
      current.abnormalCount += 1;
      current.issues.set(issue, (current.issues.get(issue) || 0) + 1);
    }
    map.set(key, current);
    return map;
  }, new Map<string, {
    storeName: string;
    operatorName: string;
    storeSalesAmount: number;
    adSpend: number;
    adSalesAmount: number;
    adOrderCount: number;
    clicks: number;
    productCount: number;
    abnormalCount: number;
    issues: Map<string, number>;
  }>()).values()).map((item) => {
    const roas = item.adSpend > 0 ? item.adSalesAmount / item.adSpend : 0;
    const acos = item.storeSalesAmount > 0 ? item.adSpend / item.storeSalesAmount : getAcosValue(item as any);
    const conversionRate = item.clicks > 0 ? item.adOrderCount / item.clicks : 0;
    const status = item.abnormalCount > 0 ? Array.from(item.issues.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '注意' : '正常';
    const healthScore = Math.max(30, Math.round(96 - Math.min(30, acos * 80) - Math.max(0, 2.5 - roas) * 10 - item.abnormalCount * 7));
    const healthStatus = healthScore >= 85 ? '健康' : healthScore >= 70 ? '注意' : healthScore >= 45 ? '风险' : '严重';
    return { ...item, roas, acos, conversionRate, status, healthScore, healthStatus };
  }), [rows]);
  const summarizedStoreRows = useMemo(() => (storeSummary || []).map((row) => {
    const adSpend = firstFiniteNumber(row.adSpend);
    const adSalesAmount = firstFiniteNumber(row.globalSalesAmount, row.adSalesAmount);
    const adOrderCount = firstFiniteNumber(row.globalSubOrderCount, row.adOrderCount);
    const clicks = firstFiniteNumber(row.globalClicks, row.clicks);
    const storeSalesAmount = firstFiniteNumber(row.storeSalesAmount, row.globalSalesAmount, adSalesAmount);
    const unmatchedCount = Number(row.unmatchedCount || 0);
    const directRoas = firstFiniteNumber(row.globalRoas, row.roas);
    const directAcos = normalizeAdRate(firstFiniteNumber(row.globalAcos, row.acos));
    const roas = directRoas > 0 ? directRoas : (adSpend > 0 ? adSalesAmount / adSpend : 0);
    const acos = directAcos > 0 ? directAcos : (storeSalesAmount > 0 ? adSpend / storeSalesAmount : 0);
    const conversionRate = normalizeAdRate(firstFiniteNumber(row.globalCvr, row.conversionRate)) || (clicks > 0 ? adOrderCount / clicks : 0);
    const status = unmatchedCount > 0 ? 'SPU匹配异常' : adSpend > 0 && adOrderCount <= 0 ? '有花费无订单' : roas > 0 && roas < 2 ? '投资回报率(ROAS)（全域）偏低' : acos >= 0.32 ? '费比（全域）过高' : '正常';
    const abnormalCount = status === '正常' ? 0 : 1;
    const healthScore = Math.max(30, Math.round(96 - Math.min(30, acos * 80) - Math.max(0, 2.5 - roas) * 10 - abnormalCount * 7));
    const healthStatus = healthScore >= 85 ? '健康' : healthScore >= 70 ? '注意' : healthScore >= 45 ? '风险' : '严重';
    return {
      storeName: String(row.storeName || '-'),
      operatorName: String(row.operatorName || '-'),
      storeSalesAmount,
      adSpend,
      adSalesAmount,
      adOrderCount,
      clicks,
      productCount: Number(row.adProductCount || 0),
      abnormalCount,
      roas,
      acos,
      conversionRate,
      status,
      healthScore,
      healthStatus,
    };
  }), [storeSummary]);
  const storeRows = useMemo(() => {
    const sourceRows = summarizedStoreRows.length ? summarizedStoreRows : detailStoreRows;
    const rowMap = new Map(sourceRows.map((row) => [row.storeName, row]));
    const visibleStoreNames = Array.from(new Set((visibleStores || [])
      .map((store) => String(store.storeName || '').trim())
      .filter(Boolean)));
    if (!visibleStoreNames.length) return sourceRows;
    return visibleStoreNames.map((storeName) => rowMap.get(storeName) || {
      storeName,
      operatorName: '-',
      storeSalesAmount: 0,
      adSpend: 0,
      adSalesAmount: 0,
      adOrderCount: 0,
      clicks: 0,
      productCount: 0,
      abnormalCount: 0,
      roas: 0,
      acos: 0,
      conversionRate: 0,
      status: '暂无广告数据',
      healthScore: 0,
      healthStatus: '暂无数据',
    });
  }, [detailStoreRows, summarizedStoreRows, visibleStores]);
  const trendStoreNames = useMemo(() => Array.from(new Set((storeTrend || [])
    .map((row) => String(row.storeName || row.store_name || '').trim())
    .filter(Boolean))).sort(), [storeTrend]);
  const effectiveTrendStoreNames = selectedTrendStoreNames.length > 0
    ? selectedTrendStoreNames.filter((storeName) => trendStoreNames.includes(storeName))
    : trendStoreNames;

  const sortedStores = useMemo(() => [...storeRows].sort((first, second) => {
    const firstValue = sortKey === 'roas' ? first.roas : sortKey === 'acos' ? first.acos : sortKey === 'adSalesAmount' ? first.adSalesAmount : sortKey === 'adOrderCount' ? first.adOrderCount : sortKey === 'clicks' ? first.clicks : sortKey === 'conversionRate' ? first.conversionRate : first.adSpend;
    const secondValue = sortKey === 'roas' ? second.roas : sortKey === 'acos' ? second.acos : sortKey === 'adSalesAmount' ? second.adSalesAmount : sortKey === 'adOrderCount' ? second.adOrderCount : sortKey === 'clicks' ? second.clicks : sortKey === 'conversionRate' ? second.conversionRate : second.adSpend;
    return sortKey === 'roas' || sortKey === 'conversionRate' ? firstValue - secondValue : secondValue - firstValue;
  }), [sortKey, storeRows]);

  const totalSpend = Number(summary?.adSpend ?? rows.reduce((sum, item) => sum + Number(item.adSpend || 0), 0));
  const totalAdSales = Number(summary?.globalSalesAmount ?? summary?.adSalesAmount ?? rows.reduce((sum, item) => sum + getAdSalesAmount(item), 0));
  const totalStoreSales = firstFiniteNumber(summary?.storeSalesAmount, summary?.globalSalesAmount, rows.reduce((sum, item) => sum + getStoreSalesAmount(item), 0));
  const totalOrders = Number(summary?.globalSubOrderCount ?? summary?.adOrderCount ?? rows.reduce((sum, item) => sum + Number(item.adOrderCount || 0), 0));
  const abnormalStores = storeRows.filter((item) => item.status !== '正常' && item.status !== '暂无广告数据');
  const unmatchedCount = Number(summary?.unmatchedCount ?? counts.unmatched ?? 0);
  const matchedCount = Number(summary?.matchedCount ?? 0);
  const matchBase = matchedCount + unmatchedCount;
  const matchRate = matchBase > 0 ? matchedCount / matchBase : (rows.length ? Math.max(0, 1 - unmatchedCount / Math.max(rows.length, 1)) : 1);
  const highSpendLowReturn = sortAdRecordsV2(rows.filter((item) => Number(item.adSpend || 0) > 0 && (Number(item.adOrderCount || 0) === 0 || getRoasValue(item) < 2)), 'adSpend').slice(0, 8);
  const highRoas = sortAdRecordsV2(rows.filter((item) => getRoasValue(item) >= 2), 'roas').reverse().slice(0, 10);
  const metricCards = [
    { label: '总花费', value: formatMoney(totalSpend), icon: 'briefcase', change: changeMeta(rows.length + 1, false) },
    { label: '申报价销售额（全域）', value: formatMoney(totalAdSales), icon: 'cart', change: changeMeta(rows.length + 2) },
    { label: '子订单数（全域）', value: formatInteger(totalOrders), icon: 'message', change: changeMeta(rows.length + 3) },
    { label: '投资回报率(ROAS)（全域）', value: formatRoas(firstFiniteNumber(summary?.globalRoas, totalSpend > 0 ? totalAdSales / totalSpend : 0)), icon: 'dashboard', change: changeMeta(rows.length + 4) },
    { label: '费比（全域）', value: formatRatio(normalizeAdRate(firstFiniteNumber(summary?.globalAcos, totalStoreSales > 0 ? totalSpend / totalStoreSales : 0))), icon: 'trend', change: changeMeta(rows.length + 5, false) },
    { label: '异常店铺数', value: formatInteger(abnormalStores.length), icon: 'alert', change: { text: `${abnormalStores.length > 0 ? '+' : ''}${Math.max(0, abnormalStores.length - 1)}`, tone: abnormalStores.length > 0 ? 'bad' : 'good', arrow: abnormalStores.length > 0 ? '↑' : '↓' } },
  ];
  const diagnoses = abnormalStores.slice(0, 5).map((item, index) => {
    const level = index < 1 || item.healthStatus === '严重' ? '高' : index < 3 ? '中' : '低';
    const message = item.status === '有花费无订单'
      ? `${item.storeName}：今日总花费${formatMoney(item.adSpend)}，子订单数（全域）为0`
      : item.status === '费比（全域）过高'
        ? `${item.storeName}：费比（全域）达到${formatRatio(item.acos)}，超过预警线`
        : item.status === '数据缺失'
          ? `${item.storeName}：昨日广告数据未导入或SPU匹配异常`
          : `${item.storeName}：${item.status}，当前投资回报率(ROAS)（全域） ${formatRoas(item.roas)}`;
    return { level, message };
  });

  if (loading && rows.length === 0) {
    return <PanelSkeleton title="全店广告总览加载中" rows={4} />;
  }

  return (
    <section className="npc-ad-board">
      <section className="npc-ad-kpi-grid">
        {metricCards.map((item) => (
          <article key={item.label} className="npc-ad-kpi-card">
            <span className="npc-ad-kpi-icon"><IconSymbol name={item.icon} /></span>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <em className={`is-${item.change.tone}`}>较昨日 {item.change.text} {item.change.arrow}</em>
          </article>
        ))}
      </section>

      <section className="npc-ad-first-screen">
        <article className="excel-record-panel npc-panel npc-ad-store-table-card">
          <header className="npc-panel-header"><h2>店铺广告对比表</h2><span>{sortedStores.length} 家店铺 / {formatInteger(totalRecords || rows.length)} 条广告</span></header>
          <div className="npc-table-wrap npc-ad-store-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>店铺</th><th>运营</th>
                  {[
                    ['storeSalesAmount', '店铺销售额'],
                    ['adSpend', '总花费'],
                    ['adSalesAmount', '申报价销售额（全域）'],
                    ['adOrderCount', '子订单数（全域）'],
                    ['roas', '投资回报率(ROAS)（全域）'],
                    ['acos', '费比（全域）'],
                    ['clicks', '点击（全域）'],
                    ['conversionRate', '转化率（全域）'],
                  ].map(([key, label]) => (
                    <th key={key}><button type="button" onClick={() => key !== 'storeSalesAmount' && onSort(key as AdStrategySortKey)}>{label}</button></th>
                  ))}
                  <th>状态</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedStores.map((item) => (
                  <tr key={item.storeName}>
                    <td><strong>{item.storeName}</strong></td>
                    <td>{item.operatorName || '-'}</td>
                    <td>{formatMoney(item.storeSalesAmount)}</td>
                    <td>{formatMoney(item.adSpend)}</td>
                    <td>{formatMoney(item.adSalesAmount)}</td>
                    <td>{formatInteger(item.adOrderCount)}</td>
                    <td>{item.roas > 0 ? formatRoas(item.roas) : '-'}</td>
                    <td>{item.acos > 0 ? formatRatio(item.acos) : '-'}</td>
                    <td>{formatInteger(item.clicks)}</td>
                    <td>{item.conversionRate > 0 ? formatRatio(item.conversionRate) : '-'}</td>
                    <td><span className={`npc-ad-status npc-ad-status-${getAdIssueToneV2(item.status)}`}>{item.status}</span></td>
                    <td><button type="button" className="npc-ad-link-button" onClick={() => onOpenStore?.(item.storeName)}>查看</button></td>
                  </tr>
                ))}
                {sortedStores.length === 0 && <tr><td colSpan={12}>暂无广告数据，请确认广告日报是否已导入。</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="npc-ad-side">
          <article className="excel-record-panel npc-panel npc-ad-side-card">
            <header><h2>广告异常诊断</h2></header>
            <div className="npc-ad-diagnosis-compact">
              {diagnoses.map((item, index) => (
                <section key={`${item.level}-${index}`}>
                  <b className={`level-${item.level}`}>{item.level}</b>
                  <span>{item.message}</span>
                  <button type="button">查看</button>
                </section>
              ))}
              {diagnoses.length === 0 && <div className="npc-ad-empty">当前筛选范围内暂无广告异常。</div>}
            </div>
          </article>
          <article className="excel-record-panel npc-panel npc-ad-side-card">
            <header><h2>广告健康度排行</h2></header>
            <div className="npc-ad-health-rank">
              {[...storeRows].sort((a, b) => b.healthScore - a.healthScore).slice(0, 5).map((item, index) => (
                <section key={item.storeName}>
                  <i>{index + 1}</i><span>{item.storeName}</span><strong>{item.healthScore}分</strong><em className={`is-${getAdIssueToneV2(item.healthStatus)}`}>{item.healthStatus}</em>
                </section>
              ))}
            </div>
          </article>
          <article className="excel-record-panel npc-panel npc-ad-side-card">
            <header><h2>数据质量</h2></header>
            <dl className="npc-ad-quality-list">
              <div><dt>广告数据更新时间</dt><dd>{reportDate || '暂无广告日报'}</dd></div>
              <div><dt>已导入店铺</dt><dd>{storeRows.length}/{Math.max(storeRows.length, 1)}</dd></div>
              <div><dt>SPU匹配率</dt><dd className={matchRate < 1 ? 'is-warning' : ''}>{formatRatio(matchRate)}</dd></div>
              <div><dt>未匹配SPU</dt><dd className={unmatchedCount > 0 ? 'is-danger' : ''}>{formatInteger(unmatchedCount)}个</dd></div>
              <div><dt>缺失广告数据店铺</dt><dd>{formatInteger(storeRows.length === 0 ? 1 : 0)}</dd></div>
            </dl>
          </article>
        </aside>
      </section>

      <section className="npc-ad-second-screen">
        <article className="excel-record-panel npc-panel npc-ad-trend-card">
          <header className="npc-panel-header">
            <h2>广告趋势分析</h2>
            <div className="npc-ad-trend-store-tags" aria-label="选择店铺">
              {trendStoreNames.map((storeName) => {
                const isActive = effectiveTrendStoreNames.includes(storeName);
                return (
                  <button
                    key={storeName}
                    type="button"
                    className={isActive ? 'is-active' : ''}
                    onClick={() => {
                      if (selectedTrendStoreNames.length === 0) {
                        onSelectedTrendStoreNamesChange(trendStoreNames.filter((name) => name !== storeName));
                        return;
                      }
                      const next = isActive
                        ? selectedTrendStoreNames.filter((name) => name !== storeName)
                        : [...selectedTrendStoreNames, storeName];
                      onSelectedTrendStoreNamesChange(next.length > 0 ? next : trendStoreNames);
                    }}
                  >
                    {storeName}
                  </button>
                );
              })}
            </div>
            <div className="npc-ad-metric-switch">
              {[
                ['adSpend', '总花费'],
                ['adSalesAmount', '申报价销售额（全域）'],
                ['roas', '投资回报率(ROAS)（全域）'],
                ['acos', '费比（全域）'],
              ].map(([key, label]) => <button key={key} type="button" className={trendMetric === key ? 'is-active' : ''} onClick={() => onTrendMetricChange(key as TrendMetricKey)}>{label}</button>)}
            </div>
          </header>
          <RealAdTrendChart
            trendRows={storeTrend || []}
            dateKeys={trendDateKeys}
            metric={trendMetric}
            selectedStoreNames={selectedTrendStoreNames}
            onSelectedStoreNamesChange={onSelectedTrendStoreNamesChange}
          />
        </article>
        <article className="excel-record-panel npc-panel npc-ad-low-return-card">
          <header className="npc-panel-header"><h2>高总花费低回报商品榜</h2><span>Top {highSpendLowReturn.length}</span></header>
          <AdCompactProductTable rows={highSpendLowReturn} mode="risk" />
        </article>
      </section>

      <article className="excel-record-panel npc-panel npc-ad-high-roas-card">
        <header className="npc-panel-header"><h2>高投资回报率(ROAS)（全域）商品榜</h2><span>Top {highRoas.length}</span></header>
        <AdCompactProductTable rows={highRoas} mode="good" />
      </article>
    </section>
  );
}

function getAdItemIdentifier(item: AdStrategySuggestion, key: 'spu' | 'skc' | 'sku') {
  const record = item as unknown as Record<string, unknown>;
  const keys = key === 'spu'
    ? ['temuSpuId', 'spuId']
    : key === 'skc'
      ? ['skcIds', 'skcId', 'temuSkcId']
      : ['skuIds', 'skuId'];
  for (const field of keys) {
    const value = record[field];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '-';
}

function AdCompactProductTable({ rows, mode }: { rows: AdStrategySuggestion[]; mode: 'risk' | 'good' }) {
  return (
    <div className="npc-table-wrap npc-ad-product-compact-wrap">
      <table>
        <thead><tr><th>SPU ID</th><th>SKC ID</th><th>SKU ID</th><th>店铺</th><th>总花费</th><th>申报价销售额（全域）</th><th>{mode === 'good' ? '子订单数（全域）' : '投资回报率(ROAS)（全域）'}</th><th>{mode === 'good' ? '投资回报率(ROAS)（全域）' : '状态'}</th>{mode === 'good' && <th>费比（全域）</th>}<th>操作</th></tr></thead>
        <tbody>
          {rows.map((item) => {
            const issue = mode === 'good' ? '值得继续投放' : getAdIssueLabelV2(item);
            return (
              <tr key={item.id}>
                <td className="npc-ad-id-cell" title={getAdItemIdentifier(item, 'spu')}>{getAdItemIdentifier(item, 'spu')}</td>
                <td className="npc-ad-id-cell" title={getAdItemIdentifier(item, 'skc')}>{getAdItemIdentifier(item, 'skc')}</td>
                <td className="npc-ad-id-cell" title={getAdItemIdentifier(item, 'sku')}>{getAdItemIdentifier(item, 'sku')}</td>
                <td>{item.storeName || '-'}</td>
                <td>{formatMoney(item.adSpend)}</td>
                <td>{formatMoney(getAdSalesAmount(item))}</td>
                <td>{mode === 'good' ? formatInteger(item.adOrderCount) : formatRoas(getRoasValue(item))}</td>
                <td>{mode === 'good' ? <strong className="npc-ad-roas-good">{formatRoas(getRoasValue(item))}</strong> : <span className={`npc-ad-status npc-ad-status-${getAdIssueToneV2(issue)}`}>{issue}</span>}</td>
                {mode === 'good' && <td>{formatRatio(getAcosValue(item))}</td>}
                <td><button type="button" className="npc-ad-link-button">查看</button></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={mode === 'good' ? 10 : 9}>暂无数据</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function StrategyDrawer({
  item,
  detail,
  loading,
  onClose,
  onHandle,
}: {
  item: AdStrategySuggestion | null;
  detail: ProductDetailResponse | null;
  loading: boolean;
  onClose: () => void;
  onHandle: (status: string) => void;
}) {
  if (!item) return null;
  const recentAds = (detail?.ads || []).slice(0, 7);
  const adSpend7 = recentAds.reduce((sum, row) => sum + Number(row.adSpend || row.ad_spend || 0), 0);
  const clicks7 = recentAds.reduce((sum, row) => sum + firstFiniteNumber(row.globalClicks, row.global_clicks, row.clicks), 0);
  const addToCart7 = recentAds.reduce((sum, row) => sum + firstFiniteNumber(row.globalAddToCartCount, row.global_add_to_cart_count, row.addToCartCount, row.add_to_cart_count), 0);
  const adOrders7 = recentAds.reduce((sum, row) => sum + firstFiniteNumber(row.globalSubOrderCount, row.global_sub_order_count, row.adOrderCount), 0);
  const naturalOrders = Number(item.naturalOrderCount || 0);
  const roas7 = adSpend7 > 0 ? recentAds.reduce((sum, row) => sum + firstFiniteNumber(row.globalSalesAmount, row.global_sales_amount, row.adSalesAmount), 0) / adSpend7 : item.roas;
  const history = detail?.recommendations || [];
  return (
    <div className="npc-strategy-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="npc-strategy-drawer" role="dialog" aria-modal="true" aria-label="诊断详情" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>诊断详情</h2>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <section className="npc-strategy-drawer-block">
          <h3>商品信息</h3>
          <StrategyProductCell item={item} />
          <dl>
            <div><dt>店铺</dt><dd>{item.storeName || '-'}</dd></div>
            <div><dt>运营</dt><dd>{item.operatorName || '-'}</dd></div>
            <div><dt>上架天数</dt><dd>{item.daysOnline ?? '-'} 天</dd></div>
            <div><dt>当前阶段</dt><dd>{item.currentStage || '-'}</dd></div>
          </dl>
        </section>
        <section className="npc-strategy-drawer-block">
          <h3>阶段策略</h3>
          <div className="npc-strategy-drawer-metrics three">
            <span><small>计划策略目标值</small><strong>{formatRoas(item.plannedTargetRoas)}</strong></span>
            <span><small>实际策略目标值</small><strong>{formatRoas(item.actualTargetRoas)}</strong></span>
            <span><small>执行结论</small><strong>{String(item.problemType || strategyDeviationText(item))}</strong></span>
          </div>
        </section>
        <section className="npc-strategy-drawer-block">
          <h3>近7天广告表现</h3>
          {loading ? <p className="npc-muted">正在加载详情...</p> : (
            <div className="npc-strategy-drawer-metrics">
              <span><small>花费</small><strong>{formatMoney(adSpend7 || item.adSpend)}</strong></span>
              <span><small>点击（全域）</small><strong>{formatInteger(clicks7 || item.clicks)}</strong></span>
              <span><small>加入购物车数（全域）</small><strong>{formatInteger(addToCart7 || item.addToCartCount)}</strong></span>
              <span><small>子订单数（全域）</small><strong>{formatInteger(adOrders7 || item.adOrderCount)}</strong></span>
              <span><small>自然订单</small><strong>{formatInteger(naturalOrders)}</strong></span>
              <span><small>投资回报率(ROAS)（全域）</small><strong>{formatRoas(roas7)}</strong></span>
            </div>
          )}
        </section>
        <section className="npc-strategy-drawer-block">
          <h3>系统判断</h3>
          <p><strong>诊断原因：</strong>{item.reasonText || item.problemType || '-'}</p>
          <p><strong>影响：</strong>如果不及时调整，可能影响新品冷启动曝光（全域）、转化验证或广告成本控制。</p>
        </section>
        <section className="npc-strategy-drawer-block">
          <h3>建议动作</h3>
          <p>{item.suggestedAction || item.recommendationText || '-'}</p>
          <div className="npc-actions">
            <button type="button" onClick={() => onHandle('EXECUTED')}>标记已执行</button>
            <button type="button" onClick={() => onHandle('IGNORED')}>忽略</button>
          </div>
        </section>
        <section className="npc-strategy-drawer-block">
          <h3>历史处理记录</h3>
          <div className="npc-strategy-history">
            {history.slice(0, 5).map((row) => (
              <div key={row.id}>
                <span>{formatDate(row.recommendationDate)}</span>
                <strong>{row.recommendationText || row.recommendationType}</strong>
                <StrategyBadge value={row.status} />
              </div>
            ))}
            {history.length === 0 && <p className="npc-muted">暂无历史处理记录。</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}

function AdStrategyWorkbenchView({ currentUser }: { currentUser: CurrentUser }) {
  const initialType = new URLSearchParams(window.location.search).get('type') || '';
  const isManager = currentUser.role === 'admin' || currentUser.role === 'leader';
  const currentOperatorName = currentUser.displayName || currentUser.username || '';
  const [dimensionTab, setDimensionTab] = useState<AdStrategyDimensionTab>(initialType ? 'newProducts' : 'allStores');
  const [activeTab, setActiveTab] = useState<StrategyTabKey>('pending');
  const [snapshotDate, setSnapshotDate] = useState('');
  const [storeId, setStoreId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [currentStage, setCurrentStage] = useState('');
  const [type, setType] = useState(initialType);
  const [datePreset, setDatePreset] = useState<AdDatePreset>('recent7');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isCustomDateOpen, setIsCustomDateOpen] = useState(false);
  const [customCalendarMonth, setCustomCalendarMonth] = useState(monthKeyFromDate(todayDateKey()));
  const [customDateError, setCustomDateError] = useState('');
  const [platform, setPlatform] = useState('');
  const [adType, setAdType] = useState('');
  const [productType, setProductType] = useState(initialType ? 'new' : 'all');
  const [abnormalStatus, setAbnormalStatus] = useState('');
  const [sortKey, setSortKey] = useState<AdStrategySortKey>('adSpend');
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>('adSpend');
  const [selectedTrendStoreNames, setSelectedTrendStoreNames] = useState<string[]>([]);
  const [trendDateKeys, setTrendDateKeys] = useState<string[]>([]);
  const [queryVersion, setQueryVersion] = useState(0);
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [config, setConfig] = useState<AdStrategyConfig | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [storageStatus, setStorageStatus] = useState<TemuStorageStatus | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreScopeOption[]>([]);
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([]);
  const [pending, setPending] = useState<{ records: AdStrategySuggestion[]; total: number; page?: number; pageSize?: number; snapshotDate?: string; dataCutoffDate?: string }>({ records: [], total: 0 });
  const [adImportOverview, setAdImportOverview] = useState<AdImportOverviewState>({ batches: [], records: [] });
  const [execution, setExecution] = useState<{ records: AdStrategyExecutionRecord[]; total: number; page?: number; pageSize?: number; snapshotDate?: string; dataCutoffDate?: string }>({ records: [], total: 0 });
  const [review, setReview] = useState<{ records: AdStrategyReviewRecord[]; total: number; page?: number; pageSize?: number; snapshotDate?: string; dataCutoffDate?: string }>({ records: [], total: 0 });
  const [loading, setLoading] = useState({ counts: true, pending: true, adOverview: true, execution: false, review: false });
  const [message, setMessage] = useState('');
  const [drawerItem, setDrawerItem] = useState<AdStrategySuggestion | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<ProductDetailResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const appliedOperatorName = isManager ? operatorName : currentOperatorName;
  const selectCustomCalendarDate = (dateKey: string) => {
    const hasOpenRange = Boolean(customStartDate && !customEndDate);
    if (!hasOpenRange) {
      setCustomStartDate(dateKey);
      setCustomEndDate('');
      setSnapshotDate(dateKey);
      setDatePreset('custom');
      setCustomCalendarMonth(monthKeyFromDate(dateKey));
      setCustomDateError('');
      setQueryVersion((value) => value + 1);
      return;
    }
    const startDate = dateKey < customStartDate ? dateKey : customStartDate;
    const endDate = dateKey < customStartDate ? customStartDate : dateKey;
    if (diffDateDays(startDate, endDate) > 60) {
      setCustomDateError('时间跨度不能超过60天');
      return;
    }
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    setSnapshotDate(startDate);
    setDatePreset('custom');
    setCustomDateError('');
    setIsCustomDateOpen(false);
    setQueryVersion((value) => value + 1);
  };
  const clearCustomCalendarDate = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setCustomDateError('');
    setIsCustomDateOpen(false);
  };
  const applyCustomDateRange = () => {
    const startDate = customStartDate || customEndDate;
    const endDate = customEndDate || customStartDate;
    if (!startDate) {
      setCustomDateError('请选择开始日期');
      return;
    }
    if (endDate < startDate) {
      setCustomDateError('结束日期不能早于开始日期');
      return;
    }
    if (diffDateDays(startDate, endDate) > 30) {
      setCustomDateError('时间跨度不能超过30天');
      return;
    }
    setCustomDateError('');
    setDatePreset('custom');
    setSnapshotDate(startDate);
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    setIsCustomDateOpen(false);
    setQueryVersion((value) => value + 1);
  };
  const filterBase = useMemo(() => {
    const params: Record<string, string> = {};
    if (snapshotDate) params.snapshotDate = snapshotDate;
    if (storeId) params.storeId = storeId;
    if (platform) params.platform = platform;
    if (appliedOperatorName) params.operatorName = appliedOperatorName;
    if (currentStage) params.currentStage = currentStage;
    if (adType) params.adType = adType;
    if (productType === 'new') params.productType = 'new';
    if (abnormalStatus) params.abnormalStatus = abnormalStatus;
    if (keyword.trim()) params.search = keyword.trim();
    return params;
  }, [abnormalStatus, adType, appliedOperatorName, currentStage, keyword, platform, productType, queryVersion, snapshotDate, storeId]);

  useEffect(() => {
    newProductCenterDataSource.getAdStrategyConfig().then(setConfig).catch(() => setConfig(null));
    newProductCenterDataSource.getTemuStorageStatus().then(setStorageStatus).catch(() => setStorageStatus(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadStoreOptions = async () => {
      try {
        const [visibleResult, scopedResult] = await Promise.allSettled([
          newProductCenterDataSource.getVisibleStores(),
          newProductCenterDataSource.getStoreOptions(buildQuery({ snapshotDate, operatorName: appliedOperatorName })),
        ]);
        const visibleStores = visibleResult.status === 'fulfilled' ? visibleResult.value.stores || [] : [];
        const scopedStores = scopedResult.status === 'fulfilled' ? scopedResult.value.stores || [] : [];
        const merged = new Map<string, StoreScopeOption>();
        visibleStores.forEach((store) => {
          const storeName = String(store.storeName || '').trim();
          if (!storeName) return;
          const storeId = String(store.id || store.dbId || storeName);
          merged.set(storeName, { storeId, storeName });
        });
        scopedStores.forEach((store) => {
          const storeName = String(store.storeName || '').trim();
          if (!storeName) return;
          const current = merged.get(storeName) || { storeId: store.storeId || storeName, storeName };
          merged.set(storeName, { ...current, ...store, storeId: current.storeId || store.storeId || storeName });
        });
        const nextStores = Array.from(merged.values()).sort((first, second) => first.storeName.localeCompare(second.storeName, 'zh-CN'));
        if (!cancelled) setStoreOptions(nextStores);
      } catch {
        if (!cancelled) setStoreOptions([]);
      }
    };
    void loadStoreOptions();
    return () => {
      cancelled = true;
    };
  }, [appliedOperatorName, snapshotDate]);

  useEffect(() => {
    if (!isManager) return;
    newProductCenterDataSource.getOperatorOptions(buildQuery({ snapshotDate, storeId }))
      .then((data) => setOperatorOptions(data.operators || []))
      .catch(() => setOperatorOptions([]));
  }, [isManager, snapshotDate, storeId]);

  useEffect(() => {
    setLoading((current) => ({ ...current, counts: true }));
    newProductCenterDataSource.getAdStrategyCounts(buildQuery(filterBase))
      .then((data) => setCounts(data.counts || {}))
      .catch(() => setCounts({}))
      .finally(() => setLoading((current) => ({ ...current, counts: false })));
  }, [filterBase]);

  useEffect(() => {
    let cancelled = false;
    const loadAdOverview = async () => {
      setLoading((current) => ({ ...current, adOverview: true }));
      try {
        const selectedStore = storeOptions.find((store) => String(store.storeId || store.storeName || '') === String(storeId));
        const baseFilters: Record<string, string> = {};
        if (storeId) {
          if (selectedStore?.storeName) baseFilters.storeName = selectedStore.storeName;
          else baseFilters.storeId = storeId;
        }
        const recent = await newProductCenterDataSource.getAdImportRecords(1, 1, baseFilters);
        const latestReportDate = String(recent.reportDates?.[0] || '').slice(0, 10);
        const customStart = customStartDate || snapshotDate;
        const customEnd = customEndDate || customStart;
        const endDate = datePreset === 'custom' && customStart ? customEnd : latestReportDate;
        const startDate = datePreset === 'recent7'
          ? offsetDate(endDate, -6)
          : datePreset === 'recent30'
            ? offsetDate(endDate, -29)
            : datePreset === 'custom'
              ? customStart
              : endDate;
        if (!endDate) {
          if (!cancelled) {
            setAdImportOverview({ batches: [], records: [], reportDate: '' });
            setTrendDateKeys([]);
          }
          return;
        }
        if (!cancelled) setTrendDateKeys(buildDateRange(startDate, endDate));
        const overview = await newProductCenterDataSource.getAdImportRecords(1, 2000, {
          ...baseFilters,
          startDate,
          endDate,
          sortField: sortKey === 'adSalesAmount' ? 'globalSalesAmount' : sortKey === 'adOrderCount' ? 'globalSubOrderCount' : sortKey === 'clicks' ? 'globalClicks' : sortKey === 'roas' ? 'globalRoas' : sortKey === 'acos' ? 'globalAcos' : 'adSpend',
          sortDirection: sortKey === 'roas' || sortKey === 'conversionRate' ? 'asc' : 'desc',
        });
        if (!cancelled) setAdImportOverview({ ...overview, reportDate: startDate === endDate ? endDate : `${startDate} 至 ${endDate}` });
      } catch (error) {
        if (!cancelled) {
          setAdImportOverview({ batches: [], records: [] });
          setTrendDateKeys([]);
          setMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setLoading((current) => ({ ...current, adOverview: false }));
      }
    };
    if (dimensionTab === 'allStores') void loadAdOverview();
    return () => {
      cancelled = true;
    };
  }, [customEndDate, customStartDate, datePreset, dimensionTab, queryVersion, snapshotDate, sortKey, storeId, storeOptions]);

  useEffect(() => {
    const base: Record<string, string> = { ...filterBase, page: String(page), pageSize: String(pageSize) };
    if (activeTab === 'pending') {
      const params = { ...base };
      if (status) params.status = status;
      if (type) params.type = type;
      if (priority) params.priority = priority;
      setLoading((current) => ({ ...current, pending: true }));
      newProductCenterDataSource.getAdStrategyPending(buildQuery(params))
        .then(setPending)
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : String(error));
          setPending({ records: [], total: 0 });
        })
        .finally(() => setLoading((current) => ({ ...current, pending: false })));
    }
    if (activeTab === 'execution') {
      setLoading((current) => ({ ...current, execution: true }));
      newProductCenterDataSource.getAdStrategyExecution(buildQuery(base))
        .then(setExecution)
        .catch(() => setExecution({ records: [], total: 0 }))
        .finally(() => setLoading((current) => ({ ...current, execution: false })));
    }
    if (activeTab === 'review') {
      setLoading((current) => ({ ...current, review: true }));
      newProductCenterDataSource.getAdStrategyReview(buildQuery(base))
        .then(setReview)
        .catch(() => setReview({ records: [], total: 0 }))
        .finally(() => setLoading((current) => ({ ...current, review: false })));
    }
  }, [activeTab, filterBase, page, pageSize, priority, status, type]);

  useEffect(() => {
    if (!drawerItem?.productId) {
      setDrawerDetail(null);
      return;
    }
    setDrawerLoading(true);
    newProductCenterDataSource.getProductDetail(String(drawerItem.productId))
      .then(setDrawerDetail)
      .catch(() => setDrawerDetail(null))
      .finally(() => setDrawerLoading(false));
  }, [drawerItem]);

  const dataCutoffDate = pending.dataCutoffDate || execution.dataCutoffDate || review.dataCutoffDate;
  const displayedDate = pending.snapshotDate || execution.snapshotDate || review.snapshotDate || snapshotDate || dataCutoffDate;
  const activeTotal = activeTab === 'pending' ? pending.total : activeTab === 'execution' ? execution.total : review.total;
  const totalPages = Math.max(1, Math.ceil((activeTotal || 0) / pageSize));
  const executionSummary = useMemo(() => execution.records.reduce((acc, item) => {
    const key = item.executionStatus || '未知';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [execution.records]);

  const resetFilters = () => {
    setSnapshotDate('');
    setStoreId('');
    setOperatorName('');
    setCurrentStage('');
    setType('');
    setDatePreset('recent7');
    setCustomStartDate('');
    setCustomEndDate('');
    setIsCustomDateOpen(false);
    setCustomDateError('');
    setPlatform('');
    setAdType('');
    setProductType('all');
    setAbnormalStatus('');
    setPriority('');
    setStatus('PENDING');
    setKeyword('');
    setPage(1);
    setQueryVersion((current) => current + 1);
  };

  const exportCurrentRows = () => {
    const rows = activeTab === 'pending' ? pending.records : activeTab === 'execution' ? execution.records : review.records;
    const csv = rows.map((row) => [
      row.productName || '',
      row.storeName || '',
      row.operatorName || '',
      (row as any).currentStage || (row as any).stageName || '',
      (row as any).plannedTargetRoas ?? '',
      (row as any).actualTargetRoas ?? '',
      (row as any).adSpend ?? '',
      (row as any).roas ?? '',
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\ufeff商品,店铺,运营,阶段,策略计划值,后台执行值,总花费,投资回报率(ROAS)（全域）\n${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `广告策略中心-${activeTab}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRecommendation = async (item: AdStrategySuggestion, nextStatus: string) => {
    if (item.generated) {
      setMessage('该建议为系统实时诊断结果，已保留为待处理状态。请在 TEMU 后台手动执行后，等待下一次广告日报验证。');
      return;
    }
    await newProductCenterDataSource.handleRecommendation(item.id, { status: nextStatus });
    setDrawerItem(null);
    const params = { ...filterBase, page: String(page), pageSize: String(pageSize), status, type, priority };
    newProductCenterDataSource.getAdStrategyPending(buildQuery(params)).then(setPending).catch(() => undefined);
  };

  const applyOverviewFilter = (next: Partial<{ status: string; priority: string; type: string }>) => {
    setActiveTab('pending');
    setDimensionTab('newProducts');
    setStatus(next.status ?? '');
    setPriority(next.priority ?? '');
    setType(next.type ?? '');
    setPage(1);
  };

  const tabItems: Array<{ key: StrategyTabKey; label: string; count: number }> = [
    { key: 'pending', label: '待处理建议', count: pending.total || counts.pending || 0 },
    { key: 'config', label: '阶段策略配置', count: config?.stages?.length || 0 },
    { key: 'execution', label: '阶段执行检查', count: execution.total || 0 },
    { key: 'review', label: '阶段效果复盘', count: review.total || 0 },
  ];
  const filteredPendingRecords = useMemo(
    () => pending.records.filter((item) => matchesAdIssueFilterV2(item, abnormalStatus)),
    [abnormalStatus, pending.records],
  );
  const allStoreAdRecords = useMemo(() => {
    const normalized = (adImportOverview.records || []).map((row) => normalizeAdImportRecord(row));
    return normalized.filter((item) => matchesAdIssueFilterV2(item, abnormalStatus));
  }, [abnormalStatus, adImportOverview.records]);

  return (
    <section className="npc-page npc-ad-strategy-page npc-ad-workbench-page">
      <div className="npc-ad-workbench-title">
        <div>
          <h1>广告策略中心</h1>
          <p>广告问题发现、策略执行检查与阶段效果复盘</p>
        </div>
      </div>
      <article className="excel-record-panel npc-panel npc-strategy-notice">
        <strong>执行说明</strong>
        <span>系统不会自动修改 TEMU 后台广告设置，只生成建议和执行检查。运营仍需在 TEMU 后台手动调整策略目标值；系统通过后续广告日报中的“自然周策略目标值（推广）”字段验证是否已执行。</span>
      </article>
      <div className="npc-ad-dimension-tabs" role="tablist" aria-label="广告策略中心视图">
        <button type="button" className={dimensionTab === 'allStores' ? 'is-active' : ''} onClick={() => { setDimensionTab('allStores'); setProductType('all'); setPage(1); }}>
          全店广告总览
        </button>
        <button type="button" className={dimensionTab === 'newProducts' ? 'is-active' : ''} onClick={() => { setDimensionTab('newProducts'); setProductType('new'); setPage(1); }}>
          新品广告效果
        </button>
      </div>
      <article className="excel-record-panel npc-panel npc-ad-workbench-filter npc-ad-board-filter">
        <label className="npc-ad-date-filter">日期范围
          <span className="npc-ad-segmented">
            {[
              ['yesterday', '昨天'],
              ['recent7', '近7天'],
              ['recent30', '近30天'],
              ['custom', '自定义'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={datePreset === key ? 'is-active' : ''}
                onClick={() => {
                  if (key === 'custom') {
                    setDatePreset('custom');
                    setCustomCalendarMonth(monthKeyFromDate(customStartDate || snapshotDate || todayDateKey()));
                    setIsCustomDateOpen((open) => !open);
                    setCustomDateError('');
                    return;
                  }
                  setDatePreset(key as AdDatePreset);
                  setIsCustomDateOpen(false);
                  setQueryVersion((value) => value + 1);
                }}
              >
                {label}
              </button>
            ))}
          </span>
          {datePreset === 'custom' && (
            <span className="npc-ad-custom-date-label">
              {customStartDate ? `${customStartDate}${customEndDate && customEndDate !== customStartDate ? ` 至 ${customEndDate}` : ''}` : '请选择日期'}
            </span>
          )}
          {isCustomDateOpen && (
            <AdDateRangeCalendar
              monthKey={customCalendarMonth}
              startDate={customStartDate}
              endDate={customEndDate}
              error={customDateError}
              onMonthChange={setCustomCalendarMonth}
              onSelect={selectCustomCalendarDate}
              onClear={clearCustomCalendarDate}
            />
          )}
        </label>
        <label>平台<select value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1); }}><option value="">全部平台</option><option value="TEMU">TEMU</option><option value="Amazon">Amazon</option><option value="1688">1688</option><option value="other">其他</option></select></label>
        <label>店铺<select value={storeId} onChange={(event) => { setStoreId(event.target.value); setPage(1); }}><option value="">全部店铺</option>{storeOptions.map((store) => <option key={store.storeId || store.storeName} value={store.storeId || store.storeName}>{store.storeName}</option>)}</select></label>
        <label>运营{isManager ? <select value={operatorName} onChange={(event) => { setOperatorName(event.target.value); setPage(1); }}><option value="">全部运营</option>{operatorOptions.map((operator) => <option key={operator.operatorName} value={operator.operatorName}>{operator.operatorName}</option>)}</select> : <input value={currentOperatorName || '当前运营'} readOnly />}</label>
        <label>广告类型<select value={adType} onChange={(event) => { setAdType(event.target.value); setPage(1); }}><option value="">全部</option><option value="商品推广">商品广告</option><option value="搜索广告">搜索广告</option><option value="场景广告">场景广告</option></select></label>
        <label>异常状态<select value={abnormalStatus ? 'abnormal' : ''} onChange={(event) => { setAbnormalStatus(event.target.value === 'abnormal' ? 'abnormal' : ''); setPage(1); }}><option value="">全部</option><option value="abnormal">仅看异常</option></select></label>
        <div className="npc-ad-workbench-filter-actions">
          <button type="button" className="is-primary" onClick={() => setQueryVersion((value) => value + 1)}>查询</button>
          <button type="button" onClick={resetFilters}>重置</button>
        </div>
      </article>
      <div className="npc-ad-scope-tip">
        <strong>当前数据口径：全域推广</strong>
        <span>申报价销售额（全域）、投资回报率(ROAS)（全域）、子订单数（全域）、曝光（全域）、点击（全域）、转化率（全域）均来自全域推广报表；页面统计与明细读取均按全域推广字段展示。</span>
      </div>
      <article className="excel-record-panel npc-panel npc-ad-workbench-filter npc-ad-legacy-filter">
        <label>日期范围<input type="date" value={snapshotDate} onChange={(event) => { setSnapshotDate(event.target.value); setPage(1); }} /></label>
        <label>店铺<select value={storeId} onChange={(event) => { setStoreId(event.target.value); setPage(1); }}><option value="">全部店铺</option>{storeOptions.map((store) => <option key={store.storeId || store.storeName} value={store.storeId || store.storeName}>{store.storeName}</option>)}</select></label>
        <label>运营{isManager ? <select value={operatorName} onChange={(event) => { setOperatorName(event.target.value); setPage(1); }}><option value="">全部运营</option>{operatorOptions.map((operator) => <option key={operator.operatorName} value={operator.operatorName}>{operator.operatorName}</option>)}</select> : <input value={currentOperatorName || '当前运营'} readOnly />}</label>
        <label>广告类型<select value={adType} onChange={(event) => { setAdType(event.target.value); setPage(1); }}><option value="">全部广告</option><option value="商品推广">商品推广</option><option value="搜索广告">搜索广告</option><option value="场景广告">场景广告</option></select></label>
        <label>商品类型<select value={productType} onChange={(event) => { setProductType(event.target.value); setDimensionTab(event.target.value === 'new' ? 'newProducts' : 'allStores'); setPage(1); }}><option value="all">全部商品</option><option value="new">新品</option></select></label>
        <label>异常状态<select value={abnormalStatus} onChange={(event) => { setAbnormalStatus(event.target.value); setPage(1); }}><option value="">全部状态</option><option value="normal">正常</option><option value="highSpend">花费偏高</option><option value="lowRoas">投资回报率(ROAS)（全域）偏低</option><option value="highAcos">费比（全域）过高</option><option value="noOrder">有花费无订单</option><option value="missing">数据缺失</option></select></label>
        <div className="npc-ad-workbench-filter-actions">
          <span>数据截止 {dataCutoffDate || '-'}</span>
          <button type="button" onClick={resetFilters}>重置</button>
          <button type="button" onClick={exportCurrentRows}>导出</button>
        </div>
      </article>
      {dimensionTab === 'allStores' ? (
        <AllStoreAdOverviewBoard
          rows={allStoreAdRecords}
          counts={counts}
          loading={loading.adOverview || loading.counts}
          sortKey={sortKey}
          onSort={setSortKey}
          trendMetric={trendMetric}
          summary={adImportOverview.summary}
          reportDate={adImportOverview.reportDate}
          totalRecords={adImportOverview.total}
          storeSummary={(adImportOverview as any).storeSummary || []}
          storeTrend={(adImportOverview as any).storeTrend || []}
          visibleStores={storeId
            ? storeOptions.filter((store) => String(store.storeId || store.storeName || '') === String(storeId))
            : storeOptions}
          trendDateKeys={trendDateKeys}
          selectedTrendStoreNames={selectedTrendStoreNames}
          onOpenStore={(storeName) => {
            const params = new URLSearchParams();
            params.set('storeName', storeName);
            if (adImportOverview.reportDate && !adImportOverview.reportDate.includes('至')) params.set('reportDate', adImportOverview.reportDate);
            window.location.href = `/admin/temu-ad-report-import?${params.toString()}`;
          }}
          onTrendMetricChange={setTrendMetric}
          onSelectedTrendStoreNamesChange={setSelectedTrendStoreNames}
        />
      ) : (
        <>
          <StrategyHealthPanel snapshotDate={snapshotDate || displayedDate} dataCutoffDate={dataCutoffDate} storageStatus={storageStatus} counts={counts} />
          {loading.counts ? <PanelSkeleton title="新品广告效果总览" rows={2} /> : <StrategyOverviewCards counts={counts} onSelect={applyOverviewFilter} />}
          <section className="npc-ad-overview-metrics npc-ad-new-product-metrics">
            {[
              { label: '新品总花费', value: formatMoney(filteredPendingRecords.reduce((sum, item) => sum + Number(item.adSpend || 0), 0)) },
              { label: '新品申报价销售额（全域）', value: formatMoney(filteredPendingRecords.reduce((sum, item) => sum + getAdSalesAmount(item), 0)) },
              { label: '新品子订单数（全域）', value: formatInteger(filteredPendingRecords.reduce((sum, item) => sum + Number(item.adOrderCount || 0), 0)) },
              { label: '新品投资回报率(ROAS)（全域）', value: filteredPendingRecords.reduce((sum, item) => sum + Number(item.adSpend || 0), 0) > 0 ? formatRoas(filteredPendingRecords.reduce((sum, item) => sum + getAdSalesAmount(item), 0) / filteredPendingRecords.reduce((sum, item) => sum + Number(item.adSpend || 0), 0)) : '-' },
              { label: '新品费比（全域）', value: filteredPendingRecords.reduce((sum, item) => sum + getAdSalesAmount(item), 0) > 0 ? formatRatio(filteredPendingRecords.reduce((sum, item) => sum + Number(item.adSpend || 0), 0) / filteredPendingRecords.reduce((sum, item) => sum + getAdSalesAmount(item), 0)) : '-' },
              { label: '新品首单数', value: formatInteger(counts.ordered || 0) },
              { label: '新品首单率', value: counts.all ? formatRatio((counts.ordered || 0) / counts.all) : '-' },
            ].map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </section>
          <div className="npc-strategy-tabs npc-ad-workbench-tabs">
            {tabItems.map((item) => (
              <button key={item.key} type="button" className={`npc-strategy-tab${activeTab === item.key ? ' is-active' : ''}`} onClick={() => { setActiveTab(item.key); setPage(1); }}>
                <span className="npc-strategy-tab-copy"><strong>{item.label}</strong></span>
                <span className="npc-strategy-tab-count">{formatInteger(item.count)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {message && <div className="excel-import-error">{message}</div>}

      {dimensionTab === 'newProducts' && activeTab === 'pending' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>待处理建议</h2><span>{pending.total} 条</span></header>
          <div className="npc-ad-workbench-toolbar">
            <input placeholder="搜索商品 / 店铺 / 运营" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
            <button type="button">更多筛选</button>
            <button type="button" onClick={() => setPage(1)}>刷新</button>
            <button type="button" onClick={exportCurrentRows}>导出</button>
          </div>
          <div className="npc-table-wrap npc-strategy-table-wrap npc-pending-strategy-table-wrap">
            <table className="npc-pending-strategy-table">
              <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>上架天数 / 当前阶段</th><th>优先级</th><th>策略计划值</th><th>后台执行值</th><th>执行偏差</th><th>总花费</th><th>点击（全域）</th><th>加入购物车数（全域）</th><th>子订单数（全域）</th><th>自然订单</th><th>投资回报率(ROAS)（全域）</th><th>策略目标值</th><th>诊断原因</th><th>建议动作</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {loading.pending && pending.records.length === 0 && <tr className="npc-strategy-empty-row"><td colSpan={19}><PanelSkeleton title="待处理建议加载中" rows={4} /></td></tr>}
                {!loading.pending && filteredPendingRecords.map((item) => (
                  <tr key={item.id}>
                    <td><StrategyProductCell item={item} /></td>
                    <td>{item.storeName || '-'}</td>
                    <td>{item.operatorName || '-'}</td>
                    <td>{item.daysOnline ?? '-'}天 / {item.currentStage || '-'}</td>
                    <td><StrategyBadge value={item.priority} type="priority" /></td>
                    <td>{formatRoas(item.plannedTargetRoas)}</td>
                    <td>{formatRoas(item.actualTargetRoas)}</td>
                    <td className={strategyDeviation(item) && strategyDeviation(item)! > 0 ? 'is-positive' : 'is-negative'}>{strategyDeviationText(item)}</td>
                    <td>{formatMoney(item.adSpend)}</td>
                    <td>{formatInteger(item.clicks)}</td>
                    <td>{formatInteger(item.addToCartCount)}</td>
                    <td>{formatInteger(item.adOrderCount)}</td>
                    <td>{formatInteger(item.naturalOrderCount)}</td>
                    <td>{formatRoas(item.roas)}</td>
                    <td>{formatRoas(item.targetRoas)}</td>
                    <td title={item.reasonText || ''}>{item.reasonText || item.problemType || '-'}</td>
                    <td title={item.suggestedAction || ''}>{item.suggestedAction || item.recommendationText || '-'}</td>
                    <td><StrategyBadge value={item.status} /></td>
                    <td className="npc-actions">
                      <button type="button" onClick={() => setDrawerItem(item)}>查看诊断</button>
                      <button type="button" onClick={() => void handleRecommendation(item, 'EXECUTED')}>标记已执行</button>
                      <button type="button" onClick={() => void handleRecommendation(item, 'IGNORED')}>忽略</button>
                    </td>
                  </tr>
                ))}
                {!loading.pending && filteredPendingRecords.length === 0 && <tr className="npc-strategy-empty-row"><td colSpan={19}><StrategyEmptyState title="暂无待处理建议" description="当前筛选条件下没有需要处理的广告策略建议。" /></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {dimensionTab === 'newProducts' && activeTab === 'config' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>阶段策略配置</h2><span>{isManager ? '管理员可编辑' : '普通运营只读'}</span></header>
          <div className="npc-stage-card-grid">
            {(config?.stages || []).map((stage, index) => (
              <section key={stage.key}>
                <h3>第{index + 1}阶段：{stage.name}</h3>
                <p>上架第 {stage.dayStart}-{stage.dayEnd} 天</p>
                <strong>{stage.bidLevel}</strong>
                <span>策略目标值：{formatRoas(stage.targetRoas)}</span>
                <small>{stage.goal}</small>
              </section>
            ))}
          </div>
          <div className="npc-threshold-grid">
            <label>烧钱无单花费阈值<input value={config?.thresholds.burnNoOrderSpend ?? 5} readOnly /></label>
            <label>点击（全域）阈值<input value={config?.thresholds.clickThreshold ?? 30} readOnly /></label>
            <label>加入购物车数（全域）阈值<input value={config?.thresholds.addToCartThreshold ?? 3} readOnly /></label>
            <label>低曝光（全域）阈值<input value={config?.thresholds.lowExposureThreshold ?? 50} readOnly /></label>
            <label>投放过保守阈值<input value="实际策略目标值 > 计划策略目标值 × 1.2" readOnly /></label>
            <label>投放过激进阈值<input value="实际策略目标值 < 计划策略目标值 × 0.8" readOnly /></label>
          </div>
        </article>
      )}

      {dimensionTab === 'newProducts' && activeTab === 'execution' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>阶段执行检查</h2><span>{execution.total} 条</span></header>
          <div className="npc-ad-execution-summary">
            {['已按策略', '投放过保守', '投放过激进', '无广告数据', '无策略目标'].map((item) => <section key={item}><small>{item}</small><strong>{formatInteger(executionSummary[item] || 0)}</strong></section>)}
          </div>
          <div className="npc-table-wrap npc-strategy-table-wrap">
            <table className="npc-execution-strategy-table">
              <thead><tr><th>商品</th><th>店铺</th><th>运营</th><th>上架天数</th><th>当前阶段</th><th>计划策略目标值</th><th>实际策略目标值</th><th>执行状态</th><th>阶段效果</th><th>下一步动作</th></tr></thead>
              <tbody>
                {execution.records.map((item) => (
                  <tr key={item.id}>
                    <td><StrategyProductCell item={item} /></td><td>{item.storeName || '-'}</td><td>{item.operatorName || '-'}</td><td>{item.daysOnline}</td><td>{item.currentStage || '-'}</td><td>{formatRoas(item.plannedTargetRoas)}</td><td>{formatRoas(item.actualTargetRoas)}</td><td><StrategyBadge value={item.executionStatus} type="plain" /></td><td>{item.stageEffect || '-'}</td><td>{item.nextAction || '-'}</td>
                  </tr>
                ))}
                {execution.records.length === 0 && <tr className="npc-strategy-empty-row"><td colSpan={10}><StrategyEmptyState title="暂无阶段执行检查数据" description="当前筛选条件下没有可检查的阶段执行记录。" /></td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {dimensionTab === 'newProducts' && activeTab === 'review' && (
        <article className="excel-record-panel npc-panel">
          <header className="npc-panel-header"><h2>阶段效果复盘</h2><span>{review.total} 条</span></header>
          <div className="npc-ad-workbench-toolbar">
            <input placeholder="搜索商品 / 店铺 / 运营" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
            <button type="button" onClick={exportCurrentRows}>导出</button>
          </div>
          <StageReviewTable rows={review.records} />
        </article>
      )}

      {dimensionTab === 'newProducts' && activeTab !== 'config' && (
        <div className="temu-product-record-pagination npc-strategy-pagination">
          <span>第 {page}/{totalPages} 页，共 {activeTotal} 条</span>
          <div>
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={20}>20 条/页</option><option value={50}>50 条/页</option></select>
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>下一页</button>
          </div>
        </div>
      )}
      <StrategyDrawer item={drawerItem} detail={drawerDetail} loading={drawerLoading} onClose={() => setDrawerItem(null)} onHandle={(nextStatus) => drawerItem && void handleRecommendation(drawerItem, nextStatus)} />
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
        <SimpleTable title="广告趋势" rows={data.ads} columns={['reportDate','adSpend','globalSalesAmount','globalClicks','globalSubOrderCount']} />
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
  if (path === '/new-product-center/ad-recommendations' || path === '/admin/ad-strategy') return <AdStrategyWorkbenchView currentUser={currentUser} />;
  if (path.startsWith('/new-product-center/products/')) return <DetailView productId={decodeURIComponent(path.replace('/new-product-center/products/', ''))} />;
  return <WorkbenchView currentUser={currentUser} />;
}
