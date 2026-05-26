export type CauseConfidence = 'low' | 'medium' | 'high';

export type AnomalyAnalysisNodeDirection = 'upstream' | 'businessCause';

export interface AnomalyAnalysisNode {
  metricKey: string;
  metricLabel: string;
  relationId: string;
  direction: AnomalyAnalysisNodeDirection;
  explanation: string;
  children: AnomalyAnalysisNode[];
}

export interface AnomalyCausePath {
  path: string[];
  explanation: string;
  confidence: CauseConfidence;
}

export interface AnomalyAnalysisTree {
  rootMetric: string;
  rootLabel: string;
  possibleCauseMetrics: string[];
  causePaths: AnomalyCausePath[];
  createdAt: string;
}

export interface AnomalyAnalysisTreeDefinition {
  rootMetric: string;
  rootLabel: string;
  businessCauses?: AnomalyAnalysisNode[];
  causePaths?: AnomalyCausePath[];
}
