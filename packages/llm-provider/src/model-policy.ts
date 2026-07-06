/**
 * Model Policy — THE single source of truth for the ecosystem's model DEFAULTS
 * and the model BLACKLIST. "Lock in our models": to change a default, edit it
 * HERE, not in the ~20 files that used to hardcode the same string.
 *
 * Division of responsibility:
 *   - Per-provider model CATALOGS (which models a provider offers + their
 *     capabilities) live WITH their adapters — OPENAI_MODELS, ANTHROPIC_MODELS,
 *     GEMINI_MODELS, XAI_MODELS, LOCAL_LLM_MODELS, BITNET_MODELS, … . That is
 *     correct: a provider owns its own model list.
 *   - This module owns the cross-cutting POLICY: which model each TIER selects by
 *     default, and which models are REFUSED everywhere (the blacklist).
 *
 * Everything that needs "the default local/fleet/cloud model" imports from here.
 * `@holoscript/llm-provider` is the lowest-level package in the model stack
 * (core, studio, mcp-server, services all depend on it; it depends on none of
 * them), so this is a cycle-free home for the SSOT.
 *
 * @version 1.0.0
 */

// =============================================================================
// TIER DEFAULTS — the locked-in model per execution tier
// =============================================================================

/**
 * Canonical sovereign LOCAL (Ollama) default model. The on-device / LAN tier
 * (daily-driver Ollama, Jetson edge node).
 *
 * `qwen3:4b-instruct-2507` (classic Qwen3, non-thinking, 256K) — chosen over the
 * earlier `qwen3.5:4b` because Qwen3.5 reproduces the BLACKLISTED-class failure
 * on Ollama: it was trained on the Qwen3-Coder XML tool-call format, but Ollama
 * sends the Hermes-JSON parser, so tool calls fall through as PLAIN TEXT
 * (Ollama #14745/#14493) — the exact symptom we blacklisted qwen2.5 for. The
 * 2507 line has the proven Hermes parser path + BFCL ~62%/82.6% AST. See
 * research/2026-06-16_open-weight-model-lane-evaluation.md (W.512). The local
 * picker still PREFERS behaviorally-verified discovery; this is the floor.
 */
export const LOCAL_DEFAULT_MODEL = 'qwen3:4b-instruct-2507';

/**
 * Canonical FLEET serving default — the model the sovereign GPU fleet serves
 * (vLLM / scale-to-zero autoscaler) when no explicit served model is pinned.
 * For the served CODE lane prefer LANE_DEFAULTS.code_served (qwen3-coder:30b).
 */
export const FLEET_DEFAULT_MODEL = 'qwen3:4b-instruct-2507';

/**
 * Canonical CLOUD frontier default — the BYOK fallback when sovereign tiers are
 * unavailable AND a frontier key is present (F.112 sovereign-first, BYOK-fallback).
 */
export const CLOUD_DEFAULT_MODEL = 'claude-opus-4-8';

/**
 * Back-compat alias: the local model picker's "safe fallback" IS the local
 * default. Kept as a named export so existing call sites keep working.
 */
export const SAFE_LOCAL_FALLBACK = LOCAL_DEFAULT_MODEL;

/**
 * Per-lane default models (D.085 "variable models per scenario"). Evidence-based
 * from research/2026-06-16_open-weight-model-lane-evaluation.md. A lane router
 * (capacity-plan Gap #2) selects these per request; until that wiring lands they
 * document the intended model per lane and back per-lane env overrides.
 *
 * NOTE: `code_served` / `vision` / `fleet_worker` tags must be pulled/served on
 * the target box before a lane routes to them (verify on Ollama/fleet first).
 */
