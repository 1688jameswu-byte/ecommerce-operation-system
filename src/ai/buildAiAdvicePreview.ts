import type { AiContext } from './aiSuggestionTypes';

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildList(items: string[], emptyText: string) {
  if (items.length === 0) {
    return `- ${emptyText}`;
  }

  return items.slice(0, 5).map((item) => `- ${item}`).join('\n');
}

function getKnowledgeReasons(context: AiContext) {
  return context.anomalies.flatMap((anomaly) => anomaly.knowledgeReasons?.map((reason) => reason.reasonName) ?? []);
}

function getKnowledgeActions(context: AiContext) {
  return context.anomalies.flatMap((anomaly) => anomaly.knowledgeActions?.map((action) => action.actionName) ?? []);
}

function getCoreProblems(context: AiContext) {
  return unique(context.anomalies.map((anomaly) => anomaly.coreProblem || anomaly.businessMeaning || ''));
}

function getBossAdvice(context: AiContext) {
  if (context.anomalies.some((anomaly) => anomaly.bossAttentionRequired)) {
    return '建议老板关注：知识库归因中存在需要老板介入的核心异常。';
  }

  const hasFormalAnomaly = context.anomalies.some((anomaly) => anomaly.level === 'critical' || anomaly.level === 'warning');
  const hasDataQualityNotes = context.dataQualityNotes.length > 0;

  if (hasDataQualityNotes) {
    return '提醒老板先关注数据质量，确认 platform、店铺、运营归属和异常指标口径后再做决策。';
  }
  if (hasFormalAnomaly) {
    return '建议老板关注，当前存在 warning / critical 级别异常，需要明确负责人和处理时限。';
  }
  if (context.anomalies.some((anomaly) => anomaly.level === 'watch')) {
    return '当前为观察项，暂不需要老板介入，建议运营先自查。';
  }

  return '当前暂无需要老板介入的问题。';
}

function getTaskAdvice(context: AiContext) {
  if (context.anomalies.some((anomaly) => anomaly.shouldCreateTask)) {
    return '建议生成任务：知识库归因中存在需要运营跟进的异常。';
  }

  const hasFormalAnomaly = context.anomalies.some((anomaly) => anomaly.level === 'critical' || anomaly.level === 'warning');
  const hasWatch = context.anomalies.some((anomaly) => anomaly.level === 'watch');

  if (hasFormalAnomaly) {
    return '建议生成任务，并跟进处理结果。';
  }
  if (hasWatch) {
    return '当前为观察项，建议人工确认后再生成任务。';
  }

  return '暂不建议生成任务。';
}

export function buildAiAdvicePreview(context: AiContext): string {
  const formalCount = context.anomalySummary.criticalCount + context.anomalySummary.warningCount;
  const metricNames = unique(context.anomalies.map((anomaly) => anomaly.metricName));
  const storeNames = unique(context.storeSnapshots.map((snapshot) => snapshot.storeName));
  const coreProblems = getCoreProblems(context);
  const knowledgeReasonNames = getKnowledgeReasons(context);
  const knowledgeActionNames = getKnowledgeActions(context);
  const reasonNames = knowledgeReasonNames.length > 0 ? knowledgeReasonNames : context.possibleReasons.map((reason) => reason.reasonName);
  const actionNames = knowledgeActionNames.length > 0 ? knowledgeActionNames : context.recommendedActions.map((action) => action.actionName);

  return [
    '1. 问题概况',
    `- 当前共发现 ${context.anomalySummary.total} 个异常/观察项`,
    `- 其中观察项 ${context.anomalySummary.watchCount} 个，正式异常 ${formalCount} 个`,
    `- 涉及店铺：${storeNames.join('、') || context.storeName || '未识别店铺'}`,
    `- 主要异常指标：${metricNames.join('、') || '暂无明确指标'}`,
    `- 主异常归因：${coreProblems.join('、') || '暂无知识库归因'}`,
    '',
    '2. 可能原因',
    buildList(reasonNames, '暂无可推断原因，需要人工结合商品、广告、活动进一步确认。'),
    '',
    '3. 建议动作',
    buildList(actionNames, '暂无推荐动作，建议先补充更多关联指标后再判断。'),
    '',
    '4. 是否需要老板介入',
    `- ${getBossAdvice(context)}`,
    '',
    '5. 是否建议生成任务',
    `- ${getTaskAdvice(context)}`,
  ].join('\n');
}
