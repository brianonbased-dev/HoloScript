/**
 * LLM Client for HoloScript MCP Server — Cloud-First
 *
 * Auto-detects the best available provider from env vars:
 *   1. 'openrouter'  — OpenRouter (preferred, best model routing)
 *   2. 'anthropic'   — Anthropic Claude API direct
 *   3. 'openai'      — OpenAI API
 *   4. 'local'       — our own local model server (fallback only): HoloServe when
 *                      HOLOSERVE_URL is set, else HoloLlama when HOLOLLAMA_URL is set, else
 *                      nothing (queryOllama returns null). Resolved by
 *                      resolveOwnedLocalProvider in @holoscript/llm-provider.
 *
 * Override with LLM_PROVIDER env var. Auto-detect runs if not set.
 *
 * Ollama (D.117): HoloLlama replaced Ollama on the owned machines on 2026-07-05, so the
 * no-key default no longer reads OLLAMA_URL; a leftover OLLAMA_* only gets a one-line
 * notice from the resolver. LLM_PROVIDER=ollama still reaches OLLAMA_URL, because naming it
 * is a deliberate foreign choice, and a hosted Ollama or a cloud-tagged model is still
 * refused there unless HOLO_ALLOW_HOSTED_OLLAMA=1. LLM_PROVIDER=hybrid-gemma is the same
 * kind of choice: its edge half is Gemma on local Ollama by definition (see queryOllama).
 *
 * Migrated (B1c) from inline fetch() calls to @holoscript/llm-provider
 * adapters which inherit withRetry from BaseLLMAdapter — exponential
 * backoff + Retry-After honoring on 429/5xx.
 *
 * Used by brittney-lite.ts and hololand-mcp-tools.ts, with graceful fallback to
 * rule-based logic when unavailable.
 */

import {
  AnthropicAdapter,
  OpenAIAdapter,
  OpenRouterAdapter,
  LocalLLMAdapter,
  LOCAL_DEFAULT_MODEL,
  checkHostedOllama,
  resolveOwnedLocalProvider,
  type ResolvedSovereignProvider,
} from '@holoscript/llm-provider';
import { resolveServiceSecret } from './holokey-resolver';

type LLMProviderName = 'hybrid-gemma' | 'openrouter' | 'anthropic' | 'openai' | 'ollama' | 'local';

const PROVIDER_NAMES: readonly LLMProviderName[] = [
  'hybrid-gemma',
  'openrouter',
  'anthropic',
  'openai',
  'ollama',
  'local',
];

function detectProvider(): LLMProviderName {
  const explicit = process.env.LLM_PROVIDER as LLMProviderName;
  if (explicit && PROVIDER_NAMES.includes(explicit)) return explicit;
  // Auto-detect from available keys
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'local';
}

const LLM_PROVIDER: LLMProviderName = detectProvider();

// ── OpenRouter config ───────────────────────────────────────────────────────
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';

// ── Anthropic config ─────────────────────────────────────────────────────────
// Use the alias (auto-resolves to latest pinned build) not the date-suffixed ID.
// Haiku is the right default here — this is a fallback path for cheap/fast calls.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

