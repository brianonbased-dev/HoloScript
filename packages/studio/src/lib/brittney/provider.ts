/**
 * Brittney Provider Resolution — native-default (sovereign serving), BYOK fallback.
 *
 * Founder directive (2026-06-05): Brittney's LLM deps are NATIVE by default. The
 * ecosystem's own AI runs on sovereign serving — Brittney Cloud (our vast Ollama/
 * PyWorker fleet, P.008) or a local Ollama — NOT a third-party frontier API. A
 * frontier API (Anthropic) is BYOK: explicit opt-in or last-resort fallback only.
 * Other agent families bring their own keys; Brittney itself defaults sovereign.
 * Extends P.009 (sovereign embeddings) to the chat LLM.
 *
 * Auto-detect priority (no explicit BRITTNEY_PROVIDER):
 *   1. BRITTNEY_SERVICE_URL present → cloud   (sovereign serving — the native default)
 *   2. OLLAMA_HOST present          → ollama  (sovereign local — Quest 3 / downloaded apps)
 *   3. ANTHROPIC_API_KEY present    → anthropic (BYOK frontier fallback)
 *   4. Error
 *
 * Explicit BRITTNEY_PROVIDER=anthropic|ollama|cloud always wins (BYOK / pinned override).
 *
 * The resolved provider exposes `streamCompletion()` from
 * @holoscript/llm-provider — a provider-agnostic async iterable of
 * LLMStreamChunk events that the Brittney route consumes identically
 * regardless of backend.
 */

import {
  AnthropicAdapter,
  LocalLLMAdapter,
  BrittneyCloudAdapter,
  type ILLMProvider,
} from '@holoscript/llm-provider';

export type BrittneyProviderName = 'anthropic' | 'ollama' | 'cloud';

export interface ResolvedBrittneyProvider {
  /** The unified provider (Anthropic, Ollama, or Brittney Cloud). */
  provider: ILLMProvider;
  /** The model string to pass to streamCompletion(). */
  model: string;
  /** Max tokens for this provider. Anthropic = 16K, Ollama = 4-8K, Cloud = 8K. */
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
 * Priority (native-default — see file header for the founder directive):
 *   1. BRITTNEY_PROVIDER=anthropic|ollama|cloud (explicit override / BYOK)
 *   2. BRITTNEY_SERVICE_URL present → cloud   (sovereign serving — native default)
 *   3. OLLAMA_HOST present → ollama           (sovereign on-device)
 *   4. ANTHROPIC_API_KEY present → anthropic  (BYOK frontier fallback)
 *   5. Error — no provider configured
 *
 * Ollama host defaults:
 *   - OLLAMA_HOST env (full URL, e.g. http://host.docker.internal:11434)
 *   - OLLAMA_BASE_URL env (alternative key)
 *   - the Ollama default port (resolved inside resolveOllama)
 */
export function resolveBrittneyProvider(): ResolvedBrittneyProvider {
  const explicit = process.env.BRITTNEY_PROVIDER as BrittneyProviderName | undefined;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const ollamaHost = process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL;
  const cloudUrl = process.env.BRITTNEY_SERVICE_URL;

  // Explicit override always wins (BYOK / pinned provider).
  if (explicit === 'ollama') {
    return resolveOllama(ollamaHost);
  }
  if (explicit === 'anthropic') {
    return resolveAnthropic(anthropicKey);
  }
  if (explicit === 'cloud') {
    return resolveCloud(cloudUrl);
  }

  // Auto-detect: sovereign serving FIRST (cloud → ollama), BYOK frontier (anthropic) LAST.
  // Brittney's own deps are native by default; Anthropic is only the fallback when no
  // sovereign endpoint is configured.
  if (cloudUrl) {
    return resolveCloud(cloudUrl);
  }
  if (ollamaHost) {
    return resolveOllama(ollamaHost);
  }
  if (anthropicKey) {
    return resolveAnthropic(anthropicKey);
  }

  throw new Error(
    'No Brittney provider configured. Brittney runs native by default — set ' +
    'BRITTNEY_PROVIDER=cloud (with BRITTNEY_SERVICE_URL, the sovereign serving endpoint) ' +
    'or BRITTNEY_PROVIDER=ollama (with OLLAMA_HOST). For a BYOK frontier fallback, set ' +
    'BRITTNEY_PROVIDER=anthropic (with ANTHROPIC_API_KEY). Downloaded apps configure ' +
    'OLLAMA_HOST to the on-device Brittney model.'
  );
}

function resolveAnthropic(apiKey: string | undefined): ResolvedBrittneyProvider {
  if (!apiKey) {
    throw new Error(
      'BRITTNEY_PROVIDER=anthropic requires ANTHROPIC_API_KEY. ' +
      'Set ANTHROPIC_API_KEY or switch to BRITTNEY_PROVIDER=cloud or BRITTNEY_PROVIDER=ollama.'
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

function resolveCloud(baseURL: string | undefined): ResolvedBrittneyProvider {
  if (!baseURL) {
    throw new Error(
      'BRITTNEY_PROVIDER=cloud requires BRITTNEY_SERVICE_URL. ' +
      'Set BRITTNEY_SERVICE_URL or switch to another provider.'
    );
  }
  const apiKey = process.env.BRITTNEY_API_KEY ?? '';
  const tier = (process.env.BRITTNEY_TIER as 'standard' | 'pro') || 'standard';
  const provider = new BrittneyCloudAdapter({
    baseURL,
    apiKey,
    tier,
  });
  return {
    provider,
    model: process.env.BRITTNEY_MODEL || 'brittney-standard',
    maxTokens: 8192,
    providerName: 'cloud',
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
