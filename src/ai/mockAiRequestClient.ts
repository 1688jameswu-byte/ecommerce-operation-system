import { buildAiAdvicePreview } from './buildAiAdvicePreview';
import type { AiAdviceRequest, AiAdviceResponse, AiRequestClient } from './aiRequestClient';

const mockLatencyMs = 450;

function wait(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function buildRequestId() {
  return `mock-gpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildProblemOverview(request: AiAdviceRequest) {
  const { context } = request;
  const formalCount = context.anomalySummary.criticalCount + context.anomalySummary.warningCount;
  const storeNames = unique(context.storeSnapshots.map((snapshot) => snapshot.storeName));
  const metricNames = unique(context.anomalies.map((anomaly) => anomaly.metricName));

  return [
    `当前识别到 ${context.anomalySummary.total} 个异常/观察项，其中正式异常 ${formalCount} 个，观察项 ${context.anomalySummary.watchCount} 个。`,
    `涉及店铺：${storeNames.slice(0, 5).join('、') || context.storeName || '未识别店铺'}。`,
    `主要指标：${metricNames.slice(0, 6).join('、') || '暂无明确指标'}。`,
  ];
}

function buildSummary(request: AiAdviceRequest) {
  const { context } = request;
  const formalCount = context.anomalySummary.criticalCount + context.anomalySummary.warningCount;

  if (context.dataQualityNotes.length > 0) {
    return 'Mock GPT 判断：当前先以数据质量校验和口径补齐为第一优先级，再推进异常归因。';
  }

  if (formalCount > 0) {
    return 'Mock GPT 判断：当前存在正式运营异常，建议按高影响店铺和核心指标优先处理。';
  }

  if (context.anomalySummary.watchCount > 0) {
    return 'Mock GPT 判断：当前主要为观察项，建议运营先做人工复核并持续观察。';
  }

  return 'Mock GPT 判断：当前暂无明显异常，可保持常规巡检。';
}

function buildBossAdvice(request: AiAdviceRequest) {
  const { context } = request;
  const formalCount = context.anomalySummary.criticalCount + context.anomalySummary.warningCount;

  if (context.dataQualityNotes.length > 0) {
    return '建议先提醒老板关注数据口径风险，避免基于缺字段或未归属数据直接做经营判断。';
  }

  if (formalCount > 0) {
    return '建议同步老板当前正式异常数量、影响店铺和处理责任人，并给出当天复盘节点。';
  }

  return '暂不需要老板介入，运营侧完成自查后再决定是否升级。';
}

function buildTaskAdvice(request: AiAdviceRequest) {
  const { context } = request;
  const formalCount = context.anomalySummary.criticalCount + context.anomalySummary.warningCount;

  if (formalCount > 0) {
    return '建议为正式异常生成任务，任务标题包含店铺、指标和截止时间，便于后续追踪闭环。';
  }

  if (context.anomalySummary.watchCount > 0) {
    return '观察项建议先不批量生成任务，人工确认原因后再创建必要任务。';
  }

  return '暂不建议生成任务。';
}

function buildRiskNotes(request: AiAdviceRequest) {
  const notes = [...request.context.dataQualityNotes];

  if (request.context.historyCases.length === 0) {
    notes.push('缺少历史案例对照，mock 结果只用于验证请求链路。');
  }

  if (request.context.relatedMetrics.length === 0) {
    notes.push('缺少关联指标，真实 GPT 接入后建议补充商品、广告、流量来源等上下文。');
  }

  return notes.length > 0 ? notes : ['暂无额外风险提示。'];
}

export const mockAiRequestClient: AiRequestClient = {
  async generateOperationAdvice(request) {
    await wait(mockLatencyMs);

    const problemOverview = buildProblemOverview(request);
    const riskNotes = buildRiskNotes(request);
    const response: AiAdviceResponse = {
      requestId: buildRequestId(),
      provider: 'mock-gpt',
      model: 'mock-operation-advice-v1',
      generatedAt: new Date().toISOString(),
      summary: buildSummary(request),
      problemOverview,
      keyReasons: request.context.possibleReasons.slice(0, 5),
      recommendedActions: request.context.recommendedActions.slice(0, 5),
      bossAttentionAdvice: buildBossAdvice(request),
      taskCreationAdvice: buildTaskAdvice(request),
      riskNotes,
      rawText: buildAiAdvicePreview(request.context),
    };

    console.log('Mock AI request', request);
    console.log('Mock AI response', response);

    return response;
  },
};