export const LANE_DEFAULTS = {
  /** CODE, local 4B — proven Hermes tool-calls. */
  code_local: LOCAL_DEFAULT_MODEL,
  /** CODE, fleet-served — purpose-built tool-calling (30B-A3B). */
  code_served: 'qwen3-coder:30b',
  /** OPERATOR — fast short chat; served alt: glm-4.5-air / minimax-m2. */
  operator: 'qwen3:4b',
  /** REASONING — cloud frontier; open co-primary: deepseek-v4-pro / kimi-k2.6. */
  reasoning: CLOUD_DEFAULT_MODEL,
  /** VISION — local GUI/screenshot agent (fills the cloud-only vision gap). */
  vision: 'qwen3-vl:4b',
  /** FLEET-WORKER — cheap 0.5-1.5B tool-caller; closes capacity-plan Gap #1. */
  fleet_worker: 'granite4:1b',
} as const;

export type ModelLane = keyof typeof LANE_DEFAULTS;

/** The default model for a given lane (non-blacklisted by construction). */
export function laneDefault(lane: ModelLane): string {
  return LANE_DEFAULTS[lane];
}

// =============================================================================
// MODEL LIBRARY — the current open-weight catalog (research-backed)
// =============================================================================

/** Execution tier a model runs in. */
export type ModelTier = 'local' | 'fleet' | 'cloud';

/** A catalog entry: a recommended model + the metadata lane routing / UIs need. */
export interface ModelLibraryEntry {
  /** Canonical id — Ollama tag for local/fleet, provider id for cloud. */
  id: string;
  /** Lanes this model is recommended for. */
  lanes: ModelLane[];
  /** Approx parameters in billions (ACTIVE params for MoE; 0 = cloud/N-A). */
  paramsB: number;
  /** License family — all entries are NMoS-clean to self-host or BYOK. */
  license: 'apache-2.0' | 'mit' | 'gemma' | 'frontier';
  /** Where it runs. */
  tier: ModelTier;
  /** One-line capability note (tool-calling quality / caveat). */
  note: string;
}

/**
 * THE model library — the current (2026-06) open-weight catalog the ecosystem
 * recommends, distilled from research/2026-06-16_open-weight-model-lane-evaluation.md.
 * LANE_DEFAULTS picks ONE model per lane; this is the fuller set incl. alternatives
 * so a lane router / model-picker UI can choose. Non-blacklisted by construction.
 *
 * ⚠ Local/fleet tags must be pulled/served on the target box before use; the
 * local picker's behavioral tool-call probe remains the real gate. Update this
 * list (and LANE_DEFAULTS) as the open-weight landscape moves — it is the SSOT.
 */
export const MODEL_LIBRARY: readonly ModelLibraryEntry[] = [
  // ── LOCAL (Ollama / on-device) ──
  { id: 'qwen3:4b-instruct-2507', lanes: ['code_local', 'operator'], paramsB: 4, license: 'apache-2.0', tier: 'local', note: 'Proven Hermes tool-calls, non-thinking, 256K — current local default.' },
  { id: 'qwen3:4b', lanes: ['operator'], paramsB: 4, license: 'apache-2.0', tier: 'local', note: 'Fast operator chat (suppress thinking via /no_think).' },
  { id: 'qwen3-vl:4b', lanes: ['vision'], paramsB: 4, license: 'apache-2.0', tier: 'local', note: 'GUI/screenshot perception agent; final-output gated for Tower C until thinking-only length regressions clear.' },
  { id: 'granite4:1b', lanes: ['fleet_worker'], paramsB: 1, license: 'apache-2.0', tier: 'local', note: 'BFCLv3 54.8 (class-leading); CPU/browser-runnable; closes fleet Gap #1.' },
  { id: 'gemma4:12b', lanes: ['vision'], paramsB: 12, license: 'gemma', tier: 'local', note: 'OCR/doc/chart vision; ~16GB. Do NOT think:false (breaks tool mask).' },
  // ── FLEET (sovereign GPU / vLLM) ──
  { id: 'qwen3-coder:30b', lanes: ['code_served'], paramsB: 3.3, license: 'apache-2.0', tier: 'fleet', note: '30B-A3B, purpose-built tool-calls; the served CODE pick.' },
  { id: 'devstral-small-2', lanes: ['code_served'], paramsB: 24, license: 'apache-2.0', tier: 'fleet', note: 'Mistral 68% SWE-bench; agentic coding on a workstation.' },
  { id: 'mistral-small-4', lanes: ['operator', 'code_served'], paramsB: 6.5, license: 'apache-2.0', tier: 'fleet', note: 'Native FC+JSON, multimodal; strong all-rounder.' },
  { id: 'glm-4.5-air', lanes: ['operator'], paramsB: 12, license: 'mit', tier: 'fleet', note: 'Best self-hostable tool-caller (90.6% success, BFCL-v3 76.4).' },
  { id: 'minimax-m2', lanes: ['operator'], paramsB: 10, license: 'apache-2.0', tier: 'fleet', note: 'Top agentic tool-caller; cheapest via API.' },
  { id: 'deepseek-v4-pro', lanes: ['reasoning', 'code_served'], paramsB: 49, license: 'mit', tier: 'fleet', note: '1M ctx; leads open agentic real-world; think:false-able.' },
  // ── CLOUD (frontier BYOK) ──
  { id: 'claude-opus-4-8', lanes: ['reasoning'], paramsB: 0, license: 'frontier', tier: 'cloud', note: 'Frontier review/reasoning default (F.112 BYOK fallback).' },
  { id: 'kimi-k2.6', lanes: ['reasoning'], paramsB: 32, license: 'mit', tier: 'cloud', note: 'Open agentic-swarm reasoning co-primary (via Fireworks).' },
];

