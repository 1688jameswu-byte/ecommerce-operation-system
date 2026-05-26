import { mockAiRequestClient } from '../mockAiRequestClient';
import { openAiRequestClient } from './openAiRequestClient';
import type { AiRequestClient } from '../aiRequestClient';

const shouldUseProxy = typeof window !== 'undefined';

export const aiRequestClient: AiRequestClient = shouldUseProxy ? openAiRequestClient : mockAiRequestClient;

export { buildAiSuggestionPrompt } from './buildAiSuggestionPrompt';
export { fetchAiRuntimeStatus } from './aiRuntimeStatusClient';
export { openAiRequestClient } from './openAiRequestClient';
export { isAiAdviceResponse } from './validateAiAdviceResponse';
