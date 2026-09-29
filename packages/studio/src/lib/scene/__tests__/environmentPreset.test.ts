import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENVIRONMENT_PRESET,
  DREI_ENVIRONMENT_PRESETS,
  resolveEnvironmentPreset,
} from '../environmentPreset';

// Regression coverage for the bug: SceneIRCompiler writes the resolved sky
// preset onto a compiled Environment node's `preset` prop (matching drei's
// own <Environment preset="..."> prop name) at all three of its emission
// sites in packages/core/src/compiler/SceneIRCompiler.ts. Four hand-written
// Studio viewers used to read `props.envPreset` instead — a name nothing in
// the compiler ever writes onto a node — so every named sky silently
// rendered drei's default 'studio' HDRI. This helper is now the single place
// that decides the answer for all four viewers.

describe('resolveEnvironmentPreset', () => {
  it('reads the `preset` key the compiler actually writes', () => {
    // SceneIRCompiler.compileEnvironmentBlock, `environment { skybox: "forest_sunset" }`:
    // ENVIRONMENT_PRESETS.forest_sunset.envPreset ('sunset') is written onto the
    // node's `preset` prop, e.g. `{ background: true, preset: 'sunset' }`.
    expect(resolveEnvironmentPreset({ preset: 'sunset' })).toBe('sunset');
    expect(resolveEnvironmentPreset({ preset: 'sunset', background: true })).toBe('sunset');
  });

  it('accepts every preset name in drei’s own table', () => {
    for (const name of DREI_ENVIRONMENT_PRESETS) {
      expect(resolveEnvironmentPreset({ preset: name })).toBe(name);
    }
  });

  it('falls back to the legacy `envPreset` key when `preset` is absent', () => {
    // Nothing in packages/core, packages/studio or packages/r3f-renderer writes
    // `envPreset` onto a node today (verified via `git grep -n envPreset --
    // packages`) — this is a zero-cost legacy/defensive fallback, not an active
    // contract. `preset` always wins when both are present.
    expect(resolveEnvironmentPreset({ envPreset: 'sunset' })).toBe('sunset');
    expect(resolveEnvironmentPreset({ preset: 'dawn', envPreset: 'sunset' })).toBe('dawn');
  });

  it('clamps an unrecognized preset name to the default instead of forwarding it to drei', () => {
    // SceneIRCompiler's `else` branch (no matching ENVIRONMENT_PRESETS entry)
    // passes the raw, unvalidated skybox name straight through as `preset`:
    // `this.createNode('Environment', { background: true, preset: presetName })`.
    // drei's useEnvironment.validatePreset throws `Preset must be one of: ...`
    // for anything outside its own preset table, so an unrecognized name must
    // clamp here rather than reach <Environment> unchanged.
    expect(resolveEnvironmentPreset({ preset: 'totally_unknown_preset_xyz' })).toBe(
      DEFAULT_ENVIRONMENT_PRESET
    );
    expect(resolveEnvironmentPreset({ envPreset: 'also_not_real' })).toBe(
      DEFAULT_ENVIRONMENT_PRESET
    );
  });

  it('defaults to \'studio\' for a node with no preset at all', () => {
    // SceneIRCompiler emits a bare `Environment` node (props: {}) for an
    // `environment { ... }` block with no skybox/preset property.
    expect(resolveEnvironmentPreset({})).toBe(DEFAULT_ENVIRONMENT_PRESET);
    expect(resolveEnvironmentPreset(undefined)).toBe(DEFAULT_ENVIRONMENT_PRESET);
    expect(resolveEnvironmentPreset(null)).toBe(DEFAULT_ENVIRONMENT_PRESET);
    expect(DEFAULT_ENVIRONMENT_PRESET).toBe('studio');
  });

  it('rejects non-string preset values instead of forwarding them', () => {
    expect(resolveEnvironmentPreset({ preset: 42 })).toBe(DEFAULT_ENVIRONMENT_PRESET);
    expect(resolveEnvironmentPreset({ preset: null })).toBe(DEFAULT_ENVIRONMENT_PRESET);
    expect(resolveEnvironmentPreset({ preset: true })).toBe(DEFAULT_ENVIRONMENT_PRESET);
  });
});
