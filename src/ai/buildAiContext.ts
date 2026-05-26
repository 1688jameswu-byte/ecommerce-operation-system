import { analyzeAiReasons } from './aiReasonAnalyzer';
import { getOperationKnowledgeByRuleCode } from './knowledge';
import type { PlatformCode } from './rule-engine';
import type {
  AiAnomalyItem,
  AiAnomalyLevel,
  AiContext,
  AiContextBuildInput,
  AiContextSourceAnomaly,
  AiRelatedMetric,
  AiStoreSnapshot,
} from './aiSuggestionTypes';

const metricNameMap: Record<string, string> = {
  salesAmount: '销售额',
  orderCount: '订单数',
  visitorCount: '访客数',
  conversionRate: '转化率',
  impressionCount: '曝光量',
  clickCount: '点击数',
  ctr: '点击率',
  adSpend: '广告花费',
  roas: '广告投入产出比',
  refundRate: '退款率',
};

const legacyRuleCodeByRuleId: Record<string, string> = {
  'sales-amount-decline-v1': 'R006',
  'order-count-decline-v1': 'R005',
  'visitor-count-decline-v1': 'R001',
  'low-conversion-rate-v1': 'R004',
  'high-visitor-low-conversion-v1': 'R010',
};

const platformCodeByText: Partial<Record<string, PlatformCode>> = {
  TEMU: 'TEMU',
  AMAZON: 'AMAZON',
  TIKTOK: 'TIKTOK',
  SHOPIFY: 'SHOPIFY',
  ALL: 'ALL',
};

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toLevel(severity?: string, resultLevel?: unknown): AiAnomalyLevel {
  if (severity === 'critical') return 'critical';
  if (severity === 'high' || severity === 'medium') return 'warning';
  if (resultLevel === 'watch' || severity === 'low') return 'watch';
  return 'normal';
}

function inferMetricKey(anomaly: AiContextSourceAnomaly) {
  if (anomaly.metricKey) {
    return anomaly.metricKey;
  }

  if (anomaly.ruleId?.includes('sales-amount')) return 'salesAmount';
  if (anomaly.ruleId?.includes('order-count')) return 'orderCount';
  if (anomaly.ruleId?.includes('visitor-count')) return 'visitorCount';
  if (anomaly.ruleId?.includes('conversion')) return 'conversionRate';
  if (anomaly.category === 'sales') return 'salesAmount';
  if (anomaly.category === 'traffic') return 'visitorCount';
  if (anomaly.category === 'conversion') return 'conversionRate';
  if (anomaly.category === 'ad') return 'adSpend';

  return '';
}

function inferMetricName(anomaly: AiContextSourceAnomaly, metricKey: string) {
  return anomaly.metricName || metricNameMap[metricKey] || anomaly.ruleName || metricKey || '未知指标';
}

function getKnowledgeRuleCode(anomaly: AiContextSourceAnomaly) {
  return anomaly.ruleCode || (anomaly.ruleId ? legacyRuleCodeByRuleId[anomaly.ruleId] : '') || '';
}

function getKnowledgePlatform(anomaly: AiContextSourceAnomaly): PlatformCode {
  return platformCodeByText[String(anomaly.platform || 'TEMU').toUpperCase()] ?? 'TEMU';
}

function pickRecentValue(sourceMetrics?: AiContextSourceAnomaly['sourceMetrics']) {
  return sourceMetrics?.recent7Avg ?? sourceMetrics?.conversionRate ?? sourceMetrics?.visitorCount;
}

function pickBaselineValue(sourceMetrics?: AiContextSourceAnomaly['sourceMetrics']) {
  return sourceMetrics?.baseline30Avg;
}

function toOptionalMetricValue(value: unknown) {
  return typeof value === 'string' || isNumber(value) ? value : undefined;
}

function pickChangeRate(sourceMetrics?: AiContextSourceAnomaly['sourceMetrics']) {
  const declineRate = sourceMetrics?.declineRate;
  if (isNumber(declineRate)) {
    return -declineRate;
  }

  return undefined;
}

function toAiAnomaly(anomaly: AiContextSourceAnomaly): AiAnomalyItem {
  const metricKey = inferMetricKey(anomaly);
  const ruleCode = getKnowledgeRuleCode(anomaly);
  const knowledge = ruleCode ? getOperationKnowledgeByRuleCode(ruleCode, getKnowledgePlatform(anomaly)) : null;

  return {
    anomalyId: anomaly.id || '',
    metricKey,
    metricName: inferMetricName(anomaly, metricKey),
    level: toLevel(anomaly.severity, anomaly.sourceMetrics?.resultLevel),
    recentValue: toOptionalMetricValue(pickRecentValue(anomaly.sourceMetrics)),
    baselineValue: toOptionalMetricValue(pickBaselineValue(anomaly.sourceMetrics)),
    changeRate: pickChangeRate(anomaly.sourceMetrics),
    ruleCode: ruleCode || undefined,
    ruleName: anomaly.ruleName || '',
    ruleType: knowledge?.rule?.ruleType,
    primaryAnomalyType: knowledge?.rootCause?.primaryAnomalyType,
    coreProblem: knowledge?.rootCause?.coreProblem,
    businessMeaning: knowledge?.rootCause?.businessMeaning,
    coreAttribution: knowledge?.rootCause?.coreAttribution,
    knowledgeReasons: knowledge?.reasonTree?.possibleReasons.map((reason) => ({
      reasonCode: reason.reasonCode,
      reasonName: reason.reasonName,
      confidence: reason.confidence,
      evidence: reason.evidenceNeeded || [],
      needHumanCheck: reason.needHumanCheck,
    })),
    knowledgeActions: knowledge?.strategy?.actions.map((action) => ({
      actionCode: action.actionCode,
      actionName: action.actionName,
      priority: action.priority,
      ownerRole: action.ownerRole,
      actionSteps: action.actionSteps,
      expectedEffect: action.expectedEffect,
      riskNote: action.riskNote || '',
    })),
    shouldCreateTask: knowledge?.rootCause?.shouldCreateTask,
    bossAttentionRequired: knowledge?.rootCause?.bossAttentionRequired,
    knowledgeMissingParts: knowledge?.missingParts,
    explanation: anomaly.summary || '',
  };
}

