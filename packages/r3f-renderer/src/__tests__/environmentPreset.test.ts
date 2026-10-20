import { describe, expect, it } from 'vitest';
import { presetsObj, type PresetsType } from '@react-three/drei/helpers/environment-assets';
import { HoloCompositionParser, HoloScriptPlusParser, SceneIRCompiler } from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';
import {
  DEFAULT_ENVIRONMENT_PRESET,
  DREI_ENVIRONMENT_PRESETS,
  resolveEnvironmentPreset,
  type DreiEnvironmentPreset,
} from '../utils/environmentPreset';

// resolveEnvironmentPreset is the one place a compiled `Environment` node's sky
// becomes the name drei's <Environment preset="..."> accepts. Studio's four
// viewers and holoscript-net's renderer all read it from here.
//
// SceneIRCompiler names the sky with two keys depending on which reading of the
// source made the node: the `.holo` reading writes `preset`; the `.hsplus`
// reading writes `envPreset` for `name: "..."` and copies an author's own
// `preset:` verbatim, so one node can hold both and they can disagree. The
// compiler cases below build real nodes from real source to show each shape.

const drei = Object.keys(presetsObj) as PresetsType[];

describe('resolveEnvironmentPreset', () => {
  it('reads the `preset` key the .holo reading writes', () => {
    // `environment { skybox: "forest_sunset" }` -> { background: true, preset: 'sunset' }
    const compiled: Record<string, unknown> = { background: true, preset: 'sunset' };
    expect(resolveEnvironmentPreset(compiled)).toBe('sunset');
    expect(resolveEnvironmentPreset({ preset: 'sunset' })).toBe('sunset');
  });

  it('accepts every name drei itself ships', () => {
    // Iterates drei's own table, not ours: a name we left out clamps and fails here.
    for (const name of drei) {
      expect(resolveEnvironmentPreset({ preset: name })).toBe(name);
      expect(resolveEnvironmentPreset({ envPreset: name })).toBe(name);
    }
  });

  it('falls back to the `envPreset` key the .hsplus reading writes when `preset` is absent', () => {
    // `environment { name: "forest_sunset" }` -> { envPreset: 'sunset', ... } and no `preset`.
    expect(resolveEnvironmentPreset({ envPreset: 'sunset' })).toBe('sunset');
  });

  it('prefers a usable `preset` over a usable `envPreset`', () => {
    // `environment { name: "forest_sunset" preset: "night" }` -> { preset: 'night', envPreset: 'sunset' }
    expect(resolveEnvironmentPreset({ preset: 'dawn', envPreset: 'sunset' })).toBe('dawn');
  });

  it('does not let an unusable `preset` hide a usable `envPreset`', () => {
    // The regression: `preset ?? envPreset` stops at the first DEFINED value, so a
    // junk or empty `preset` shadowed a valid `envPreset` and the sky went to 'studio'.
    const unusable: unknown[] = [
      'bogus_lighting', // a name drei does not ship
      '', // empty
      'Sunset', // wrong case
      ' sunset ', // padded
      42, // wrong type
      true,
      null,
      { type: 'gradient', top: '#050510' }, // the object form real examples write
    ];
    for (const preset of unusable) {
      expect(resolveEnvironmentPreset({ preset, envPreset: 'sunset' })).toBe('sunset');
    }
  });

  it('clamps to drei’s default when neither key holds a name drei ships', () => {
    // SceneIRCompiler passes an author's unrecognized skybox name through as
    // `preset` unvalidated; drei's useEnvironment THROWS for it, so it must clamp.
    expect(resolveEnvironmentPreset({ preset: 'totally_unknown_preset_xyz' })).toBe(
      DEFAULT_ENVIRONMENT_PRESET
    );
    expect(resolveEnvironmentPreset({ envPreset: 'also_not_real' })).toBe(
      DEFAULT_ENVIRONMENT_PRESET
    );
    expect(resolveEnvironmentPreset({ preset: 'nope', envPreset: 'also_nope' })).toBe(
      DEFAULT_ENVIRONMENT_PRESET
    );
    expect(DEFAULT_ENVIRONMENT_PRESET).toBe('studio');
  });

  it('gives a node with no sky at all drei’s default', () => {
    // An `environment { shadows: true }` block compiles to a bare Environment node.
    expect(resolveEnvironmentPreset({})).toBe(DEFAULT_ENVIRONMENT_PRESET);
    expect(resolveEnvironmentPreset(undefined)).toBe(DEFAULT_ENVIRONMENT_PRESET);
    expect(resolveEnvironmentPreset(null)).toBe(DEFAULT_ENVIRONMENT_PRESET);
  });

  it('never forwards a hostile or malformed name, and never throws', () => {
    const hostile: unknown[] = [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'Sunset',
      'SUNSET',
      ' sunset',
      'sunset ',
      42,
      true,
      {},
      [],
    ];
    for (const value of hostile) {
      expect(resolveEnvironmentPreset({ preset: value })).toBe(DEFAULT_ENVIRONMENT_PRESET);
      expect(resolveEnvironmentPreset({ envPreset: value })).toBe(DEFAULT_ENVIRONMENT_PRESET);
    }
  });
});

