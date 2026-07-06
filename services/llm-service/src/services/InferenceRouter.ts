/**
 * InferenceRouter — Multi-Provider LLM Inference
 *
 * Routes Brittney chat requests to the best available inference provider.
 * 
 * Tiers (how much capability/cost):
 *   - pro:      Kimi K2.5 (1T MoE, 32B active) — advanced reasoning, vision, agentic
 *   - standard: Fireworks (llama-v3p1-8b-instruct default, override via FIREWORKS_MODEL) — fast, cheap
 *   - fallback: Together AI, Ollama (local dev)
 *
 * Lanes (what kind of work — task-type modulation, see "Lane Routing" below):
 *   - operator / code / vision / reasoning, with opt-in per-lane model overrides
 *     via BRITTNEY_LANE_<LANE>_MODEL env vars.
 *
 * All providers implement the same InferenceProvider interface and return
 * an async generator of SSE-compatible events.
 *
 * ── Dogfooding @holoscript/llm-provider ──────────────────────────────────────
 * The stream-parsing primitives are NO LONGER hand-rolled here. The hosted
 * OpenAI-compatible providers (Fireworks, Kimi, Together) delegate to the
 * package's `OpenAICompatibleAdapter`, Fleet delegates to `VastServerlessAdapter`,
 * and the Ollama provider delegates to the package's `LocalLLMAdapter`. All speak the package's `LLMStreamChunk`
 * discriminated union internally; the public stream of THIS module stays the
 * legacy `StreamEvent {type,payload}` wire contract via a shim
 * (`streamChunksToStreamEvents`). server.ts and the package's
 * `BrittneyCloudAdapter` parse `StreamEvent` exactly — that contract is
 * unchanged. All `LLMStreamChunk` usage is INTERNAL, behind the shim.
 */

import {
  OpenAICompatibleAdapter,
  VastServerlessAdapter,
  FLEET_DEFAULT_MODEL,
  createLocalLLMProvider,
  LOCAL_DEFAULT_MODEL,
  type LLMStreamChunk,
  type LLMMessage,
  type LLMCompletionRequest,
  type ToolSpec,
} from '@holoscript/llm-provider';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types (PUBLIC WIRE CONTRACT — server.ts + brittney-cloud.ts depend on these)
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Task lane — what KIND of work this request is, independent of cost tier.
 * Lanes map intent to the model best suited for it (multi-lane model strategy,
 * ai-ecosystem research/2026-05-13 + EXP-1 router-bench):
 *   - operator:  conversation / status / HoloShell state routing (fast small model)
 *   - code:      HoloScript generation, repair, tool-call drafting (code specialist)
 *   - vision:    screenshot / visual state extraction (vision-capable model)
 *   - reasoning: hard source-wide reasoning (pro tier by default)
 */
export type BrittneyLane = 'operator' | 'code' | 'vision' | 'reasoning';

export const BRITTNEY_LANES: readonly BrittneyLane[] = ['operator', 'code', 'vision', 'reasoning'];

