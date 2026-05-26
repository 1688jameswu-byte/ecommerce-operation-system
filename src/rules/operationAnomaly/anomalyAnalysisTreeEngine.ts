import { anomalyAnalysisTreeLibrary } from './anomalyAnalysisTreeLibrary';
import { getRelationsByTargetMetric } from './metricRelationEngine';
import type {
  AnomalyAnalysisNode,
  AnomalyAnalysisTree,
  AnomalyAnalysisTreeDefinition,
  AnomalyCausePath,
} from './anomalyAnalysisTreeTypes';

const metricLabels: Record<string, string> = {
  adSpend: '广告花费',
  avgOrderValue: '客单价',
  clickCount: '点击数',
  conversionRate: '转化率',
  ctr: '点击率',
  impressionCount: '曝光数',
  orderCount: '订单数',
  refundAmount: '退款金额',
  refundRate: '退款率',
  roas: 'ROAS',
  salesAmount: '销售额',
  visitorCount: '访客数',
};

function getMetricLabel(metricKey: string) {
  return metricLabels[metricKey] ?? metricKey;
}

function getDirectionText(rootLabel: string, sourceLabel: string) {
  if (rootLabel.includes('退款率') && sourceLabel.includes('销售额')) {
    return `${sourceLabel}下降可能导致${rootLabel}上升。`;
  }

  if (rootLabel.includes('退款率') && sourceLabel.includes('退款金额')) {
    return `${sourceLabel}上升可能导致${rootLabel}上升。`;
  }

  if (rootLabel.includes('ROAS') && sourceLabel.includes('广告花费')) {
    return `${sourceLabel}上升且销售未同步增长时，可能导致${rootLabel}下降。`;
  }

  return `${sourceLabel}下降可能导致${rootLabel}下降。`;
}

function buildRelationNodes(rootMetric: string, rootLabel: string): AnomalyAnalysisNode[] {
  return getRelationsByTargetMetric(rootMetric).flatMap((relation) =>
    relation.sourceMetrics.map((sourceMetric) => ({
      metricKey: sourceMetric,
      metricLabel: getMetricLabel(sourceMetric),
      relationId: relation.id,
      direction: 'upstream' as const,
      explanation: getDirectionText(rootLabel, getMetricLabel(sourceMetric)),
      children: [],
    })),
  );
}

function dedupeNodes(nodes: AnomalyAnalysisNode[]) {
  const nodeMap = new Map<string, AnomalyAnalysisNode>();

  nodes.forEach((node) => {
    if (!nodeMap.has(node.metricKey)) {
      nodeMap.set(node.metricKey, node);
    }
  });

  return Array.from(nodeMap.values());
}

function buildTreeFromDefinition(definition: AnomalyAnalysisTreeDefinition, createdAt: string): AnomalyAnalysisTree {
  const causeNodes = dedupeNodes([
    ...buildRelationNodes(definition.rootMetric, definition.rootLabel),
    ...(definition.businessCauses ?? []),
  ]);
  const causePaths = buildCausePathsFromNodes(definition.rootMetric, definition.rootLabel, causeNodes, definition.causePaths);

  return {
    rootMetric: definition.rootMetric,
    rootLabel: definition.rootLabel,
    possibleCauseMetrics: causeNodes.map((node) => node.metricKey),
    causePaths,
    createdAt,
  };
}

function buildCausePathsFromNodes(
  rootMetric: string,
  rootLabel: string,
  causeNodes: AnomalyAnalysisNode[],
  configuredPaths: AnomalyCausePath[] = [],
): AnomalyCausePath[] {
  if (configuredPaths.length > 0) {
    return configuredPaths;
  }

  return causeNodes.map((node) => ({
    path: [rootMetric, node.metricKey],
    explanation: node.explanation || `${node.metricLabel}可能影响${rootLabel}。`,
    confidence: node.direction === 'upstream' ? 'high' : 'medium',
  }));
}

export function getAnomalyAnalysisTrees(): AnomalyAnalysisTree[] {
  const createdAt = new Date().toISOString();

  return anomalyAnalysisTreeLibrary.map((definition) => buildTreeFromDefinition(definition, createdAt));
}

export function getAnalysisTreeByRootMetric(metricKey: string): AnomalyAnalysisTree | undefined {
  const definition = anomalyAnalysisTreeLibrary.find((item) => item.rootMetric === metricKey);

  return definition ? buildTreeFromDefinition(definition, new Date().toISOString()) : undefined;
}

export function getPossibleCauseMetrics(metricKey: string): string[] {
  return getAnalysisTreeByRootMetric(metricKey)?.possibleCauseMetrics ?? [];
}

export function buildCausePaths(metricKey: string): AnomalyCausePath[] {
  return getAnalysisTreeByRootMetric(metricKey)?.causePaths ?? [];
}
