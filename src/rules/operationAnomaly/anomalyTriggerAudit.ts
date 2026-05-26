import type { StandardFactDataSet } from '../../data-standard';
import type { AnalysisResultRecord, SalesOrderRecord, TrafficMetricRecord } from '../../types/fact';
import { operationAnomalyRuleConfig } from './anomalyRuleConfig';

type DeclineMetricKey = 'salesAmount' | 'orderCount' | 'visitorCount';

export interface DeclineRuleStoreAudit {
  storeKey: string;
  storeName: string;
  latestDate: string;
  dateCount: number;
  recent7Avg?: number;
  baseline30Avg?: number;
  declineRate?: number;
  recentDays: number;
  baselineDays: number;
  watchTriggered: boolean;
  triggered: boolean;
  reasons: string[];
}

export interface ConversionRuleAudit {
  metricCount: number;
  lowestConversionRate?: number;
  lowestConversionStoreName?: string;
  lowestConversionDate?: string;
  highVisitorLowConversionCount: number;
  hasConversionRate: boolean;
  hasVisitorCount: boolean;
  triggered: boolean;
  reasons: string[];
}

export interface DataQualityRuleAudit {
  warningCount: number;
  triggered: boolean;
  reasons: string[];
}

export interface AnomalyRuleReadinessAudit {
  ruleId: string;
  ruleName: string;
  ready: boolean;
  triggered: boolean;
  reasons: string[];
  storeAudits?: DeclineRuleStoreAudit[];
  conversionAudit?: ConversionRuleAudit;
  dataQualityAudit?: DataQualityRuleAudit;
}

export interface AnomalyTriggerAuditReport {
  dataSummary: {
    salesOrderCount: number;
    trafficMetricCount: number;
    analysisResultCount: number;
    warningCount: number;
    storeCount: number;
    dateRange: {
      startDate: string;
      endDate: string;
    };
  };
  missingFieldStats: Record<string, number>;
  ruleAudits: AnomalyRuleReadinessAudit[];
  keyMetricChangeOverview: Record<DeclineMetricKey, DeclineRuleStoreAudit[]>;
  generatedAt: string;
}

type FactLike = SalesOrderRecord | TrafficMetricRecord | AnalysisResultRecord;

type DailyMetric = {
  storeKey: string;
  storeName: string;
  date: string;
  value: number;
};

type ConversionMetric = {
  storeKey: string;
  storeName: string;
  date: string;
  visitorCount?: number;
  conversionRate?: number;
};

const {
  baselineWindowDays,
  declineThreshold,
  highVisitorThreshold,
  lowConversionRateThreshold,
  recentWindowDays,
  watchDeclineThreshold,
} = operationAnomalyRuleConfig;

function hasText(value?: string) {
  return Boolean(value && value.trim());
}