// ── OpenAI config ────────────────────────────────────────────────────────────
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ── Ollama config (explicit LLM_PROVIDER=ollama, and hybrid-gemma's edge half) ──
const OLLAMA_URL = process.env.OLLAMA_URL || ''; // empty means disabled
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || LOCAL_DEFAULT_MODEL;
const OLLAMA_CALLER = 'mcp-server ollama-client';

// ── Owned local model config (the no-key default) ─────────────────────────────
const LOCAL_CALLER = 'mcp-server local fallback';

// ── Gemma 4 Hybrid Routing config ────────────────────────────────────────────
// hybrid-gemma stays Ollama-edge by definition: naming it is an explicit Ollama choice, so
// its edge half uses OLLAMA_URL behind #384's hosted check, never our own HoloServe /
// HoloLlama. Each half passes its GEMMA_*_MODEL to the adapter as the model argument.
const GEMMA_EDGE_MODEL = process.env.GEMMA_EDGE_MODEL || 'gemma4:e4b';
// OpenRouter's id carries -it. 'google/gemma-4-31b' is not a model there (its /api/v1/models,
// 2026-09-28); that went unseen while no GEMMA_*_MODEL reached the wire.
const GEMMA_CLOUD_MODEL = process.env.GEMMA_CLOUD_MODEL || 'google/gemma-4-31b-it';

const LLM_TIMEOUT = 60_000; // 60s for generation

/** HoloScript-specific system prompt for model calls */
export const HOLOSCRIPT_SYSTEM_PROMPT = `You are Brittney, an expert HoloScript assistant. Follow these rules strictly:

1. Output ONLY raw HoloScript code when asked to generate code — no markdown fences, no backticks, no explanations unless explicitly asked.
2. Use geometry: (never type:) for shapes. Valid geometries: sphere, cube, cylinder, cone, plane, torus, ring, capsule, model, custom, text.
3. Always quote object names: object "Name" { ... }
4. Use negative z values for object visibility: position: [0, 1, -3]
5. Wrap scenes in composition "Name" { ... }
6. Only use canonical @traits. Common traits: @grabbable, @collidable, @physics, @glowing, @networked, @floating, @animated, @clickable, @hoverable, @draggable, @throwable, @spatial_audio, @teleport, @portal, @lod, @billboard, @particle_system, @sculpt_volume, @printable, @iot_bridge, @digital_twin, @collaborative_sculpt.
7. Never emit [Think], [/Think], or other meta-blocks.
8. For .hsplus files, use orb syntax: orb Name { ... }
9. For .holo files, always include composition wrapper with environment block.`;

// =============================================================================
// ADAPTER INSTANCES (lazy-initialized, reuse across calls)
// =============================================================================

let _anthropicAdapter: AnthropicAdapter | null = null;
let _openaiAdapter: OpenAIAdapter | null = null;
let _openrouterAdapter: OpenRouterAdapter | null = null;
let _ollamaAdapter: LocalLLMAdapter | null = null;

// Adapter key resolution (Phase 2): prefer the HoloKey vault value, else the module-level
// env const. Resolved ONCE at adapter construction and cached with the adapter — no per-call
// DB hit on the hot path. Fully fallback-safe: vault off / key not in vault → the env const.
async function getAnthropicAdapter(): Promise<AnthropicAdapter | null> {
  if (_anthropicAdapter) return _anthropicAdapter;
  const apiKey = await resolveServiceSecret('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  _anthropicAdapter = new AnthropicAdapter({
    apiKey,
    defaultModel: ANTHROPIC_MODEL,
    timeoutMs: LLM_TIMEOUT,
  });
  return _anthropicAdapter;
}

async function getOpenAIAdapter(): Promise<OpenAIAdapter | null> {
  if (_openaiAdapter) return _openaiAdapter;
  const apiKey = await resolveServiceSecret('OPENAI_API_KEY');
  if (!apiKey) return null;
  _openaiAdapter = new OpenAIAdapter({
    apiKey,
    defaultModel: OPENAI_MODEL,
    timeoutMs: LLM_TIMEOUT,
  });
  return _openaiAdapter;
}

async function getOpenRouterAdapter(): Promise<OpenRouterAdapter | null> {
  if (_openrouterAdapter) return _openrouterAdapter;
  const apiKey = await resolveServiceSecret('OPENROUTER_API_KEY');
  if (!apiKey) return null;
  _openrouterAdapter = new OpenRouterAdapter({
    apiKey,
    defaultModel: OPENROUTER_MODEL,
    timeoutMs: LLM_TIMEOUT,
  });
  return _openrouterAdapter;
}

function getOllamaAdapter(): LocalLLMAdapter | null {
  if (!OLLAMA_URL) return null;
  if (!_ollamaAdapter) {
    _ollamaAdapter = new LocalLLMAdapter({
      baseURL: OLLAMA_URL,
      defaultModel: OLLAMA_MODEL,
      timeoutMs: LLM_TIMEOUT,
    });
  }
  return _ollamaAdapter;
}

/**
 * The model name the explicit Ollama path sends: the override (hybrid-gemma's
 * GEMMA_EDGE_MODEL) when there is one, else the adapter's own OLLAMA_MODEL. #384's hosted
 * check runs on exactly this name. It used to check OLLAMA_MODEL as well, because until
 * task_1790566904265_avh4 an override never reached the wire and OLLAMA_MODEL went instead.
 */
function ollamaModelSent(modelOverride?: string): string {
  return modelOverride || OLLAMA_MODEL;
}

/** #384's hosted-Ollama check for one model on OLLAMA_URL (a missing URL counts as refused). */
function isRefusedOllama(model: string): boolean {
  if (!OLLAMA_URL) return true;
  return Boolean(checkHostedOllama(OLLAMA_URL, { model, caller: OLLAMA_CALLER }).refused);
}

let _localResolveWarned = false;

/**
 * Our own local model: HoloServe when HOLOSERVE_URL is set, else HoloLlama when
 * HOLOLLAMA_URL is set, else null.
 *
 * Resolved on every call instead of cached like the adapters above. Resolution only reads
 * env (and the HoloServe parity-pin registry file, when one is configured) and builds a
 * stateless adapter: no network, no vault lookup, so caching would save nothing. Resolving
 * each time means a changed HOLOSERVE_URL / HOLOLLAMA_URL, or a newly landed parity pin,
 * takes effect on the next call without a restart.
 *
 * When the resolver refuses the configuration (a public or unparseable HOLOSERVE_URL /
 * HOLOLLAMA_URL, or a model parity-pinned to HoloServe) that counts as no local model:
 * null, one warning per process, and nothing is sent anywhere.
 */
