import type { GenerateRequest, GenerateResponse } from '@/types';

export async function generateScene(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    return { success: false, code: '', error: `Generation failed: ${res.statusText}` };
  }

  return res.json();
}

/**
 * Check if any AI provider is available (cloud-first).
 * The health endpoint detects OPENROUTER_API_KEY, ANTHROPIC_API_KEY,
 * OPENAI_API_KEY, or OLLAMA_URL and reports connectivity.
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    // Legacy: ollama field is true when any AI provider is configured
    return data.ollama === true;
  } catch {
    return false;
  }
}

/**
 * Fetches a list of available AI providers/models from the health API endpoint.
 *
 * @returns Promise resolving to array of provider names, empty array on error
 */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return [];
    const data = await res.json();
    return data.models ?? [];
  } catch {
    return [];
  }
}
