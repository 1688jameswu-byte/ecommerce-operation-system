import type { StandardFactDataSet } from '../../data-standard';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export type AnomalyCategory = 'sales' | 'traffic' | 'conversion' | 'ad' | 'afterSale' | 'dataQuality';

export type AnomalySourceMetrics = Record<string, string | number | boolean | null | undefined>;

export interface AnomalyResult {
  id: string;
  ruleId: string;
  ruleName: string;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  platform: string;
  storeId: string;
  storeName: string;
  operatorId: string;
  operatorName: string;
  date: string;
  summary: string;
  possibleCauses: string[];
  suggestedActions: string[];
  sourceMetrics: AnomalySourceMetrics;
  createdAt: string;
}

export interface RuleEvaluationContext {
  dataSet: StandardFactDataSet;
  createdAt: string;
}

export interface AnomalyRule {
  id: string;
  name: string;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  enabled: boolean;
  evaluate: (context: RuleEvaluationContext) => AnomalyResult[];
}
