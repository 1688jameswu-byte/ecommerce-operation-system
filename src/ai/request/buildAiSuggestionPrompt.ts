import type { AiAdviceRequest } from '../aiRequestClient';

export function buildAiSuggestionPrompt(request: AiAdviceRequest) {
  return [
    '你是 TEMU 运营数据诊断助手。请基于用户提供的 AiAdviceRequest JSON 输出运营建议。',
    '必须只返回 JSON，不要返回 Markdown。',
    'JSON 字段必须包含：summary, problemOverview, keyReasons, recommendedActions, bossAttentionAdvice, taskCreationAdvice, riskNotes, rawText。',
    'keyReasons 使用输入 context.possibleReasons 中的对象结构，recommendedActions 使用输入 context.recommendedActions 中的对象结构。',
    'problemOverview 和 riskNotes 必须是字符串数组。',
    'rawText 是可复制给老板/运营的中文建议文本。',
    '如果 context.anomalies 包含 ruleCode、ruleName、ruleType、primaryAnomalyType、coreProblem、businessMeaning、coreAttribution、knowledgeReasons、knowledgeActions、shouldCreateTask、bossAttentionRequired，请优先使用这些 AI运营知识体系字段。',
    '输出建议时请体现：命中规则、主异常归因、可能原因、推荐策略、是否建议生成任务、是否需要老板关注；不要改变返回 JSON 字段结构。',
    '',
    JSON.stringify(request),
  ].join('\n');
}
