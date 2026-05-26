import type { AiRuntimeStatus } from '../aiRequestClient';

export async function fetchAiRuntimeStatus(): Promise<AiRuntimeStatus> {
  try {
    const response = await fetch('/api/ai/status', { method: 'GET' });

    if (!response.ok) {
      throw new Error(`AI status failed: ${response.status}`);
    }

    return await response.json() as AiRuntimeStatus;
  } catch {
    return {
      provider: 'unknown',
      configuredProvider: 'unknown',
      hasApiKey: false,
      model: 'unknown',
    };
  }
}
