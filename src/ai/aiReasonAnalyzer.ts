import { getAiStrategy, type AiProblemType } from './aiStrategyLibrary';
import type { AiAnomalyItem, AiRecommendedAction, AiPossibleReason } from './aiSuggestionTypes';

export interface AiReasonAnalysisResult {
  problemTypes: AiProblemType[];
  possibleReasons: AiPossibleReason[];
  recommendedActions: AiRecommendedAction[];
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function inferProblemType(anomaly: AiAnomalyItem): AiProblemType | undefined {
  const metricKey = normalizeText(anomaly.metricKey);
  const metricName = normalizeText(anomaly.metricName);
  const ruleName = normalizeText(anomaly.ruleName);
  const text = `${metricKey} ${metricName} ${ruleName}`;

  if (includesAny(text, ['adSpendUpConversionDown', 'ad spend up conversion down', '花费上升转化下降'])) {
    return 'AD_SPEND_UP_CONVERSION_DOWN';
  }
  if (includesAny(text, ['visitorCount', 'visitors', 'visitor', '访客', '流量'])) {
    return 'VISITOR_DROP';
  }
  if (includesAny(text, ['orderCount', 'orders', 'order', '订单'])) {
    return 'ORDER_DROP';
  }
  if (includesAny(text, ['conversionRate', 'conversion', 'cvr', '转化'])) {
    return 'CONVERSION_DROP';
  }
  if (includesAny(text, ['salesAmount', 'sales', 'gmv', '销售额', '成交额'])) {
    return 'SALES_DROP';
  }
  if (includesAny(text, ['adSpend', 'advertisingCost', 'adcost', '广告花费', '广告消耗'])) {
    return 'AD_SPEND_DROP';
  }
  if (includesAny(text, ['impressionCount', 'impressions', 'exposure', '曝光'])) {
    return 'EXPOSURE_DROP';
  }
  if (includesAny(text, ['ctr', 'clickThroughRate', '点击率'])) {
    return 'CTR_DROP';
  }

  return undefined;
}

function dedupeReasons(items: AiPossibleReason[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.reasonCode)) {
      return false;
    }
    seen.add(item.reasonCode);
    return true;
  });
}

function dedupeActions(items: AiRecommendedAction[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.actionCode)) {
      return false;
    }
    seen.add(item.actionCode);
    return true;
  });
}

function dedupeProblemTypes(problemTypes: AiProblemType[]) {
  return Array.from(new Set(problemTypes));
}

export function analyzeAiReasons(anomalies: AiAnomalyItem[]): AiReasonAnalysisResult {
  const problemTypes = dedupeProblemTypes(
    anomalies
      .map(inferProblemType)
      .filter((problemType): problemType is AiProblemType => Boolean(problemType)),
  );
  const strategies = problemTypes.map(getAiStrategy);

  return {
    problemTypes,
    possibleReasons: dedupeReasons(strategies.flatMap((strategy) => strategy.possibleReasons)),
    recommendedActions: dedupeActions(strategies.flatMap((strategy) => strategy.recommendedActions)),
  };
}
