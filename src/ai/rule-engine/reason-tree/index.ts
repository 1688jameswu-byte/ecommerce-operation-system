import { TEMU_REASON_TREES } from './temuReasonTrees';

export { TEMU_REASON_TREES } from './temuReasonTrees';

export const getReasonTreeByRuleCode = (ruleCode: string) =>
  TEMU_REASON_TREES.find((reasonTree) => reasonTree.ruleCode === ruleCode);
