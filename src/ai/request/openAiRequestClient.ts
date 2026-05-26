import { mockAiRequestClient } from '../mockAiRequestClient';
import type { AiAdviceRequest, AiRequestClient } from '../aiRequestClient';
import { buildAiSuggestionPrompt } from './buildAiSuggestionPrompt';
import { isAiAdviceResponse } from './validateAiAdviceResponse';

async function requestOperationAdvice(request: AiAdviceRequest) {
  const response = await fetch('/api/ai/operation-advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, prompt: buildAiSuggestionPrompt(request) }),
  });

  if (!response.ok) {
    throw new Error(`AI proxy failed: ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

export const openAiRequestClient: AiRequestClient = {
  async generateOperationAdvice(request) {
    try {
      const response = await requestOperationAdvice(request);

      if (isAiAdviceResponse(response)) {
        return response;
      }
    } catch (error) {
      console.error('OpenAI proxy request failed, fallback to mock', error);
    }

    return mockAiRequestClient.generateOperationAdvice(request);
  },
};
