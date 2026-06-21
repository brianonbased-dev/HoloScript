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
  LLMFileMetadata,
  LLMFileUploadRequest,
  TokenUsage,
  HoloScriptGenerationRequest,
  HoloScriptGenerationResponse,
  LLMProviderName,
  LLMProviderConfig,
  OpenAIApiSurface,
  OpenAIReasoningEffort,
  OpenAIProviderConfig,
  AnthropicProviderConfig,
  GeminiProviderConfig,
  BitNetProviderConfig,
  LocalLLMProviderConfig,
  OpenRouterProviderConfig,
  XAIProviderConfig,
  LLMProviderRegistry,
  ProviderSelectionStrategy,
  // Tool-use types — added 2026-04-25 for mesh-agent runner
  ToolSpec,
  ToolSpecUnion,
  AnthropicAdvisorToolSpec,
  CacheControlEphemeral,
  AnthropicFileSource,
  AnthropicDocumentFileBlock,
  AnthropicImageFileBlock,
  AnthropicContainerUploadBlock,
  AnthropicFileContentBlock,
  AnthropicFileContentBlockType,
  AnthropicFileContentBlockOptions,
  LLMContentBlock,
  AnthropicEffortLevel,
  AnthropicThinkingParam,
  ToolUseBlock,
  ToolResultBlock,
  TextBlock,
  AssistantContentBlock,
  // Stream-completion types — added 2026-04-27 for D.025 provider-routing
  // refactor (Brittney route migration to unified streaming surface).
  LLMStreamChunk,
  Capabilities,
  // Inline moderation types — added 2026-06-08 (A-020): OpenAI inline moderation
  // passthrough eliminates a separate POST /v1/moderations call for HoloDoor gates.
  InlineModerationRequest,
  InlineModerationResult,
  // Provider extension types
  ProviderExtensions,
  OpenAIProviderExtensions,
  AnthropicProviderExtensions,
  GrokProviderExtensions,
  GeminiProviderExtensions,
  OllamaProviderExtensions,
} from './types';

export {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
  LLMCreditExhaustedError,
  anthropicFileContentBlock,
  filterGenericTools,
  isAnthropicAdvisorTool,
  isToolSpec,
  messageContentAsString,
} from './types';

// Base adapter
export { BaseLLMAdapter } from './base-adapter';

// Provider adapters
export {
  OpenAIAdapter,
  OPENAI_MODELS,
  OPENAI_CAPABILITIES,
  messagesToOpenAIResponsesInput,
  parseOpenAIResponsesResult,
  parseOpenAIModerationResult,
  toolSpecsToOpenAIResponseTools,
} from './adapters/openai';
export type { OpenAIModel } from './adapters/openai';

export {
  AnthropicAdapter,
  ANTHROPIC_MODELS,
  ANTHROPIC_MODEL_METADATA,
  ANTHROPIC_CAPABILITIES,
  ANTHROPIC_ADVISOR_BETA,
  ANTHROPIC_FILES_BETA,
  buildThinkingAndOutputForAnthropic,
  collectAnthropicBetaHeaders,
  getAnthropicModelMetadata,
  hasAnthropicFileContent,
  isAnthropicDefaultRoutingEligible,
} from './adapters/anthropic';
export type { AnthropicModel, AnthropicModelMetadata } from './adapters/anthropic';

export { GeminiAdapter, GEMINI_MODELS, GEMINI_CAPABILITIES } from './adapters/gemini';
export type { GeminiModel } from './adapters/gemini';

export { MockAdapter, MOCK_CAPABILITIES } from './adapters/mock';

export {
  BitNetAdapter,
  BITNET_MODELS,
  BITNET_MODEL_ALIASES,
  BITNET_CAPABILITIES,
} from './adapters/bitnet';
export type { BitNetModel } from './adapters/bitnet';

export { LocalLLMAdapter, LOCAL_LLM_MODELS, LOCAL_LLM_CAPABILITIES } from './adapters/local-llm';
export type { LocalLLMModel } from './adapters/local-llm';

export {
  OpenRouterAdapter,
  OPENROUTER_MODELS,
  OPENROUTER_CAPABILITIES,
} from './adapters/openrouter';
export type { OpenRouterModel } from './adapters/openrouter';

export {
  OpenAICompatibleAdapter,
  OPENAI_COMPATIBLE_CAPABILITIES,
} from './adapters/openai-compatible';
export type { OpenAICompatibleAdapterConfig } from './adapters/openai-compatible';

