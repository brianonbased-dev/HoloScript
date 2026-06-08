/**
 * InferenceRouter — Multi-Provider LLM Inference
 *
 * Routes Brittney chat requests to the best available inference provider.
 * 
 * Tiers:
 *   - pro:      Kimi K2.5 (1T MoE, 32B active) — advanced reasoning, vision, agentic
 *   - standard: Fireworks (Qwen2.5-Coder-7B fine-tuned) — fast, cheap, code-optimized
 *   - fallback: Together AI, Ollama (local dev)
 *
 * All providers implement the same InferenceProvider interface and return
 * an async generator of SSE-compatible events.
 *
 * ── Dogfooding @holoscript/llm-provider ──────────────────────────────────────
 * The stream-parsing primitives are NO LONGER hand-rolled here. The hosted
 * OpenAI-compatible providers (Fireworks, Kimi, Together, Fleet) delegate to the
 * package's `OpenAICompatibleAdapter`, and the Ollama provider delegates to the
 * package's `LocalLLMAdapter`. Both speak the package's `LLMStreamChunk`
 * discriminated union internally; the public stream of THIS module stays the
 * legacy `StreamEvent {type,payload}` wire contract via a shim
 * (`streamChunksToStreamEvents`). server.ts and the package's
 * `BrittneyCloudAdapter` parse `StreamEvent` exactly — that contract is
 * unchanged. All `LLMStreamChunk` usage is INTERNAL, behind the shim.
 */

import {
  OpenAICompatibleAdapter,
  createLocalLLMProvider,
  type LLMStreamChunk,
  type LLMMessage,
  type LLMCompletionRequest,
  type ToolSpec,
} from '@holoscript/llm-provider';
import { logger } from '../utils/logger';

// ============================================================================
// Types (PUBLIC WIRE CONTRACT — server.ts + brittney-cloud.ts depend on these)
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  sceneContext?: string;
  tools?: ToolDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tier?: 'pro' | 'standard';
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface StreamEvent {
  type: 'text' | 'tool_call' | 'error' | 'done';
  payload: unknown;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface InferenceProvider {
  name: string;
  stream(request: ChatRequest): AsyncGenerator<StreamEvent>;
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Brittney System Prompt
// ============================================================================

const BRITTNEY_SYSTEM_PROMPT = `You are Brittney, the AI Scene Director for HoloScript Studio — a Unity-like spatial editor for HoloScript scenes.

Your role:
- Help users build, edit, and refine their 3D scenes using natural language
- Apply traits (behaviors) to scene objects by calling the provided tools
- Explain what you're doing in a friendly, concise way
- When a user says something vague, pick the most logical interpretation and state what you did

HoloScript trait system:
- Traits are behaviors attached to objects: @physics, @ai_npc, @glow, @gaussian_splat, @llm_agent, etc.
- You compose them: "@HoverCar = @physics + @vehicle + @hover_vehicle"
- Every change you make is immediately visible in the scene

Rules:
- Always use tools to make changes — never just describe what you would do
- After calling a tool, briefly confirm in 1-2 sentences what happened
- If you need more info (e.g. which object to modify), ask once concisely
- Match the user's energy: casual and fast if they're fast, detailed if they ask for it
- Never apologize excessively or pad your responses`;

// ============================================================================
// Shims — ChatRequest ⇄ package types ; LLMStreamChunk → StreamEvent
// ============================================================================

/**
 * Build the system prompt for a request, folding in the optional scene context.
 */
function buildSystemPrompt(request: ChatRequest): string {
  return request.sceneContext
    ? `${BRITTNEY_SYSTEM_PROMPT}\n\nCurrent scene:\n${request.sceneContext}`
    : BRITTNEY_SYSTEM_PROMPT;
}

/**
 * Map the router's `ToolDefinition` (OpenAI function shape, `parameters`) to
 * the package's `ToolSpec` (`input_schema`). The package adapters re-emit the
 * OpenAI function shape on the wire, so this is a lossless round-trip.
 */
function toolDefinitionsToToolSpecs(tools: ToolDefinition[] | undefined): ToolSpec[] {
  if (!tools || tools.length === 0) return [];
  return tools.map((t) => {
    const params = t.function.parameters ?? {};
    const properties =
      (params.properties as Record<string, unknown> | undefined) ??
      (params as Record<string, unknown>);
    const required = (params as { required?: unknown }).required;
    return {
      name: t.function.name,
      description: t.function.description,
      input_schema: {
        type: 'object' as const,
        properties,
        ...(Array.isArray(required) ? { required: required as string[] } : {}),
      },
    };
  });
}

/**
 * Build a package `LLMCompletionRequest` from the router's `ChatRequest`,
 * prepending the Brittney system prompt (+ scene context).
 */
function toCompletionRequest(request: ChatRequest, defaultMaxTokens = 2048): LLMCompletionRequest {
  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt(request) },
    ...request.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = toolDefinitionsToToolSpecs(request.tools);
  return {
    messages,
    temperature: request.temperature ?? 0.7,
    maxTokens: request.maxTokens ?? defaultMaxTokens,
    stream: true,
    ...(tools.length > 0 ? { tools } : {}),
  };
}

/**
 * THE WIRE-CONTRACT SHIM. Translate the package's internal `LLMStreamChunk`
 * discriminated union back to the router's public `StreamEvent {type,payload}`.
 *
 * Mapping (mirrors the legacy hand-rolled parseOpenAIStream/Ollama output):
 *   text_delta            → { type:'text',      payload: <text> }
 *   tool_use_end          → { type:'tool_call', payload: { name, arguments } }
 *   message_stop (error)  → { type:'error', payload } then { type:'done' }
 *   message_stop (other)  → { type:'done',      payload: null }
 *
 * `tool_use_start` and `tool_use_input_delta` are intentionally SUPPRESSED —
 * the legacy contract only ever emitted a single `tool_call` event carrying the
 * fully-accumulated arguments (emitted here on `tool_use_end`). Tool names are
 * tracked across chunks so `tool_use_end` (which carries only the id + parsed
 * input) can be paired back to its name.
 */
async function* streamChunksToStreamEvents(
  chunks: AsyncIterable<LLMStreamChunk>,
): AsyncGenerator<StreamEvent> {
  const toolNamesById = new Map<string, string>();
  let emittedDone = false;

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case 'text_delta':
        if (chunk.text) yield { type: 'text', payload: chunk.text };
        break;
      case 'tool_use_start':
        toolNamesById.set(chunk.id, chunk.name);
        break;
      case 'tool_use_input_delta':
        // Suppressed — accumulation happens inside the adapter; the legacy
        // contract only emits the final tool_call.
        break;
      case 'tool_use_end':
        yield {
          type: 'tool_call',
          payload: {
            name: toolNamesById.get(chunk.id) ?? 'unknown',
            arguments: chunk.input,
          },
        };
        break;
      case 'message_stop':
        if (chunk.finishReason === 'error') {
          yield { type: 'error', payload: 'Inference stream error' };
        }
        yield { type: 'done', payload: null };
        emittedDone = true;
        break;
    }
  }

  // Defensive: a stream that ends without a message_stop still terminates the
  // SSE wire with a `done` so the client doesn't hang.
  if (!emittedDone) yield { type: 'done', payload: null };
}

