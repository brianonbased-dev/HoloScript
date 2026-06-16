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
 * (daily-driver Ollama, Jetson edge node). qwen3.5:4b: modern, tool-capable,
 * small enough for 8GB edge. Replaced qwen2.5-coder (blacklisted — lied about
 * tool support). The local picker still PREFERS behaviorally-verified discovery
 * over this static default; this is the floor it falls back to.
 */
export const LOCAL_DEFAULT_MODEL = 'qwen3.5:4b';

/**
 * Canonical FLEET serving default — the model the sovereign GPU fleet serves
 * (vLLM / scale-to-zero autoscaler) when no explicit served model is pinned.
 */
export const FLEET_DEFAULT_MODEL = 'qwen3.5:4b';

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
