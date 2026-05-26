import type { AiAdviceResponse } from '../aiRequestClient';

export function isAiAdviceResponse(value: unknown): value is AiAdviceResponse {
  const response = value as Partial<AiAdviceResponse>;

  return Boolean(
    response &&
    typeof response.requestId === 'string' &&
    typeof response.provider === 'string' &&
    typeof response.model === 'string' &&
    typeof response.generatedAt === 'string' &&
    typeof response.summary === 'string' &&
    Array.isArray(response.problemOverview) &&
    Array.isArray(response.keyReasons) &&
    Array.isArray(response.recommendedActions) &&
    typeof response.bossAttentionAdvice === 'string' &&
    typeof response.taskCreationAdvice === 'string' &&
    Array.isArray(response.riskNotes) &&
    typeof response.rawText === 'string',
  );
}
