import type { StandardFactDataSet } from '../../data-standard';
import type { AnalysisResultRecord, SalesOrderRecord, TrafficMetricRecord } from '../../types/fact';
import type { AnomalyResult } from './anomalyRuleTypes';
import { operationAnomalyRuleConfig } from './anomalyRuleConfig';
import { ruleTreeLibrary } from './ruleTreeLibrary';
import type {
  RuleTree,
  RuleTreeDecision,
  RuleTreeEvaluation,
  RuleTreeNode,
  RuleTreeDecisionStatus,
} from './ruleTreeTypes';

const {
  baselineWindowDays,
  declineThreshold,
  recentWindowDays,
} = operationAnomalyRuleConfig;

type StandardRecord = SalesOrderRecord | TrafficMetricRecord | AnalysisResultRecord;

type DailyMetric = {
  date: string;
  value: number;
};

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

function average(metrics: DailyMetric[]) {
  if (metrics.length === 0) {
    return 0;
  }

  return metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length;
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function matchesStore(record: Pick<StandardRecord, 'storeId' | 'storeName'>, anomalyResult: AnomalyResult) {
  if (anomalyResult.storeId) {
    return record.storeId === anomalyResult.storeId;
  }

  return Boolean(anomalyResult.storeName && record.storeName === anomalyResult.storeName);
}

function addDailyValue(dailyMap: Map<string, number>, date: string, value: number) {
  dailyMap.set(date, (dailyMap.get(date) ?? 0) + value);
}

function toDailyMetrics(dailyMap: Map<string, number>) {
  return Array.from(dailyMap.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((first, second) => first.date.localeCompare(second.date));
}

function getMetricsInRange(metrics: DailyMetric[], startDate: string, endDate: string) {
  const start = dateToTime(startDate);
  const end = dateToTime(endDate);

  return metrics.filter((metric) => {
    const time = dateToTime(metric.date);
    return time >= start && time <= end;
  });
}

function buildSalesOrderDailyMetrics(
  dataSet: StandardFactDataSet,
  anomalyResult: AnomalyResult,
  getValue: (record: SalesOrderRecord) => number | undefined,
) {
  const dailyMap = new Map<string, number>();

  dataSet.salesOrders.forEach((record) => {
    const date = normalizeDate(record.date);
    const value = getValue(record);

    if (!date || !matchesStore(record, anomalyResult) || !isFiniteMetric(value)) {
      return;
    }

    addDailyValue(dailyMap, date, value);
  });

  return toDailyMetrics(dailyMap);
}

function buildTrafficDailyMetrics(
  dataSet: StandardFactDataSet,
  anomalyResult: AnomalyResult,
  getValue: (record: TrafficMetricRecord) => number | undefined,
) {
  const dailyMap = new Map<string, number>();

  dataSet.trafficMetrics.forEach((record) => {
    const date = normalizeDate(record.date);
    const value = getValue(record);

    if (!date || !matchesStore(record, anomalyResult) || !isFiniteMetric(value)) {
      return;
    }

    addDailyValue(dailyMap, date, value);
  });

  return toDailyMetrics(dailyMap);
}

function buildAnalysisDailyMetrics(
  dataSet: StandardFactDataSet,
  anomalyResult: AnomalyResult,
  getValue: (record: AnalysisResultRecord) => number | undefined,
) {
  const dailyMap = new Map<string, number>();

  dataSet.analysisResults.forEach((record) => {
    const date = normalizeDate(record.date);
    const value = getValue(record);

    if (!date || !matchesStore(record, anomalyResult) || !isFiniteMetric(value)) {
      return;
    }

    addDailyValue(dailyMap, date, value);
  });

  return toDailyMetrics(dailyMap);
}

function chooseFirstAvailable(...candidates: DailyMetric[][]) {
  return candidates.find((metrics) => metrics.length > 0) ?? [];
}

function getDailyMetricSeries(dataSet: StandardFactDataSet, anomalyResult: AnomalyResult, metricKey: string): DailyMetric[] {
  if (metricKey === 'salesAmount') {
    return chooseFirstAvailable(
      buildSalesOrderDailyMetrics(dataSet, anomalyResult, (record) => record.salesAmount),
      buildTrafficDailyMetrics(dataSet, anomalyResult, (record) => record.salesAmount),
      buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.salesAmount),
    );
  }

  if (metricKey === 'orderCount') {
    return chooseFirstAvailable(
      buildSalesOrderDailyMetrics(dataSet, anomalyResult, () => 1),
      buildTrafficDailyMetrics(dataSet, anomalyResult, (record) => record.orderCount),
      buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.orderCount),
    );
  }

  if (metricKey === 'avgOrderValue') {
    return chooseFirstAvailable(
      buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.avgOrderValue),
      deriveAverageOrderValue(dataSet, anomalyResult),
    );
  }

  if (metricKey === 'visitorCount') {
    return chooseFirstAvailable(
      buildTrafficDailyMetrics(dataSet, anomalyResult, (record) => record.visitorCount),
      buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.visitorCount),
    );
  }

  if (metricKey === 'conversionRate') {
    return chooseFirstAvailable(
      buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.conversionRate),
      buildTrafficDailyMetrics(dataSet, anomalyResult, (record) => record.conversionRate),
    );
  }

  if (metricKey === 'impressionCount') {
    return buildTrafficDailyMetrics(dataSet, anomalyResult, (record) => record.impressionCount);
  }

  if (metricKey === 'clickCount') {
    return buildTrafficDailyMetrics(dataSet, anomalyResult, (record) => record.clickCount);
  }

  if (metricKey === 'ctr') {
    return buildTrafficDailyMetrics(dataSet, anomalyResult, (record) => record.ctr);
  }

  if (metricKey === 'adSpend') {
    return buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.adSpend);
  }

  if (metricKey === 'roas') {
    return buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.roas);
  }

  if (metricKey === 'refundRate') {
    return buildAnalysisDailyMetrics(dataSet, anomalyResult, (record) => record.refundRate);
  }

  return [];
}