/** Library entries recommended for a lane. */
export function modelsForLane(lane: ModelLane): ModelLibraryEntry[] {
  return MODEL_LIBRARY.filter((m) => m.lanes.includes(lane));
}

/** Look up a library entry by exact id. */
export function modelLibraryEntry(id: string): ModelLibraryEntry | undefined {
  return MODEL_LIBRARY.find((m) => m.id === id);
}

// =============================================================================
// FINAL OUTPUT GATE - models allowed for perception, not Tower C output promotion
// =============================================================================

/**
 * Models that may still be useful inside their lane but must not be promoted as
 * usable final-output towers without an additional final-output gate.
 */
export const FINAL_OUTPUT_GATED_MODELS: readonly string[] = ['qwen3-vl'];

/** True when a model id belongs to a family barred from Tower C final output promotion. */
export function isFinalOutputGatedModel(name: string | undefined | null): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return FINAL_OUTPUT_GATED_MODELS.some((gated) =>
    normalized.includes(gated.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
}

// =============================================================================
// BLACKLIST — models refused everywhere (founder 2026-06-16)
// =============================================================================

/**
 * Model families the ecosystem refuses to auto-select. qwen2.5 (esp.
 * qwen2.5-coder:7b) FALSELY reports `tools` support in /api/show capabilities
 * yet emits malformed / prose tool calls — it lies past the capability check and
 * silently degrades real agent turns. Matched case-insensitively as a SUBSTRING
 * so every tag and quant variant (qwen2.5-coder:7b, qwen2.5:14b-instruct-q4_K_M,
 * qwen2.5-7b-instruct, …) is covered.
 */
export const MODEL_BLACKLIST: readonly string[] = ['qwen2.5', 'qwen2_5', 'qwen-2.5'];

/** True when `name` matches a blacklisted model family (case-insensitive substring). */
export function isBlacklistedModel(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return MODEL_BLACKLIST.some((b) => n.includes(b));
}

/**
 * Resolve a requested model against policy: returns it unless it is blacklisted,
 * in which case `fallback` (default: the safe local default) is returned. Use at
 * any seam that accepts an external/explicit model string.
 */
export function resolveAllowedModel(requested: string | undefined | null, fallback: string = SAFE_LOCAL_FALLBACK): string {
  if (!requested || isBlacklistedModel(requested)) {
    return isBlacklistedModel(fallback) ? LOCAL_DEFAULT_MODEL : fallback;
  }
  return requested;
}
