/**
 * environmentPreset.ts
 *
 * Single source of truth for turning a compiled `Environment` node's props into
 * the one thing drei's `<Environment preset="...">` accepts: one of its own ten
 * preset names.
 *
 * Every surface that mounts a compiled `Environment` node reads its sky through
 * here, so the mapping cannot drift between copies again:
 *   - packages/studio/src/components/scene/R3FNodeRenderer.tsx
 *   - packages/studio/src/embed/DesktopViewer.tsx
 *   - packages/studio/src/embed/SceneViewer.tsx
 *   - packages/studio/src/embed/WebXRViewer.tsx
 *   - services/holoscript-net/src/components/R3FNodeRenderer.tsx
 * (All five compile with SceneIRCompiler, so all five get the same nodes.)
 *
 * WHAT THE COMPILER PUTS ON THE NODE. SceneIRCompiler
 * (packages/core/src/compiler/SceneIRCompiler.ts) names the sky with two
 * different keys, depending on which reading of the source produced the node, so
 * a node can carry either key, both, or neither:
 *
 *   `preset`     drei's own prop name.
 *                - The `.holo` composition reading (compileEnvironmentBlock, and
 *                  the legacy world block's skybox_color branch) writes it: the
 *                  ENVIRONMENT_PRESETS entry's drei name, or the author's raw
 *                  name when the table has no entry for it.
 *                - The `.hsplus` reading (mapType) copies the author's own
 *                  `preset: "..."` property onto the node untouched, valid or
 *                  not, and a node's `graphics.lighting.preset` can set it too
 *                  (applyGraphicsConfig).
 *   `envPreset`  the same meaning, under the name used inside SceneIRCompiler's
 *                own ENVIRONMENT_PRESETS table. The `.hsplus` reading writes it:
 *                `environment { name: "forest_sunset" }` runs
 *                Object.assign(props, ENVIRONMENT_PRESETS[name]), which copies
 *                that entry's `envPreset` ('sunset') onto the node.
 *
 * Both keys can therefore sit on one node and disagree. For
 * `environment { name: "forest_sunset" preset: "bogus_lighting" }` the node is
 * `{ preset: "bogus_lighting", envPreset: "sunset" }`. So the answer is the
 * first VALID name, not the first defined one: `preset ?? envPreset` stops at the
 * bogus (or empty) `preset`, clamps it to 'studio', and throws away the valid
 * `envPreset` that the viewers rendered before this helper existed.
 *
 * THE BUG THIS FIXES. The viewers read only `props.envPreset`. The `.holo`
 * reading never writes that key, so every named sky there
 * (`environment { skybox: "forest_sunset" }`) silently rendered drei's default
 * 'studio' HDRI instead of the intended one. The `.hsplus` reading did write it,
 * which is why a fix that read only `preset` would have broken that reading.
 *
 * Only these two keys, on an Environment node, are read. Other `preset` props
 * (material objects, reverb zones) sit on other nodes and are never passed here.
 */

/**
 * drei's own preset table (`@react-three/drei@10.7.8`,
 * `helpers/environment-assets.js`'s `presetsObj`, mirrored by
 * `core/useEnvironment.js`'s `validatePreset`). `useEnvironment` THROWS
 * `Preset must be one of: ...` for any name outside this set, so a value that
 * didn't come from this list must be clamped before it reaches `<Environment>`.
 *
 * environmentPreset.test.ts compares this list with drei's own `presetsObj`, so
 * a drei upgrade that adds or drops a name fails that test instead of drifting.
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
 * Returns the first of `props.preset`, then `props.envPreset` that is one of
 * drei's own names (see the module doc for which reading writes which key).
 * A key that is absent, empty, the wrong type, wrong-cased, padded, or a name
 * drei does not ship (SceneIRCompiler passes an author's unrecognized skybox
 * name through as `preset`, unvalidated) is skipped rather than allowed to hide
 * the other key. When neither key holds a drei name the result is 'studio',
 * drei's own default, so the thrown "Preset must be one of: ..." never happens.
 */
export function resolveEnvironmentPreset(
  props: { preset?: unknown; envPreset?: unknown } | null | undefined
): DreiEnvironmentPreset {
  return (
    [props?.preset, props?.envPreset].find(isDreiEnvironmentPreset) ?? DEFAULT_ENVIRONMENT_PRESET
  );
}