/**
 * Drive a package adapter's `streamCompletion` through the wire-contract shim,
 * converting any pre-flight throw (auth / 429 / network) into the legacy
 * error+done event pair instead of propagating the exception. Each provider's
 * `stream()` delegates here so error handling matches the old per-provider
 * behavior exactly.
 */
async function* streamViaAdapter(
  providerLabel: string,
  run: () => AsyncIterable<LLMStreamChunk>,
): AsyncGenerator<StreamEvent> {
  let iterable: AsyncIterable<LLMStreamChunk>;
  try {
    iterable = run();
  } catch (err) {
    yield { type: 'error', payload: `${providerLabel} error: ${err instanceof Error ? err.message : String(err)}` };
    yield { type: 'done', payload: null };
    return;
  }
  try {
    yield* streamChunksToStreamEvents(iterable);
  } catch (err) {
    // streamCompletion may throw a terminal error AFTER yielding message_stop;
    // the shim already emitted `done` in that case, but a pre-first-chunk throw
    // lands here. Emit the legacy error pair.
    yield { type: 'error', payload: `${providerLabel} error: ${err instanceof Error ? err.message : String(err)}` };
    yield { type: 'done', payload: null };
  }
}

// ============================================================================
// Fireworks AI Provider (thin wrapper over OpenAICompatibleAdapter)
// ============================================================================

class FireworksProvider implements InferenceProvider {
  name = 'fireworks';
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.FIREWORKS_API_KEY || '';
    this.model = process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/llama-v3p1-8b-instruct';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'https://api.fireworks.ai/inference/v1',
      apiKey: this.apiKey,
      model: this.model,
    });
    const model = request.model || this.model;
    yield* streamViaAdapter('Fireworks', () =>
      adapter.streamCompletion(toCompletionRequest(request, 2048), model),
    );
  }
}

// ============================================================================
// Kimi K2.5 Provider (Brittney Pro — via Fireworks serverless)
// ============================================================================

