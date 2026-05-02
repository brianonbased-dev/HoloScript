/**
 * LLM Client for HoloScript MCP Server — Cloud-First
 *
 * Auto-detects the best available provider from env vars:
 *   1. 'openrouter'  — OpenRouter (preferred, best model routing)
 *   2. 'anthropic'   — Anthropic Claude API direct
 *   3. 'openai'      — OpenAI API
 *   4. 'ollama'      — local Ollama instance (fallback only)
 *
 * Override with LLM_PROVIDER env var. Auto-detect runs if not set.
 *
 * Migrated (B1c) from inline fetch() calls to @holoscript/llm-provider
 * adapters which inherit withRetry from BaseLLMAdapter — exponential
 * backoff + Retry-After honoring on 429/5xx.
 *
 * Used by brittney-lite.ts, generators.ts, and self-improve-tools.ts
 * with graceful fallback to rule-based logic when unavailable.
 */

import {
  AnthropicAdapter,
  OpenAIAdapter,
  OpenRouterAdapter,
  LocalLLMAdapter,
  type ILLMProvider,
  type LLMCompletionRequest,
} from '@holoscript/llm-provider';

type LLMProviderName = 'hybrid-gemma' | 'openrouter' | 'anthropic' | 'openai' | 'ollama';

function detectProvider(): LLMProviderName {
  const explicit = process.env.LLM_PROVIDER as LLMProviderName;
  if (explicit && ['hybrid-gemma', 'openrouter', 'anthropic', 'openai', 'ollama'].includes(explicit))
    return explicit;
  // Auto-detect from available keys
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'ollama';
}

const LLM_PROVIDER: LLMProviderName = detectProvider();

// ── OpenRouter config ───────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';

// ── Anthropic config ─────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
// Use the alias (auto-resolves to latest pinned build) not the date-suffixed ID.
// Haiku is the right default here — this is a fallback path for cheap/fast calls.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

// ── OpenAI config ────────────────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ── Ollama config (local fallback only) ──────────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL || ''; // Ollama is optional — empty means disabled
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'brittney-qwen-v23:latest';

// ── Gemma 4 Hybrid Routing config ────────────────────────────────────────────
const GEMMA_EDGE_MODEL = process.env.GEMMA_EDGE_MODEL || 'gemma4:e4b';
const GEMMA_CLOUD_MODEL = process.env.GEMMA_CLOUD_MODEL || 'google/gemma-4-31b';

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

function getAnthropicAdapter(): AnthropicAdapter | null {
  if (!ANTHROPIC_API_KEY) return null;
  if (!_anthropicAdapter) {
    _anthropicAdapter = new AnthropicAdapter({
      apiKey: ANTHROPIC_API_KEY,
      defaultModel: ANTHROPIC_MODEL,
      timeoutMs: LLM_TIMEOUT,
    });
  }
  return _anthropicAdapter;
}

function getOpenAIAdapter(): OpenAIAdapter | null {
  if (!OPENAI_API_KEY) return null;
  if (!_openaiAdapter) {
    _openaiAdapter = new OpenAIAdapter({
      apiKey: OPENAI_API_KEY,
      defaultModel: OPENAI_MODEL,
      timeoutMs: LLM_TIMEOUT,
    });
  }
  return _openaiAdapter;
}

function getOpenRouterAdapter(): OpenRouterAdapter | null {
  if (!OPENROUTER_API_KEY) return null;
  if (!_openrouterAdapter) {
    _openrouterAdapter = new OpenRouterAdapter({
      apiKey: OPENROUTER_API_KEY,
      defaultModel: OPENROUTER_MODEL,
      timeoutMs: LLM_TIMEOUT,
    });
  }
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

// =============================================================================
// PROVIDER IMPLEMENTATIONS (delegating to @holoscript/llm-provider adapters
// with withRetry from BaseLLMAdapter — exponential backoff + Retry-After)
// =============================================================================

async function queryOpenRouterProvider(prompt: string, system: string, modelOverride?: string): Promise<string | null> {
  const adapter = getOpenRouterAdapter();
  if (!adapter) return null;
  try {
    const result = await adapter.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4096,
      ...(modelOverride && { model: modelOverride }),
    });
    return result.content || null;
  } catch {
    return null;
  }
}

async function queryAnthropicProvider(prompt: string, system: string): Promise<string | null> {
  const adapter = getAnthropicAdapter();
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
  const adapter = getOpenAIAdapter();
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

async function queryOllamaProvider(prompt: string, system: string, modelOverride?: string): Promise<string | null> {
  const adapter = getOllamaAdapter();
  if (!adapter) return null;
  try {
    const result = await adapter.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4096,
      ...(modelOverride && { model: modelOverride }),
    });
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
 * Auto-detects provider from env vars: OpenRouter → Anthropic → OpenAI → Ollama.
 * Override with LLM_PROVIDER env var.
 */
export async function queryOllama(prompt: string, system?: string, options?: RoutingOptions): Promise<string | null> {
  const sysPrompt = system || HOLOSCRIPT_SYSTEM_PROMPT;
  try {
    const activeProvider = LLM_PROVIDER;

    // Apply Gemma 4 Edge-to-Cloud Routing
    if (activeProvider === 'hybrid-gemma') {
      const needsEdge = options?.requiresAudio || !options?.requiresDeepReasoning;
      if (needsEdge) {
        // Route to Edge (Gemma 4 E4B) via local Ollama
        return await queryOllamaProvider(prompt, sysPrompt, GEMMA_EDGE_MODEL);
      } else {
        // Route to Cloud (Gemma 4 26B/31B) via OpenRouter
        return await queryOpenRouterProvider(prompt, sysPrompt, GEMMA_CLOUD_MODEL);
      }
    }

    switch (activeProvider) {
      case 'openrouter':
        return await queryOpenRouterProvider(prompt, sysPrompt);
      case 'anthropic':
        return await queryAnthropicProvider(prompt, sysPrompt);
      case 'openai':
        return await queryOpenAIProvider(prompt, sysPrompt);
      case 'ollama':
      default:
        return await queryOllamaProvider(prompt, sysPrompt);
    }
  } catch {
    return null;
  }
}

/**
 * Check if the configured LLM provider is available.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    switch (LLM_PROVIDER) {
      case 'openrouter':
        return !!OPENROUTER_API_KEY;
      case 'anthropic':
        return !!ANTHROPIC_API_KEY;
      case 'openai':
        return !!OPENAI_API_KEY;
      case 'ollama':
      default:
        // Use the adapter's healthCheck for Ollama (pings /health or /v1/models)
        if (!OLLAMA_URL) return false;
        const adapter = getOllamaAdapter();
        if (!adapter) return false;
        const health = await adapter.healthCheck();
        return health.ok;
    }
  } catch {
    return false;
  }
}

/**
 * Get the active LLM provider name (for health endpoints).
 */
export function getActiveProvider(): string {
  return LLM_PROVIDER;
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