describe('DREI_ENVIRONMENT_PRESETS against drei’s own table', () => {
  // The viewers hand this module's answer to drei, which throws for any name
  // outside its own `presetsObj`. Comparing with the installed drei (not with a
  // copy in this file) is what makes deleting 'warehouse' here, or adding a
  // name drei lacks, turn red.
  it('lists exactly the names drei ships', () => {
    expect([...DREI_ENVIRONMENT_PRESETS].sort()).toEqual([...drei].sort());
  });

  it('has a default that drei accepts', () => {
    expect(drei).toContain(DEFAULT_ENVIRONMENT_PRESET);
  });

  it('has no duplicates', () => {
    expect(new Set(DREI_ENVIRONMENT_PRESETS).size).toBe(DREI_ENVIRONMENT_PRESETS.length);
  });

  it('is the same set as drei’s own type (checked by tsc, not at runtime)', () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const same: Same<DreiEnvironmentPreset, PresetsType> = true;
    expect(same).toBe(true);
  });
});

// ── Through the REAL parsers and compiler ───────────────────────────────────

function compileHolo(source: string): R3FNode {
  const result = new HoloCompositionParser().parse(source);
  expect(result.errors ?? []).toEqual([]);
  return new SceneIRCompiler().compileComposition(result.ast ?? result) as R3FNode;
}

function compileHsplus(source: string): R3FNode {
  const result = new HoloScriptPlusParser().parse(source);
  expect(result.errors ?? []).toEqual([]);
  return new SceneIRCompiler().compile(result.ast ?? result) as R3FNode;
}

/** The one compiled `Environment` node in a tree. */
function environmentNode(root: R3FNode): R3FNode {
  const found: R3FNode[] = [];
  const walk = (node: R3FNode) => {
    if (node.type === 'Environment') found.push(node);
    node.children?.forEach(walk);
  };
  walk(root);
  expect(found).toHaveLength(1);
  return found[0];
}

const holo = (envBlock: string) => `composition "Room" {
  ${envBlock}
  object "Floor" { geometry: "plane" }
}`;

// Not wrapped in `composition`, so the viewers take the .hsplus reading too.
const hsplus = (envBlock: string) => `${envBlock}

object "Floor" {
  geometry: "plane"
}
`;

describe('resolveEnvironmentPreset on nodes the real compiler builds', () => {
  describe('.holo reading: writes `preset`', () => {
    // SceneIRCompiler's own six named skies and the drei name each one stands for.
    const compilerSkies: Array<[string, DreiEnvironmentPreset]> = [
      ['forest_sunset', 'sunset'],
      ['cyberpunk_city', 'night'],
      ['space_void', 'night'],
      ['studio', 'studio'],
      ['underwater', 'dawn'],
      ['desert', 'sunset'],
    ];

    it.each(compilerSkies)('skybox "%s" resolves to drei’s "%s"', (skybox, expected) => {
      const env = environmentNode(compileHolo(holo(`environment { skybox: "${skybox}" }`)));
      expect(env.props.preset).toBe(expected);
      expect(resolveEnvironmentPreset(env.props)).toBe(expected);
    });

    it('passes one of drei’s own names straight through', () => {
      const env = environmentNode(compileHolo(holo('environment { skybox: "night" }')));
      expect(env.props.preset).toBe('night');
      expect(resolveEnvironmentPreset(env.props)).toBe('night');
    });

    it('clamps a skybox name nothing maps', () => {
      const env = environmentNode(compileHolo(holo('environment { skybox: "no_such_sky" }')));
      expect(env.props.preset).toBe('no_such_sky'); // the compiler forwards it unvalidated
      expect(resolveEnvironmentPreset(env.props)).toBe(DEFAULT_ENVIRONMENT_PRESET);
    });

    it('gives an environment block with no skybox drei’s default', () => {
      const env = environmentNode(compileHolo(holo('environment { shadows: true }')));
      expect(env.props.preset).toBeUndefined();
      expect(resolveEnvironmentPreset(env.props)).toBe(DEFAULT_ENVIRONMENT_PRESET);
    });
  });

  describe('.hsplus reading: writes `envPreset` for `name:`, keeps an author’s `preset:`', () => {
    it('`name:` alone leaves only `envPreset` on the node, and that is enough', () => {
      const env = environmentNode(
        compileHsplus(hsplus('environment {\n  name: "forest_sunset"\n}'))
      );
      expect(env.props.envPreset).toBe('sunset');
      expect(env.props.preset).toBeUndefined();
      expect(resolveEnvironmentPreset(env.props)).toBe('sunset');
    });

    it('a bogus `preset:` next to `name:` does not hide the named sky', () => {
      const env = environmentNode(
        compileHsplus(
          hsplus('environment {\n  name: "forest_sunset"\n  preset: "bogus_lighting"\n}')
        )
      );
      // Both keys are on the node and they disagree (this is what the test is about).
      expect(env.props.preset).toBe('bogus_lighting');
      expect(env.props.envPreset).toBe('sunset');
      expect(resolveEnvironmentPreset(env.props)).toBe('sunset');
    });

    it('an empty `preset:` next to `name:` does not hide the named sky', () => {
      const env = environmentNode(
        compileHsplus(hsplus('environment {\n  name: "forest_sunset"\n  preset: ""\n}'))
      );
      expect(env.props.preset).toBe('');
      expect(env.props.envPreset).toBe('sunset');
      expect(resolveEnvironmentPreset(env.props)).toBe('sunset');
    });

    it('a real drei `preset:` next to `name:` wins over the named sky', () => {
      const env = environmentNode(
        compileHsplus(hsplus('environment {\n  name: "forest_sunset"\n  preset: "night"\n}'))
      );
      expect(env.props.preset).toBe('night');
      expect(env.props.envPreset).toBe('sunset');
      expect(resolveEnvironmentPreset(env.props)).toBe('night');
    });
  });
});
