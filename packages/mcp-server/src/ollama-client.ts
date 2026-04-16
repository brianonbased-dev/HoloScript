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
 * Used by brittney-lite.ts, generators.ts, and self-improve-tools.ts
 * with graceful fallback to rule-based logic when unavailable.
 */

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
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

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
// PROVIDER IMPLEMENTATIONS
// =============================================================================

async function queryOpenRouterProvider(prompt: string, system: string, modelOverride?: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return null;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://mcp.holoscript.net',
      'X-Title': 'HoloScript MCP',
    },
    body: JSON.stringify({
      model: modelOverride || OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || null;
}

async function queryAnthropicProvider(prompt: string, system: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content: Array<{ text: string }> };
  return data.content?.[0]?.text || null;
}

async function queryOpenAIProvider(prompt: string, system: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || null;
}

async function queryOllamaProvider(prompt: string, system: string, modelOverride?: string): Promise<string | null> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelOverride || OLLAMA_MODEL,
      prompt,
      system,
      stream: false,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { response: string };
  return data.response || null;
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
      default: {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        return (
          data.models?.some((m) => m.name.startsWith(OLLAMA_MODEL.replace(':latest', ''))) ?? false
        );
      }
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