class KimiProvider implements InferenceProvider {
  name = 'kimi';
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.FIREWORKS_API_KEY || '';
    this.model = process.env.KIMI_MODEL || 'accounts/fireworks/models/kimi-k2p5';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    // Kimi K2.5 is served through Fireworks API (same OpenAI-compatible endpoint).
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'https://api.fireworks.ai/inference/v1',
      apiKey: this.apiKey,
      model: this.model,
    });
    const model = request.model || this.model;
    yield* streamViaAdapter('Kimi K2.5', () =>
      adapter.streamCompletion(toCompletionRequest(request, 4096), model),
    );
  }
}

// ============================================================================
// Together AI Provider (thin wrapper over OpenAICompatibleAdapter)
// ============================================================================

class TogetherProvider implements InferenceProvider {
  name = 'together';
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.TOGETHER_API_KEY || '';
    this.model = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.1-8B-Instruct-Turbo';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const adapter = new OpenAICompatibleAdapter({
      baseURL: 'https://api.together.xyz/v1',
      apiKey: this.apiKey,
      model: this.model,
    });
    const model = request.model || this.model;
    yield* streamViaAdapter('Together', () =>
      adapter.streamCompletion(toCompletionRequest(request, 2048), model),
    );
  }
}

// ============================================================================
// Ollama Provider (local dev — delegates to package LocalLLMAdapter)
// ============================================================================

// Ollama is a localhost-only local-dev runtime by design; OLLAMA_URL overrides
// the default for any non-default deployment. This is the local-dev tier,
// distinct from the hosted (https://) providers above.
const OLLAMA_DEFAULT_URL = 'http://' + 'localhost:11434';

class OllamaLocalProvider implements InferenceProvider {
  name = 'ollama';
  private url: string;
  private model: string;

  constructor() {
    this.url = process.env.OLLAMA_URL || OLLAMA_DEFAULT_URL;
    this.model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    // LocalLLMAdapter.streamCompletion hits Ollama's native /api/chat (NDJSON)
    // and yields LLMStreamChunk — the same shape the shim expects.
    const adapter = createLocalLLMProvider({ baseURL: this.url, model: this.model });
    const model = request.model || this.model;
    yield* streamViaAdapter('Ollama', () =>
      adapter.streamCompletion(toCompletionRequest(request, 2048), model),
    );
  }
}

// ============================================================================
// Fleet Provider (self-hosted vast.ai serving tier — OpenAI-compatible)
//
// Self-hosted serving behind the scale-to-zero autoscaler (P.004/P.005). Two
// operating modes:
//   - DYNAMIC (FLEET_REGISTRY_URL set): the box IP changes every cold start, so
//     the URL is resolved per-request from the orchestrator serving registry
//     (GET /serve/resolve?model=). That call ALSO records demand — which is what
//     wakes the autoscaler. A cold model => isAvailable() false => router fails
//     closed to the managed provider while the autoscaler warms a box for the
//     next request. Once warm, resolve returns the live url and the box serves.
//   - STATIC (FLEET_PROVIDER_URL set): a manually-pinned box (no registry).
// DORMANT by default: neither env set => isAvailable() false, router unaffected.
// Either mode fails CLOSED on a preempted/dead endpoint. Set BRITTNEY_PROVIDER=
// fleet to PREFER the cheap self-hosted box when warm (the P.005 cost win).
// ============================================================================

export class FleetProvider implements InferenceProvider {
  name = 'fleet';
  private staticUrl: string;
  private registryUrl: string;
  private registryKey: string;
  private model: string;
  // Last resolved data-plane URL (direct router->vLLM). Set by isAvailable()
  // before each stream(); the router always calls isAvailable() first.
  private url = '';

  // Shared serving key — sent as a Bearer token to the vLLM box, which the
  // autoscaler launched with --api-key <same key> so the public endpoint isn't
  // an open LLM. Empty => no Authorization header (unauthenticated box / dev).
  private inferenceKey: string;

  constructor() {
    this.staticUrl = process.env.FLEET_PROVIDER_URL || '';
    this.registryUrl = (process.env.FLEET_REGISTRY_URL || '').replace(/\/$/, '');
    this.registryKey = process.env.FLEET_REGISTRY_KEY || process.env.HOLOSCRIPT_API_KEY || '';
    this.inferenceKey = process.env.FLEET_INFERENCE_KEY || '';
    this.model = process.env.FLEET_MODEL || 'Qwen/Qwen2.5-Coder-7B-Instruct';
  }

