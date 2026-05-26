import type { AnalysisResultRecord, SalesOrderRecord, TrafficMetricRecord } from '../../types/fact';
import { operationAnomalyRuleConfig } from './anomalyRuleConfig';
import type { AnomalyResult, AnomalyRule, AnomalySourceMetrics } from './anomalyRuleTypes';

const {
  baselineWindowDays,
  declineThreshold,
  highVisitorThreshold,
  lowConversionRateThreshold,
  recentWindowDays,
  watchDeclineThreshold,
} = operationAnomalyRuleConfig;

type FactIdentity = {
  platform: string;
  storeId: string;
  storeName: string;
  operatorId: string;
  operatorName: string;
  date: string;
};

type DailyMetric = FactIdentity & {
  value: number;
};

type ConversionMetric = FactIdentity & {
  visitorCount?: number;
  conversionRate?: number;
};

type MetricRecord = SalesOrderRecord | TrafficMetricRecord | AnalysisResultRecord;

const salesDeclinePossibleCauses = [
  '流量下降',
  '转化率下降',
  '商品竞争力下降',
  '价格竞争力下降',
  '活动结束或曝光减少',
];

const salesDeclineSuggestedActions = [
  '检查近7天访客趋势',
  '检查转化率变化',
  '检查商品价格和竞品变化',
  '检查活动状态',
  '检查主推商品是否断流',
];

const conversionPossibleCauses = [
  '商品详情页吸引力不足',
  '价格竞争力不足',
  '主图或标题吸引了不精准用户',
  '评论、售后或履约体验影响购买',
  'SKU库存或规格设置影响下单',
];

const conversionSuggestedActions = [
  '检查主图与商品详情是否一致',
  '检查价格和优惠力度',
  '检查近7天评论和售后反馈',
  '检查库存和SKU可售状态',
  '对比同类商品转化表现',
];

const trafficDeclinePossibleCauses = [
  '自然流量下降',
  '活动曝光减少',
  '商品搜索或推荐表现下降',
  '主推商品竞争力下降',
  '投放或内容引流减少',
];

const trafficDeclineSuggestedActions = [
  '检查近7天曝光和点击变化',
  '检查主推商品流量来源',
  '检查活动和内容引流状态',
  '检查同类商品流量变化',
  '检查商品标题、主图和关键词表现',
];

const orderDeclinePossibleCauses = [
  '访客数下降',
  '转化率下降',
  '价格或优惠吸引力不足',
  '库存或规格影响下单',
  '活动结束或购买意愿下降',
];

const orderDeclineSuggestedActions = [
  '检查近7天访客趋势',
  '检查下单转化率变化',
  '检查库存和SKU可售状态',
  '检查价格和优惠力度',
  '检查主要成交商品是否异常',
];

function hasText(value: string | undefined) {
  return Boolean(value && value.trim());
}

function normalizeDate(value: string | undefined) {
  const text = String(value || '').slice(0, 10);
  const time = Date.parse(`${text}T00:00:00`);

  return Number.isNaN(time) ? '' : text;
}

function dateToTime(date: string) {
  return Date.parse(`${date}T00:00:00`);
}

function shiftDate(date: string, days: number) {
  const shifted = new Date(dateToTime(date));
  shifted.setDate(shifted.getDate() + days);

  return shifted.toISOString().slice(0, 10);
}

function isFiniteMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getStoreKey(record: Pick<MetricRecord, 'storeId' | 'storeName'>) {
  return hasText(record.storeId) ? record.storeId : record.storeName;
}

function getIdentity(record: MetricRecord, date: string): FactIdentity {
  return {
    platform: record.platform || '',
    storeId: record.storeId || '',
    storeName: record.storeName || '',
    operatorId: record.operatorId || '',
    operatorName: record.operatorName || '',
    date,
  };
}

function buildResultId(ruleId: string, storeKey: string, date: string) {
  return `${ruleId}:${storeKey || 'unknown-store'}:${date || 'unknown-date'}`;
}

function createResult(
  rule: Pick<AnomalyRule, 'id' | 'name' | 'category' | 'severity'>,
  identity: FactIdentity,
  summary: string,
  possibleCauses: string[],
  suggestedActions: string[],
  sourceMetrics: AnomalySourceMetrics,
  createdAt: string,
): AnomalyResult {
  return {
    id: buildResultId(rule.id, identity.storeId || identity.storeName, identity.date),
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category,
    severity: rule.severity,
    platform: identity.platform,
    storeId: identity.storeId,
    storeName: identity.storeName,
    operatorId: identity.operatorId,
    operatorName: identity.operatorName,
    date: identity.date,
    summary,
    possibleCauses,
    suggestedActions,
    sourceMetrics,
    createdAt,
  };
}

