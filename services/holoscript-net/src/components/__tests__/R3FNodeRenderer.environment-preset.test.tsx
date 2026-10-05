import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HoloCompositionParser, HoloScriptPlusParser, SceneIRCompiler } from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';

// What reaches drei's <Environment> when holoscript-net's own R3FNodeRenderer
// (the preview on holoscript.net) mounts a scene the REAL parsers and compiler
// built. It compiles with the same SceneIRCompiler as Studio does
// (hooks/useScenePipeline.ts), so it gets the same nodes: `.holo` writes
// `preset`; `.hsplus` writes `envPreset` for `name:` and keeps an author's
// `preset:`, so one node can hold both and they can disagree. This renderer
// used to read only `props.envPreset`, which left every `.holo` named sky on
// drei's default 'studio'. It reads the sky through resolveEnvironmentPreset
// from @holoscript/r3f-renderer now, like Studio's four surfaces
// (packages/studio/src/embed/__tests__/environment-preset-viewers.test.tsx).

const { envCalls, Null } = vi.hoisted(() => ({
  envCalls: [] as Array<{ preset: unknown; background: unknown }>,
  Null: () => null,
}));

vi.mock('@react-three/drei', () => ({
  Environment: (props: { preset: unknown; background: unknown }) => {
    envCalls.push({ preset: props.preset, background: props.background });
    return null;
  },
  Sparkles: Null,
  Text: Null,
}));

// The renderer package is stubbed except for the one export under test, which is
// the REAL implementation from source: this answers "what does this renderer
// draw for this scene", not "is the stub right".
vi.mock('@holoscript/r3f-renderer', async () => {
  const { resolveEnvironmentPreset } = await import(
    '../../../../../packages/r3f-renderer/src/utils/environmentPreset'
  );
  return {
    MeshNode: Null,
    ShaderMeshNode: Null,
    hasShaderTrait: () => false,
    AnimatedMeshNode: Null,
    LODMeshNode: Null,
    hasLOD: () => false,
    DraftMeshNode: Null,
    partitionStudioChildren: (children: R3FNode[] | undefined) => ({
      batchableDraftMeshes: [],
      rest: children ?? [],
    }),
    buildScatterMesh: () => null,
    resolveEnvironmentPreset,
  };
});
vi.mock('../PostProcessingNode', () => ({ PostProcessingNode: Null }));
vi.mock('../GLTFModelNode', () => ({ GLTFModelNode: Null }));
vi.mock('../scene/CompiledLotusMeshNode', () => ({ CompiledLotusMeshNode: Null }));
vi.mock('../scene/TimelineDriver', () => ({ TimelineDriver: Null }));
vi.mock('../scene/AnimatedTransformGroup', () => ({ AnimatedTransformGroup: Null }));

import { R3FNodeRenderer } from '../R3FNodeRenderer';

/** Compile the way the net pipeline does: text that opens with `composition` is .holo, anything else .hsplus. */
function compile(source: string): R3FNode {
  if (source.trimStart().startsWith('composition')) {
    const result = new HoloCompositionParser().parse(source);
    expect(result.errors ?? []).toEqual([]);
    return new SceneIRCompiler().compileComposition(result.ast ?? result) as R3FNode;
  }
  const result = new HoloScriptPlusParser().parse(source);
  expect(result.errors ?? []).toEqual([]);
  return new SceneIRCompiler().compile(result.ast ?? result) as R3FNode;
}

/**
 * Render `source` and return what reached drei's <Environment> with `background`
 * on (the compiler marks a named sky `background: true`).
 */
function skiesReachingDrei(source: string): Array<{ preset: unknown; background: unknown }> {
  const tree = compile(source);
  envCalls.length = 0;
  renderToStaticMarkup(<R3FNodeRenderer node={tree} />);
  return envCalls.filter((call) => call.background === true).map((call) => ({ ...call }));
}

const holo = (envBlock: string) => `composition "Room" {
  ${envBlock}
  object "Floor" { geometry: "plane" }
}`;

// Not wrapped in `composition`, so it is read as .hsplus.
const hsplus = (envBlock: string) => `${envBlock}

object "Floor" {
  geometry: "plane"
}
`;

const cases: Array<{ label: string; source: string; expected: string }> = [
  {
    label: '.holo named sky: skybox "forest_sunset" renders drei’s "sunset"',
    source: holo('environment { skybox: "forest_sunset" }'),
    expected: 'sunset',
  },
  {
    label: '.holo drei name: skybox "night" renders "night"',
    source: holo('environment { skybox: "night" }'),
    expected: 'night',
  },
  {
    label: '.holo unmapped name: skybox "no_such_sky" renders "studio", without throwing',
    source: holo('environment { skybox: "no_such_sky" }'),
    expected: 'studio',
  },
  {
    label: '.hsplus `name:` alone (only `envPreset` is on the node) renders "sunset"',
    source: hsplus('environment {\n  name: "forest_sunset"\n}'),
    expected: 'sunset',
  },
  {
    label: '.hsplus `name:` with a bogus `preset:` still renders "sunset"',
    source: hsplus('environment {\n  name: "forest_sunset"\n  preset: "bogus_lighting"\n}'),
    expected: 'sunset',
  },
  {
    label: '.hsplus `name:` with an empty `preset:` still renders "sunset"',
    source: hsplus('environment {\n  name: "forest_sunset"\n  preset: ""\n}'),
    expected: 'sunset',
  },
  {
    label: '.hsplus `name:` with a real drei `preset: "night"` renders "night"',
    source: hsplus('environment {\n  name: "forest_sunset"\n  preset: "night"\n}'),
    expected: 'night',
  },
];

describe('holoscript-net R3FNodeRenderer mounts the compiled Environment node', () => {
  it.each(cases)('$label', ({ source, expected }) => {
    // One compiled sky reached drei, and it is the one the scene asked for.
    expect(skiesReachingDrei(source)).toEqual([{ preset: expected, background: true }]);
  });
});
