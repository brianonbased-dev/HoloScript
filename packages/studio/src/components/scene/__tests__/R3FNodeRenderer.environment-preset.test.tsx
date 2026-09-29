import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HoloCompositionParser, SceneIRCompiler } from '@holoscript/core';
import type { R3FNode } from '@holoscript/core';

// Reproduces the reported bug end to end: a `.holo` composition with a named
// sky (`environment { skybox: "forest_sunset" }`) compiled by the REAL
// SceneIRCompiler, then rendered by the REAL R3FNodeRenderer, must reach
// drei's <Environment> with preset "sunset" — not the default "studio".
//
// Root cause: SceneIRCompiler.compileEnvironmentBlock
// (packages/core/src/compiler/SceneIRCompiler.ts, ~3227) writes the resolved
// sky onto the node's `preset` prop — matching drei's own <Environment
// preset="..."> prop name. R3FNodeRenderer used to read `props.envPreset`
// instead (a key nothing in the compiler ever writes onto a node), so this
// case silently fell back to 'studio' for every named sky.

vi_mock_drei();
function vi_mock_drei() {
  // Placed in a function only so the explanatory comment above reads before
  // the hoisted mock; vi.mock itself is still hoisted to the top of the file.
}

const environmentCalls: Array<{ preset: unknown; background: unknown }> = [];

vi.mock('@react-three/drei', () => ({
  Environment: (props: { preset: unknown; background: unknown }) => {
    environmentCalls.push(props);
    return React.createElement('div', {
      'data-testid': 'environment',
      'data-preset': String(props.preset),
      'data-background': String(props.background),
    });
  },
  Sparkles: () => null,
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

vi.mock('@holoscript/r3f-renderer', () => {
  const NullComponent = () => null;
  return {
    MeshNode: NullComponent,
    ShaderMeshNode: NullComponent,
    hasShaderTrait: () => false,
    AnimatedMeshNode: NullComponent,
    LODMeshNode: NullComponent,
    hasLOD: () => false,
    DraftMeshNode: NullComponent,
    BiologicalMeshNode: NullComponent,
    GaussianSplatViewer: NullComponent,
    HolomapPointCloudViewer: NullComponent,
    WebSurfaceRenderer: NullComponent,
    resolveGaussianSplatSrc: () => null,
    resolveWebSurfaceConfig: () => null,
    partitionStudioChildren: (children: R3FNode[] | undefined) => ({
      batchableDraftMeshes: [],
      rest: children ?? [],
    }),
    buildScatterMesh: () => null,
  };
});

vi.mock('@/lib/stores', () => ({
  useEditorStore: Object.assign(vi.fn(), {
    getState: () => ({
      selectedObjectId: null,
      setSelectedObjectId: vi.fn(),
    }),
  }),
  useSceneGraphStore: vi.fn(),
}));

vi.mock('@/lib/stores/builderStore', () => ({
  useBuilderStore: vi.fn(),
}));

vi.mock('../PostProcessingNode', () => ({ PostProcessingNode: () => null }));
vi.mock('../GLTFModelNode', () => ({ GLTFModelNode: () => null }));
vi.mock('../CompiledLotusMeshNode', () => ({ CompiledLotusMeshNode: () => null }));
vi.mock('../TimelineDriver', () => ({ TimelineDriver: () => null }));
vi.mock('../AnimatedTransformGroup', () => ({ AnimatedTransformGroup: () => null }));

import { R3FNodeRenderer } from '../R3FNodeRenderer';

/** Parse a `.holo` composition that must read without error. */
function compileHolo(source: string): R3FNode {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  expect(result.errors ?? []).toEqual([]);
  const compiler = new SceneIRCompiler();
  const tree = compiler.compileComposition(result.ast ?? result);
  expect(tree).toBeDefined();
  return tree as R3FNode;
}

/** The compiled `Environment` node the compiler emitted for an environment block, if any. */
function findEnvironmentNode(root: R3FNode): R3FNode | undefined {
  return (root.children ?? []).find((n) => n.type === 'Environment');
}

describe('R3FNodeRenderer renders the compiler-emitted Environment preset', () => {
  it('renders a named skybox at its own preset, not the "studio" default', () => {
    // ENVIRONMENT_PRESETS.forest_sunset.envPreset is 'sunset' — SceneIRCompiler
    // writes that value onto the node's `preset` prop.
    const root = compileHolo(`composition "Room" {
  environment { skybox: "forest_sunset" }
  object "Floor" { geometry: "plane" }
}`);
    const envNode = findEnvironmentNode(root);
    expect(envNode).toBeDefined();
    expect(envNode!.props.preset).toBe('sunset');
    expect(envNode!.props.envPreset).toBeUndefined(); // confirms the compiler never writes this key

    const markup = renderToStaticMarkup(<R3FNodeRenderer node={envNode!} />);

    expect(markup).toContain('data-preset="sunset"');
    expect(markup).not.toContain('data-preset="studio"');
  });

  it('clamps a skybox name outside the compiler’s own preset table to "studio"', () => {
    // No ENVIRONMENT_PRESETS entry for this name: SceneIRCompiler's fallback
    // branch passes the raw, unvalidated name straight through as `preset`
    // (SceneIRCompiler.ts ~3297). drei's useEnvironment would throw
    // "Preset must be one of: ..." for it, so the renderer must clamp.
    const root = compileHolo(`composition "Room" {
  environment { skybox: "totally_unknown_preset_xyz" }
  object "Floor" { geometry: "plane" }
}`);
    const envNode = findEnvironmentNode(root);
    expect(envNode).toBeDefined();
    expect(envNode!.props.preset).toBe('totally_unknown_preset_xyz');

    const markup = renderToStaticMarkup(<R3FNodeRenderer node={envNode!} />);

    expect(markup).toContain('data-preset="studio"');
  });

  it('gives an environment block with no skybox the "studio" default', () => {
    const root = compileHolo(`composition "Room" {
  environment { shadows: true }
  object "Floor" { geometry: "plane" }
}`);
    const envNode = findEnvironmentNode(root);
    expect(envNode).toBeDefined();
    expect(envNode!.props.preset).toBeUndefined();

    const markup = renderToStaticMarkup(<R3FNodeRenderer node={envNode!} />);

    expect(markup).toContain('data-preset="studio"');
  });
});
