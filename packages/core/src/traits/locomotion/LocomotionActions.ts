/**
 * Locomotion Actions — first-class movement/locomotion primitives for HoloScript.
 *
 * This is the single source of truth (SSOT) for the locomotion vocabulary shared
 * by the parser, LSP, linter, trait runtime, and compilers — mirroring the
 * cognitive-actions seam (`traits/cognitive/CognitiveActions.ts`, commit
 * 8b78030e0) for the *motor* side of agent/player behavior.
 *
 * Where the cognitive seam answers "what an agent THINKS" (llm_call/recall/plan),
 * this seam answers "how a body MOVES":
 *   - {@link LOCOMOTION_MODES}      — the movement styles a `move` statement /
 *     `@locomotion` trait can select (glide/walk/teleport/fly/…).
 *   - {@link LOCOMOTION_REACTION_TRIGGERS} — the `on_*` reaction triggers that
 *     belong to the `movement` {@link ReactionCategory} bucket.
 *   - {@link LOCOMOTION_MODE_MAP}   — binds each mode to the runtime trait event
 *     the LocomotionTrait consumes (the wiring contract, not new behavior).
 *
 * No movement logic lives here — this is pure vocabulary + the verb→event
 * contract. The real per-frame integration lives in `traits/LocomotionTrait.ts`.
 *
 * @version 1.0.0
 */

/** The movement styles a `move` statement or `@locomotion` trait may select. */
export type LocomotionMode =
  | 'glide'
  | 'walk'
  | 'run'
  | 'fly'
  | 'swim'
  | 'teleport'
  | 'path'
  | 'orbit'
  | 'snap'
  | 'follow';

/** Canonical ordered list of locomotion modes (SSOT for parser/linter/LSP/compiler). */
export const LOCOMOTION_MODES: readonly LocomotionMode[] = [
  'glide',
  'walk',
  'run',
  'fly',
  'swim',
  'teleport',
  'path',
  'orbit',
  'snap',
  'follow',
] as const;

/** Type guard: is the given identifier one of the locomotion modes? */
export function isLocomotionMode(value: string): value is LocomotionMode {
  return (LOCOMOTION_MODES as readonly string[]).includes(value);
}

/**
 * Movement verb keywords — the imperative `.hs` statements that drive locomotion.
 * These are grammar keywords (not trait names): they belong in the parser keyword
 * set / LSP KNOWN_DIRECTIVES, never in the trait vocabulary (VR_TRAITS).
 */
export const MOVEMENT_VERBS = ['move', 'turn', 'strafe', 'jump', 'land'] as const;
export type MovementVerb = (typeof MOVEMENT_VERBS)[number];

/** Type guard: is the given identifier a movement verb keyword? */
export function isMovementVerb(value: string): value is MovementVerb {
  return (MOVEMENT_VERBS as readonly string[]).includes(value);
}

/**
 * Reaction triggers that route to the `movement` {@link ReactionCategory}.
 * Kept here so `reactionCategory()` in the .hs parser and the LSP diagnostic
 * vocabulary share exactly one list (no hardcoded trigger names in two places).
 */
export const LOCOMOTION_REACTION_TRIGGERS = [
  'on_move',
  'on_walk',
  'on_run',
  'on_jump',
  'on_land',
  'on_strafe',
  'on_teleport',
] as const;
export type LocomotionReactionTrigger = (typeof LOCOMOTION_REACTION_TRIGGERS)[number];

/** Type guard: is the trigger a movement-category reaction? */
export function isLocomotionReactionTrigger(value: string): value is LocomotionReactionTrigger {
  return (LOCOMOTION_REACTION_TRIGGERS as readonly string[]).includes(value);
}

/** Binding from a locomotion mode to the runtime trait event it requests. */
export interface LocomotionModeBinding {
  /** Event the LocomotionTrait consumes to apply this mode. */
  event: string;
  /** Trait that owns the runtime integration. */
  trait: string;
}

/**
 * Single source of truth: locomotion mode → runtime trait event contract.
 * The LocomotionTrait (`traits/LocomotionTrait.ts`) consumes `locomotion:set_mode`
 * / `locomotion:move`; compilers emit these from `MovementStatementNode` and the
 * `@locomotion` trait config. All modes route to the one `locomotion` trait.
 */
export const LOCOMOTION_MODE_MAP: Record<LocomotionMode, LocomotionModeBinding> = {
  glide: { event: 'locomotion:set_mode', trait: 'locomotion' },
  walk: { event: 'locomotion:set_mode', trait: 'locomotion' },
  run: { event: 'locomotion:set_mode', trait: 'locomotion' },
  fly: { event: 'locomotion:set_mode', trait: 'locomotion' },
  swim: { event: 'locomotion:set_mode', trait: 'locomotion' },
  teleport: { event: 'locomotion:teleport_request', trait: 'locomotion' },
  path: { event: 'locomotion:move', trait: 'locomotion' },
  orbit: { event: 'locomotion:set_mode', trait: 'locomotion' },
  snap: { event: 'locomotion:snap_turn', trait: 'locomotion' },
  follow: { event: 'locomotion:move', trait: 'locomotion' },
};
