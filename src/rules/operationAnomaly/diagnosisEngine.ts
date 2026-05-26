import type { StandardFactDataSet } from '../../data-standard';
import { runOperationAnomalyRules } from './anomalyEngine';
import { evaluateRuleTrees } from './ruleTreeEngine';
import { matchSolutionsForEvaluations } from './solutionEngine';
import type { OperationDiagnosisResult, OperationDiagnosisSummary } from './diagnosisTypes';
import type { AnomalyResult } from './anomalyRuleTypes';
import type { SolutionMatchResult } from './solutionTypes';

function getStoreKey(anomaly: AnomalyResult) {
  return anomaly.storeId || anomaly.storeName;
}

function countSolutions(solutionMatches: SolutionMatchResult[]) {
  const solutionIds = new Set<string>();

  solutionMatches.forEach((match) => {
    match.solutions.forEach((solution) => {
      solutionIds.add(solution.id);
    });
  });

  return solutionIds.size;
}

function buildSummary(anomalies: AnomalyResult[], solutionMatches: SolutionMatchResult[]): OperationDiagnosisSummary {
  return {
    anomalyCount: anomalies.length,
    criticalCount: anomalies.filter((anomaly) => anomaly.severity === 'critical').length,
    highCount: anomalies.filter((anomaly) => anomaly.severity === 'high').length,
    mediumCount: anomalies.filter((anomaly) => anomaly.severity === 'medium').length,
    lowCount: anomalies.filter((anomaly) => anomaly.severity === 'low').length,
    solutionCount: countSolutions(solutionMatches),
    affectedStoreCount: new Set(anomalies.map(getStoreKey).filter(Boolean)).size,
  };
}

export function runOperationDiagnosis(dataSet: StandardFactDataSet): OperationDiagnosisResult {
  const createdAt = new Date().toISOString();
  const anomalies = runOperationAnomalyRules(dataSet);
  const ruleTreeEvaluations = evaluateRuleTrees(dataSet, anomalies);
  const solutionMatches = matchSolutionsForEvaluations(anomalies, ruleTreeEvaluations);

  return {
    anomalies,
    ruleTreeEvaluations,
    solutionMatches,
    summary: buildSummary(anomalies, solutionMatches),
    createdAt,
  };
}