function buildDailyMetrics<T extends MetricRecord>(
  records: T[],
  getValue: (record: T) => number | undefined,
) {
  const storeMap = new Map<string, Map<string, DailyMetric>>();

  records.forEach((record) => {
    const date = normalizeDate(record.date);
    const storeKey = getStoreKey(record);
    const value = getValue(record);

    if (!date || !hasText(storeKey) || !isFiniteMetric(value)) {
      return;
    }

    const dailyMap = storeMap.get(storeKey) ?? new Map<string, DailyMetric>();
    const existing = dailyMap.get(date);

    if (existing) {
      existing.value += value;
    } else {
      dailyMap.set(date, {
        ...getIdentity(record, date),
        value,
      });
    }

    storeMap.set(storeKey, dailyMap);
  });

  return storeMap;
}

function getMetricsInRange(dailyMap: Map<string, DailyMetric>, startDate: string, endDate: string) {
  const start = dateToTime(startDate);
  const end = dateToTime(endDate);

  return Array.from(dailyMap.values()).filter((metric) => {
    const time = dateToTime(metric.date);
    return time >= start && time <= end;
  });
}

function average(metrics: DailyMetric[]) {
  if (metrics.length === 0) {
    return 0;
  }

  return metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length;
}

function evaluateDeclineRule(
  contextCreatedAt: string,
  rule: Pick<AnomalyRule, 'id' | 'name' | 'category' | 'severity'>,
  storeMap: Map<string, Map<string, DailyMetric>>,
  possibleCauses: string[],
  suggestedActions: string[],
) {
  const results: AnomalyResult[] = [];

  storeMap.forEach((dailyMap) => {
    const dates = Array.from(dailyMap.keys()).sort();
    const latestDate = dates.at(-1);

    if (!latestDate) {
      return;
    }

    const recentStartDate = shiftDate(latestDate, 1 - recentWindowDays);
    const baselineEndDate = shiftDate(latestDate, -recentWindowDays);
    const baselineStartDate = shiftDate(baselineEndDate, 1 - baselineWindowDays);
    const recentMetrics = getMetricsInRange(dailyMap, recentStartDate, latestDate);
    const baselineMetrics = getMetricsInRange(dailyMap, baselineStartDate, baselineEndDate);

    if (recentMetrics.length < recentWindowDays || baselineMetrics.length === 0) {
      return;
    }

    const recent7Avg = average(recentMetrics);
    const baseline30Avg = average(baselineMetrics);

    if (baseline30Avg <= 0) {
      return;
    }

    const declineRate = (baseline30Avg - recent7Avg) / baseline30Avg;

    if (declineRate < watchDeclineThreshold) {
      return;
    }

    const latestMetric = dailyMap.get(latestDate) ?? recentMetrics.at(-1);

    if (!latestMetric) {
      return;
    }

    const isAnomaly = declineRate >= declineThreshold;
    const resultRule = isAnomaly ? rule : { ...rule, severity: 'low' as const };
    const resultPrefix = isAnomaly ? '' : '观察级波动：';

    results.push(createResult(
      resultRule,
      latestMetric,
      `${resultPrefix}${latestMetric.storeName || '未知店铺'} 最近${recentWindowDays}天日均${rule.name.replace('下降', '')}较基准期下降 ${Math.round(declineRate * 100)}%。`,
      possibleCauses,
      suggestedActions,
      {
        recent7Avg: roundMetric(recent7Avg),
        baseline30Avg: roundMetric(baseline30Avg),
        declineRate: roundMetric(declineRate),
        recentDays: recentMetrics.length,
        baselineDays: baselineMetrics.length,
        resultLevel: isAnomaly ? 'anomaly' : 'watch',
      },
      contextCreatedAt,
    ));
  });

  return results;
}

function dedupeConversionMetrics(primary: ConversionMetric[], fallback: ConversionMetric[]) {
  const metricsByStoreDate = new Map<string, ConversionMetric>();

  primary.forEach((metric) => {
    const storeKey = metric.storeId || metric.storeName;
    if (!storeKey || !metric.date || !isFiniteMetric(metric.conversionRate)) {
      return;
    }

    metricsByStoreDate.set(`${storeKey}:${metric.date}`, metric);
  });

  fallback.forEach((metric) => {
    const storeKey = metric.storeId || metric.storeName;
    if (!storeKey || !metric.date || !isFiniteMetric(metric.conversionRate)) {
      return;
    }

    const key = `${storeKey}:${metric.date}`;
    if (!metricsByStoreDate.has(key)) {
      metricsByStoreDate.set(key, metric);
    }
  });

  return Array.from(metricsByStoreDate.values());
}

function toAnalysisConversionMetric(record: AnalysisResultRecord): ConversionMetric | null {
  const date = normalizeDate(record.date);

  if (!date || !isFiniteMetric(record.conversionRate)) {
    return null;
  }

  return {
    ...getIdentity(record, date),
    visitorCount: record.visitorCount,
    conversionRate: record.conversionRate,
  };
}

function toTrafficConversionMetric(record: TrafficMetricRecord): ConversionMetric | null {
  const date = normalizeDate(record.date);

  if (!date || !isFiniteMetric(record.conversionRate)) {
    return null;
  }

  return {
    ...getIdentity(record, date),
    visitorCount: record.visitorCount,
    conversionRate: record.conversionRate,
  };
}