export { VastServerlessAdapter, VAST_SERVERLESS_CAPABILITIES } from './adapters/vast-serverless';
export type { VastServerlessAdapterConfig } from './adapters/vast-serverless';

export { XAIAdapter, XAI_MODELS, XAI_MODEL_CAPABILITIES, XAI_CAPABILITIES } from './adapters/xai';
export type { XAIModel, XAIModelCapability } from './adapters/xai';

export {
  BrittneyCloudAdapter,
  BRITTNEY_CLOUD_MODELS,
  BRITTNEY_CLOUD_CAPABILITIES,
} from './adapters/brittney-cloud';
export type {
  BrittneyCloudModel,
  BrittneyCloudProviderConfig,
  BrittneyCloudLane,
} from './adapters/brittney-cloud';

// Provider manager
export { LLMProviderManager } from './provider-manager';
export type { ProviderManagerConfig } from './provider-manager';

// Universal sovereign-first provider resolution (founder 2026-06-10):
// one policy for HoloClaw, the fleet, and Brittney — sovereign serving
// (fleet/cloud/ollama) by default, BYOK frontier keys as fallback (F.112).
export { resolveSovereignProvider, resolveSovereignProviderAsync } from './sovereign-resolver';
export type {
  ResolvedSovereignProvider,
  SovereignProviderName,
  SovereignResolveOptions,
} from './sovereign-resolver';

// Model policy — THE single source of truth for tier defaults + the blacklist
// ("lock in our models": change a default here, not in 20 files).
export {
  LOCAL_DEFAULT_MODEL,
  FLEET_DEFAULT_MODEL,
  CLOUD_DEFAULT_MODEL,
  SAFE_LOCAL_FALLBACK,
  LANE_DEFAULTS,
  laneDefault,
  MODEL_LIBRARY,
  modelsForLane,
  modelLibraryEntry,
  MODEL_BLACKLIST,
  isBlacklistedModel,
  resolveAllowedModel,
} from './model-policy';
export type { ModelLane, ModelTier, ModelLibraryEntry } from './model-policy';

// Local model discovery — picks the best behaviorally-verified tool-calling
// model from whatever Ollama has installed, instead of a hardcoded tag
// (founder 2026-06-10: "don't we have a large variety available?").
export {
  pickLocalModel,
  __clearLocalModelPickerCache,
  OLLAMA_DEFAULT_BASE_URL,
} from './local-model-picker';
export type { LocalModelChoice } from './local-model-picker';

// Local multi-GPU fleet routing — the runtime consumer of the native
// `@model_fleet` brain (compositions/model-fleet.hsplus). Routes one request
// across the owned-metal GPU nodes (Jetson + laptop RTX 3060) least-loaded +
// warm-preferred, endpoints resolved by sovereign-devices registry handle. The
// single-endpoint picker above is its degenerate one-node case.
export {
  parseFleetSpec,
  loadFleetSpec,
  resolveNodeEndpoint,
  discoverNode,
  pickFleetModel,
  resolveLocalFleet,
  embedAcrossFleet,
  cosineSimilarity,
} from './fleet-router';
export type {
  FleetNode,
  FleetSpec,
  NodeDiscovery,
  FleetCandidate,
  FleetRoute,
  FleetRouteOptions,
  FetchLike,
} from './fleet-router';

// Quest Generator (Phase 2 Hololand Integration)
export { QuestGenerator } from './QuestGenerator';
export type { QuestNarrativeRequest, QuestNarrativeResponse } from './QuestGenerator';

// KVFlow — workflow-aware KV cache management (arXiv:2507.07400 harvest)
export {
  InMemoryAgentStepGraph,
  KVFlowCacheManager,
  scopeFromBrainCaching,
  scopeToCacheUsage,
  estimateKVBytes,
  entryFromStep,
} from './kvflow';
export type {
  StepNodeId,
  KVFlowScope,
  KVResidency,
  AgentStep,
  KVCacheEntry,
  KVFlowConfig,
  EvictionResult,
  PrefetchResult,
  KVFlowTelemetry,
} from './kvflow';

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
import { OpenRouterAdapter } from './adapters/openrouter';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible';
import { VastServerlessAdapter } from './adapters/vast-serverless';
import { XAIAdapter } from './adapters/xai';
import { BrittneyCloudAdapter } from './adapters/brittney-cloud';
import { LLMProviderManager } from './provider-manager';
import type {
  OpenAIProviderConfig,
  AnthropicProviderConfig,
  GeminiProviderConfig,
  BitNetProviderConfig,
  LocalLLMProviderConfig,
  OpenRouterProviderConfig,
  XAIProviderConfig,
  BrittneyCloudProviderConfig,
} from './types';
import type { OpenAICompatibleAdapterConfig } from './adapters/openai-compatible';

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
 * Create an OpenRouter adapter from environment variables.
 * Uses OPENROUTER_API_KEY environment variable.
 * OpenRouter provides an OpenAI-compatible API that routes to 200+ models.
 *
 * @example
 * ```typescript
 * const openrouter = createOpenRouterProvider();
 * const scene = await openrouter.generateHoloScript({
 *   prompt: "a floating island with glowing crystals",
 * });
 * ```
 */