function deriveAverageOrderValue(dataSet: StandardFactDataSet, anomalyResult: AnomalyResult) {
  const salesByDate = new Map<string, number>();
  const ordersByDate = new Map<string, number>();

  dataSet.salesOrders.forEach((record) => {
    const date = normalizeDate(record.date);

    if (!date || !matchesStore(record, anomalyResult)) {
      return;
    }

    addDailyValue(salesByDate, date, record.salesAmount);
    addDailyValue(ordersByDate, date, 1);
  });

  return Array.from(salesByDate.entries())
    .map(([date, salesAmount]) => {
      const orderCount = ordersByDate.get(date) ?? 0;
      return orderCount > 0 ? { date, value: salesAmount / orderCount } : undefined;
    })
    .filter((metric): metric is DailyMetric => Boolean(metric))
    .sort((first, second) => first.date.localeCompare(second.date));
}

function evaluateMetricSeries(node: RuleTreeNode, metrics: DailyMetric[]): RuleTreeDecision {
  const latestDate = metrics.at(-1)?.date;

  if (!latestDate) {
    return {
      nodeId: node.id,
      status: 'insufficientData',
      metricKey: node.metricKey,
      explanation: `${node.label}缺少可用标准指标数据。`,
    };
  }

  const recentMetrics = getMetricsInRange(metrics, shiftDate(latestDate, 1 - recentWindowDays), latestDate);
  const baselineEndDate = shiftDate(latestDate, -recentWindowDays);
  const baselineMetrics = getMetricsInRange(metrics, shiftDate(baselineEndDate, 1 - baselineWindowDays), baselineEndDate);

  if (recentMetrics.length < recentWindowDays || baselineMetrics.length === 0) {
    return {
      nodeId: node.id,
      status: 'insufficientData',
      metricKey: node.metricKey,
      explanation: `${node.label}最近${recentWindowDays}天或基准期数据不足。`,
    };
  }

  const observedValue = average(recentMetrics);
  const baselineValue = average(baselineMetrics);

  if (baselineValue <= 0) {
    return {
      nodeId: node.id,
      status: 'insufficientData',
      metricKey: node.metricKey,
      observedValue: roundMetric(observedValue),
      baselineValue: roundMetric(baselineValue),
      explanation: `${node.label}基准值不足以计算变化率。`,
    };
  }

  const changeRate = (observedValue - baselineValue) / baselineValue;
  const matched = node.checkDirection === 'increase'
    ? changeRate > declineThreshold
    : changeRate < -declineThreshold;
  const status: RuleTreeDecisionStatus = matched ? 'matched' : 'notMatched';

  return {
    nodeId: node.id,
    status,
    metricKey: node.metricKey,
    observedValue: roundMetric(observedValue),
    baselineValue: roundMetric(baselineValue),
    changeRate: roundMetric(changeRate),
    explanation: matched ? node.explanation : `${node.label}未达到规则树触发阈值。`,
  };
}

