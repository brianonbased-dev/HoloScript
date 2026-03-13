/**
 * @holoscript/llm-provider
 *
 * Unified LLM provider SDK for HoloScript.
 * Supports OpenAI, Anthropic (Claude), Google Gemini, and Mock adapters
 * with a consistent interface for scene generation and AI integration.
 *
 * @example
 * ```typescript
 * import { AnthropicAdapter, LLMProviderManager } from '@holoscript/llm-provider';
 *
 * const claude = new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! });
 * const scene = await claude.generateHoloScript({
 *   prompt: "a floating island with glowing crystals and a waterfall",
 * });
 * console.log(scene.code);
 * ```
 *
 * @module @holoscript/llm-provider
 * @version 1.0.0
 */

// Core types
export type {
  ILLMProvider,
  LLMMessage,
  LLMSystemMessage,
  LLMUserMessage,
  LLMAssistantMessage,
  MessageRole,
  LLMCompletionRequest,
  LLMCompletionResponse,
  TokenUsage,
  HoloScriptGenerationRequest,
  HoloScriptGenerationResponse,
  LLMProviderName,
  LLMProviderConfig,
  OpenAIProviderConfig,
  AnthropicProviderConfig,
  GeminiProviderConfig,
  BitNetProviderConfig,
  LocalLLMProviderConfig,
  LLMProviderRegistry,
  ProviderSelectionStrategy,
} from './types';

export {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
} from './types';

// Base adapter
export { BaseLLMAdapter } from './base-adapter';

// Provider adapters
export { OpenAIAdapter, OPENAI_MODELS } from './adapters/openai';
export type { OpenAIModel } from './adapters/openai';

export { AnthropicAdapter, ANTHROPIC_MODELS } from './adapters/anthropic';
export type { AnthropicModel } from './adapters/anthropic';

export { GeminiAdapter, GEMINI_MODELS } from './adapters/gemini';
export type { GeminiModel } from './adapters/gemini';

export { MockAdapter } from './adapters/mock';

export { BitNetAdapter, BITNET_MODELS, BITNET_MODEL_ALIASES } from './adapters/bitnet';
export type { BitNetModel } from './adapters/bitnet';

export { LocalLLMAdapter, LOCAL_LLM_MODELS } from './adapters/local-llm';
export type { LocalLLMModel } from './adapters/local-llm';

// Provider manager
export { LLMProviderManager } from './provider-manager';
export type { ProviderManagerConfig } from './provider-manager';

// Quest Generator (Phase 2 Hololand Integration)
export { QuestGenerator } from './QuestGenerator';
export type { QuestNarrativeRequest, QuestNarrativeResponse } from './QuestGenerator';

// Narrative Quest Service
export {
  getNarrativeQuestService,
  NarrativeQuestService,
  type QuestParams,
} from './services/NarrativeQuestService';

// =============================================================================
// Convenience factory functions
// =============================================================================

import { OpenAIAdapter } from './adapters/openai';
import { AnthropicAdapter } from './adapters/anthropic';
import { GeminiAdapter } from './adapters/gemini';
import { MockAdapter } from './adapters/mock';
import { BitNetAdapter } from './adapters/bitnet';
import { LocalLLMAdapter } from './adapters/local-llm';
import { LLMProviderManager } from './provider-manager';
import type { OpenAIProviderConfig, AnthropicProviderConfig, GeminiProviderConfig, BitNetProviderConfig, LocalLLMProviderConfig } from './types';

/**
 * Create an OpenAI adapter from environment variables.
 * Uses OPENAI_API_KEY environment variable.
 */
export function createOpenAIProvider(config?: Partial<OpenAIProviderConfig>): OpenAIAdapter {
  const apiKey =
    config?.apiKey ?? (typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : '') ?? '';
  if (!apiKey) {
    throw new Error('OpenAI API key required. Set OPENAI_API_KEY or pass apiKey in config.');
  }
  return new OpenAIAdapter({ ...config, apiKey });
}

/**
 * Create an Anthropic adapter from environment variables.
 * Uses ANTHROPIC_API_KEY environment variable.
 */
export function createAnthropicProvider(
  config?: Partial<AnthropicProviderConfig>
): AnthropicAdapter {
  const apiKey =
    config?.apiKey ?? (typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : '') ?? '';
  if (!apiKey) {
    throw new Error('Anthropic API key required. Set ANTHROPIC_API_KEY or pass apiKey in config.');
  }
  return new AnthropicAdapter({ ...config, apiKey });
}

/**
 * Create a Gemini adapter from environment variables.
 * Uses GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable.
 */
export function createGeminiProvider(config?: Partial<GeminiProviderConfig>): GeminiAdapter {
  const apiKey =
    config?.apiKey ??
    (typeof process !== 'undefined'
      ? (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY)
      : '') ??
    '';
  if (!apiKey) {
    throw new Error('Gemini API key required. Set GEMINI_API_KEY or pass apiKey in config.');
  }
  return new GeminiAdapter({ ...config, apiKey });
}