export function createOpenRouterProvider(
  config?: Partial<OpenRouterProviderConfig>
): OpenRouterAdapter {
  const apiKey =
    config?.apiKey ?? (typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY : '') ?? '';
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key required. Set OPENROUTER_API_KEY or pass apiKey in config.'
    );
  }
  return new OpenRouterAdapter({ ...config, apiKey });
}

/**
 * Create an OpenAI-compatible Bearer adapter for any hosted endpoint that
 * speaks `${baseURL}/chat/completions` with an optional `Authorization: Bearer`
 * header (Fireworks, Together, Kimi-via-Fireworks, self-hosted vLLM/TGI/SGLang).
 *
 * Unlike the other factories this does NOT read an env var by default — the
 * endpoint baseURL is the discriminator, so the caller passes `{ baseURL,
 * apiKey?, model }` explicitly.
 *
 * @example
 * ```typescript
 * const fireworks = createOpenAICompatibleProvider({
 *   baseURL: 'https://api.fireworks.ai/inference/v1',
 *   apiKey: process.env.FIREWORKS_API_KEY,
 *   model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
 * });
 * ```
 */
export function createOpenAICompatibleProvider(
  config?: Partial<OpenAICompatibleAdapterConfig>
): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter(config);
}

/**
 * Create an xAI (Grok) adapter from environment variables.
 * Uses XAI_API_KEY environment variable.
 * xAI provides an OpenAI-compatible API at https://api.x.ai/v1.
 *
 * @example
 * ```typescript
 * const xai = createXAIProvider();
 * const scene = await xai.generateHoloScript({
 *   prompt: "a floating island with glowing crystals",
 * });
 * ```
 */
export function createXAIProvider(config?: Partial<XAIProviderConfig>): XAIAdapter {
  const apiKey =
    config?.apiKey ?? (typeof process !== 'undefined' ? process.env.XAI_API_KEY : '') ?? '';
  if (!apiKey) {
    throw new Error('xAI API key required. Set XAI_API_KEY or pass apiKey in config.');
  }
  return new XAIAdapter({ ...config, apiKey });
}

/**
 * Create a Brittney Cloud adapter from environment variables.
 * Uses BRITTNEY_SERVICE_URL and optional BRITTNEY_API_KEY.
 *
 * Brittney Cloud is HoloScript's first-party inference gateway.
 * It routes to Fireworks, Together, Kimi, or Ollama backends.
 *
 * @example
 * ```typescript
 * const brittney = createBrittneyCloudProvider();
 * const scene = await brittney.generateHoloScript({
 *   prompt: "a floating island with glowing crystals",
 * });
 * ```
 */