function collectDataQualityNotes(input: AiContextBuildInput, anomalies: AiAnomalyItem[]) {
  const notes: string[] = [];
  const sourceAnomalies = input.anomalies;

  if (!input.platform) notes.push('缺少 platform');
  if (!input.storeId) notes.push('缺少 storeId');
  if (!input.storeName) notes.push('缺少 storeName');
  if (!input.operatorId) notes.push('缺少 operatorId');
  if (!input.operatorName) notes.push('缺少 operatorName');
  if (!input.dateRange?.startDate || !input.dateRange?.endDate) notes.push('缺少 dateRange');
  if (sourceAnomalies.some((anomaly) => !anomaly.platform)) notes.push('部分异常缺少 platform');
  if (sourceAnomalies.some((anomaly) => !anomaly.storeId)) notes.push('部分异常缺少 storeId');
  if (sourceAnomalies.some((anomaly) => !anomaly.operatorId)) notes.push('部分异常缺少 operatorId');
  if (anomalies.some((anomaly) => !anomaly.metricKey)) notes.push('部分异常缺少 metricKey，已尝试使用 ruleId/category 兜底');
  if (anomalies.some((anomaly) => !anomaly.anomalyId)) notes.push('部分异常缺少 anomalyId');

  return notes;
}

function buildRelatedMetrics(anomalies: AiAnomalyItem[], relatedMetrics: AiRelatedMetric[] = []) {
  const fromAnomalies = anomalies.map((anomaly) => ({
    metricKey: anomaly.metricKey,
    metricName: anomaly.metricName,
    value: anomaly.recentValue,
    baselineValue: anomaly.baselineValue,
    changeRate: anomaly.changeRate,
    note: anomaly.explanation,
  }));

  return [...relatedMetrics, ...fromAnomalies].filter((metric) => metric.metricKey || metric.metricName);
}

function buildStoreSnapshots(input: AiContextBuildInput): AiStoreSnapshot[] {
  const snapshots = input.anomalies.map((anomaly) => ({
    platform: anomaly.platform || '',
    storeId: anomaly.storeId || '',
    storeName: anomaly.storeName || '',
    operatorId: anomaly.operatorId || '',
    operatorName: anomaly.operatorName || '',
  }));

  if (input.platform || input.storeId || input.storeName || input.operatorId || input.operatorName) {
    snapshots.push({
      platform: input.platform || '',
      storeId: input.storeId || '',
      storeName: input.storeName || '',
      operatorId: input.operatorId || '',
      operatorName: input.operatorName || '',
    });
  }

  const seen = new Set<string>();

  return snapshots.filter((snapshot) => {
    const key = `${snapshot.platform}:${snapshot.storeId || snapshot.storeName}:${snapshot.operatorId || snapshot.operatorName}`;
    if (seen.has(key) || key === '::') {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function buildAiContext(input: AiContextBuildInput): AiContext {
  const anomalies = input.anomalies.map(toAiAnomaly);
  const analysis = analyzeAiReasons(anomalies);
  const storeSnapshots = buildStoreSnapshots(input);

  return {
    contextVersion: 'v1',
    generatedAt: new Date().toISOString(),
    platform: input.platform || '',
    storeId: input.storeId || '',
    storeName: input.storeName || '',
    operatorId: input.operatorId || '',
    operatorName: input.operatorName || '',
    storeSnapshots,
    dateRange: {
      startDate: input.dateRange?.startDate || '',
      endDate: input.dateRange?.endDate || '',
    },
    anomalySummary: {
      total: anomalies.length,
      criticalCount: anomalies.filter((anomaly) => anomaly.level === 'critical').length,
      warningCount: anomalies.filter((anomaly) => anomaly.level === 'warning').length,
      watchCount: anomalies.filter((anomaly) => anomaly.level === 'watch').length,
    },
    anomalies,
    relatedMetrics: buildRelatedMetrics(anomalies, input.relatedMetrics),
    possibleReasons: analysis.possibleReasons,
    recommendedActions: analysis.recommendedActions,
    historyCases: input.historyCases || [],
    dataQualityNotes: [
      ...collectDataQualityNotes(input, anomalies),
      ...(input.anomalies.some((anomaly) => !anomaly.ruleCode) ? ['部分异常缺少 ruleCode，无法关联 AI运营知识体系。'] : []),
    ],
  };
}
