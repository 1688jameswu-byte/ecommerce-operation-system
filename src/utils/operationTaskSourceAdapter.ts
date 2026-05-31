import { taskDataSource } from '../data-source/taskDataSource';
import type { AnomalyResult, RuleTreeEvaluation, SolutionMatchResult } from '../rules/operationAnomaly';
import type { OperationTaskPriority, OperationTaskRecord, OperationTaskSourceType } from '../types/task';
import type { TrafficGrowthOpportunity, TrafficWarningResult, TrafficWarningType } from '../types/traffic';

export interface OperationTaskSourceCreateResult {
  task?: OperationTaskRecord;
  existingTask?: OperationTaskRecord;
  created: boolean;
  message: string;
}

interface RiskWarningTaskInput {
  warning: TrafficWarningResult;
  title?: string;
  suggestion?: string;
}

interface GrowthOpportunityTaskInput {
  opportunity: TrafficGrowthOpportunity;
  title?: string;
  suggestion?: string;
}

const trafficTypeLabels: Record<TrafficWarningType, string> = {
  traffic: '流量异常',
  conversion: '转化异常',
  deal: '成交异常',
};

const trafficGrowthTypeLabels: Record<TrafficWarningType, string> = {
  traffic: '流量增长',
  conversion: '转化增长',
  deal: '成交增长',
};

function sourceTypeMatches(task: OperationTaskRecord, sourceType: OperationTaskSourceType) {
  if (task.sourceType === sourceType) {
    return true;
  }

  return (sourceType === 'risk_warning' && task.sourceType === 'warning') ||
    (sourceType === 'growth_opportunity' && task.sourceType === 'opportunity');
}

function isOpenTask(task: OperationTaskRecord) {
  return task.status === 'todo' || task.status === 'doing';
}

export function buildRiskWarningTaskDedupKey(warning: TrafficWarningResult) {
  return `risk_warning:${warning.storeName || 'unknown-store'}:${warning.metricField || warning.type}`;
}

export function buildGrowthOpportunityTaskDedupKey(opportunity: TrafficGrowthOpportunity) {
  return `growth_opportunity:${opportunity.storeName || 'unknown-store'}:${opportunity.metricField || opportunity.type}`;
}

export function buildOperationAnomalyTaskDedupKey(anomaly: AnomalyResult) {
  return `operation_anomaly:${anomaly.storeId || anomaly.storeName || 'unknown-store'}:${anomaly.ruleId}`;
}

export function findExistingTaskBySource(
  tasks: OperationTaskRecord[],
  sourceType: OperationTaskSourceType,
  sourceId: string,
) {
  return tasks.find((task) => sourceTypeMatches(task, sourceType) && task.sourceId === sourceId);
}

export function findOpenTaskByDedupKey(tasks: OperationTaskRecord[], taskDedupKey?: string) {
  return taskDedupKey ? tasks.find((task) => task.taskDedupKey === taskDedupKey && isOpenTask(task)) : undefined;
}

export function findOpenTaskBySource(
  tasks: OperationTaskRecord[],
  sourceType: OperationTaskSourceType,
  sourceId?: string,
) {
  return sourceId ? tasks.find((task) => sourceTypeMatches(task, sourceType) && task.sourceId === sourceId && isOpenTask(task)) : undefined;
}

function normalizeStoreKey(task: Partial<OperationTaskRecord>) {
  return String(task.storeId || task.storeName || '').replace(/\s+/g, '').trim().toLowerCase();
}

function getTaskBusinessMetric(task: Partial<OperationTaskRecord>) {
  const text = [
    task.taskDedupKey,
    task.sourceId,
    task.title,
    task.sourceContent,
    (task as Partial<OperationTaskRecord> & { sourceRuleId?: string }).sourceRuleId,
    (task as Partial<OperationTaskRecord> & { anomalyType?: string }).anomalyType,
  ].map((value) => String(value ?? '').toLowerCase()).join('|');

  if (
    text.includes('visitor-count-decline') ||
    text.includes('访客数下降') ||
    text.includes('商品访客数') ||
    text.includes('productvisitors') ||
    text.includes('traffic')
  ) {
    return 'traffic_drop';
  }

  return '';
}

export function findOpenTaskByBusinessKey(tasks: OperationTaskRecord[], nextTask: Partial<OperationTaskRecord>) {
  const storeKey = normalizeStoreKey(nextTask);
  const metricKey = getTaskBusinessMetric(nextTask);
  if (!storeKey || !metricKey) {
    return undefined;
  }

  return tasks.find((task) =>
    isOpenTask(task) &&
    normalizeStoreKey(task) === storeKey &&
    getTaskBusinessMetric(task) === metricKey
  );
}

