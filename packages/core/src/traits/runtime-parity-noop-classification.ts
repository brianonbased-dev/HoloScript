/**
 * Native Runtime Parity — Tier-5 No-Op Classification
 *
 * Audited 2026-06-17 against:
 *   - packages/core/src/compiler/R3FCompiler.ts  (what R3F emits)
 *   - packages/runtime/src/browser/BrowserRuntime.ts  (TraitSystem.register calls)
 *   - packages/core/src/traits/<Trait>.ts  (each handler's onUpdate / onEvent body)
 *
 * Purpose:
 *   The parity gate CI task (board task #7 from research/2026-06-15_trait-parity-
 *   and-tsx-deprecation.md) needs an explicit list of traits that the R3F compiler
 *   emits but which intentionally have NO runtime tick/event handler in the native
 *   runtime.  Without this list every such trait would appear as a blocker in the
 *   parity gate, inflating the backlog count incorrectly.
 *
 * Audit verdict summary (see research/2026-06-17_tier5-noop-audit.md for detail):
 *
 *   TRUE NO-OP  (1): `attach`
 *     - R3F emits props.attach (R3FCompiler.ts:3304-3305)
 *     - No AttachTrait.ts file exists in packages/core/src/traits/
 *     - No handler registered in BrowserRuntime.ts
 *     - Semantics: Three.js child-hierarchy attachment hint — compile-time only
 *
 *   FALSE NO-OPS — these 11 traits have real TraitHandler implementations with
 *   onAttach / onUpdate / onEvent logic and MUST be registered in BrowserRuntime.ts
 *   to close the parity gap.  They are NOT no-ops:
 *
 *     accessible     — per-frame announce queue + focus ring (AccessibleTrait.ts)
 *     alt_text       — onAttach registration + onEvent query/update (AltTextTrait.ts)
 *     high_contrast  — event-driven material swap (HighContrastTrait.ts)
 *     motion_reduced — per-frame velocity clamp + animation intercept (MotionReducedTrait.ts)
 *     moderation     — event-driven AI moderation pipeline (ModerationTrait.ts)
 *     anti_grief     — per-frame grief-score compute + shield expiry (AntiGriefTrait.ts)
 *     token_gated    — onUpdate re-verify polling + fallback visibility (TokenGatedTrait.ts)
 *     data_binding   — per-frame REST poll + interpolation (DataBindingTrait.ts)
 *     world_state    — 10 Hz CRDT sync + autosave timers (WorldStateTrait.ts)
 *     shared_world   — per-Hz sync accumulator + peer update dispatch (SharedWorldTrait.ts)
 *     material       — handled by BrowserRuntime TraitVisualSystem at build time
 *                      (BrowserRuntime.ts:1362-1434); parity OK via different
 *                      mechanism (TraitCompositor), not missing
 *
 * Net effect on the parity backlog:
 *   The research doc estimated ~12 Tier-5 no-ops.
 *   Actual result: 1 true no-op (attach) + 1 already-handled differently (material).
 *   The remaining 10 are real blockers that belong in the Tier-1–4 registration work.
 *   Backlog reduction: 2 removed from the 79-trait poison list (not 12 as hoped).
 */

/**
 * Traits that the R3F compiler emits but which require NO native runtime handler.
 * These are safe to omit from BrowserRuntime.ts TraitSystem.register() calls.
 *
 * Expand this list only after the same three-point audit:
 *   1. Confirm R3F emits it (R3FCompiler.ts switch block)
 *   2. Confirm no TraitHandler file exists with active onUpdate / onEvent logic
 *   3. Confirm the semantic is genuinely compile-time or structural (not behavioral)
 */
export const RUNTIME_NOOP_TRAITS = [
  /**
   * `attach` — Three.js child-hierarchy attachment hint.
   * R3F emits `props.attach = trait.config || true` (R3FCompiler.ts:3304-3305).
   * The native runtime builds its own scene graph directly; there is no equivalent
   * concept that needs a per-tick handler.  No AttachTrait.ts exists.
   */
  'attach',
] as const;

export type RuntimeNoopTrait = (typeof RUNTIME_NOOP_TRAITS)[number];

/**
 * Traits that appear in the Tier-5 "passive/metadata" research list but have
 * real TraitHandler implementations.  They are NOT no-ops — they need to be
 * registered in BrowserRuntime.ts to close parity.
 *
 * This list is documentation-only (not consumed by any gate).  It exists to
 * prevent future auditors from re-classifying these as no-ops without evidence.
 */
export const TIER5_MISCLASSIFIED_AS_NOOP = [
  'accessible', // AccessibleTrait.ts — per-frame announce queue + focus ring
  'alt_text', // AltTextTrait.ts — onAttach + onEvent query/generate
  'high_contrast', // HighContrastTrait.ts — event-driven material palette swap
  'motion_reduced', // MotionReducedTrait.ts — per-frame velocity clamp + anim intercept
  'moderation', // ModerationTrait.ts — event-driven AI moderation pipeline
  'anti_grief', // AntiGriefTrait.ts — per-frame grief score + shield expiry
  'token_gated', // TokenGatedTrait.ts — onUpdate re-verify polling
  'data_binding', // DataBindingTrait.ts — per-frame REST poll + interpolation
  'world_state', // WorldStateTrait.ts — 10 Hz CRDT sync + autosave timers
  'shared_world', // SharedWorldTrait.ts — per-Hz sync accumulator + peer dispatch
] as const;

/**
 * `material` — handled by the native runtime via TraitCompositor + TraitVisualSystem
 * (BrowserRuntime.ts:1362-1434).  It is processed at object-build time, not via a
 * registered TraitHandler.  PARITY-OK by a different mechanism — not a blocker.
 */
export const MATERIAL_TRAIT_PARITY_NOTE =
  'material: handled by BrowserRuntime TraitVisualSystem at object-build time ' +
  '(TraitCompositor.compose → MeshStandardMaterial/MeshPhysicalMaterial). ' +
  'No TraitSystem.register() entry needed. PARITY-OK.';
