/**
 * Local model picker — discovery over hardcodes (founder 2026-06-10:
 * "why are we hardcoding 1 qwen model, don't we have a large variety?").
 *
 * Instead of pinning one Ollama tag, enumerate what is actually installed
 * (/api/tags), keep models whose template supports tools (/api/show
 * capabilities), rank by modernity + size, and BEHAVIORALLY verify the top
 * candidate with one tiny forced tool call. The capability flag alone is a
 * liar: qwen2.5-coder:7b reports `tools` in capabilities yet emits the call
 * JSON as plain text (proven 2026-06-10 — the tend_garden stall / the
 * zero-objects benchmark cells). Only a model that actually returns
 * `tool_calls` passes.
 *
 * Pull a better model tomorrow → it gets picked automatically. Env override
 * (HOLO_LLM_MODEL / BRITTNEY_MODEL, surfaced via opts.override) always wins
 * and skips discovery entirely.
 */

import { SAFE_LOCAL_FALLBACK, isBlacklistedModel } from './model-policy';

/**
 * Canonical default endpoint for the LOCAL Ollama tier. Single source for the
 * one allowed localhost literal (founder-ruled 2026-06-10): the local tier is
 * only reachable after OLLAMA_* env explicitly selected it in auto-detect, or
 * via explicit provider=ollama — production sovereign surfaces (fleet, cloud)
 * always rank above it. Ollama's own server binds this address by default.
 */
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

// The model blacklist + the safe local fallback are owned by the model-policy
// SSOT (one place to change a default). Re-exported here so existing
// `from './local-model-picker'` importers keep working.
export { SAFE_LOCAL_FALLBACK, MODEL_BLACKLIST, isBlacklistedModel } from './model-policy';

export interface LocalModelChoice {
  model: string;
  /** How the choice was made — env pin, verified discovery, or static fallback. */
  source: 'override' | 'discovery' | 'fallback';
  /** True when the model passed the live tool-call probe (always true for discovery). */
  toolCallVerified: boolean;
  /** Every installed model considered, in ranked order (diagnostics). */
  candidates: string[];
}

interface TagsModel {
  name: string;
  details?: { parameter_size?: string };
}

interface ShowResponse {
  capabilities?: string[];
}

/**
 * Representative probe, not a ping: gemma4:e2b passed a trivial ping 2/2
 * (2026-06-10) yet produced prose or wrong-argument calls on real scene
 * tasks. The probe must demand what real work demands — selecting the right
 * tool among decoys AND emitting faithful typed arguments.
 */
