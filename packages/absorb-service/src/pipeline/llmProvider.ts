/**
 * LLM Provider — Pipeline adapter over @holoscript/llm-provider.
 *
 * Collapsed from 5 inline provider classes + fetchWithRetry helper into a
 * thin adapter layer.  The canonical retry, error-classification, and HTTP
 * logic now lives in BaseLLMAdapter.withRetry() inside @holoscript/llm-provider.
 *
 * This module provides:
 * - `LLMProvider` (re-exported from layerExecutors) — the narrow chat() contract
 *   used by L1/L2 executors and MeteredLLMProvider.
 * - `createPipelineLLMProvider()` — auto-detects env, creates the right
 *   ILLMProvider adapter, and wraps it in the chat() shim.
 * - `adaptToChatProvider()` — wraps any ILLMProvider into the LLMProvider shape.
 * - `detectLLMProviderName()` — returns which provider env var won.
 */

import type { LLMProvider } from './layerExecutors';
import {
  type ILLMProvider,
  LocalLLMAdapter,
  resolveSovereignProvider,
  resolveSovereignProviderAsync,
} from '@holoscript/llm-provider';
import { resolveConfigSecret } from '@holoscript/config';

/**
 * HoloLlama — the sovereign inference layer (D.117: retire Ollama; run llama-server
 * direct). It is an OpenAI-compatible llama.cpp server (POST /v1/chat/completions),
 * NOT Ollama's /api/chat. We point LocalLLMAdapter at the llama-server port and force
 * `nativeOllamaApi:false` so it never falls into the Ollama code path — the miss the
 * generic resolver made (its "local" default is Ollama's :11434).
 */
const HOLOLLAMA_DEFAULT_URL = 'http://127.0.0.1:18080';

function holoLlamaBaseURL(): string {
  return (
    process.env.HOLOLLAMA_URL ??
    process.env.HOLOLLAMA_ENDPOINT ??
    process.env.HOLO_LLM_SERVICE_URL ??
    HOLOLLAMA_DEFAULT_URL
  ).replace(/\/+$/, '');
}

function holoLlamaModel(): string {
  return process.env.HOLO_LLM_MODEL ?? process.env.BRITTNEY_MODEL ?? 'qwen3:4b-instruct-2507';
}

/** Build a HoloLlama (llama.cpp llama-server, OpenAI-compat) LocalLLMAdapter. */
function holoLlamaAdapter(): LocalLLMAdapter {
  return new LocalLLMAdapter({
    baseURL: holoLlamaBaseURL(),
    model: holoLlamaModel(),
    nativeOllamaApi: false, // HoloLlama speaks OpenAI /v1/chat/completions, not Ollama /api/chat
    timeoutMs: 300_000,
  });
}

/** True when the caller did not pin a non-sovereign provider (so HoloLlama is the default). */
function wantsSovereignDefault(): boolean {
  const explicit = (process.env.HOLO_LLM_PROVIDER ?? process.env.BRITTNEY_PROVIDER)?.toLowerCase();
  return !explicit || explicit === 'auto' || explicit === 'sovereign' || explicit === 'holollama';
}

// ─── Chat Adapter ──────────────────────────────────────────────────────────

/**
 * Wrap an ILLMProvider from @holoscript/llm-provider into the LLMProvider
 * chat() contract used by the pipeline layers.
 *
 * chat({ system, prompt, maxTokens }) → { text }
 * maps to
 * complete({ messages, maxTokens }) → { content }
 */
export function adaptToChatProvider(provider: ILLMProvider): LLMProvider {
  return {
    async chat(params: {
      system: string;
      prompt: string;
      maxTokens: number;
    }): Promise<{ text: string }> {
      const response = await provider.complete({
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.prompt },
        ],
        maxTokens: params.maxTokens,
      });
      return { text: response.content };
    },
  };
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Resolve a pipeline-compatible LLMProvider, SOVEREIGN-FIRST — HoloLlama by default.
 *
 * The GEV/absorb synthesis pillar defaults to HoloLlama (D.117 — the sovereign
 * inference layer, llama.cpp llama-server; NOT Ollama, NOT cloud). A non-sovereign
 * provider is EXPLICIT opt-in only (HOLO_LLM_PROVIDER=anthropic|xai|openai|cloud|
 * fleet|ollama), routed through the canonical `resolveSovereignProvider`. This
 * replaces the previous FOREIGN-first chain (OpenRouter→Anthropic→…→Ollama-last)
 * AND the resolver's Ollama-as-local default.
 *
 * Sync path returns HoloLlama unconditionally when no explicit override is set — no
 * silent cloud fallback (if HoloLlama is down the call fails loud with a
 * start-the-server hint). Use `createPipelineLLMProviderAsync` for a health-probed
 * graceful fallback.
 */