export interface ChatRequest {
  messages: ChatMessage[];
  sceneContext?: string;
  tools?: ToolDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tier?: 'pro' | 'standard';
  lane?: BrittneyLane;
  onTelemetry?: (telemetry: InferenceTelemetry) => void;
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

export interface InferenceTelemetry {
  provider: string;
  endpoint?: string;
  model?: string;
  requestId?: string;
  usage?: UsageInfo;
  responseHeaders?: Record<string, string>;
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

interface StreamTelemetryContext {
  provider: string;
  endpoint?: string;
  model?: string;
  onTelemetry?: (telemetry: InferenceTelemetry) => void;
}

function emitTelemetry(
  callback: ((telemetry: InferenceTelemetry) => void) | undefined,
  telemetry: InferenceTelemetry
): void {
  if (!callback) return;
  try {
    callback(telemetry);
  } catch (err) {
    logger.warn(
      `[InferenceRouter] telemetry callback failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
  telemetry?: StreamTelemetryContext,
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
        if (telemetry) {
          emitTelemetry(telemetry.onTelemetry, {
            provider: telemetry.provider,
            endpoint: telemetry.endpoint,
            model: chunk.model ?? telemetry.model,
            requestId: chunk.requestId,
            usage: chunk.usage,
            responseHeaders: chunk.responseHeaders,
          });
        }
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
  telemetry?: StreamTelemetryContext,
): AsyncGenerator<StreamEvent> {
  let iterable: AsyncIterable<LLMStreamChunk>;
  try {
    if (telemetry) {
      emitTelemetry(telemetry.onTelemetry, {
        provider: telemetry.provider,
        endpoint: telemetry.endpoint,
        model: telemetry.model,
      });
    }
    iterable = run();
  } catch (err) {
    yield { type: 'error', payload: `${providerLabel} error: ${err instanceof Error ? err.message : String(err)}` };
    yield { type: 'done', payload: null };
    return;
  }
  try {
    yield* streamChunksToStreamEvents(iterable, telemetry);
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
      {
        provider: this.name,
        endpoint: 'https://api.fireworks.ai/inference/v1',
        model,
        onTelemetry: request.onTelemetry,
      },
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
      {
        provider: this.name,
        endpoint: 'https://api.fireworks.ai/inference/v1',
        model,
        onTelemetry: request.onTelemetry,
      },
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
      {
        provider: this.name,
        endpoint: 'https://api.together.xyz/v1',
        model,
        onTelemetry: request.onTelemetry,
      },
    );
  }
}

// ============================================================================
// HoloLLama local compatibility provider (delegates to package LocalLLMAdapter)
// ============================================================================

// The compatibility endpoint is localhost-only by default; OLLAMA_URL overrides
// the default for any non-default deployment. This is the HoloLLama local tier,
// distinct from the hosted providers above.
const OLLAMA_DEFAULT_URL = 'http://' + 'localhost:11434';

class OllamaLocalProvider implements InferenceProvider {
  name = 'ollama';
  private url: string;
  private model: string;

  constructor() {
    this.url = process.env.OLLAMA_URL || OLLAMA_DEFAULT_URL;
    this.model = process.env.OLLAMA_MODEL || LOCAL_DEFAULT_MODEL;
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
      {
        provider: this.name,
        endpoint: this.url,
        model,
        onTelemetry: request.onTelemetry,
      },
    );
  }
}

// ============================================================================
// Fleet Provider (Vast serverless sovereign serving)
//
// Vast serverless is not plain OpenAI-at-a-URL. The route call wakes/resolves
// a worker, then the worker call carries Vast's auth_data envelope around the
// OpenAI-compatible payload. `isAvailable()` performs a single route probe:
// ready worker => fleet available. Cold/not-ready status normally falls through
// to managed providers, unless cold-start waiting is explicitly enabled for the
// deployment; route/auth/deleted-endpoint errors still report unavailable.
// ============================================================================

function positiveEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function truthyEnv(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || '').trim());
}

export class FleetProvider implements InferenceProvider {
  name = 'fleet';
  private apiKey: string;
  private endpointName: string;
  private model: string;
  private cost: number;
  private maxWaitS: number;
  private pollIntervalMs: number;
  private waitForColdStart: boolean;

  constructor() {
    this.apiKey = process.env.VAST_API_KEY || '';
    this.endpointName =
      process.env.FLEET_PROVIDER_ENDPOINT || process.env.VAST_QWEN_ENDPOINT_NAME || 'holoscript-qwen-coder';
    this.model = process.env.FLEET_MODEL || process.env.VAST_QWEN_MODEL || FLEET_DEFAULT_MODEL;
    this.cost = positiveEnvNumber('VAST_SERVERLESS_COST', 100);
    this.maxWaitS = nonNegativeEnvNumber('VAST_SERVERLESS_MAX_WAIT_S', 540);
    this.pollIntervalMs = positiveEnvNumber('VAST_SERVERLESS_POLL_INTERVAL_MS', 10_000);
    this.waitForColdStart =
      String(process.env.BRITTNEY_PROVIDER || '').trim().toLowerCase() === this.name ||
      truthyEnv('VAST_SERVERLESS_WAIT_FOR_COLD_START') ||
      truthyEnv('FLEET_WAIT_FOR_COLD_START');
  }

  private createAdapter(maxWaitS = this.maxWaitS): VastServerlessAdapter {
    return new VastServerlessAdapter({
      apiKey: this.apiKey,
      endpointName: this.endpointName,
      model: this.model,
      cost: this.cost,
      maxWaitS,
      pollIntervalMs: this.pollIntervalMs,
    });
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    const health = await this.createAdapter(0).healthCheck();
    if (health.ok) return true;
    const error = health.error || '';
    return this.waitForColdStart &&
      /no worker became READY/i.test(error) &&
      !/latest route status:\s*no status/i.test(error);
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    if (!this.apiKey) {
      yield { type: 'error', payload: 'Fleet error: VAST_API_KEY is not configured' };
      yield { type: 'done', payload: null };
      return;
    }

    const adapter = this.createAdapter();
    const model = request.model || this.model;
    yield* streamViaAdapter('Fleet', () =>
      adapter.streamCompletion(toCompletionRequest(request, 2048), model),
      {
        provider: this.name,
        endpoint: `vast-serverless:${this.endpointName}`,
        model,
        onTelemetry: request.onTelemetry,
      },
    );
  }
}

// ============================================================================
// Lane Routing — task-type modulation
// ============================================================================
//
// Tiers answer "how much capability/cost?"; lanes answer "what kind of work?".
// A request's lane selects the model best suited for the task, per the
// multi-lane strategy (ai-ecosystem research/2026-05-13) and the EXP-1
// router-bench finding that small models have complementary strengths.
//
// Backward-compatible by construction:
//   - Lane → model overrides come ONLY from env (BRITTNEY_LANE_<LANE>_MODEL).
//     No lane env set + no explicit lane on the request = byte-identical routing.
//   - An explicit request.model always wins over a lane override.
//   - Tier promotion (vision/reasoning → pro) fires ONLY for an EXPLICIT
//     request.lane, never from heuristic detection — heuristics must not move
//     a request onto a more expensive tier on their own.

const LANE_MODEL_ENV: Record<BrittneyLane, string> = {
  operator: 'BRITTNEY_LANE_OPERATOR_MODEL',
  code: 'BRITTNEY_LANE_CODE_MODEL',
  vision: 'BRITTNEY_LANE_VISION_MODEL',
  reasoning: 'BRITTNEY_LANE_REASONING_MODEL',
};

const VISION_HINT =
  /\b(screenshot|screen\s*shot|what(?:'s| is) on (?:my|the) screen|this image|attached image)\b/i;

// A short tool-less turn is operator traffic (status/conversation); anything
// tool-bearing is scene/code work. Threshold is conservative — misclassifying
// operator→code costs nothing (code is the current default for everything).
const OPERATOR_MAX_CHARS = 280;

/**
 * Resolve the lane for a request. An explicit `request.lane` always wins;
 * otherwise a conservative heuristic classifies the request.
 */
export function detectLane(request: ChatRequest): BrittneyLane {
  if (request.lane) return request.lane;
  const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
  const text = lastUser?.content ?? '';
  if (VISION_HINT.test(text)) return 'vision';
  if (request.tools && request.tools.length > 0) return 'code';
  if (text.length > 0 && text.length <= OPERATOR_MAX_CHARS) return 'operator';
  return 'code';
}

/**
 * Apply lane routing to a request: resolve the lane, promote explicitly-laned
 * vision/reasoning requests to the pro tier (Kimi K2.5 is the only
 * vision-capable provider; standard fallback still applies if pro is down),
 * and apply the env-configured per-lane model override.
 */
export function applyLaneRouting(request: ChatRequest): { request: ChatRequest; lane: BrittneyLane } {
  const lane = detectLane(request);
  const next: ChatRequest = { ...request, lane };

  if (request.lane && (lane === 'vision' || lane === 'reasoning') && !request.tier) {
    next.tier = 'pro';
  }

  const envModel = process.env[LANE_MODEL_ENV[lane]];
  if (envModel && !request.model) {
    next.model = envModel;
  }

  return { request: next, lane };
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
   * Stream a chat response, routing by lane (what kind of work) then tier
   * (how much capability/cost):
   *   - lane:     env-configured per-lane model override (see applyLaneRouting)
   *   - pro:      Kimi K2.5 (falls back to standard if unavailable)
   *   - standard: preferred provider → any available
   */
  async *chat(rawRequest: ChatRequest): AsyncGenerator<StreamEvent> {
    const { request, lane } = applyLaneRouting(rawRequest);

    // Pro tier: route to Kimi K2.5
    if (request.tier === 'pro') {
      if (await this.proProvider.isAvailable()) {
        logger.info(`[InferenceRouter] lane=${lane} pro tier → ${this.proProvider.name}`);
        yield* this.proProvider.stream(request);
        return;
      }
      logger.warn(`[InferenceRouter] Pro tier unavailable, falling back to standard`);
    }

    // Standard tier: try preferred provider first
    const preferred = this.providers.find(p => p.name === this.preferredProvider);
    if (preferred && await preferred.isAvailable()) {
      logger.info(`[InferenceRouter] lane=${lane} → ${preferred.name}`);
      yield* preferred.stream(request);
      return;
    }

    // Try any available provider
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        logger.info(`[InferenceRouter] lane=${lane} falling back to ${provider.name}`);
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