export function buildExistingTaskUpdate(existingTask: OperationTaskRecord, nextTask: Partial<OperationTaskRecord>) {
  const latestAnomalyDate = nextTask.latestAnomalyDate || existingTask.latestAnomalyDate;
  const shouldIncrementDuration = Boolean(
    latestAnomalyDate &&
    existingTask.latestAnomalyDate &&
    latestAnomalyDate !== existingTask.latestAnomalyDate,
  );

  return {
    sourceId: nextTask.sourceId || existingTask.sourceId,
    taskDedupKey: nextTask.taskDedupKey || existingTask.taskDedupKey,
    sourceContent: nextTask.sourceContent || existingTask.sourceContent,
    suggestion: nextTask.suggestion || existingTask.suggestion,
    priority: nextTask.priority || existingTask.priority,
    latestAnomalyDate,
    anomalyDurationDays: shouldIncrementDuration
      ? (existingTask.anomalyDurationDays || 1) + 1
      : existingTask.anomalyDurationDays || nextTask.anomalyDurationDays || 1,
    latestSeverity: nextTask.latestSeverity || existingTask.latestSeverity,
    latestTriggerTime: nextTask.latestTriggerTime || new Date().toISOString(),
  } satisfies Partial<OperationTaskRecord>;
}

function createTaskIfNotExists(task: Partial<OperationTaskRecord>): OperationTaskSourceCreateResult {
  const sourceType = task.sourceType ?? 'manual';
  const sourceId = task.sourceId ?? '';
  const tasks = taskDataSource.load();
  const existingTask = findOpenTaskByDedupKey(tasks, task.taskDedupKey) ||
    findOpenTaskBySource(tasks, sourceType, sourceId) ||
    findOpenTaskByBusinessKey(tasks, task);

  if (existingTask) {
    const updatedTask = taskDataSource.update(existingTask.id, buildExistingTaskUpdate(existingTask, task));

    return {
      existingTask: updatedTask,
      created: false,
      message: '该异常/预警已生成任务。',
    };
  }

  const createdTask = taskDataSource.create(task);

  return {
    task: createdTask,
    created: true,
    message: '任务已生成。',
  };
}

export function buildTaskCreateUrl(task: Partial<OperationTaskRecord>) {
  const searchParams = new URLSearchParams({
    sourceType: task.sourceType ?? 'manual',
    sourceId: task.sourceId ?? '',
    taskDedupKey: task.taskDedupKey ?? '',
    latestAnomalyDate: task.latestAnomalyDate ?? '',
    latestSeverity: task.latestSeverity ?? '',
    latestTriggerTime: task.latestTriggerTime ?? '',
    storeName: task.storeName ?? '',
    title: task.title ?? '',
    content: task.sourceContent ?? '',
    suggestion: task.suggestion ?? '',
  });

  return `/admin/tasks?${searchParams.toString()}`;
}

export function buildRiskWarningTaskDraft(input: RiskWarningTaskInput): Partial<OperationTaskRecord> {
  const { warning } = input;

  return {
    title: input.title || `${warning.storeName} ${trafficTypeLabels[warning.type]}预警`,
    storeName: warning.storeName,
    sourceType: 'risk_warning',
    sourceId: warning.id,
    taskDedupKey: buildRiskWarningTaskDedupKey(warning),
    latestAnomalyDate: warning.date,
    anomalyDurationDays: 1,
    latestSeverity: warning.level,
    latestTriggerTime: warning.triggeredAt || new Date().toISOString(),
    sourceContent: warning.content,
    suggestion: input.suggestion || '',
    priority: warning.level === 'critical' ? 'high' : 'medium',
    status: 'todo',
  };
}

export function buildGrowthOpportunityTaskDraft(input: GrowthOpportunityTaskInput): Partial<OperationTaskRecord> {
  const { opportunity } = input;

  return {
    title: input.title || `${opportunity.storeName} ${trafficGrowthTypeLabels[opportunity.type]}跟进`,
    storeName: opportunity.storeName,
    sourceType: 'growth_opportunity',
    sourceId: opportunity.id,
    taskDedupKey: buildGrowthOpportunityTaskDedupKey(opportunity),
    latestAnomalyDate: opportunity.date,
    anomalyDurationDays: 1,
    latestSeverity: 'opportunity',
    latestTriggerTime: new Date().toISOString(),
    sourceContent: opportunity.content,
    suggestion: input.suggestion || '',
    priority: 'medium',
    status: 'todo',
  };
}

function solutionPriorityToTaskPriority(priority?: string): OperationTaskPriority {
  if (priority === 'urgent' || priority === 'high') {
    return 'high';
  }

  if (priority === 'low') {
    return 'low';
  }

  return 'medium';
}