export function createBrittneyCloudProvider(
  config?: Partial<BrittneyCloudProviderConfig>
): BrittneyCloudAdapter {
  const baseURL =
    config?.baseURL ??
    (typeof process !== 'undefined' ? process.env.BRITTNEY_SERVICE_URL : '') ??
    '';
  const apiKey =
    config?.apiKey ?? (typeof process !== 'undefined' ? process.env.BRITTNEY_API_KEY : '') ?? '';
  if (!baseURL) {
    throw new Error(
      'Brittney Cloud URL required. Set BRITTNEY_SERVICE_URL or pass baseURL in config.'
    );
  }
  return new BrittneyCloudAdapter({ ...config, baseURL, apiKey });
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
    fleet?: VastServerlessAdapter;
    openrouter?: OpenRouterAdapter;
    xai?: XAIAdapter;
    'brittney-cloud'?: BrittneyCloudAdapter;
  } = {};

  const openaiKey = typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : '';
  const anthropicKey = typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : '';
  const geminiKey =
    typeof process !== 'undefined'
      ? (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY)
      : '';
  const openrouterKey = typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY : '';
  const xaiKey = typeof process !== 'undefined' ? process.env.XAI_API_KEY : '';

  if (openaiKey) providers.openai = new OpenAIAdapter({ apiKey: openaiKey });
  if (anthropicKey) providers.anthropic = new AnthropicAdapter({ apiKey: anthropicKey });
  if (geminiKey) providers.gemini = new GeminiAdapter({ apiKey: geminiKey });
  if (openrouterKey) providers.openrouter = new OpenRouterAdapter({ apiKey: openrouterKey });
  if (xaiKey) providers.xai = new XAIAdapter({ apiKey: xaiKey });

  // Fleet: Vast serverless transport. Route calls wake the cold pool with a
  // cost signal (default 100), then worker calls carry Vast's auth_data envelope.
  const vastKey = typeof process !== 'undefined' ? process.env.VAST_API_KEY : '';
  if (vastKey) {
    const endpointName =
      (typeof process !== 'undefined'
        ? (process.env.FLEET_PROVIDER_ENDPOINT ?? process.env.VAST_QWEN_ENDPOINT_NAME)
        : undefined) ?? 'holoscript-qwen-coder';
    const fleetModel =
      typeof process !== 'undefined'
        ? (process.env.FLEET_MODEL ?? process.env.VAST_QWEN_MODEL)
        : undefined;
    const cost = Number(typeof process !== 'undefined' ? process.env.VAST_SERVERLESS_COST : NaN);
    const maxWaitS = Number(
      typeof process !== 'undefined' ? process.env.VAST_SERVERLESS_MAX_WAIT_S : NaN
    );
    providers.fleet = new VastServerlessAdapter({
      apiKey: vastKey,
      endpointName,
      ...(fleetModel ? { model: fleetModel } : {}),
      ...(Number.isFinite(cost) && cost > 0 ? { cost } : {}),
      ...(Number.isFinite(maxWaitS) && maxWaitS >= 0 ? { maxWaitS } : {}),
    });
  }

  // Brittney Cloud: registered when BRITTNEY_SERVICE_URL is explicitly set.
  const brittneyCloudUrl =
    typeof process !== 'undefined' ? process.env.BRITTNEY_SERVICE_URL : undefined;
  if (brittneyCloudUrl) {
    const brittneyApiKey =
      (typeof process !== 'undefined' ? process.env.BRITTNEY_API_KEY : undefined) ?? '';
    providers['brittney-cloud'] = new BrittneyCloudAdapter({
      baseURL: brittneyCloudUrl,
      apiKey: brittneyApiKey,
    });
  }

  // LocalLLM: any OpenAI-compatible local server (llama.cpp, Ollama, LM Studio)
  // Only registered when HOLOSCRIPT_LOCAL_LLM_URL is explicitly set.
  // Without this guard, the provider is always attempted, causing a ~120s hang
  // when nothing is listening at localhost:8080.
  const localLlmUrl =
    typeof process !== 'undefined' ? process.env.HOLOSCRIPT_LOCAL_LLM_URL : undefined;
  if (localLlmUrl) {
    const localLlmTimeoutMs = Number(
      (typeof process !== 'undefined' ? process.env.HOLOSCRIPT_LOCAL_LLM_TIMEOUT_MS : undefined) ??
        120000
    );
    providers['local-llm'] = new LocalLLMAdapter({
      baseURL: localLlmUrl,
      timeoutMs: Number.isFinite(localLlmTimeoutMs) ? localLlmTimeoutMs : 120000,
    });
  }

  // BitNet: only registered when explicitly configured via HOLOSCRIPT_BITNET_URL
  // bitnet.cpp runs on a separate port from the generic local LLM server
  const bitnetUrl = typeof process !== 'undefined' ? process.env.HOLOSCRIPT_BITNET_URL : undefined;
  if (bitnetUrl) {
    const bitnetTimeoutMs = Number(
      (typeof process !== 'undefined' ? process.env.HOLOSCRIPT_BITNET_TIMEOUT_MS : undefined) ??
        60000
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
      'No LLM providers available. Set VAST_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, XAI_API_KEY, BRITTNEY_SERVICE_URL, or start a local server.'
    );
  }

  return new LLMProviderManager({ providers });
}
