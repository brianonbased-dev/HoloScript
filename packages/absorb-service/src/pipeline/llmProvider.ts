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
  type LLMProviderName as PkgProviderName,
  AnthropicAdapter,
  OpenAIAdapter,
  XAIAdapter,
  OpenRouterAdapter,
  LocalLLMAdapter,
  LLMProviderManager,
} from '@holoscript/llm-provider';

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
    async chat(params: { system: string; prompt: string; maxTokens: number }): Promise<{ text: string }> {
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
 * Auto-detect available LLM provider from environment variables and return
 * a pipeline-compatible LLMProvider.
 *
 * Fallback chain: OPENROUTER_API_KEY → ANTHROPIC_API_KEY → XAI_API_KEY →
 * OPENAI_API_KEY → OLLAMA_URL (last resort)
 */
export function createPipelineLLMProvider(): LLMProvider {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4';
    return adaptToChatProvider(
      new OpenRouterAdapter({
        apiKey: openRouterKey,
        defaultModel: model,
        referer: 'https://holoscript.net',
        title: 'HoloScript Absorb',
      })
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
    return adaptToChatProvider(new AnthropicAdapter({ apiKey: anthropicKey, defaultModel: model }));
  }

  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey) {
    const model = process.env.XAI_MODEL ?? 'grok-3-mini';
    return adaptToChatProvider(new XAIAdapter({ apiKey: xaiKey, defaultModel: model }));
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    return adaptToChatProvider(new OpenAIAdapter({ apiKey: openaiKey, defaultModel: model }));
  }

  // Ollama / local-llm fallback — only used when no cloud API keys are set
  const ollamaUrl = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL;
  if (!ollamaUrl) {
    throw new Error(
      '[LLMProvider] No AI provider configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, or OLLAMA_URL in .env'
    );
  }
  const ollamaModel = process.env.OLLAMA_MODEL ?? process.env.BRITTNEY_MODEL ?? 'llama3.1:8b';
  console.warn(
    '[LLMProvider] No cloud API keys found (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY). Falling back to Ollama.'
  );
  return adaptToChatProvider(
    new LocalLLMAdapter({ baseURL: ollamaUrl.replace(/\/+$/, ''), model: ollamaModel })
  );
}

/**
 * Returns which provider would be used, for diagnostics.
 * Mirrors the fallback chain in createPipelineLLMProvider().
 */
export function detectLLMProviderName(): string {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.XAI_API_KEY) return 'xai';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'ollama';
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