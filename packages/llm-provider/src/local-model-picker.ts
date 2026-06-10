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

/**
 * Canonical default endpoint for the LOCAL Ollama tier. Single source for the
 * one allowed localhost literal (founder-ruled 2026-06-10): the local tier is
 * only reachable after OLLAMA_* env explicitly selected it in auto-detect, or
 * via explicit provider=ollama — production sovereign surfaces (fleet, cloud)
 * always rank above it. Ollama's own server binds this address by default.
 */
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

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

const PROBE_TOOL = {
  type: 'function',
  function: {
    name: 'ping',
    description: 'Reply to a ping. Always call this tool.',
    parameters: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
    },
  },
};

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

/** One tiny forced-tools call: does the model ACTUALLY emit tool_calls? */
async function probeToolCall(baseURL: string, model: string, timeoutMs: number): Promise<boolean> {
  const body = {
    model,
    messages: [{ role: 'user', content: 'Ping. You must call the ping tool with ok=true.' }],
    tools: [PROBE_TOOL],
    stream: false,
  };
  const resp = await fetchJson<{
    choices?: Array<{ message?: { tool_calls?: unknown[] } }>;
  }>(
    `${baseURL.replace(/\/$/, '')}/v1/chat/completions`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    timeoutMs
  );
  const calls = resp?.choices?.[0]?.message?.tool_calls;
  return Array.isArray(calls) && calls.length > 0;
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
  if (opts.override) {
    return { model: opts.override, source: 'override', toolCallVerified: false, candidates: [] };
  }

  const key = baseURL.replace(/\/$/, '');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.choice;

  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxParamsB =
    opts.maxParamsB ?? (Number(process.env.HOLO_LLM_LOCAL_MAX_PARAMS_B || '') || 15);
  const fallback = opts.fallback ?? 'qwen3.5:4b';

  const tags = await fetchJson<{ models?: TagsModel[] }>(`${key}/api/tags`, undefined, timeoutMs);
  const installed = tags?.models ?? [];

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
