import type { StandardFactDataSet } from '../../data-standard';
import { anomalyRuleLibrary } from './anomalyRuleLibrary';
import type { AnomalyResult } from './anomalyRuleTypes';

export function runOperationAnomalyRules(dataSet: StandardFactDataSet): AnomalyResult[] {
  const createdAt = new Date().toISOString();

  return anomalyRuleLibrary.flatMap((rule) => {
    if (!rule.enabled) {
      return [];
    }

    try {
      return rule.evaluate({ dataSet, createdAt });
    } catch {
      return [];
    }
  });
}
