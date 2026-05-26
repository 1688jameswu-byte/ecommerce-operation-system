import type { CauseConfidence } from './anomalyAnalysisTreeTypes';

export type RuleTreeDecisionStatus = 'matched' | 'notMatched' | 'insufficientData' | 'unknown';

export type RuleTreeNodeType = 'rootAnomaly' | 'metricCheck' | 'businessCause' | 'decision';

export type RuleTreeCheckDirection = 'decline' | 'increase' | 'mismatch';

export interface RuleTreeNode {
  id: string;
  type: RuleTreeNodeType;
  metricKey: string;
  label: string;
  conditionText: string;
  children: RuleTreeNode[];
  causeKey: string;
  explanation: string;
  checkDirection?: RuleTreeCheckDirection;
  futureMetric?: boolean;
}

export interface RuleTree {
  id: string;
  name: string;
  rootMetric: string;
  relatedRuleIds: string[];
  nodes: RuleTreeNode[];
}

export interface RuleTreeDecision {
  nodeId: string;
  status: RuleTreeDecisionStatus;
  metricKey: string;
  observedValue?: number;
  baselineValue?: number;
  changeRate?: number;
  explanation: string;
}

export interface RuleTreeEvaluation {
  anomalyResultId: string;
  ruleTreeId: string;
  rootMetric: string;
  decisions: RuleTreeDecision[];
  likelyCauseKeys: string[];
  confidence: CauseConfidence;
  createdAt: string;
}