export function createPipelineLLMProvider(): LLMProvider {
  if (wantsSovereignDefault()) {
    return adaptToChatProvider(holoLlamaAdapter());
  }
  const explicit = (process.env.HOLO_LLM_PROVIDER ?? process.env.BRITTNEY_PROVIDER)!.toLowerCase();
  return adaptToChatProvider(resolveSovereignProvider({ explicit }).provider);
}

/** Resolve the BYOK Anthropic key via HoloKey (vault) → env, for the last-resort frontier fallback. */
async function resolveAnthropicByokKey(): Promise<string | null> {
  const k = (await resolveConfigSecret('ANTHROPIC_API_KEY')).trim();
  return k || null;
}

/**
 * HoloKey-aware, SOVEREIGN-FIRST async variant of createPipelineLLMProvider().
 *
 * Prefers HoloLlama (D.117) but HEALTH-PROBES it first: if the llama-server is
 * reachable, use it; if it is down, gracefully fall to the canonical resolver
 * (itself sovereign-first: fleet / sovereign serving endpoint, then BYOK last) so
 * a box without a local server still works. `HOLO_LLM_PROVIDER=holollama` forces
 * HoloLlama with no fallback. Also resolves the Anthropic BYOK key via HoloKey.
 */
export async function createPipelineLLMProviderAsync(): Promise<LLMProvider> {
  const explicit = (process.env.HOLO_LLM_PROVIDER ?? process.env.BRITTNEY_PROVIDER)?.toLowerCase();
  if (wantsSovereignDefault()) {
    const adapter = holoLlamaAdapter();
    if (explicit === 'holollama') return adaptToChatProvider(adapter); // forced, no fallback
    if ((await adapter.healthCheck()).ok) return adaptToChatProvider(adapter);
    const anthropicKey = await resolveAnthropicByokKey();
    return adaptToChatProvider((await resolveSovereignProviderAsync({ anthropicKey })).provider);
  }
  const anthropicKey = await resolveAnthropicByokKey();
  return adaptToChatProvider((await resolveSovereignProviderAsync({ explicit, anthropicKey })).provider);
}

/** HoloKey-aware provider-name detection (sovereign-first; probes HoloLlama). */
export async function detectLLMProviderNameAsync(): Promise<string> {
  const explicit = (process.env.HOLO_LLM_PROVIDER ?? process.env.BRITTNEY_PROVIDER)?.toLowerCase();
  if (wantsSovereignDefault()) {
    if (explicit === 'holollama') return 'holollama';
    if ((await holoLlamaAdapter().healthCheck()).ok) return 'holollama';
    const anthropicKey = await resolveAnthropicByokKey();
    try {
      return (await resolveSovereignProviderAsync({ anthropicKey })).providerName;
    } catch {
      return 'none';
    }
  }
  const anthropicKey = await resolveAnthropicByokKey();
  try {
    return (await resolveSovereignProviderAsync({ explicit, anthropicKey })).providerName;
  } catch {
    return 'none';
  }
}

/**
 * Returns which provider would be used, for diagnostics (sync — no health probe).
 * HoloLlama is the sovereign default; a non-sovereign provider is explicit opt-in.
 */
export function detectLLMProviderName(): string {
  if (wantsSovereignDefault()) return 'holollama';
  const explicit = (process.env.HOLO_LLM_PROVIDER ?? process.env.BRITTNEY_PROVIDER)!.toLowerCase();
  try {
    return resolveSovereignProvider({ explicit }).providerName;
  } catch {
    return 'none';
  }
}

// ─── Re-exports from @holoscript/llm-provider ──────────────────────────────
//
// Adapter constructors for consumers that need direct access
// (e.g. GraphRAG tool construction in mcp/graph-rag-tools.ts).
export {
  type ILLMProvider,
  AnthropicAdapter,
  OpenAIAdapter,
  XAIAdapter,
  OpenRouterAdapter,
  LocalLLMAdapter,
  LLMProviderManager,
} from '@holoscript/llm-provider';