function severityToTaskPriority(severity: AnomalyResult['severity']): OperationTaskPriority {
  if (severity === 'critical' || severity === 'high') {
    return 'high';
  }

  if (severity === 'low') {
    return 'low';
  }

  return 'medium';
}

function getOperationAnomalyPriority(anomaly: AnomalyResult, solutionMatch?: SolutionMatchResult) {
  const solutionPriority = solutionMatch?.solutions.find((solution) => solution.priority === 'urgent' || solution.priority === 'high')?.priority ||
    solutionMatch?.solutions[0]?.priority;
  const fromSolution = solutionPriorityToTaskPriority(solutionPriority);
  const fromSeverity = severityToTaskPriority(anomaly.severity);

  if (fromSolution === 'high' || fromSeverity === 'high') {
    return 'high';
  }

  if (fromSolution === 'low' && fromSeverity === 'low') {
    return 'low';
  }

  return 'medium';
}

function formatDecision(decision: RuleTreeEvaluation['decisions'][number]) {
  const metrics = [
    decision.observedValue !== undefined ? `近7天均值 ${decision.observedValue}` : '',
    decision.baselineValue !== undefined ? `基准均值 ${decision.baselineValue}` : '',
    decision.changeRate !== undefined ? `变化率 ${(decision.changeRate * 100).toFixed(2)}%` : '',
  ].filter(Boolean).join('，');

  return `- ${decision.metricKey || decision.nodeId}：${decision.status}。${decision.explanation}${metrics ? `（${metrics}）` : ''}`;
}

function buildOperationAnomalySourceContent(
  anomaly: AnomalyResult,
  evaluation?: RuleTreeEvaluation,
  solutionMatch?: SolutionMatchResult,
) {
  const lines = [
    `异常摘要：${anomaly.summary}`,
    '',
    '可能原因：',
    ...anomaly.possibleCauses.map((cause) => `- ${cause}`),
  ];

  if (evaluation) {
    lines.push('', '规则树判断结果:', ...evaluation.decisions.map(formatDecision));
  }

  if (solutionMatch?.solutions.length) {
    lines.push('', '排查步骤:');
    solutionMatch.solutions.flatMap((solution) => solution.checkSteps).forEach((step) => lines.push(`- ${step}`));
  }

  return lines.join('\n');
}

function buildOperationAnomalySuggestion(
  anomaly: AnomalyResult,
  solutionMatch?: SolutionMatchResult,
) {
  const lines = ['建议动作:', ...anomaly.suggestedActions.map((action) => `- ${action}`)];

  if (solutionMatch?.solutions.length) {
    lines.push('', '解决方案建议:');
    solutionMatch.solutions.forEach((solution) => {
      lines.push(`【${solution.title}】`);
      solution.suggestedActions.forEach((action) => lines.push(`- ${action}`));
      lines.push(`预期效果：${solution.expectedEffect}`);
    });
  }

  return lines.join('\n');
}

export function buildOperationAnomalyTaskDraft(params: {
  anomaly: AnomalyResult;
  ruleTreeEvaluation?: RuleTreeEvaluation;
  solutionMatch?: SolutionMatchResult;
}): Partial<OperationTaskRecord> {
  const { anomaly, ruleTreeEvaluation, solutionMatch } = params;

  return {
    title: `处理【${anomaly.ruleName}】 - ${anomaly.storeName || '未绑定店铺'}`,
    platform: anomaly.platform,
    storeId: anomaly.storeId,
    storeName: anomaly.storeName,
    operatorId: anomaly.operatorId,
    operatorName: anomaly.operatorName,
    sourceType: 'operation_anomaly',
    sourceId: anomaly.id,
    taskDedupKey: buildOperationAnomalyTaskDedupKey(anomaly),
    latestAnomalyDate: anomaly.date,
    anomalyDurationDays: 1,
    latestSeverity: anomaly.severity,
    latestTriggerTime: anomaly.createdAt || new Date().toISOString(),
    sourceContent: buildOperationAnomalySourceContent(anomaly, ruleTreeEvaluation, solutionMatch),
    suggestion: buildOperationAnomalySuggestion(anomaly, solutionMatch),
    priority: getOperationAnomalyPriority(anomaly, solutionMatch),
    status: 'todo',
  };
}

export function createTaskFromRiskWarning(input: RiskWarningTaskInput): OperationTaskSourceCreateResult {
  return createTaskIfNotExists(buildRiskWarningTaskDraft(input));
}

export function createTaskFromOperationAnomaly(params: {
  anomaly: AnomalyResult;
  ruleTreeEvaluation?: RuleTreeEvaluation;
  solutionMatch?: SolutionMatchResult;
}): OperationTaskSourceCreateResult {
  return createTaskIfNotExists(buildOperationAnomalyTaskDraft(params));
}
