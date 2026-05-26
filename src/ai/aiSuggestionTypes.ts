export type AiAnomalyLevel = 'normal' | 'watch' | 'warning' | 'critical';

export type AiConfidence = 'low' | 'medium' | 'high';

export type AiActionPriority = 'low' | 'medium' | 'high';

export interface AiStoreSnapshot {
  platform: string;
  storeId: string;
  storeName: string;
  operatorId: string;
  operatorName: string;
}

export interface AiRelatedMetric {
  metricKey: string;
  metricName: string;
  value?: number | string;
  baselineValue?: number | string;
  changeRate?: number;
  note?: string;
}

export interface AiAnomalyItem {
  anomalyId: string;
  metricKey: string;
  metricName: string;
  level: AiAnomalyLevel;
  recentValue?: number | string;
  baselineValue?: number | string;
  changeRate?: number;
  ruleCode?: string;
  ruleName: string;
  ruleType?: string;
  primaryAnomalyType?: string;
  coreProblem?: string;
  businessMeaning?: string;
  coreAttribution?: string;
  knowledgeReasons?: AiPossibleReason[];
  knowledgeActions?: AiRecommendedAction[];
  shouldCreateTask?: boolean;
  bossAttentionRequired?: boolean;
  knowledgeMissingParts?: string[];
  explanation: string;
}

export interface AiPossibleReason {
  reasonCode: string;
  reasonName: string;
  confidence: AiConfidence;
  evidence: string[];
  needHumanCheck: boolean;
}

export interface AiRecommendedAction {
  actionCode: string;
  actionName: string;
  priority: AiActionPriority;
  ownerRole: string;
  actionSteps: string[];
  expectedEffect: string;
  riskNote: string;
}

export interface AiHistoryCase {
  caseId: string;
  platform: string;
  storeId: string;
  metricKey: string;
  problemSummary: string;
  actionSummary: string;
  resultSummary: string;
  occurredAt?: string;
}

export interface AiContext {
  contextVersion: 'v1';
  generatedAt: string;
  platform: string;
  storeId: string;
  storeName: string;
  operatorId: string;
  operatorName: string;
  storeSnapshots: AiStoreSnapshot[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  anomalySummary: {
    total: number;
    criticalCount: number;
    warningCount: number;
    watchCount: number;
  };
  anomalies: AiAnomalyItem[];
  relatedMetrics: AiRelatedMetric[];
  possibleReasons: AiPossibleReason[];
  recommendedActions: AiRecommendedAction[];
  historyCases: AiHistoryCase[];
  dataQualityNotes: string[];
}

export interface AiContextSourceAnomaly {
  id?: string;
  ruleCode?: string;
  ruleId?: string;
  ruleName?: string;
  category?: string;
  severity?: string;
  platform?: string;
  storeId?: string;
  storeName?: string;
  operatorId?: string;
  operatorName?: string;
  date?: string;
  summary?: string;
  metricKey?: string;
  metricName?: string;
  sourceMetrics?: Record<string, string | number | boolean | null | undefined>;
}

export interface AiContextBuildInput {
  platform?: string;
  storeId?: string;
  storeName?: string;
  operatorId?: string;
  operatorName?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  anomalies: AiContextSourceAnomaly[];
  relatedMetrics?: AiRelatedMetric[];
  historyCases?: AiHistoryCase[];
}