function evaluateMismatchNode(dataSet: StandardFactDataSet, anomalyResult: AnomalyResult, node: RuleTreeNode): RuleTreeDecision {
  const visitorDecision = evaluateMetricSeries(node, getDailyMetricSeries(dataSet, anomalyResult, 'visitorCount'));
  const orderDecision = evaluateMetricSeries(
    { ...node, metricKey: 'orderCount', checkDirection: 'increase' },
    getDailyMetricSeries(dataSet, anomalyResult, 'orderCount'),
  );

  if (visitorDecision.status === 'insufficientData' || orderDecision.status === 'insufficientData') {
    return {
      nodeId: node.id,
      status: 'insufficientData',
      metricKey: node.metricKey,
      explanation: `${node.label}缺少访客数或订单数数据。`,
    };
  }

  const visitorIncreased = (visitorDecision.changeRate ?? 0) > declineThreshold;
  const orderNotIncreased = (orderDecision.changeRate ?? 0) <= declineThreshold;

  return {
    nodeId: node.id,
    status: visitorIncreased && orderNotIncreased ? 'matched' : 'notMatched',
    metricKey: node.metricKey,
    observedValue: visitorDecision.observedValue,
    baselineValue: visitorDecision.baselineValue,
    changeRate: visitorDecision.changeRate,
    explanation: visitorIncreased && orderNotIncreased ? node.explanation : `${node.label}未达到规则树触发阈值。`,
  };
}

function flattenNodes(nodes: RuleTreeNode[]): RuleTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function evaluateNode(dataSet: StandardFactDataSet, anomalyResult: AnomalyResult, node: RuleTreeNode): RuleTreeDecision | undefined {
  if (node.type === 'rootAnomaly') {
    return undefined;
  }

  if (node.type === 'businessCause') {
    return {
      nodeId: node.id,
      status: 'unknown',
      metricKey: node.metricKey,
      explanation: node.explanation,
    };
  }

  if (node.futureMetric) {
    return {
      nodeId: node.id,
      status: 'insufficientData',
      metricKey: node.metricKey,
      explanation: `${node.label}是预留指标，当前标准事实数据未提供。`,
    };
  }

  if (node.checkDirection === 'mismatch') {
    return evaluateMismatchNode(dataSet, anomalyResult, node);
  }

  return evaluateMetricSeries(node, getDailyMetricSeries(dataSet, anomalyResult, node.metricKey));
}

function getEvaluationConfidence(decisions: RuleTreeDecision[]) {
  const matchedCount = decisions.filter((decision) => decision.status === 'matched').length;
  const insufficientCount = decisions.filter((decision) => decision.status === 'insufficientData').length;

  if (matchedCount >= 2) {
    return 'high';
  }

  if (matchedCount === 1) {
    return 'medium';
  }

  return insufficientCount === decisions.length ? 'low' : 'low';
}

function findRuleTreeForAnomaly(anomalyResult: AnomalyResult) {
  return ruleTreeLibrary.find((tree) => tree.relatedRuleIds.includes(anomalyResult.ruleId));
}

export function getRuleTrees(): RuleTree[] {
  return ruleTreeLibrary.map((tree) => ({
    ...tree,
    nodes: [...tree.nodes],
  }));
}

export function getRuleTreeByRootMetric(metricKey: string): RuleTree | undefined {
  return ruleTreeLibrary.find((tree) => tree.rootMetric === metricKey);
}

export function evaluateRuleTree(
  dataSet: StandardFactDataSet,
  anomalyResult: AnomalyResult,
): RuleTreeEvaluation | undefined {
  const ruleTree = findRuleTreeForAnomaly(anomalyResult);

  if (!ruleTree) {
    return undefined;
  }

  const decisions = flattenNodes(ruleTree.nodes)
    .map((node) => evaluateNode(dataSet, anomalyResult, node))
    .filter((decision): decision is RuleTreeDecision => Boolean(decision));
  const likelyCauseKeys = decisions
    .filter((decision) => decision.status === 'matched')
    .map((decision) => decision.metricKey)
    .filter(Boolean);

  return {
    anomalyResultId: anomalyResult.id,
    ruleTreeId: ruleTree.id,
    rootMetric: ruleTree.rootMetric,
    decisions,
    likelyCauseKeys,
    confidence: getEvaluationConfidence(decisions),
    createdAt: new Date().toISOString(),
  };
}

export function evaluateRuleTrees(
  dataSet: StandardFactDataSet,
  anomalyResults: AnomalyResult[],
): RuleTreeEvaluation[] {
  return anomalyResults
    .map((anomalyResult) => evaluateRuleTree(dataSet, anomalyResult))
    .filter((evaluation): evaluation is RuleTreeEvaluation => Boolean(evaluation));
}
