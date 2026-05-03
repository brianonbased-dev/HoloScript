/**
 * Brittney Provider Resolution — D.025 Phase 3
 *
 * Resolves which LLM provider Brittney routes through based on the
 * BRITTNEY_PROVIDER env var. Defaults to Anthropic when ANTHROPIC_API_KEY
 * is set, Ollama when OLLAMA_HOST is set. Produces a clear error otherwise.
 *
 * In downloaded apps (Quest 3, mobile), BRITTNEY_PROVIDER=ollama routes to
 * the local Ollama instance running Brittney's quantized model. In cloud
 * (Railway), BRITTNEY_PROVIDER=anthropic (default) routes to Claude.
 *
 * The resolved provider exposes `streamCompletion()` from
 * @holoscript/llm-provider — a provider-agnostic async iterable of
 * LLMStreamChunk events that the Brittney route consumes identically
 * regardless of backend.
 */

import {
  AnthropicAdapter,
  LocalLLMAdapter,
  type ILLMProvider,
} from '@holoscript/llm-provider';

export type BrittneyProviderName = 'anthropic' | 'ollama';

export interface ResolvedBrittneyProvider {
  /** The unified provider (Anthropic or Ollama). */
  provider: ILLMProvider;
  /** The model string to pass to streamCompletion(). */
  model: string;
  /** Max tokens for this provider. Anthropic = 16K, Ollama = 4-8K. */
  maxTokens: number;
  /** Which provider was resolved (for logging/response headers). */
  providerName: BrittneyProviderName;
}

/**
 * Default Ollama model for Brittney. Must match the model name the local
 * Ollama instance serves (configured during app install / Quest 3 setup).
 */
const OLLAMA_DEFAULT_MODEL = 'brittney-qwen-v23:latest';

/**
 * Resolve Brittney's LLM provider from environment variables.
 *
 * Priority:
 *   1. BRITTNEY_PROVIDER=anthropic|ollama (explicit override)
 *   2. ANTHROPIC_API_KEY present → anthropic
 *   3. OLLAMA_HOST present → ollama
 *   4. Error — no provider configured
 *
 * Ollama host defaults:
 *   - OLLAMA_HOST env (full URL, e.g. http://host.docker.internal:11434)
 *   - OLLAMA_BASE_URL env (alternative key)
 *   - http://localhost:11434 (local Ollama default)
 */
export function resolveBrittneyProvider(): ResolvedBrittneyProvider {
  const explicit = process.env.BRITTNEY_PROVIDER as BrittneyProviderName | undefined;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const ollamaHost = process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL;

  // Explicit override takes priority
  if (explicit === 'ollama') {
    return resolveOllama(ollamaHost);
  }
  if (explicit === 'anthropic') {
    return resolveAnthropic(anthropicKey);
  }

  // Auto-detect: Anthropic if key present, Ollama if host present
  if (anthropicKey) {
    return resolveAnthropic(anthropicKey);
  }
  if (ollamaHost) {
    return resolveOllama(ollamaHost);
  }

  throw new Error(
    'No Brittney provider configured. Set BRITTNEY_PROVIDER=anthropic (with ANTHROPIC_API_KEY) ' +
    'or BRITTNEY_PROVIDER=ollama (with OLLAMA_HOST). In downloaded apps, the installer sets ' +
    'OLLAMA_HOST to point to the local Brittney model.'
  );
}

function resolveAnthropic(apiKey: string | undefined): ResolvedBrittneyProvider {
  if (!apiKey) {
    throw new Error(
      'BRITTNEY_PROVIDER=anthropic requires ANTHROPIC_API_KEY. ' +
      'Set ANTHROPIC_API_KEY or switch to BRITTNEY_PROVIDER=ollama.'
    );
  }
  const provider = new AnthropicAdapter({
    apiKey,
    enablePromptCaching: true,
  });
  return {
    provider,
    model: process.env.BRITTNEY_MODEL || 'claude-opus-4-7',
    maxTokens: 16000,
    providerName: 'anthropic',
  };
}

function resolveOllama(host: string | undefined): ResolvedBrittneyProvider {
  const baseURL = host || 'http://localhost:11434';
  const provider = new LocalLLMAdapter({
    baseURL,
    model: process.env.BRITTNEY_MODEL || OLLAMA_DEFAULT_MODEL,
    timeoutMs: 300_000, // 5 min — matches Anthropic adapter
  });
  return {
    provider,
    model: process.env.BRITTNEY_MODEL || OLLAMA_DEFAULT_MODEL,
    // Local models have smaller context windows. 4K is safe for 7B-class;
    // 8K for larger models. Override via BRITTNEY_MAX_TOKENS if needed.
    maxTokens: Number(process.env.BRITTNEY_MAX_TOKENS) || 4096,
    providerName: 'ollama',
  };
}