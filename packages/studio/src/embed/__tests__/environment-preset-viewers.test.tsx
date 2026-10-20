import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HoloCompositionParser, HoloScriptPlusParser, SceneIRCompiler } from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';

// What reaches drei's <Environment> when each Studio surface renders a scene the
// REAL parsers and compiler built. Four surfaces mount a compiled `Environment`
// node: the viewport's R3FNodeRenderer and the three embed viewers (SceneViewer,
// and DesktopViewer + WebXRViewer, which serve the playground). Each reads the
// sky through resolveEnvironmentPreset from @holoscript/r3f-renderer, and each
// is checked here on its own: a viewer that goes back to reading `props.envPreset`
// directly fails ITS cases, whatever the other three do.
//
// The cases cover both readings of the source. `.holo` (`composition ...`)
// writes `preset`; `.hsplus` writes `envPreset` for `name:` and keeps an
// author's `preset:`, so a node can hold both and they can disagree.

const { envCalls, Null } = vi.hoisted(() => ({
  envCalls: [] as Array<{ preset: unknown; background: unknown }>,
  Null: () => null,
}));

vi.mock('@react-three/drei', () => ({
  Environment: (props: { preset: unknown; background: unknown }) => {
    envCalls.push({ preset: props.preset, background: props.background });
    return null;
  },
  OrbitControls: Null,
  Grid: Null,
  Stars: Null,
  Sparkles: Null,
  Text: Null,
}));
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  useFrame: () => {},
  useThree: () => ({}),
}));
vi.mock('@react-three/xr', () => ({
  XR: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  createXRStore: () => ({}),
}));
vi.mock('@holoscript/xr-embodiment/react', () => ({
  AgentAvatars: Null,
  AgentAvatar: Null,
  useXRLocomotion: () => {},
}));
vi.mock('@/components/vr/VREditSession', () => ({ VREditSession: Null }));

// The renderer package is stubbed except for the one export under test, which is
// the REAL implementation from source: these tests answer "what does this surface
// render for this scene", not "is the stub right".
vi.mock('@holoscript/r3f-renderer', async () => {
  const { resolveEnvironmentPreset } =
    await import('../../../../r3f-renderer/src/utils/environmentPreset');
  return {
    MeshNode: Null,
    ShaderMeshNode: Null,
    hasShaderTrait: () => false,
    AnimatedMeshNode: Null,
    LODMeshNode: Null,
    hasLOD: () => false,
    DraftMeshNode: Null,
    BiologicalMeshNode: Null,
    GaussianSplatViewer: Null,
    HolomapPointCloudViewer: Null,
    WebSurfaceRenderer: Null,
    resolveGaussianSplatSrc: () => null,
    resolveWebSurfaceConfig: () => null,
    partitionStudioChildren: (children: R3FNode[] | undefined) => ({
      batchableDraftMeshes: [],
      rest: children ?? [],
    }),
    buildScatterMesh: () => null,
    resolveEnvironmentPreset,
  };
});

vi.mock('@/lib/stores', () => ({
  useEditorStore: Object.assign(vi.fn(), {
    getState: () => ({ selectedObjectId: null, setSelectedObjectId: vi.fn() }),
  }),
  useSceneGraphStore: vi.fn(),
}));
vi.mock('@/lib/stores/builderStore', () => ({ useBuilderStore: vi.fn() }));
vi.mock('@/components/scene/PostProcessingNode', () => ({ PostProcessingNode: Null }));
vi.mock('@/components/scene/GLTFModelNode', () => ({ GLTFModelNode: Null }));
vi.mock('@/components/scene/CompiledLotusMeshNode', () => ({ CompiledLotusMeshNode: Null }));
vi.mock('@/components/scene/TimelineDriver', () => ({ TimelineDriver: Null }));
vi.mock('@/components/scene/AnimatedTransformGroup', () => ({ AnimatedTransformGroup: Null }));

import { R3FNodeRenderer } from '@/components/scene/R3FNodeRenderer';
import { SceneViewer } from '../SceneViewer';
import { DesktopViewer } from '../DesktopViewer';
import { WebXRViewer } from '../WebXRViewer';

/** Compile the way the viewers do: text that opens with `composition` is .holo, anything else .hsplus. */
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
 * Render `source` on one surface and return what reached drei's <Environment>
 * with `background` on (the compiler marks a named sky `background: true`; the
 * viewers' own fallback skies render with it off, so they are not counted).
 */
function skiesReachingDrei(render: () => string): Array<{ preset: unknown; background: unknown }> {
  envCalls.length = 0;
  render();
  return envCalls.filter((call) => call.background === true).map((call) => ({ ...call }));
}

const surfaces: Array<{ name: string; render: (source: string) => string }> = [
  {
    name: 'R3FNodeRenderer (Studio viewport)',
    render: (source) => renderToStaticMarkup(<R3FNodeRenderer node={compile(source)} />),
  },
  {
    name: 'SceneViewer (embed)',
    render: (source) => renderToStaticMarkup(<SceneViewer code={source} />),
  },
  {
    name: 'DesktopViewer (embed, playground)',
    render: (source) => renderToStaticMarkup(<DesktopViewer code={source} />),
  },
  {
    name: 'WebXRViewer (embed, playground)',
    render: (source) => renderToStaticMarkup(<WebXRViewer code={source} />),
  },
];

const holo = (envBlock: string) => `composition "Room" {
  ${envBlock}
  object "Floor" { geometry: "plane" }
}`;

// Not wrapped in `composition`, so every surface reads it as .hsplus.
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

for (const { name, render } of surfaces) {
  describe(`${name} mounts the compiled Environment node`, () => {
    for (const { label, source, expected } of cases) {
      it(label, () => {
        const skies = skiesReachingDrei(() => render(source));

        // One compiled sky reached drei, and it is the one the scene asked for.
        expect(skies).toEqual([{ preset: expected, background: true }]);
      });
    }
  });
}
