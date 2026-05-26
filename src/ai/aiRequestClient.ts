import type { AiContext, AiPossibleReason, AiRecommendedAction } from './aiSuggestionTypes';

export type AiAdviceProvider = 'mock-gpt' | 'openai-gpt';

export interface AiAdviceRequest {
  scenario: 'operation-diagnosis';
  context: AiContext;
  responseLanguage: 'zh-CN';
  userQuestion?: string;
}

export interface AiAdviceResponse {
  requestId: string;
  provider: AiAdviceProvider;
  model: string;
  generatedAt: string;
  summary: string;
  problemOverview: string[];
  keyReasons: AiPossibleReason[];
  recommendedActions: AiRecommendedAction[];
  bossAttentionAdvice: string;
  taskCreationAdvice: string;
  riskNotes: string[];
  rawText: string;
}

export interface AiRequestClient {
  generateOperationAdvice: (request: AiAdviceRequest) => Promise<AiAdviceResponse>;
}

export interface AiRuntimeStatus {
  provider: 'mock' | 'openai' | 'unknown';
  configuredProvider: string;
  hasApiKey: boolean;
  model: string;
}
