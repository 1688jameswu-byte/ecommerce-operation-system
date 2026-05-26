import { metricRelationLibrary } from './metricRelationLibrary';
import type { MetricRelation } from './metricRelationTypes';

export function getMetricRelations(): MetricRelation[] {
  return [...metricRelationLibrary];
}

export function getRelationsByTargetMetric(metricKey: string): MetricRelation[] {
  return metricRelationLibrary.filter((relation) => relation.targetMetric === metricKey);
}

export function getSourceMetricsForTarget(metricKey: string): string[] {
  return Array.from(new Set(
    getRelationsByTargetMetric(metricKey).flatMap((relation) => relation.sourceMetrics),
  ));
}

export function getAffectedMetricsBySource(metricKey: string): string[] {
  return Array.from(new Set(
    metricRelationLibrary
      .filter((relation) => relation.sourceMetrics.includes(metricKey))
      .map((relation) => relation.targetMetric),
  ));
}
