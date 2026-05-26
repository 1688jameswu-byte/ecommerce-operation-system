import { TEMU_ROOT_CAUSE_RULES } from './temuRootCauseRules';

export { TEMU_ROOT_CAUSE_RULES } from './temuRootCauseRules';

export const getRootCauseRuleByRuleCode = (ruleCode: string) =>
  TEMU_ROOT_CAUSE_RULES.find((rootCauseRule) => rootCauseRule.ruleCode === ruleCode);