function resolveLocalProvider(): ResolvedSovereignProvider | null {
  try {
    return resolveOwnedLocalProvider({ caller: LOCAL_CALLER, timeoutMs: LLM_TIMEOUT });
  } catch (err) {
    if (!_localResolveWarned) {
      _localResolveWarned = true;
      console.warn(
        `[mcp-server] local model unavailable: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  }
}

// =============================================================================
// PROVIDER IMPLEMENTATIONS (delegating to @holoscript/llm-provider adapters
// with withRetry from BaseLLMAdapter — exponential backoff + Retry-After)
// =============================================================================

async function queryOpenRouterProvider(
  prompt: string,
  system: string,
  modelOverride?: string
): Promise<string | null> {
  const adapter = await getOpenRouterAdapter();
  if (!adapter) return null;
  try {
    const result = await adapter.complete(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        maxTokens: 4096,
      },
      // The model is the second argument: LLMCompletionRequest has no model field, so an
      // override spread into the request reached no adapter (task_1790566904265_avh4).
      modelOverride
    );
    return result.content || null;
  } catch {
    return null;
  }
}

async function queryAnthropicProvider(prompt: string, system: string): Promise<string | null> {
  const adapter = await getAnthropicAdapter();
  if (!adapter) return null;
  try {
    const result = await adapter.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4096,
    });
    return result.content || null;
  } catch {
    return null;
  }
}

async function queryOpenAIProvider(prompt: string, system: string): Promise<string | null> {
  const adapter = await getOpenAIAdapter();
  if (!adapter) return null;
  try {
    const result = await adapter.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4096,
    });
    return result.content || null;
  } catch {
    return null;
  }
}

/** Explicit Ollama: LLM_PROVIDER=ollama, and hybrid-gemma's edge half. */
async function queryOllamaProvider(
  prompt: string,
  system: string,
  modelOverride?: string
): Promise<string | null> {
  const adapter = getOllamaAdapter();
  if (!adapter) return null;
  // A deliberate foreign choice is still not a hosted one: a hosted Ollama URL, or a
  // cloud-tagged model, is refused unless HOLO_ALLOW_HOSTED_OLLAMA=1.
  if (isRefusedOllama(ollamaModelSent(modelOverride))) return null;
  try {
    const result = await adapter.complete(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        maxTokens: 4096,
      },
      // The model is the second argument: LLMCompletionRequest has no model field, so an
      // override spread into the request reached no adapter (task_1790566904265_avh4).
      modelOverride
    );
    return result.content || null;
  } catch {
    return null;
  }
}

/** Our own local model (the no-key default). */
async function queryLocalProvider(prompt: string, system: string): Promise<string | null> {
  const local = resolveLocalProvider();
  if (!local) return null;
  try {
    const result = await local.provider.complete(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        maxTokens: local.maxTokens,
      },
      local.model
    );
    return result.content || null;
  } catch {
    return null;
  }
}

// =============================================================================
// PUBLIC API (backward-compatible — function name kept as queryOllama)
// =============================================================================

export interface RoutingOptions {
  requiresAudio?: boolean;
  requiresDeepReasoning?: boolean;
}

/**
 * Query the configured LLM provider.
 * Returns null if the provider is unavailable or the request fails.
 *
 * Auto-detects provider from env vars: OpenRouter → Anthropic → OpenAI → our own local
 * model (HoloServe / HoloLlama). Override with LLM_PROVIDER env var.
 */
// Phase-0 fleet telemetry: per-process in-flight gauge for the agent (hs_ai_*)
// inference path. The durable cross-process signal is the `[fleet-metric]` log
// line below (same format as services/llm-service + studio). This is the path
// agentic build-work over GitHub projects drives — likely the highest-volume
// source. Ref: research/2026-05-31_self-hosted-fleet-inference-plan.md.
let __mcpActive = 0;

export async function queryOllama(
  prompt: string,
  system?: string,
  options?: RoutingOptions
): Promise<string | null> {
  const sysPrompt = system || HOLOSCRIPT_SYSTEM_PROMPT;
  const __start = Date.now();
  __mcpActive += 1;
  const __concurrencyAtStart = __mcpActive;
  let __result: string | null = null;
  let __errored = false;
  try {
    const activeProvider = LLM_PROVIDER;

    // Apply Gemma 4 Edge-to-Cloud Routing. hybrid-gemma stays Ollama-edge by definition:
    // naming it chose Gemma on local Ollama for the edge half, so it never moves to our own
    // HoloServe / HoloLlama.
    if (activeProvider === 'hybrid-gemma') {
      const needsEdge = options?.requiresAudio || !options?.requiresDeepReasoning;
      __result = needsEdge
        ? await queryOllamaProvider(prompt, sysPrompt, GEMMA_EDGE_MODEL) // Edge (Gemma 4 E4B) via local Ollama
        : await queryOpenRouterProvider(prompt, sysPrompt, GEMMA_CLOUD_MODEL); // Cloud (Gemma 4 26B/31B) via OpenRouter
      return __result;
    }

    switch (activeProvider) {
      case 'openrouter':
        __result = await queryOpenRouterProvider(prompt, sysPrompt);
        break;
      case 'anthropic':
        __result = await queryAnthropicProvider(prompt, sysPrompt);
        break;
      case 'openai':
        __result = await queryOpenAIProvider(prompt, sysPrompt);
        break;
      case 'ollama':
        __result = await queryOllamaProvider(prompt, sysPrompt);
        break;
      case 'local':
      default:
        __result = await queryLocalProvider(prompt, sysPrompt);
        break;
    }
    return __result;
  } catch {
    __errored = true;
    return null;
  } finally {
    __mcpActive -= 1;
    // eslint-disable-next-line no-console -- intentional structured telemetry line
    console.info(
      `[fleet-metric] ${JSON.stringify({
        ts: new Date().toISOString(),
        source: 'mcp-hs-ai',
        provider: LLM_PROVIDER,
        promptTokens: Math.ceil((prompt.length + sysPrompt.length) / 4),
        completionTokens: __result ? Math.ceil(__result.length / 4) : 0,
        latencyMs: Date.now() - __start,
        concurrencyAtStart: __concurrencyAtStart,
        error: __errored,
      })}`
    );
  }
}

/**
 * Check if the configured LLM provider is available. The name is kept for its importers:
 * for the no-key default it means our own local model (HoloServe / HoloLlama) is configured
 * and answers its health check; for LLM_PROVIDER=ollama and hybrid-gemma, that OLLAMA_URL
 * is an owned Ollama that answers.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    switch (LLM_PROVIDER) {
      case 'openrouter':
        return Boolean(await resolveServiceSecret('OPENROUTER_API_KEY'));
      case 'anthropic':
        return Boolean(await resolveServiceSecret('ANTHROPIC_API_KEY'));
      case 'openai':
        return Boolean(await resolveServiceSecret('OPENAI_API_KEY'));
      case 'ollama':
      case 'hybrid-gemma': {
        // Use the adapter's healthCheck for Ollama (pings /health or /v1/models).
        // A hosted Ollama that queryOllamaProvider would refuse is not "available".
        if (!OLLAMA_URL) return false;
        const override = LLM_PROVIDER === 'hybrid-gemma' ? GEMMA_EDGE_MODEL : undefined;
        if (isRefusedOllama(ollamaModelSent(override))) return false;
        const adapter = getOllamaAdapter();
        if (!adapter) return false;
        const health = await adapter.healthCheck();
        return health.ok;
      }
      case 'local':
      default: {
        const local = resolveLocalProvider();
        if (!local) return false;
        const health = await local.provider.healthCheck();
        return health.ok;
      }
    }
  } catch {
    return false;
  }
}

/**
 * Get the active LLM provider name (for health endpoints): 'local' for the no-key default
 * (our own HoloServe / HoloLlama); 'ollama' and 'hybrid-gemma' only when LLM_PROVIDER names
 * them.
 */
export function getActiveProvider(): string {
  return LLM_PROVIDER;
}

/**
 * The local model queryOllama runs on when it runs locally, for status payloads. It does
 * not contact the server. `ollama` + the model sent there (GEMMA_EDGE_MODEL for
 * hybrid-gemma, OLLAMA_MODEL for LLM_PROVIDER=ollama); otherwise our own `holoserve` /
 * `holollama` and the model name sent to it (HoloLlama answers with the model it loaded,
 * whatever the name). null when nothing local is configured.
 */
export function describeLocalModel(): { source: string; model: string } | null {
  if (LLM_PROVIDER === 'ollama' || LLM_PROVIDER === 'hybrid-gemma') {
    const override = LLM_PROVIDER === 'hybrid-gemma' ? GEMMA_EDGE_MODEL : undefined;
    return OLLAMA_URL ? { source: 'ollama', model: ollamaModelSent(override) } : null;
  }
  const local = resolveLocalProvider();
  return local ? { source: local.providerName, model: local.model } : null;
}

/**
 * Strip markdown code fences from model output.
 * Models sometimes wrap output in ```holoscript ... ``` even when told not to.
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}
