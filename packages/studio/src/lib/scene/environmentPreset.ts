/**
 * environmentPreset.ts
 *
 * Single source of truth for resolving a compiled `Environment` node's props
 * into a drei-safe `<Environment preset="...">` value.
 *
 * THE BUG THIS FIXES: SceneIRCompiler (packages/core/src/compiler/SceneIRCompiler.ts)
 * writes the resolved sky preset onto the node's `preset` prop — matching drei's
 * own <Environment preset="..."> prop name — at all three of its Environment
 * emission sites (compileEnvironmentBlock's two branches and the legacy world
 * block's skybox_color branch). `envPreset` is never written onto a node; it is
 * only an internal key inside SceneIRCompiler's own ENVIRONMENT_PRESETS table,
 * used to *compute* the value that then gets written under `preset`. Four
 * hand-written Studio viewers read `props.envPreset` instead of `props.preset`,
 * so every named sky (e.g. `environment { skybox: "forest_sunset" }`) silently
 * rendered drei's default 'studio' HDRI instead of the intended one.
 *
 * Verified 2026-09-29 with `git grep -n envPreset -- packages`: nothing in
 * packages/core, packages/studio or packages/r3f-renderer ever assigns
 * `envPreset` as a node prop — only preset-table entries (not node props) and
 * two packages/core test files asserting the table's own internal shape.
 * `props.envPreset` is kept below as a low-priority, zero-cost legacy fallback
 * (checked only when `props.preset` is absent) in case some emitter outside
 * this monorepo's own compiler still writes that name — not because anything
 * here does today.
 *
 * Used by all four hand-written render surfaces that mount a compiled
 * `Environment` node, so the mapping cannot drift out of sync between copies
 * again the way it did here:
 *   - packages/studio/src/components/scene/R3FNodeRenderer.tsx
 *   - packages/studio/src/embed/DesktopViewer.tsx
 *   - packages/studio/src/embed/SceneViewer.tsx
 *   - packages/studio/src/embed/WebXRViewer.tsx
 */

/**
 * drei's own preset table (`@react-three/drei@10.7.8`,
 * `helpers/environment-assets.js`'s `presetsObj`, mirrored by
 * `core/useEnvironment.js`'s `validatePreset`). `useEnvironment` THROWS
 * `Preset must be one of: ...` for any name outside this set, so a value that
 * didn't come from this list must be clamped before it reaches `<Environment>`.
 */
export const DREI_ENVIRONMENT_PRESETS = [
  'apartment',
  'city',
  'dawn',
  'forest',
  'lobby',
  'night',
  'park',
  'studio',
  'sunset',
  'warehouse',
] as const;

export type DreiEnvironmentPreset = (typeof DREI_ENVIRONMENT_PRESETS)[number];

const DREI_ENVIRONMENT_PRESET_SET: ReadonlySet<string> = new Set(DREI_ENVIRONMENT_PRESETS);

/** drei's own default for an <Environment> with no recognized preset. */
export const DEFAULT_ENVIRONMENT_PRESET: DreiEnvironmentPreset = 'studio';

function isDreiEnvironmentPreset(value: unknown): value is DreiEnvironmentPreset {
  return typeof value === 'string' && DREI_ENVIRONMENT_PRESET_SET.has(value);
}

/**
 * Resolve the drei preset name for a compiled `Environment` node's props.
 *
 * Reads `props.preset` first — the key SceneIRCompiler actually writes.
 * Falls back to the legacy `props.envPreset` name (see module doc) only when
 * `preset` is absent. Any value that isn't one of drei's known preset names —
 * including no value at all, or a custom preset name the compiler's table
 * doesn't carry an HDRI for (SceneIRCompiler emits the raw, unvalidated name
 * when a skybox key isn't in its own ENVIRONMENT_PRESETS table) — clamps to
 * 'studio', matching drei's own default and avoiding the thrown
 * "Preset must be one of: ..." error.
 */
export function resolveEnvironmentPreset(
  props: { preset?: unknown; envPreset?: unknown } | null | undefined
): DreiEnvironmentPreset {
  const candidate = props?.preset ?? props?.envPreset;
  return isDreiEnvironmentPreset(candidate) ? candidate : DEFAULT_ENVIRONMENT_PRESET;
}