const PROBE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_object',
      description: 'Create a 3D object in the scene',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          primitive: { type: 'string' },
          position: { type: 'array', items: { type: 'number' } },
          radius: { type: 'number' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_object',
      description: 'Delete an object from the scene by name',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_objects',
      description: 'List all objects in the scene',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const PROBE_PROMPT =
  'Create a sphere named orb-probe with radius 2 at position [1, 2, 3]. Use the appropriate tool.';

function probeArgsFaithful(args: Record<string, unknown>): boolean {
  const name = String(args['name'] ?? '');
  const radius = Number(args['radius']);
  const pos = Array.isArray(args['position']) ? args['position'].map(Number) : null;
  return (
    name.includes('orb') &&
    Math.abs(radius - 2) < 0.01 &&
    !!pos &&
    pos.length === 3 &&
    Math.abs(pos[0] - 1) < 0.01 &&
    Math.abs(pos[1] - 2) < 0.01 &&
    Math.abs(pos[2] - 3) < 0.01
  );
}

/** Cache per baseURL so a long-lived server probes at most once per TTL. */
const cache = new Map<string, { choice: LocalModelChoice; at: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function parseParamsB(size: string | undefined): number {
  const m = (size ?? '').match(/([\d.]+)\s*B/i);
  return m ? Number(m[1]) : 0;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * One representative tools call: the model must pick create_object among
 * decoys AND reproduce the requested arguments faithfully. Tool-call
 * EXISTENCE alone is not enough — that is the lesson of the gemma4 incident.
 */
async function probeToolCall(baseURL: string, model: string, timeoutMs: number): Promise<boolean> {
  const body = {
    model,
    messages: [{ role: 'user', content: PROBE_PROMPT }],
    tools: PROBE_TOOLS,
    stream: false,
  };
  const resp = await fetchJson<{
    choices?: Array<{
      message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> };
    }>;
  }>(
    `${baseURL.replace(/\/$/, '')}/v1/chat/completions`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    timeoutMs
  );
  const calls = resp?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return false;
  const create = calls.find((c) => c.function?.name === 'create_object');
  if (!create) return false;
  const rawArgs = create.function?.arguments;
  let args: Record<string, unknown>;
  try {
    args = typeof rawArgs === 'string' ? (JSON.parse(rawArgs) as Record<string, unknown>) : ((rawArgs ?? {}) as Record<string, unknown>);
  } catch {
    return false;
  }
  return probeArgsFaithful(args);
}

export async function pickLocalModel(
  baseURL: string,
  opts: {
    override?: string;
    fallback?: string;
    /** Skip candidates above this parameter count (default 15B — keeps a
     * surprise 70B pull from silently making every turn minutes long). */
    maxParamsB?: number;
    timeoutMs?: number;
  } = {}
): Promise<LocalModelChoice> {
  // Resolve a non-blacklisted fallback up front so every exit path is safe.
  const requestedFallback = opts.fallback ?? SAFE_LOCAL_FALLBACK;
  const fallback = isBlacklistedModel(requestedFallback) ? SAFE_LOCAL_FALLBACK : requestedFallback;

  if (opts.override) {
    // A blacklisted override is not honored — the blacklist outranks an explicit
    // pin (that is what "blacklist" means). Fall back to a safe model instead.
    if (isBlacklistedModel(opts.override)) {
      return { model: fallback, source: 'fallback', toolCallVerified: false, candidates: [] };
    }
    return { model: opts.override, source: 'override', toolCallVerified: false, candidates: [] };
  }

  const key = baseURL.replace(/\/$/, '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.choice;

  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxParamsB =
    opts.maxParamsB ?? (Number(process.env.HOLO_LLM_LOCAL_MAX_PARAMS_B || '') || 15);

  const tags = await fetchJson<{ models?: TagsModel[] }>(`${key}/api/tags`, undefined, timeoutMs);
  // Drop blacklisted models before ranking — they never get probed or picked.
  const installed = (tags?.models ?? []).filter((m) => !isBlacklistedModel(m.name));

  // Rank: tools-capable only → modern capability sets first (thinking is the
  // 2026-family marker) → larger params first within the cap.
  const ranked: Array<{ name: string; paramsB: number; modern: boolean }> = [];
  for (const m of installed.slice(0, 16)) {
    const show = await fetchJson<ShowResponse>(
      `${key}/api/show`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.name }),
      },
      timeoutMs
    );
    const caps = show?.capabilities ?? [];
    if (!caps.includes('tools')) continue;
    const paramsB = parseParamsB(m.details?.parameter_size);
    if (paramsB > maxParamsB) continue;
    ranked.push({ name: m.name, paramsB, modern: caps.includes('thinking') });
  }
  ranked.sort((a, b) => Number(b.modern) - Number(a.modern) || b.paramsB - a.paramsB);

  // Behavioral gate: capabilities lie; only live tool_calls responses count.
  // TWO samples, both must pass: a single-sample probe let gemma4:e2b through
  // on a lucky ping (2026-06-10) and an entire benchmark run silently rode a
  // flaky tool-caller. Consistency beats size — a model that ping-passes 1/2
  // loses to a smaller model that passes 2/2.
  for (const c of ranked) {
    const probeMs = Math.max(timeoutMs, 30_000);
    const passedBoth =
      (await probeToolCall(key, c.name, probeMs)) && (await probeToolCall(key, c.name, probeMs));
    if (passedBoth) {
      const choice: LocalModelChoice = {
        model: c.name,
        source: 'discovery',
        toolCallVerified: true,
        candidates: ranked.map((r) => r.name),
      };
      cache.set(key, { choice, at: Date.now() });
      return choice;
    }
  }

  const choice: LocalModelChoice = {
    model: fallback,
    source: 'fallback',
    toolCallVerified: false,
    candidates: ranked.map((r) => r.name),
  };
  cache.set(key, { choice, at: Date.now() });
  return choice;
}

/** Test hook: clear the per-process picker cache. */
export function __clearLocalModelPickerCache(): void {
  cache.clear();
}