function normalizeDate(value?: string) {
  const date = String(value || '').slice(0, 10);
  return Number.isNaN(Date.parse(`${date}T00:00:00`)) ? '' : date;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function isFiniteMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function getStoreKey(record: Pick<FactLike, 'storeId' | 'storeName'>) {
  return hasText(record.storeId) ? record.storeId : record.storeName;
}

function dateInRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function average(metrics: DailyMetric[]) {
  if (metrics.length === 0) {
    return 0;
  }

  return metrics.reduce((total, metric) => total + metric.value, 0) / metrics.length;
}

function countMissing<T extends object>(records: T[], field: keyof T) {
  return records.filter((record) => {
    const value = record[field];
    return value === undefined || value === null || value === '';
  }).length;
}

function buildDateRange(dataSet: StandardFactDataSet) {
  const dates = [
    ...dataSet.salesOrders.map((record) => normalizeDate(record.date)),
    ...dataSet.trafficMetrics.map((record) => normalizeDate(record.date)),
    ...dataSet.analysisResults.map((record) => normalizeDate(record.date)),
  ].filter(Boolean).sort();

  return {
    startDate: dates.at(0) ?? '',
    endDate: dates.at(-1) ?? '',
  };
}

function buildStoreCount(dataSet: StandardFactDataSet) {
  const stores = new Set<string>();

  [...dataSet.salesOrders, ...dataSet.trafficMetrics, ...dataSet.analysisResults].forEach((record) => {
    const storeKey = getStoreKey(record);
    if (hasText(storeKey)) {
      stores.add(storeKey);
    }
  });

  return stores.size;
}

function buildMissingFieldStats(dataSet: StandardFactDataSet) {
  return {
    salesOrdersMissingDate: countMissing(dataSet.salesOrders, 'date'),
    salesOrdersMissingStoreIdentity: dataSet.salesOrders.filter((record) => !hasText(record.storeId) && !hasText(record.storeName)).length,
    salesOrdersMissingSalesAmount: dataSet.salesOrders.filter((record) => !isFiniteMetric(record.salesAmount)).length,
    trafficMetricsMissingDate: countMissing(dataSet.trafficMetrics, 'date'),
    trafficMetricsMissingStoreIdentity: dataSet.trafficMetrics.filter((record) => !hasText(record.storeId) && !hasText(record.storeName)).length,
    trafficMetricsMissingVisitorCount: dataSet.trafficMetrics.filter((record) => !isFiniteMetric(record.visitorCount)).length,
    trafficMetricsMissingConversionRate: dataSet.trafficMetrics.filter((record) => !isFiniteMetric(record.conversionRate)).length,
    analysisResultsMissingDate: countMissing(dataSet.analysisResults, 'date'),
    analysisResultsMissingStoreIdentity: dataSet.analysisResults.filter((record) => !hasText(record.storeId) && !hasText(record.storeName)).length,
    analysisResultsMissingConversionRate: dataSet.analysisResults.filter((record) => !isFiniteMetric(record.conversionRate)).length,
    analysisResultsMissingVisitorCount: dataSet.analysisResults.filter((record) => !isFiniteMetric(record.visitorCount)).length,
  };
}

function buildDailyMetrics<T extends FactLike>(
  records: T[],
  getValue: (record: T) => number | undefined,
) {
  const storeMetrics = new Map<string, Map<string, DailyMetric>>();

  records.forEach((record) => {
    const date = normalizeDate(record.date);
    const storeKey = getStoreKey(record);
    const value = getValue(record);

    if (!date || !hasText(storeKey) || !isFiniteMetric(value)) {
      return;
    }

    const dailyMetrics = storeMetrics.get(storeKey) ?? new Map<string, DailyMetric>();
    const existing = dailyMetrics.get(date);

    if (existing) {
      existing.value += value;
    } else {
      dailyMetrics.set(date, {
        storeKey,
        storeName: record.storeName || '未绑定店铺',
        date,
        value,
      });
    }

    storeMetrics.set(storeKey, dailyMetrics);
  });

  return storeMetrics;
}

function auditDeclineMetric(
  metricKey: DeclineMetricKey,
  storeMetrics: Map<string, Map<string, DailyMetric>>,
) {
  const audits: DeclineRuleStoreAudit[] = [];

  storeMetrics.forEach((dailyMetrics, storeKey) => {
    const dates = Array.from(dailyMetrics.keys()).sort();
    const latestDate = dates.at(-1) ?? '';
    const firstMetric = Array.from(dailyMetrics.values())[0];
    const reasons: string[] = [];

    if (!latestDate) {
      reasons.push('没有可用日期。');
      audits.push({
        storeKey,
        storeName: firstMetric?.storeName || '未绑定店铺',
        latestDate,
        dateCount: dates.length,
        recentDays: 0,
        baselineDays: 0,
        watchTriggered: false,
        triggered: false,
        reasons,
      });
      return;
    }

    const recentStartDate = shiftDate(latestDate, 1 - recentWindowDays);
    const baselineEndDate = shiftDate(latestDate, -recentWindowDays);
    const baselineStartDate = shiftDate(baselineEndDate, 1 - baselineWindowDays);
    const metrics = Array.from(dailyMetrics.values());
    const recentMetrics = metrics.filter((metric) => dateInRange(metric.date, recentStartDate, latestDate));
    const baselineMetrics = metrics.filter((metric) => dateInRange(metric.date, baselineStartDate, baselineEndDate));
    const recent7Avg = average(recentMetrics);
    const baseline30Avg = average(baselineMetrics);
    const declineRate = baseline30Avg > 0 ? (baseline30Avg - recent7Avg) / baseline30Avg : undefined;
    const hasEnoughRecentData = recentMetrics.length >= recentWindowDays;
    const watchTriggered = declineRate !== undefined && hasEnoughRecentData && declineRate >= watchDeclineThreshold;
    const triggered = declineRate !== undefined && hasEnoughRecentData && declineRate >= declineThreshold;

    if (recentMetrics.length < recentWindowDays) {
      reasons.push(`最近${recentWindowDays}天可用天数不足，仅 ${recentMetrics.length} 天。`);
    }
    if (baselineMetrics.length === 0) {
      reasons.push(`最近${baselineWindowDays}天 baseline 没有可用数据。`);
    }
    if (baseline30Avg <= 0) {
      reasons.push('baseline30Avg 小于等于 0，无法计算下降率。');
    }
    if (declineRate !== undefined && declineRate < watchDeclineThreshold) {
      reasons.push(`${metricKey} 下降率 ${(declineRate * 100).toFixed(2)}%，未达到观察阈值 ${(watchDeclineThreshold * 100).toFixed(0)}%。`);
    }
    if (watchTriggered && !triggered) {
      reasons.push(`${metricKey} 下降率 ${(declineRate * 100).toFixed(2)}%，已达到观察阈值 ${(watchDeclineThreshold * 100).toFixed(0)}%，未达到异常阈值 ${(declineThreshold * 100).toFixed(0)}%。`);
    }
    if (triggered) {
      reasons.push(`${metricKey} 下降率 ${(declineRate * 100).toFixed(2)}%，已达到异常阈值 ${(declineThreshold * 100).toFixed(0)}%。`);
    }

    audits.push({
      storeKey,
      storeName: firstMetric?.storeName || '未绑定店铺',
      latestDate,
      dateCount: dates.length,
      recent7Avg: roundMetric(recent7Avg),
      baseline30Avg: roundMetric(baseline30Avg),
      declineRate: declineRate === undefined ? undefined : roundMetric(declineRate),
      recentDays: recentMetrics.length,
      baselineDays: baselineMetrics.length,
      watchTriggered,
      triggered,
      reasons,
    });
  });

  return audits.sort((first, second) => (second.declineRate ?? -1) - (first.declineRate ?? -1));
}

function toAnalysisConversionMetric(record: AnalysisResultRecord): ConversionMetric | undefined {
  const date = normalizeDate(record.date);
  const storeKey = getStoreKey(record);

  if (!date || !hasText(storeKey) || !isFiniteMetric(record.conversionRate)) {
    return undefined;
  }

  return {
    storeKey,
    storeName: record.storeName || '未绑定店铺',
    date,
    visitorCount: record.visitorCount,
    conversionRate: record.conversionRate,
  };
}

function toTrafficConversionMetric(record: TrafficMetricRecord): ConversionMetric | undefined {
  const date = normalizeDate(record.date);
  const storeKey = getStoreKey(record);

  if (!date || !hasText(storeKey) || !isFiniteMetric(record.conversionRate)) {
    return undefined;
  }

  return {
    storeKey,
    storeName: record.storeName || '未绑定店铺',
    date,
    visitorCount: record.visitorCount,
    conversionRate: record.conversionRate,
  };
}

function getConversionMetrics(dataSet: StandardFactDataSet) {
  const metrics = new Map<string, ConversionMetric>();

  dataSet.analysisResults.forEach((record) => {
    const metric = toAnalysisConversionMetric(record);
    if (metric) {
      metrics.set(`${metric.storeKey}:${metric.date}`, metric);
    }
  });

  dataSet.trafficMetrics.forEach((record) => {
    const metric = toTrafficConversionMetric(record);
    const key = metric ? `${metric.storeKey}:${metric.date}` : '';
    if (metric && !metrics.has(key)) {
      metrics.set(key, metric);
    }
  });

  return Array.from(metrics.values());
}

function auditConversionRules(dataSet: StandardFactDataSet): ConversionRuleAudit {
  const conversionMetrics = getConversionMetrics(dataSet);
  const orderedByConversion = conversionMetrics
    .filter((metric) => isFiniteMetric(metric.conversionRate))
    .sort((first, second) => (first.conversionRate ?? 0) - (second.conversionRate ?? 0));
  const lowest = orderedByConversion[0];
  const lowConversionCount = conversionMetrics.filter((metric) =>
    isFiniteMetric(metric.conversionRate) && metric.conversionRate < lowConversionRateThreshold,
  ).length;
  const highVisitorLowConversionCount = conversionMetrics.filter((metric) =>
    isFiniteMetric(metric.visitorCount) &&
    metric.visitorCount >= highVisitorThreshold &&
    isFiniteMetric(metric.conversionRate) &&
    metric.conversionRate < lowConversionRateThreshold,
  ).length;
  const reasons: string[] = [];

  if (conversionMetrics.length === 0) {
    reasons.push('没有可用于转化率判断的标准 conversionRate。');
  }
  if (lowest && (lowest.conversionRate ?? 0) >= lowConversionRateThreshold) {
    reasons.push(`最低 conversionRate 为 ${((lowest.conversionRate ?? 0) * 100).toFixed(2)}%，未低于 ${(lowConversionRateThreshold * 100).toFixed(0)}%。`);
  }
  if (lowConversionCount > 0) {
    reasons.push(`${lowConversionCount} 条 conversionRate 低于 ${(lowConversionRateThreshold * 100).toFixed(0)}%。`);
  }
  if (highVisitorLowConversionCount === 0) {
    reasons.push(`不存在 visitorCount >= ${highVisitorThreshold} 且 conversionRate < ${(lowConversionRateThreshold * 100).toFixed(0)}% 的记录。`);
  }
  if (highVisitorLowConversionCount > 0) {
    reasons.push(`${highVisitorLowConversionCount} 条记录满足高访客低转化条件。`);
  }

  return {
    metricCount: conversionMetrics.length,
    lowestConversionRate: lowest?.conversionRate === undefined ? undefined : roundMetric(lowest.conversionRate),
    lowestConversionStoreName: lowest?.storeName,
    lowestConversionDate: lowest?.date,
    highVisitorLowConversionCount,
    hasConversionRate: conversionMetrics.some((metric) => isFiniteMetric(metric.conversionRate)),
    hasVisitorCount: conversionMetrics.some((metric) => isFiniteMetric(metric.visitorCount)),
    triggered: lowConversionCount > 0,
    reasons,
  };
}

function ruleReadyFromStoreAudits(audits: DeclineRuleStoreAudit[]) {
  return audits.some((audit) => audit.recentDays >= 7 && audit.baselineDays > 0 && (audit.baseline30Avg ?? 0) > 0);
}

export function analyzeAnomalyTriggerReadiness(dataSet: StandardFactDataSet): AnomalyTriggerAuditReport {
  const salesAudits = auditDeclineMetric(
    'salesAmount',
    buildDailyMetrics(dataSet.salesOrders, (record) => record.salesAmount),
  );
  const orderAudits = auditDeclineMetric(
    'orderCount',
    buildDailyMetrics(dataSet.salesOrders, () => 1),
  );
  const visitorAudits = auditDeclineMetric(
    'visitorCount',
    buildDailyMetrics(dataSet.trafficMetrics, (record) => record.visitorCount),
  );
  const conversionAudit = auditConversionRules(dataSet);
  const highVisitorLowConversionAudit = {
    ...conversionAudit,
    triggered: conversionAudit.highVisitorLowConversionCount > 0,
  };
  const dataQualityAudit: DataQualityRuleAudit = {
    warningCount: dataSet.warnings.length,
    triggered: dataSet.warnings.length > 0,
    reasons: dataSet.warnings.length > 0
      ? [`存在 ${dataSet.warnings.length} 条 StandardFactDataSet warnings。`]
      : ['StandardFactDataSet warnings 为空。'],
  };

  return {
    dataSummary: {
      salesOrderCount: dataSet.salesOrders.length,
      trafficMetricCount: dataSet.trafficMetrics.length,
      analysisResultCount: dataSet.analysisResults.length,
      warningCount: dataSet.warnings.length,
      storeCount: buildStoreCount(dataSet),
      dateRange: buildDateRange(dataSet),
    },
    missingFieldStats: buildMissingFieldStats(dataSet),
    ruleAudits: [
      {
        ruleId: 'sales-amount-decline-v1',
        ruleName: '销售额下降',
        ready: ruleReadyFromStoreAudits(salesAudits),
        triggered: salesAudits.some((audit) => audit.triggered),
        reasons: salesAudits.length ? salesAudits.flatMap((audit) => audit.reasons).slice(0, 8) : ['没有可用于销售额下降规则的 salesAmount 数据。'],
        storeAudits: salesAudits,
      },
      {
        ruleId: 'order-count-decline-v1',
        ruleName: '订单数下降',
        ready: ruleReadyFromStoreAudits(orderAudits),
        triggered: orderAudits.some((audit) => audit.triggered),
        reasons: orderAudits.length ? orderAudits.flatMap((audit) => audit.reasons).slice(0, 8) : ['没有可用于订单数下降规则的订单记录。'],
        storeAudits: orderAudits,
      },
      {
        ruleId: 'visitor-count-decline-v1',
        ruleName: '访客数下降',
        ready: ruleReadyFromStoreAudits(visitorAudits),
        triggered: visitorAudits.some((audit) => audit.triggered),
        reasons: visitorAudits.length ? visitorAudits.flatMap((audit) => audit.reasons).slice(0, 8) : ['没有可用于访客数下降规则的 visitorCount 数据。'],
        storeAudits: visitorAudits,
      },
      {
        ruleId: 'low-conversion-rate-v1',
        ruleName: '转化率过低',
        ready: conversionAudit.hasConversionRate,
        triggered: conversionAudit.triggered,
        reasons: conversionAudit.reasons,
        conversionAudit,
      },
      {
        ruleId: 'high-visitor-low-conversion-v1',
        ruleName: '高访客低转化',
        ready: highVisitorLowConversionAudit.hasConversionRate && highVisitorLowConversionAudit.hasVisitorCount,
        triggered: highVisitorLowConversionAudit.triggered,
        reasons: highVisitorLowConversionAudit.reasons,
        conversionAudit: highVisitorLowConversionAudit,
      },
      {
        ruleId: 'standard-fact-data-quality-v1',
        ruleName: '数据质量异常',
        ready: true,
        triggered: dataQualityAudit.triggered,
        reasons: dataQualityAudit.reasons,
        dataQualityAudit,
      },
    ],
    keyMetricChangeOverview: {
      salesAmount: salesAudits,
      orderCount: orderAudits,
      visitorCount: visitorAudits,
    },
    generatedAt: new Date().toISOString(),
  };
}
