import type { AnomalyResult } from './anomalyRuleTypes';
import type { RuleTreeEvaluation } from './ruleTreeTypes';
import type { SolutionMatchResult } from './solutionTypes';

export interface OperationDiagnosisSummary {
  anomalyCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  solutionCount: number;
  affectedStoreCount: number;
}

export interface OperationDiagnosisResult {
  anomalies: AnomalyResult[];
  ruleTreeEvaluations: RuleTreeEvaluation[];
  solutionMatches: SolutionMatchResult[];
  summary: OperationDiagnosisSummary;
  createdAt: string;
}