/**
 * Create a mock provider for testing (no API key required).
 */
export function createMockProvider(): MockAdapter {
  return new MockAdapter();
}

/**
 * Create a BitNet adapter targeting a local bitnet.cpp server.
 * Requires bitnet.cpp running at http://localhost:8080 (or custom baseURL).
 * No API key required — the server runs locally.
 *
 * Setup: https://github.com/microsoft/BitNet
 *   python setup_env.py -md microsoft/bitnet-b1.58-2B-4T -q i2_s
 *   python run_inference.py --serve --port 8080 --host 0.0.0.0
 *
 * @example
 * ```typescript
 * const bitnet = createBitNetProvider();
 * const health = await bitnet.healthCheck();
 * if (health.ok) {
 *   const scene = await bitnet.generateHoloScript({ prompt: 'a glowing sphere' });
 * }
 * ```
 */
export function createBitNetProvider(config?: Partial<BitNetProviderConfig>): BitNetAdapter {
  return new BitNetAdapter(config);
}

/**
 * Create a LocalLLM adapter for any OpenAI-compatible local inference server.
 * Works with llama.cpp, Ollama, LM Studio, or similar.
 * No API key required — the server runs locally.
 *
 * @example
 * ```typescript
 * // llama.cpp: llama-server -m mistral-7b-instruct.gguf --port 8080
 * const localLlm = createLocalLLMProvider({ baseURL: 'http://localhost:8080' });
 * const scene = await localLlm.generateHoloScript({ prompt: 'a glowing sphere' });
 *
 * // Ollama: ollama serve
 * const ollama = createLocalLLMProvider({ baseURL: 'http://localhost:11434', model: 'mistral' });
 * ```
 */
export function createLocalLLMProvider(config?: Partial<LocalLLMProviderConfig>): LocalLLMAdapter {
  return new LocalLLMAdapter(config);
}

/**
 * Create a provider manager with automatic provider detection.
 * Reads API keys from environment variables.
 */
export function createProviderManager(): LLMProviderManager {
  const providers: {
    openai?: OpenAIAdapter;
    anthropic?: AnthropicAdapter;
    gemini?: GeminiAdapter;
    bitnet?: BitNetAdapter;
    'local-llm'?: LocalLLMAdapter;
  } = {};

  const openaiKey = typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : '';
  const anthropicKey = typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : '';
  const geminiKey =
    typeof process !== 'undefined'
      ? (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY)
      : '';

  if (openaiKey) providers.openai = new OpenAIAdapter({ apiKey: openaiKey });
  if (anthropicKey) providers.anthropic = new AnthropicAdapter({ apiKey: anthropicKey });
  if (geminiKey) providers.gemini = new GeminiAdapter({ apiKey: geminiKey });

  // LocalLLM: any OpenAI-compatible local server (llama.cpp, Ollama, LM Studio)
  // Only registered when HOLOSCRIPT_LOCAL_LLM_URL is explicitly set.
  // Without this guard, the provider is always attempted, causing a ~120s hang
  // when nothing is listening at localhost:8080.
  const localLlmUrl =
    typeof process !== 'undefined' ? process.env.HOLOSCRIPT_LOCAL_LLM_URL : undefined;
  if (localLlmUrl) {
    const localLlmTimeoutMs = Number(
      (typeof process !== 'undefined' ? process.env.HOLOSCRIPT_LOCAL_LLM_TIMEOUT_MS : undefined) ?? 120000
    );
    providers['local-llm'] = new LocalLLMAdapter({
      baseURL: localLlmUrl,
      timeoutMs: Number.isFinite(localLlmTimeoutMs) ? localLlmTimeoutMs : 120000,
    });
  }

  // BitNet: only registered when explicitly configured via HOLOSCRIPT_BITNET_URL
  // bitnet.cpp runs on a separate port from the generic local LLM server
  const bitnetUrl =
    typeof process !== 'undefined' ? process.env.HOLOSCRIPT_BITNET_URL : undefined;
  if (bitnetUrl) {
    const bitnetTimeoutMs = Number(
      (typeof process !== 'undefined' ? process.env.HOLOSCRIPT_BITNET_TIMEOUT_MS : undefined) ?? 60000
    );
    const bitnetMaxRetries = Number(
      (typeof process !== 'undefined' ? process.env.HOLOSCRIPT_BITNET_MAX_RETRIES : undefined) ?? 2
    );
    providers.bitnet = new BitNetAdapter({
      baseURL: bitnetUrl,
      timeoutMs: Number.isFinite(bitnetTimeoutMs) ? bitnetTimeoutMs : 60000,
      maxRetries: Number.isFinite(bitnetMaxRetries) ? bitnetMaxRetries : 2,
    });
  }

  if (Object.keys(providers).length === 0) {
    throw new Error(
      'No LLM providers available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or start a local server.'
    );
  }

  return new LLMProviderManager({ providers });
}
