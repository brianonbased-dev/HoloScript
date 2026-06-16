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
