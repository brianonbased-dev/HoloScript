/**
 * LLM Client for HoloScript MCP Server
 *
 * Supports multiple providers via LLM_PROVIDER env var:
 *   - 'ollama'    (default) — local Ollama instance
 *   - 'anthropic' — Anthropic Claude API (requires ANTHROPIC_API_KEY)
 *   - 'openai'    — OpenAI API (requires OPENAI_API_KEY)
 *
 * Used by brittney-lite.ts for AI-backed code generation/review
 * with graceful fallback to rule-based logic when unavailable.
 */

type LLMProviderName = 'ollama' | 'anthropic' | 'openai';

const LLM_PROVIDER: LLMProviderName = (process.env.LLM_PROVIDER as LLMProviderName) || 'ollama';

// ── Ollama config ────────────────────────────────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'brittney-qwen-v23:latest';

// ── Anthropic config ─────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

// ── OpenAI config ────────────────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

async function queryOllamaProvider(prompt: string, system: string): Promise<string | null> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
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

// =============================================================================
// PUBLIC API (backward-compatible)
// =============================================================================

/**
 * Query the configured LLM provider.
 * Returns null if the provider is unavailable or the request fails.
 *
 * Provider selected by LLM_PROVIDER env var (ollama | anthropic | openai).
 */
export async function queryOllama(prompt: string, system?: string): Promise<string | null> {
  const sysPrompt = system || HOLOSCRIPT_SYSTEM_PROMPT;
  try {
    switch (LLM_PROVIDER) {
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
 * Strip markdown code fences from model output.
 * Models sometimes wrap output in ```holoscript ... ``` even when told not to.
 */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}
