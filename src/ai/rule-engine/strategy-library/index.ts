import { TEMU_STRATEGY_LIBRARY } from './temuStrategyLibrary';

export { TEMU_STRATEGY_LIBRARY } from './temuStrategyLibrary';

export const getStrategiesByRuleCode = (ruleCode: string) =>
  TEMU_STRATEGY_LIBRARY.find((strategy) => strategy.ruleCode === ruleCode);
