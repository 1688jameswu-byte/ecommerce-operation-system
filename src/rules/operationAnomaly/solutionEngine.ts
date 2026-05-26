import type { AnomalyCategory, AnomalyResult } from './anomalyRuleTypes';
import { ruleTreeLibrary } from './ruleTreeLibrary';
import type { RuleTreeNode, RuleTreeEvaluation } from './ruleTreeTypes';
import { solutionLibrary } from './solutionLibrary';
import type { OperationSolution, SolutionMatchResult } from './solutionTypes';

function flattenNodes(nodes: RuleTreeNode[]): RuleTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function solutionMatchesCause(solution: OperationSolution, causeKey: string) {
  return solution.causeKey === causeKey || Boolean(solution.causeAliases?.includes(causeKey));
}

function getRuleTreeBusinessCauseKeys(ruleTreeEvaluation: RuleTreeEvaluation) {
  const ruleTree = ruleTreeLibrary.find((tree) => tree.id === ruleTreeEvaluation.ruleTreeId);

  if (!ruleTree) {
    return [];
  }

  return flattenNodes(ruleTree.nodes)
    .filter((node) => node.type === 'businessCause')
    .map((node) => node.causeKey);
}

function getMatchedDecisionMetricKeys(ruleTreeEvaluation: RuleTreeEvaluation) {
  return ruleTreeEvaluation.decisions
    .filter((decision) => decision.status === 'matched')
    .map((decision) => decision.metricKey);
}

function getFallbackCauseKeys(anomalyResult: AnomalyResult, ruleTreeEvaluation: RuleTreeEvaluation) {
  const byCategory: Record<AnomalyCategory, string[]> = {
    sales: ['salesAmount', 'visitorCount', 'conversionRate', 'avgOrderValue', 'orderCount'],
    traffic: ['visitorCount', 'impressionCount', 'ctr'],
    conversion: ['conversionRate', 'orderCount', '商品吸引力不足', '价格竞争力不足', '详情页/素材承接不足'],
    ad: ['roas', 'adSpend', 'salesAmount'],
    afterSale: ['refundRate', '商品质量问题', '履约体验问题'],
    dataQuality: [],
  };
  const ruleName = anomalyResult.ruleName;
  const fromRuleName: string[] = [];

  if (ruleName.includes('销售额')) {
    fromRuleName.push('salesAmount', 'visitorCount', 'conversionRate', 'avgOrderValue');
  }
  if (ruleName.includes('订单')) {
    fromRuleName.push('orderCount', 'visitorCount', 'conversionRate');
  }
  if (ruleName.includes('访客')) {
    fromRuleName.push('visitorCount', 'impressionCount', 'ctr');
  }
  if (ruleName.includes('转化')) {
    fromRuleName.push('conversionRate', 'orderCount', '商品吸引力不足', '价格竞争力不足', '详情页/素材承接不足');
  }

  return dedupe([
    ruleTreeEvaluation.rootMetric,
    ...fromRuleName,
    ...byCategory[anomalyResult.category],
    ...getRuleTreeBusinessCauseKeys(ruleTreeEvaluation),
  ]);
}

function getCandidateCauseKeys(anomalyResult: AnomalyResult, ruleTreeEvaluation: RuleTreeEvaluation) {
  const primaryKeys = dedupe([
    ...ruleTreeEvaluation.likelyCauseKeys,
    ...getMatchedDecisionMetricKeys(ruleTreeEvaluation),
  ]);

  if (primaryKeys.length > 0) {
    return primaryKeys;
  }

  return getFallbackCauseKeys(anomalyResult, ruleTreeEvaluation);
}

function getSolutionsForCauseKeys(causeKeys: string[]) {
  return solutionLibrary.filter((solution) =>
    causeKeys.some((causeKey) => solutionMatchesCause(solution, causeKey)),
  );
}

function getMatchedCauseKeys(causeKeys: string[], solutions: OperationSolution[]) {
  return dedupe(causeKeys.filter((causeKey) =>
    solutions.some((solution) => solutionMatchesCause(solution, causeKey)),
  ));
}

export function getOperationSolutions(): OperationSolution[] {
  return solutionLibrary.map((solution) => ({
    ...solution,
    checkSteps: [...solution.checkSteps],
    suggestedActions: [...solution.suggestedActions],
    applicableMetrics: [...solution.applicableMetrics],
    applicableCategories: [...solution.applicableCategories],
    causeAliases: solution.causeAliases ? [...solution.causeAliases] : undefined,
  }));
}

export function getSolutionsByCauseKey(causeKey: string): OperationSolution[] {
  return getOperationSolutions().filter((solution) => solutionMatchesCause(solution, causeKey));
}

export function matchSolutionsForEvaluation(
  anomalyResult: AnomalyResult,
  ruleTreeEvaluation: RuleTreeEvaluation,
): SolutionMatchResult {
  const createdAt = new Date().toISOString();
  const candidateCauseKeys = getCandidateCauseKeys(anomalyResult, ruleTreeEvaluation);
  const solutions = getSolutionsForCauseKeys(candidateCauseKeys);

  return {
    anomalyResultId: anomalyResult.id,
    ruleTreeEvaluationId: `${ruleTreeEvaluation.anomalyResultId}:${ruleTreeEvaluation.ruleTreeId}`,
    matchedCauseKeys: getMatchedCauseKeys(candidateCauseKeys, solutions),
    solutions,
    createdAt,
  };
}

export function matchSolutionsForEvaluations(
  anomalyResults: AnomalyResult[],
  ruleTreeEvaluations: RuleTreeEvaluation[],
): SolutionMatchResult[] {
  return ruleTreeEvaluations.flatMap((evaluation) => {
    const anomalyResult = anomalyResults.find((item) => item.id === evaluation.anomalyResultId);

    return anomalyResult ? [matchSolutionsForEvaluation(anomalyResult, evaluation)] : [];
  });
}
