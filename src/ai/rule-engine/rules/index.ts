import { TEMU_MULTI_METRIC_RULES } from './temuMultiMetricRules';
import { TEMU_SINGLE_METRIC_RULES } from './temuSingleMetricRules';

export { TEMU_MULTI_METRIC_RULES } from './temuMultiMetricRules';
export { TEMU_SINGLE_METRIC_RULES } from './temuSingleMetricRules';

export const TEMU_OPERATION_RULES = [
  ...TEMU_SINGLE_METRIC_RULES,
  ...TEMU_MULTI_METRIC_RULES,
];
