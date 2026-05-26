import type { AnomalyCategory } from './anomalyRuleTypes';

export type SolutionPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SolutionActionType = 'check' | 'optimize' | 'adjust' | 'monitor' | 'escalate';

export interface OperationSolution {
  id: string;
  causeKey: string;
  causeAliases?: string[];
  title: string;
  priority: SolutionPriority;
  actionType: SolutionActionType;
  description: string;
  checkSteps: string[];
  suggestedActions: string[];
  expectedEffect: string;
  applicableMetrics: string[];
  applicableCategories: AnomalyCategory[];
}

export interface SolutionMatchResult {
  anomalyResultId: string;
  ruleTreeEvaluationId: string;
  matchedCauseKeys: string[];
  solutions: OperationSolution[];
  createdAt: string;
}
