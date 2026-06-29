import { useEffect, useMemo, useRef, useState } from 'react';
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
  storeId?: string;
};

type StoreKpiBreakdown = {
  storeId: string;
  storeName: string;
  operatorName?: string;
  totalScore: number | null;
  scoreText: string;
  salesCompletionRate: number | null;
  listingCompletionRate: number | null;
  firstOrderCompletionRate: number | null;
  expenseRatio: number | null;
  expenseTargetRatio: number | null;
  mainProblem: string;
  status: string;
  targetStatus: 'ok' | 'missing' | 'partial';
  kpis: {
    sales: { target: number | null; actual: number; completionRate: number | null; score: number | null };
    listing: { target: number | null; actual: number; completionRate: number | null; score: number | null };
    firstOrder: {
      target: number | null;
      actual: number;
      completionRate: number | null;
      score: number | null;
      expiredNoFirstOrder: number;
      observingCount: number;
    };
    expense: { targetRatio: number | null; actualRatio: number | null; totalExpense: number; score: number | null };
  };
};

type ProductFollowUp = {
  skc: string;
  spuId?: string;
  skuId?: string;
  productName?: string;
  storeName: string;
  operatorName: string;
  siteJoinDate: string;
  observeEndAt?: string;
  daysOnline: number;
  firstOrderStatus: string;
  firstOrderStatusCode?: 'FIRST_ORDER_SUCCESS' | 'OBSERVING' | 'EXPIRED_NO_FIRST_ORDER' | 'DELAYED_FIRST_ORDER';
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
    storeOptions?: StoreRecord[];
    operatorStoreMap: Record<string, string[]>;
    selectedOperatorId: string;
    selectedStoreId: string;
  };
  dataUpdatedAt: string;
  dataIntegrityStatus: string;
  dataSourceMapping: Array<{ kpi: string; source: string; endpoint: string; confirmed: string }>;
  kpiSummary: { totalScore: number | null; scoreText: string; cards: KpiCard[] };
  storeBreakdown?: StoreKpiBreakdown[];
  todayActions: WorkbenchAction[];
  salesKpi: {
    currentValue?: number;
    targetValue?: number | null;
    score?: number | null;
    expectedByTime?: number | null;
    progressGapValue?: number | null;
    remainingToTarget?: number | null;
    exceededTarget?: number | null;
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
    currentValue?: number;
    targetValue?: number | null;
    score?: number | null;
    timeProgress?: number;
    expectedByTime?: number | null;
    progressGapValue?: number | null;
    remainingToTarget?: number | null;
    exceededTarget?: number | null;
    last7DaysCompleted?: number;
    target: number | null;
    completed: number;
    todayCompleted: number;
    remaining: number | null;
    todaySuggested: number | null;
    completionRate: number | null;
  };
  firstOrderKpi: {
    currentValue?: number;
    targetValue?: number | null;
    targetCompletionRate?: number | null;
    score?: number | null;
    observationDueCount?: number;
    dueProductFirstOrderRate?: number | null;
    remainingToTarget?: number | null;
    dueIn7DaysCount?: number;
    target: number | null;
    completed: number;
    completionRate: number | null;
    effectiveListingCount: number;
    firstOrderWithin30DaysCount: number;
    expiredNoFirstOrderCount: number;
    delayedFirstOrderCount?: number;
    observingCount: number;
    decidableCount: number;
    firstOrderRate: number | null;
    over7NoFirstOrder: number;
  };
  expenseKpi: {
    currentExpenseRatio?: number | null;
    targetExpenseRatio?: number | null;
    score?: number | null;
    promotionExpense?: number;
    promotionExpenseRatio?: number | null;
    afterSalesAccrual?: number;
    afterSalesAccrualRatio?: number | null;
    accrualBasisLabel?: string;
    gapToTarget?: number | null;
    mainExpenseSource?: string;
    salesAmount: number;
    adExpense: number;
    afterSaleExpense: number;
    afterSaleExpensePeriod?: string;
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
  dataIntegrityWarnings: Array<string | { type?: string; level?: string; message: string }>;
  cache?: { cacheHit: boolean; generatedAt: string; ttlMs?: number };
  debug?: { timings?: Record<string, number>; totalMs?: number };
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

async function fetchJson<T>(url: string, fallback: T, options: RequestInit & { bustCache?: boolean } = {}): Promise<T> {
  try {
    const { bustCache, ...fetchOptions } = options;
    const requestUrl = bustCache ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url;
    const response = await fetch(requestUrl, {
      credentials: 'include',
      cache: 'no-store',
      ...fetchOptions,
    });
    return response.ok ? await response.json() as T : fallback;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
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

function formatPeriodMonth(period?: string) {
  const month = Number(String(period || '').split('-')[1]);
  return Number.isFinite(month) && month > 0 ? `${month}月` : '';
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatFirstOrderRate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '暂无可判定新品';
  return formatPercent(value);
}

function normalizeKey(value: string | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

function statusClass(status: string) {
  if (status.includes('缺失') || status.includes('未配置')) return 'warning';
  if (status.includes('严重')) return 'danger';
  if (status.includes('落后') || status.includes('超标') || status.includes('未设置')) return 'warning';
  return 'ok';
}

function metricClass(value: number | null | undefined, inverse = false, target?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'muted';
  if (inverse) {
    if (target !== null && target !== undefined && Number.isFinite(target)) {
      return value > target ? 'danger' : 'ok';
    }
    return 'muted';
  }
  if (value >= 0.85) return 'ok';
  if (value >= 0.6) return 'warning';
  return 'danger';
}

function scoreClass(score: number | null | undefined) {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'muted';
  if (score >= 85) return 'ok';
  if (score >= 60) return 'warning';
  return 'danger';
}

type IntegratedKpiCardModel = {
  key: string;
  title: string;
  subtitle: string;
  weight: number;
  status: string;
  statusClassName: string;
  mainValue: string;
  progress: number | null;
  summaryRows: Array<[string, string, string?]>;
  detailRows: Array<[string, string, string?]>;
  actionLabel: string;
  actionHref: string;
};

function scoreText(card: KpiCard | undefined) {
  if (!card || card.score === null || !Number.isFinite(card.score)) return '-';
  return `${card.score.toFixed(1)} / ${card.weight}`;
}

function cardProgress(card: KpiCard | undefined) {
  if (!card) return null;
  if (card.key === 'expense') {
    return card.score === null || !Number.isFinite(card.score) ? null : card.score / card.weight;
  }
  return card.completionRate;
}

function salesProgressGapRow(data: WorkbenchData): [string, string] {
  const gap = data.salesKpi.progressGap;
  if (gap === null || gap === undefined || !Number.isFinite(gap)) return ['进度对比', '-'];
  if (gap >= 0) return ['已超时间进度', formatPercent(gap)];
  return ['进度落后', formatPercent(Math.abs(gap))];
}

function progressGapRow(gap: number | null | undefined, formatter: (value: number) => string): [string, string, string?] {
  if (gap === null || gap === undefined || !Number.isFinite(gap)) return ['进度差距', '-'];
  if (gap >= 0) return ['进度差距', `领先 ${formatter(Math.abs(gap))}`, 'ok'];
  return ['进度差距', `落后 ${formatter(Math.abs(gap))}`, 'warning'];
}

function remainingOrExceededRow(remaining: number | null | undefined, exceeded: number | null | undefined, formatter: (value: number) => string): [string, string, string?] {
  if (exceeded !== null && exceeded !== undefined && Number.isFinite(exceeded) && exceeded > 0) {
    return ['已超目标', formatter(exceeded), 'ok'];
  }
  if (remaining !== null && remaining !== undefined && Number.isFinite(remaining)) {
    return ['剩余目标', formatter(remaining)];
  }
  return ['剩余目标', '-'];
}

function expenseGapRow(gap: number | null | undefined): [string, string, string?] {
  if (gap === null || gap === undefined || !Number.isFinite(gap)) return ['距目标空间', '-'];
  const points = `${Math.abs(gap * 100).toFixed(1)}个百分点`;
  if (gap >= 0) return ['低于目标', points, 'ok'];
  return ['高于目标', points, 'danger'];
}

function buildIntegratedKpiCards(data: WorkbenchData): IntegratedKpiCardModel[] {
  const cardByKey = new Map(data.kpiSummary.cards.map((card) => [card.key, card]));
  const salesCard = cardByKey.get('sales');
  const listingCard = cardByKey.get('listing');
  const firstOrderCard = cardByKey.get('firstOrder');
  const expenseCard = cardByKey.get('expense');
  const expenseMainValue = data.expenseKpi.hasExpenseData
    ? (data.expenseKpi.expenseRatio === null ? '费用占比无法计算' : formatPercent(data.expenseKpi.expenseRatio))
    : '暂无费用数据';
  const expenseRatioLabel = data.expenseKpi.hasExpenseData
    ? formatPercent(data.expenseKpi.expenseRatio)
    : data.expenseKpi.salesAmount <= 0
      ? '暂无销售额，费用占比无法计算'
      : '暂无费用数据，费用占比无法计算';
  const salesTarget = data.salesKpi.targetValue ?? data.salesKpi.salesTarget;
  const listingTarget = data.listingKpi.targetValue ?? data.listingKpi.target;
  const firstOrderTarget = data.firstOrderKpi.targetValue ?? data.firstOrderKpi.target;
  const salesExpectedByTime = data.salesKpi.expectedByTime ?? (salesTarget ? salesTarget * data.salesKpi.timeProgress : null);
  const listingTimeProgress = data.listingKpi.timeProgress ?? data.salesKpi.timeProgress;
  const listingExpectedByTime = data.listingKpi.expectedByTime ?? (listingTarget ? listingTarget * listingTimeProgress : null);
  const firstOrderCurrent = data.firstOrderKpi.currentValue ?? data.firstOrderKpi.firstOrderWithin30DaysCount ?? data.firstOrderKpi.completed;
  const firstOrderCompletionRate = data.firstOrderKpi.targetCompletionRate ?? data.firstOrderKpi.completionRate;
  const firstOrderDueCount = data.firstOrderKpi.observationDueCount ?? data.firstOrderKpi.decidableCount;
  const firstOrderRate = data.firstOrderKpi.dueProductFirstOrderRate ?? data.firstOrderKpi.firstOrderRate;
  const firstOrderRemaining = data.firstOrderKpi.remainingToTarget ?? (firstOrderTarget ? Math.max(firstOrderTarget - firstOrderCurrent, 0) : null);
  const expenseTargetRatio = data.expenseKpi.targetExpenseRatio ?? data.expenseKpi.targetRatio;
  const expenseCurrentRatio = data.expenseKpi.currentExpenseRatio ?? data.expenseKpi.expenseRatio;
  const promotionExpense = data.expenseKpi.promotionExpense ?? data.expenseKpi.adExpense;
  const promotionExpenseRatio = data.expenseKpi.promotionExpenseRatio ?? data.expenseKpi.adRatio;
  const afterSalesAccrual = data.expenseKpi.afterSalesAccrual ?? data.expenseKpi.afterSaleExpense;
  const afterSalesAccrualRatio = data.expenseKpi.afterSalesAccrualRatio ?? data.expenseKpi.afterSaleRatio;
  const expenseGap = data.expenseKpi.gapToTarget ?? (expenseCurrentRatio !== null && expenseTargetRatio ? expenseTargetRatio - expenseCurrentRatio : null);
  const mainExpenseSource = data.expenseKpi.mainExpenseSource || '-';

  return [
    {
      key: 'sales',
      title: '经营结果',
      subtitle: '销售额目标完成率',
      weight: 30,
      status: salesCard?.status ?? '数据缺失',
      statusClassName: statusClass(salesCard?.status ?? '数据缺失'),
      mainValue: formatAmount(data.salesKpi.salesAmount),
      progress: cardProgress(salesCard),
      summaryRows: [
        ['目标', formatAmount(salesTarget)],
        ['完成率', formatPercent(data.salesKpi.completionRate)],
        ['得分', scoreText(salesCard)],
      ],
      detailRows: [
        ['时间进度', formatPercent(data.salesKpi.timeProgress)],
        ['按时间应完成', formatAmount(salesExpectedByTime)],
        progressGapRow(data.salesKpi.progressGapValue ?? null, formatAmount),
        remainingOrExceededRow(data.salesKpi.remainingToTarget ?? data.salesKpi.remainingSales, data.salesKpi.exceededTarget, formatAmount),
      ],
      actionLabel: '查看销售明细',
      actionHref: '/admin/store-business',
    },
    {
      key: 'listing',
      title: '上新效率',
      subtitle: '有效上新数',
      weight: 30,
      status: listingCard?.status ?? '数据缺失',
      statusClassName: statusClass(listingCard?.status ?? '数据缺失'),
      mainValue: formatNumber(data.listingKpi.completed, '款'),
      progress: cardProgress(listingCard),
      summaryRows: [
        ['目标', formatNumber(listingTarget, '款')],
        ['完成率', formatPercent(data.listingKpi.completionRate)],
        ['得分', scoreText(listingCard)],
      ],
      detailRows: [
        ['时间进度', formatPercent(listingTimeProgress)],
        ['按时间应完成', formatNumber(listingExpectedByTime, '款')],
        progressGapRow(data.listingKpi.progressGapValue ?? null, (value) => formatNumber(value, '款')),
        remainingOrExceededRow(data.listingKpi.remainingToTarget ?? data.listingKpi.remaining, data.listingKpi.exceededTarget, (value) => formatNumber(value, '款')),
        ['今日已完成', formatNumber(data.listingKpi.todayCompleted, '款')],
        ['近7天完成', formatNumber(data.listingKpi.last7DaysCompleted ?? 0, '款')],
      ],
      actionLabel: '去导入商品信息',
      actionHref: '/admin/temu-product-info-import',
    },
    {
      key: 'firstOrder',
      title: '新品转化',
      subtitle: '30天首单达成',
      weight: 20,
      status: firstOrderCard?.status ?? '数据缺失',
      statusClassName: statusClass(firstOrderCard?.status ?? '数据缺失'),
      mainValue: formatNumber(firstOrderCurrent, '款'),
      progress: cardProgress(firstOrderCard),
      summaryRows: [
        ['目标', formatNumber(firstOrderTarget, '款')],
        ['目标完成率', formatPercent(firstOrderCompletionRate)],
        ['得分', scoreText(firstOrderCard)],
      ],
      detailRows: [
        ['本月观察期到期', formatNumber(firstOrderDueCount, '款')],
        ['30天内首单', formatNumber(data.firstOrderKpi.firstOrderWithin30DaysCount, '款')],
        ['到期未首单', formatNumber(data.firstOrderKpi.expiredNoFirstOrderCount, '款')],
        ['到期商品首单率', formatFirstOrderRate(firstOrderRate)],
        ['距离目标还差', formatNumber(firstOrderRemaining, '款')],
        ['7天内即将到期', formatNumber(data.firstOrderKpi.dueIn7DaysCount ?? 0, '款')],
      ],
      actionLabel: '查看未首单商品',
      actionHref: '#product-follow-ups',
    },
    {
      key: 'expense',
      title: '费用控制',
      subtitle: '推广费 + 售后费用计提占销售额',
      weight: 20,
      status: data.expenseKpi.hasExpenseData ? (expenseCard?.status ?? '数据缺失') : '数据缺失',
      statusClassName: data.expenseKpi.hasExpenseData ? statusClass(expenseCard?.status ?? '数据缺失') : 'muted',
      mainValue: expenseMainValue,
      progress: data.expenseKpi.hasExpenseData ? cardProgress(expenseCard) : null,
      summaryRows: [
        ['目标费用占比', formatPercent(expenseTargetRatio)],
        ['当前费用占比', data.expenseKpi.hasExpenseData ? formatPercent(expenseCurrentRatio) : expenseRatioLabel],
        ['得分', data.expenseKpi.hasExpenseData ? scoreText(expenseCard) : '-'],
      ],
      detailRows: [
        ['销售额', formatAmount(data.expenseKpi.salesAmount)],
        ['总费用', data.expenseKpi.hasExpenseData ? formatAmount(data.expenseKpi.totalExpense) : '暂无费用数据'],
        ['本月推广费', data.expenseKpi.hasExpenseData ? formatAmount(promotionExpense) : '暂无费用数据'],
        ['推广费占比', data.expenseKpi.hasExpenseData ? formatPercent(promotionExpenseRatio) : '-'],
        ['售后费用计提', data.expenseKpi.hasExpenseData ? formatAmount(afterSalesAccrual) : '暂无费用数据'],
        ['售后计提占比', data.expenseKpi.hasExpenseData ? formatPercent(afterSalesAccrualRatio) : '-'],
        ['计提口径', data.expenseKpi.accrualBasisLabel || '按上月售后费用'],
        expenseGapRow(expenseGap),
        ['主要费用来源', data.expenseKpi.hasExpenseData ? mainExpenseSource : '-'],
      ],
      actionLabel: '查看费用明细',
      actionHref: '/admin/operator-analysis',
    },
  ];
}

function KpiOverviewSection({ data }: { data: WorkbenchData }) {
  const cards = useMemo(() => buildIntegratedKpiCards(data), [data]);
  const selectedOperator = data.filters.operators.find((item) => item.id === data.filters.selectedOperatorId);
  const selectedStore = (data.filters.storeOptions ?? data.filters.stores).find((item) => item.id === data.filters.selectedStoreId || item.storeName === data.filters.selectedStoreId);
  const storeNames = data.filters.stores.map((store) => store.storeName).filter(Boolean).join('、') || '全部店铺';
  const title = data.filters.selectedStoreId
    ? '店铺KPI'
    : data.filters.selectedOperatorId
      ? '运营综合KPI'
      : '公司综合KPI';
  const subtitle = data.filters.selectedStoreId
    ? `当前运营：${selectedOperator?.operatorName || '当前范围'} ｜ 当前店铺：${selectedStore?.storeName || data.filters.selectedStoreId} ｜ 本月KPI：${data.kpiSummary.scoreText}`
    : data.filters.selectedOperatorId
      ? `当前运营：${selectedOperator?.operatorName || '当前运营'} ｜ 负责店铺：${storeNames} ｜ 本月综合KPI：${data.kpiSummary.scoreText}`
      : `当前范围：全部运营 ｜ ${storeNames} ｜ 本月综合KPI：${data.kpiSummary.scoreText}`;
  return (
    <section className="workbench-overview">
      <header className="workbench-overview-header">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
        <p>四项核心指标按经营结果、上新效率、新品转化、费用控制加权展示。</p>
      </header>
      <section className="workbench-summary">
        {cards.map((card) => <IntegratedKpiCard card={card} key={card.key} />)}
      </section>
    </section>
  );
}

function StoreKpiBreakdownTable({ rows, onSelectStore }: { rows: StoreKpiBreakdown[]; onSelectStore: (storeId: string) => void }) {
  if (rows.length === 0) return null;

  return (
    <article className="excel-record-panel workbench-panel workbench-store-breakdown" id="store-breakdown">
      <header>
        <div>
          <h2>各店铺KPI拆解</h2>
          <p>店铺=全部店铺时，展示当前范围内店铺拆解，用于定位拖后腿店铺。</p>
        </div>
        <span>{rows.length} 个店铺</span>
      </header>
      <div className="import-record-table-wrap">
        <table className="import-record-table workbench-breakdown-table">
          <thead>
            <tr>
              <th>店铺</th>
              <th>综合得分</th>
              <th>销售完成率</th>
              <th>上新完成率</th>
              <th>30天首单完成率</th>
              <th>费用占比</th>
              <th>主要问题</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={`breakdown-row ${scoreClass(row.totalScore)}`} key={row.storeId || row.storeName}>
                <td><strong>{row.storeName}</strong></td>
                <td className={scoreClass(row.totalScore)}>{row.scoreText}</td>
                <td className={metricClass(row.salesCompletionRate)}>{formatPercent(row.salesCompletionRate)}</td>
                <td className={metricClass(row.listingCompletionRate)}>{formatPercent(row.listingCompletionRate)}</td>
                <td className={metricClass(row.firstOrderCompletionRate)}>{formatPercent(row.firstOrderCompletionRate)}</td>
                <td className={metricClass(row.expenseRatio, true, row.expenseTargetRatio)}>{formatPercent(row.expenseRatio)}</td>
                <td><span className={`workbench-problem ${statusClass(row.status)}`}>{row.mainProblem}</span></td>
                <td><button type="button" className="workbench-row-action" onClick={() => onSelectStore(row.storeId || row.storeName)}>查看</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function IntegratedKpiCard({ card }: { card: IntegratedKpiCardModel }) {
  const progressWidth = card.progress === null || !Number.isFinite(card.progress)
    ? 0
    : Math.min(Math.max(card.progress * 100, 0), 100);

  return (
    <article className={`workbench-kpi-card workbench-kpi-card-${card.key}`}>
      <header>
        <div>
          <span>{card.title}</span>
          <small>权重 {card.weight}% · {card.subtitle}</small>
        </div>
        <b className={`workbench-status ${card.statusClassName}`}>{card.status}</b>
      </header>
      <strong className="workbench-kpi-main">{card.mainValue}</strong>
      <div className="workbench-progress" aria-label={`${card.title}完成进度`}>
        <i style={{ width: `${progressWidth}%` }} />
      </div>
      <div className="workbench-kpi-values">
        {card.summaryRows.map(([label, value, tone]) => <span key={label}>{label}<strong className={tone}>{value}</strong></span>)}
      </div>
      <div className="workbench-kpi-detail-list">
        {card.detailRows.map(([label, value, tone]) => <span key={label}>{label}<strong className={tone}>{value}</strong></span>)}
      </div>
      <a className="workbench-kpi-action" href={card.actionHref}>{card.actionLabel}</a>
    </article>
  );
}

function TodayKpiActions({ actions, onSelectStore }: { actions: WorkbenchAction[]; onSelectStore: (storeId: string) => void }) {
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
            {item.storeId ? (
              <button type="button" className="workbench-row-action" onClick={() => onSelectStore(item.storeId || '')}>{item.actionLabel}</button>
            ) : (
              <a href={item.actionHref}>{item.actionLabel}</a>
            )}
          </section>
        ))}
        {actions.length === 0 && <div className="admin-home-empty">当前 KPI 没有明显落后项，继续保持日常节奏。</div>}
      </div>
    </article>
  );
}

function ProductFollowUpTable({ rows }: { rows: ProductFollowUp[] }) {
  const [filter, setFilter] = useState('all');
  const visibleRows = useMemo(() => rows.filter((row) => {
    if (filter === 'expired') return row.firstOrderStatusCode === 'EXPIRED_NO_FIRST_ORDER';
    if (filter === 'observing') return row.firstOrderStatusCode === 'OBSERVING';
    if (filter === 'firstOrder') return row.firstOrderStatusCode === 'FIRST_ORDER_SUCCESS';
    if (filter === 'new') return row.daysOnline <= 31;
    return true;
  }), [filter, rows]);

  return (
    <article className="excel-record-panel workbench-panel" id="product-follow-ups">
      <header>
        <h2>重点商品跟进</h2>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">全部</option>
          <option value="expired">已超过30天未首单</option>
          <option value="observing">观察中</option>
          <option value="firstOrder">30天内已首单</option>
          <option value="new">本月新上</option>
        </select>
      </header>
      <div className="import-record-table-wrap">
        <table className="import-record-table">
          <thead>
            <tr>
              <th className="workbench-follow-title-col">标题</th>
              <th>SKC ID</th>
              <th>SPU ID</th>
              <th>SKU ID</th>
              <th>店铺</th>
              <th>运营</th>
              <th>上新日期</th>
              <th>观察截止</th>
              <th>上站天数</th>
              <th>首单状态</th>
              <th>首单日期</th>
              <th>建议动作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.skc}-${row.spuId || ''}-${row.skuId || ''}-${row.storeName}-${row.siteJoinDate}`}>
                <td className="workbench-follow-title-col" title={row.productName || row.skc || '-'}>
                  <strong>{row.productName || '-'}</strong>
                </td>
                <td className="workbench-id-cell" title={row.skc || '-'}>{row.skc || '-'}</td>
                <td className="workbench-id-cell" title={row.spuId || '-'}>{row.spuId || '-'}</td>
                <td className="workbench-id-cell" title={row.skuId || '-'}>{row.skuId || '-'}</td>
                <td>{row.storeName || '-'}</td>
                <td>{row.operatorName || '-'}</td>
                <td>{row.siteJoinDate || '-'}</td>
                <td>{row.observeEndAt || '-'}</td>
                <td>{row.daysOnline}</td>
                <td><span className={`workbench-table-status ${row.firstOrderStatusCode === 'FIRST_ORDER_SUCCESS' ? 'ok' : row.firstOrderStatusCode === 'EXPIRED_NO_FIRST_ORDER' ? 'danger' : 'warning'}`}>{row.firstOrderStatus}</span></td>
                <td>{row.firstOrderDate || '-'}</td>
                <td>{row.suggestedAction}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && <tr><td colSpan={12}>暂无符合条件的商品。</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DataIntegrityPanel({ data }: { data: WorkbenchData }) {
  if (!data.filters.canManage) return null;
  const warningText = (item: WorkbenchData['dataIntegrityWarnings'][number]) => typeof item === 'string' ? item : item.message;
  const warningKey = (item: WorkbenchData['dataIntegrityWarnings'][number], index: number) => typeof item === 'string' ? item : `${item.type || 'warning'}-${item.message}-${index}`;

  return (
    <article className="excel-record-panel workbench-panel">
      <header><h2>数据完整性提醒</h2><span>{data.dataIntegrityStatus}</span></header>
      <div className="workbench-warning-list">
        {data.dataIntegrityWarnings.map((item, index) => <span className="warning" key={warningKey(item, index)}>{warningText(item)}</span>)}
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

function TargetEditor({
  data,
  target,
  onSaved,
  onClose,
}: {
  data: WorkbenchData;
  target: KpiTarget | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<KpiTarget>({ ...defaultTarget, period: data.filters.period });
  const [firstOrderRateTarget, setFirstOrderRateTarget] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!target) return;
    const nextForm = { ...defaultTarget, ...target, period: target.period || data.filters.period };
    setForm(nextForm);
    setFirstOrderRateTarget(
      nextForm.effectiveListingTarget > 0
        ? Number(((nextForm.firstOrderProductTarget / nextForm.effectiveListingTarget) * 100).toFixed(1))
        : 0,
    );
    setMessage('');
  }, [data.filters.period, target]);

  const storeOptions = useMemo(() => {
    const allStoreOptions = data.filters.storeOptions ?? data.filters.stores;
    if (!form.operatorId) return allStoreOptions;
    const allowedStoreKeys = new Set(data.filters.operatorStoreMap?.[form.operatorId] ?? []);
    return allStoreOptions.filter((store) => allowedStoreKeys.has(store.id) || allowedStoreKeys.has(store.storeName));
  }, [data.filters.operatorStoreMap, data.filters.storeOptions, data.filters.stores, form.operatorId]);

  if (!data.filters.canManage || !target) return null;

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
    onClose();
  };

  return (
    <div className="workbench-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <article className="excel-record-panel workbench-panel workbench-target-editor workbench-target-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>KPI 目标配置</h2>
            <span>{form.period || data.filters.period} · {form.operatorName || '全部运营'} · {form.storeName || '全部店铺'}</span>
          </div>
          <button type="button" className="workbench-modal-close" onClick={onClose} aria-label="关闭 KPI 目标配置">关闭</button>
        </header>
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
        <div className="workbench-modal-actions">
          <button type="button" className="workbench-modal-button workbench-modal-button-secondary" onClick={onClose}>取消</button>
          <button type="button" className="workbench-modal-button workbench-modal-button-primary" onClick={save}>保存目标</button>
        </div>
        {message && <div className="excel-import-error">{message}</div>}
      </article>
    </div>
  );
}

function KpiTargetLedger({
  data,
  refreshKey,
  onConfigure,
}: {
  data: WorkbenchData;
  refreshKey: number;
  onConfigure: (target: KpiTarget) => void;
}) {
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
  const operatorRefsByStoreKey = new Map<string, Array<{ id: string; name: string }>>();
  for (const operator of data.filters.operators) {
    const storeKeys = data.filters.operatorStoreMap?.[operator.id] ?? [];
    for (const storeKey of storeKeys) {
      const key = normalizeKey(storeKey);
      if (!key) continue;
      const refs = operatorRefsByStoreKey.get(key) ?? [];
      if (!refs.some((ref) => ref.id === operator.id || ref.name === operator.operatorName)) {
        refs.push({ id: operator.id, name: operator.operatorName });
      }
      operatorRefsByStoreKey.set(key, refs);
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
    const relatedOperators = [
      ...(operatorRefsByStoreKey.get(normalizeKey(store.id)) ?? []),
      ...(operatorRefsByStoreKey.get(normalizeKey(store.storeName)) ?? []),
    ].filter((operator, index, list) => list.findIndex((item) => item.id === operator.id || item.name === operator.name) === index);
    const selectedOperator = data.filters.selectedOperatorId
      ? data.filters.operators.find((operator) => operator.id === data.filters.selectedOperatorId)
      : undefined;
    const primaryOperator = matched
      ? { id: matched.operatorId, name: matched.operatorName }
      : selectedOperator
        ? { id: selectedOperator.id, name: selectedOperator.operatorName }
        : relatedOperators[0] ?? { id: '', name: '' };
    const targetForEdit: KpiTarget = matched ?? {
      ...defaultTarget,
      period: ledgerPeriod,
      operatorId: primaryOperator.id,
      operatorName: primaryOperator.name,
      storeId: store.id,
      storeName: store.storeName || store.id,
    };
    const operatorNames = matched?.operatorName
      ? [matched.operatorName]
      : uniqueText(relatedOperators.map((operator) => operator.name));

    return {
      storeName: store.storeName || store.id,
      operatorName: operatorNames.join('、') || '-',
      target: matched,
      targetForEdit,
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
                <td>
                  <button
                    type="button"
                    className={`workbench-config-link ${row.target ? 'ok' : 'warning'}`}
                    onClick={() => onConfigure(row.targetForEdit)}
                  >
                    {row.target ? '已配置' : '未配置'}
                  </button>
                </td>
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
  const [editingTarget, setEditingTarget] = useState<KpiTarget | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const dashboardQuery = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (operatorId) params.set('operatorId', operatorId);
    if (storeId) params.set('storeId', storeId);
    return params.toString();
  }, [operatorId, period, storeId]);

  const loadData = (query = dashboardQuery) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    void fetchJson<WorkbenchData | null>(`/api/operation-workbench/kpi-dashboard?${query}`, null, { signal: controller.signal })
      .then((nextData) => {
        if (requestIdRef.current === requestId) setData(nextData);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (requestIdRef.current === requestId) setData(null);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(dashboardQuery), 160);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [dashboardQuery]);

  const canManage = data?.filters.canManage ?? currentUser.role !== 'operator';
  const selectStore = (nextStoreId: string) => {
    if (!nextStoreId) return;
    setStoreId(nextStoreId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
          {(data?.filters.storeOptions ?? data?.filters.stores ?? []).map((item) => <option key={item.id} value={item.id}>{item.storeName}</option>)}
        </select></label>
        <span>数据更新时间<strong>{data?.dataUpdatedAt ? data.dataUpdatedAt.replace('T', ' ').slice(0, 19) : '-'}</strong></span>
      </section>

      {loading && !data && <div className="admin-route-loading">加载 KPI 工作台...</div>}
      {!loading && !data && <section className="excel-record-panel admin-permission-empty">工作台数据读取失败，请稍后重试。</section>}
      {data && (
        <>
          <KpiOverviewSection data={data} />
          <StoreKpiBreakdownTable rows={data.storeBreakdown ?? []} onSelectStore={selectStore} />
          <TodayKpiActions actions={data.todayActions} onSelectStore={selectStore} />
          <ProductFollowUpTable rows={data.productFollowUps} />
          <DataIntegrityPanel data={data} />
          <KpiTargetLedger data={data} refreshKey={targetRefreshKey} onConfigure={setEditingTarget} />
          <TargetEditor data={data} target={editingTarget} onClose={() => setEditingTarget(null)} onSaved={() => {
            setTargetRefreshKey((value) => value + 1);
            loadData();
          }} />
        </>
      )}
    </section>
  );
}

export default WorkbenchPage;
