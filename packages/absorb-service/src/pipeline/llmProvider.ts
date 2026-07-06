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
  resolveSovereignProvider,
  resolveSovereignProviderAsync,
} from '@holoscript/llm-provider';
import { resolveConfigSecret } from '@holoscript/config';

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
 * Resolve a pipeline-compatible LLMProvider, SOVEREIGN-FIRST.
 *
 * Converges on the canonical `resolveSovereignProvider` (F.112 ecosystem-wide,
 * D.118 sovereign-at-every-layer): sovereign serving fleet → sovereign serving
 * endpoint → local model (HoloLlama/Ollama) by default, frontier APIs
 * (anthropic/xai/openai) as BYOK fallback LAST. This replaces the previous
 * FOREIGN-first chain (OpenRouter→Anthropic→xAI→OpenAI→Ollama-last-resort) that
 * defaulted the GEV/absorb synthesis pillar to cloud. Explicit override via
 * HOLO_LLM_PROVIDER; the whole ecosystem now runs sovereign by default and the
 * absorb synthesis "generation" leg is native unless a frontier key is the only
 * thing configured. OpenRouter-only setups: point OPENAI_BASE_URL at OpenRouter.
 */
export function createPipelineLLMProvider(): LLMProvider {
  return adaptToChatProvider(resolveSovereignProvider().provider);
}

/** Resolve the BYOK Anthropic key via HoloKey (vault) → env, for the last-resort frontier fallback. */
async function resolveAnthropicByokKey(): Promise<string | null> {
  const k = (await resolveConfigSecret('ANTHROPIC_API_KEY')).trim();
  return k || null;
}

/**
 * HoloKey-aware, SOVEREIGN-FIRST async variant of createPipelineLLMProvider().
 *
 * Same sovereign policy as the sync path (serving fleet / sovereign endpoint /
 * local first, frontier BYOK last) but additionally (a) prefers the serving
 * fleet when VAST_API_KEY is set (async route probe with graceful cold fallback)
 * and (b) resolves the Anthropic BYOK key through the HoloKey vault.
 */
export async function createPipelineLLMProviderAsync(): Promise<LLMProvider> {
  const anthropicKey = await resolveAnthropicByokKey();
  const resolved = await resolveSovereignProviderAsync({ anthropicKey });
  return adaptToChatProvider(resolved.provider);
}

/** HoloKey-aware provider-name detection (sovereign-first). */
export async function detectLLMProviderNameAsync(): Promise<string> {
  const anthropicKey = await resolveAnthropicByokKey();
  try {
    return (await resolveSovereignProviderAsync({ anthropicKey })).providerName;
  } catch {
    return 'none';
  }
}

/**
 * Returns which provider would be used, for diagnostics.
 * Mirrors the sovereign-first resolution in createPipelineLLMProvider().
 */
export function detectLLMProviderName(): string {
  try {
    return resolveSovereignProvider().providerName;
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