  // Resolve the data-plane URL: a static pin wins; otherwise ask the registry
  // for a warm endpoint (which also bumps demand → wakes the autoscaler).
  // Returns '' when dormant or cold (caller fails closed).
  private async resolveUrl(): Promise<string> {
    if (this.staticUrl) return this.staticUrl;
    if (!this.registryUrl) return ''; // dormant
    try {
      const res = await fetch(
        `${this.registryUrl}/serve/resolve?model=${encodeURIComponent(this.model)}`,
        { headers: { 'x-mcp-api-key': this.registryKey }, signal: AbortSignal.timeout(4000) },
      );
      if (!res.ok) return '';
      const body = (await res.json()) as { status?: string; url?: string };
      return body.status === 'warm' && body.url ? body.url : '';
    } catch {
      return '';
    }
  }

  async isAvailable(): Promise<boolean> {
    // Resolve (static pin or registry). Cold/dormant → fail closed; demand was
    // already recorded by resolveUrl() so the autoscaler can warm a box.
    const url = await this.resolveUrl();
    if (!url) {
      this.url = '';
      return false;
    }
    // Fast health check — a preempted/dead node fails closed here so the router
    // falls through to the serverless provider. (The autoscaler health-checks
    // before registering, but a box can die between ticks.)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        if (!res.ok) {
          // Some OpenAI-compatible servers (e.g. vLLM) expose /v1/models, not /health.
          const models = await fetch(`${url}/v1/models`, { signal: controller.signal });
          if (!models.ok) return false;
        }
        this.url = url;
        return true;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    // The router calls isAvailable() first (which sets this.url); resolve
    // defensively if called directly so we never POST to a relative URL.
    if (!this.url) this.url = await this.resolveUrl();
    if (!this.url) {
      yield { type: 'error', payload: 'Fleet error: no warm endpoint (cold/dormant)' };
      yield { type: 'done', payload: null };
      return;
    }

    // Delegate ONLY the stream to the package adapter, pointed at the resolved
    // data-plane url. vLLM serves at ${url}/v1/chat/completions, so the adapter
    // baseURL is `${this.url}/v1`. The shared serving key (if any) rides as the
    // adapter's Bearer apiKey — the same gate the old hand-rolled path used.
    const adapter = new OpenAICompatibleAdapter({
      baseURL: `${this.url}/v1`,
      apiKey: this.inferenceKey,
      model: this.model,
    });
    const model = request.model || this.model;
    yield* streamViaAdapter('Fleet', () =>
      adapter.streamCompletion(toCompletionRequest(request, 2048), model),
    );
  }
}

// ============================================================================
// InferenceRouter
// ============================================================================

export class InferenceRouter {
  private providers: InferenceProvider[];
  private proProvider: InferenceProvider;
  private preferredProvider: string;

  constructor() {
    this.preferredProvider = process.env.BRITTNEY_PROVIDER || 'fireworks';
    this.proProvider = new KimiProvider();
    this.providers = [
      new FireworksProvider(),
      new FleetProvider(),
      new TogetherProvider(),
      new OllamaLocalProvider(),
    ];
  }

  /**
   * Stream a chat response, routing by tier
   *   - pro:      Kimi K2.5 (falls back to standard if unavailable)
   *   - standard: preferred provider → any available
   */
  async *chat(request: ChatRequest): AsyncGenerator<StreamEvent> {
    // Pro tier: route to Kimi K2.5
    if (request.tier === 'pro') {
      if (await this.proProvider.isAvailable()) {
        logger.info(`[InferenceRouter] Pro tier → ${this.proProvider.name}`);
        yield* this.proProvider.stream(request);
        return;
      }
      logger.warn(`[InferenceRouter] Pro tier unavailable, falling back to standard`);
    }

    // Standard tier: try preferred provider first
    const preferred = this.providers.find(p => p.name === this.preferredProvider);
    if (preferred && await preferred.isAvailable()) {
      logger.info(`[InferenceRouter] Using ${preferred.name}`);
      yield* preferred.stream(request);
      return;
    }

    // Try any available provider
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        logger.info(`[InferenceRouter] Falling back to ${provider.name}`);
        yield* provider.stream(request);
        return;
      }
    }

    yield { type: 'error', payload: 'No inference provider available. Set FIREWORKS_API_KEY, TOGETHER_API_KEY, or start Ollama.' };
    yield { type: 'done', payload: null };
  }

  /**
   * Get status of all providers including pro tier
   */
  async getStatus(): Promise<{ provider: string; available: boolean; tier: string }[]> {
    const results: { provider: string; available: boolean; tier: string }[] = [
      { provider: this.proProvider.name, available: await this.proProvider.isAvailable(), tier: 'pro' },
    ];
    for (const p of this.providers) {
      results.push({ provider: p.name, available: await p.isAvailable(), tier: 'standard' });
    }
    return results;
  }

  getPreferredProvider(): string {
    return this.preferredProvider;
  }
}