function getConversionMetrics(analysisResults: AnalysisResultRecord[], trafficMetrics: TrafficMetricRecord[]) {
  return dedupeConversionMetrics(
    analysisResults.map(toAnalysisConversionMetric).filter((metric): metric is ConversionMetric => Boolean(metric)),
    trafficMetrics.map(toTrafficConversionMetric).filter((metric): metric is ConversionMetric => Boolean(metric)),
  );
}

export const anomalyRuleLibrary: AnomalyRule[] = [
  {
    id: 'sales-amount-decline-v1',
    name: '销售额下降',
    category: 'sales',
    severity: 'high',
    enabled: true,
    evaluate: ({ dataSet, createdAt }) => evaluateDeclineRule(
      createdAt,
      anomalyRuleLibrary[0],
      buildDailyMetrics(dataSet.salesOrders, (record) => record.salesAmount),
      salesDeclinePossibleCauses,
      salesDeclineSuggestedActions,
    ),
  },
  {
    id: 'order-count-decline-v1',
    name: '订单数下降',
    category: 'sales',
    severity: 'high',
    enabled: true,
    evaluate: ({ dataSet, createdAt }) => evaluateDeclineRule(
      createdAt,
      anomalyRuleLibrary[1],
      buildDailyMetrics(dataSet.salesOrders, () => 1),
      orderDeclinePossibleCauses,
      orderDeclineSuggestedActions,
    ),
  },
  {
    id: 'visitor-count-decline-v1',
    name: '访客数下降',
    category: 'traffic',
    severity: 'medium',
    enabled: true,
    evaluate: ({ dataSet, createdAt }) => evaluateDeclineRule(
      createdAt,
      anomalyRuleLibrary[2],
      buildDailyMetrics(dataSet.trafficMetrics, (record) => record.visitorCount),
      trafficDeclinePossibleCauses,
      trafficDeclineSuggestedActions,
    ),
  },
  {
    id: 'low-conversion-rate-v1',
    name: '转化率过低',
    category: 'conversion',
    severity: 'medium',
    enabled: true,
    evaluate: ({ dataSet, createdAt }) => getConversionMetrics(dataSet.analysisResults, dataSet.trafficMetrics)
      .filter((metric) => isFiniteMetric(metric.conversionRate) && metric.conversionRate < lowConversionRateThreshold)
      .map((metric) => createResult(
        anomalyRuleLibrary[3],
        metric,
        `${metric.storeName || '未知店铺'} 转化率低于 ${formatPercent(lowConversionRateThreshold)}。`,
        conversionPossibleCauses,
        conversionSuggestedActions,
        {
          conversionRate: roundMetric(metric.conversionRate ?? 0),
          visitorCount: metric.visitorCount,
        },
        createdAt,
      )),
  },
  {
    id: 'high-visitor-low-conversion-v1',
    name: '高访客低转化',
    category: 'conversion',
    severity: 'high',
    enabled: true,
    evaluate: ({ dataSet, createdAt }) => getConversionMetrics(dataSet.analysisResults, dataSet.trafficMetrics)
      .filter((metric) =>
        isFiniteMetric(metric.visitorCount) &&
        metric.visitorCount >= highVisitorThreshold &&
        isFiniteMetric(metric.conversionRate) &&
        metric.conversionRate < lowConversionRateThreshold,
      )
      .map((metric) => createResult(
        anomalyRuleLibrary[4],
        metric,
        `${metric.storeName || '未知店铺'} 访客数较高但转化率低于 ${formatPercent(lowConversionRateThreshold)}。`,
        conversionPossibleCauses,
        conversionSuggestedActions,
        {
          visitorCount: metric.visitorCount,
          conversionRate: roundMetric(metric.conversionRate ?? 0),
        },
        createdAt,
      )),
  },
  {
    id: 'standard-fact-data-quality-v1',
    name: '数据质量异常',
    category: 'dataQuality',
    severity: 'medium',
    enabled: true,
    evaluate: ({ dataSet, createdAt }) => {
      if (dataSet.warnings.length === 0) {
        return [];
      }

      return [createResult(
        anomalyRuleLibrary[5],
        {
          platform: dataSet.meta.platforms.join(','),
          storeId: '',
          storeName: '全局数据集',
          operatorId: '',
          operatorName: '',
          date: dataSet.meta.generatedAt.slice(0, 10),
        },
        `标准事实数据存在 ${dataSet.warnings.length} 条质量警告。`,
        ['标准字段缺失', '店铺或日期信息不完整', '上游数据映射不完整'],
        ['检查标准事实数据质量警告', '补充缺失的店铺、平台和日期字段', '复核平台适配层字段映射'],
        {
          warningCount: dataSet.warnings.length,
          salesOrderCount: dataSet.meta.recordCounts.salesOrders,
          trafficMetricCount: dataSet.meta.recordCounts.trafficMetrics,
          analysisResultCount: dataSet.meta.recordCounts.analysisResults,
        },
        createdAt,
      )];
    },
  },
];
