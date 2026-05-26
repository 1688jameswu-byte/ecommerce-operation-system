export type MetricRelationType = 'formula' | 'dependency' | 'derived';

export type MetricRelationCategory = 'sales' | 'traffic' | 'conversion' | 'ad' | 'afterSale';

export type MetricImpactDirection = 'positive' | 'negative' | 'neutral';

export interface MetricRelation {
  id: string;
  name: string;
  category: MetricRelationCategory;
  type: MetricRelationType;
  targetMetric: string;
  sourceMetrics: string[];
  formulaText: string;
  impactDescription: string;
  impactDirection: MetricImpactDirection;
  explanation: string;
  optional?: boolean;
  futureMetrics?: string[];
}
