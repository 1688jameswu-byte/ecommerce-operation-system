import {
  getReasonTreeByRuleCode,
  getRootCauseRuleByRuleCode,
  getStrategiesByRuleCode,
  TEMU_OPERATION_RULES,
} from '../rule-engine';
import type {
  BaseOperationRule,
  BaseReasonTree,
  BaseRootCauseRule,
  BaseStrategyRule,
  PlatformCode,
} from '../rule-engine';

type KnowledgePart = 'rule' | 'reasonTree' | 'strategy' | 'rootCause';

export type OperationKnowledge = {
  ruleCode: string;
  rule?: BaseOperationRule;
  reasonTree?: BaseReasonTree;
  strategy?: BaseStrategyRule;
  rootCause?: BaseRootCauseRule;
  found: boolean;
  missingParts: string[];
};

export type OperationKnowledgeValidationResult = {
  platform: PlatformCode;
  totalRules: number;
  completeCount: number;
  incompleteCount: number;
  incompleteItems: {
    ruleCode: string;
    ruleName: string;
    missingParts: string[];
  }[];
};

const operationRulesByPlatform: Partial<Record<PlatformCode, readonly BaseOperationRule[]>> = {
  TEMU: TEMU_OPERATION_RULES,
};

const getOperationRulesByPlatform = (platform: PlatformCode) =>
  operationRulesByPlatform[platform] ?? [];

const getMissingParts = (parts: Record<KnowledgePart, unknown>) =>
  Object.entries(parts)
    .filter(([, value]) => !value)
    .map(([part]) => part);

export const getOperationKnowledgeByRuleCode = (
  ruleCode: string,
  platform: PlatformCode = 'TEMU',
): OperationKnowledge => {
  const rule = getOperationRulesByPlatform(platform).find((item) => item.ruleCode === ruleCode);
  const reasonTree = getReasonTreeByRuleCode(ruleCode);
  const strategy = getStrategiesByRuleCode(ruleCode);
  const rootCause = getRootCauseRuleByRuleCode(ruleCode);

  return {
    ruleCode,
    rule,
    reasonTree,
    strategy,
    rootCause,
    found: Boolean(rule),
    missingParts: getMissingParts({ rule, reasonTree, strategy, rootCause }),
  };
};

export const getOperationKnowledgeByRuleCodes = (
  ruleCodes: string[],
  platform: PlatformCode = 'TEMU',
) => ruleCodes.map((ruleCode) => getOperationKnowledgeByRuleCode(ruleCode, platform));

export const validateOperationKnowledge = (
  platform: PlatformCode = 'TEMU',
): OperationKnowledgeValidationResult => {
  const rules = getOperationRulesByPlatform(platform);
  const incompleteItems = rules
    .map((rule) => ({
      ruleCode: rule.ruleCode,
      ruleName: rule.ruleName,
      missingParts: getOperationKnowledgeByRuleCode(rule.ruleCode, platform).missingParts,
    }))
    .filter((item) => item.missingParts.length > 0);

  return {
    platform,
    totalRules: rules.length,
    completeCount: rules.length - incompleteItems.length,
    incompleteCount: incompleteItems.length,
    incompleteItems,
  };
};
