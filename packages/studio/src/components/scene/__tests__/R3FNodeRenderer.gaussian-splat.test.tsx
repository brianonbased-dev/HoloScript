import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { R3FNode } from '@holoscript/core';

const rendererMocks = vi.hoisted(() => ({
  gaussianSplatViewer: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  Environment: () => null,
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
    GaussianSplatViewer: (props: {
      src: string;
      maxSplats?: number;
      position?: unknown;
      rotation?: unknown;
      scale?: unknown;
    }) => {
      rendererMocks.gaussianSplatViewer(props);
      return React.createElement('div', {
        'data-testid': 'gaussian-splat-viewer',
        'data-src': props.src,
        'data-max-splats': props.maxSplats,
      });
    },
    HolomapPointCloudViewer: NullComponent,
    WebSurfaceRenderer: NullComponent,
    resolveGaussianSplatSrc: (node: R3FNode) => {
      const trait = node.traits?.get('gaussian_splat') as Record<string, unknown> | undefined;
      const traitSrc = trait?.source ?? trait?.src ?? trait?.url;
      if (typeof traitSrc === 'string' && traitSrc.length > 0) return traitSrc;
      if (typeof node.props.src === 'string' && node.props.src.length > 0) return node.props.src;
      if (typeof node.props.source === 'string' && node.props.source.length > 0) {
        return node.props.source;
      }
      return null;
    },
    resolveWebSurfaceConfig: () => null,
    partitionStudioChildren: (children: R3FNode[] | undefined) => ({
      batchableDraftMeshes: [],
      rest: children ?? [],
    }),
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

function splatNode(type: 'splat' | 'GaussianSplat'): R3FNode {
  return {
    id: `${type}-node`,
    type,
    props: {
      src: '/assets/kitchen.splat',
      maxSplats: 123_456,
      position: [1, 2, 3],
    },
    children: [],
    traits: new Map(),
  } as R3FNode;
}

describe('R3FNodeRenderer gaussian splat nodes', () => {
  it('mounts GaussianSplatViewer for compiler-emitted splat nodes', () => {
    const markup = renderToStaticMarkup(<R3FNodeRenderer node={splatNode('splat')} />);

    expect(markup).toContain('data-testid="gaussian-splat-viewer"');
    expect(markup).toContain('data-src="/assets/kitchen.splat"');
    expect(rendererMocks.gaussianSplatViewer.mock.calls.at(-1)?.[0]).toMatchObject({
      src: '/assets/kitchen.splat',
      maxSplats: 123_456,
      position: [1, 2, 3],
    });
  });

  it('mounts GaussianSplatViewer for legacy GaussianSplat node types', () => {
    const markup = renderToStaticMarkup(<R3FNodeRenderer node={splatNode('GaussianSplat')} />);

    expect(markup).toContain('data-testid="gaussian-splat-viewer"');
    expect(markup).toContain('data-src="/assets/kitchen.splat"');
    expect(rendererMocks.gaussianSplatViewer.mock.calls.at(-1)?.[0]).toMatchObject({
      src: '/assets/kitchen.splat',
      maxSplats: 123_456,
      position: [1, 2, 3],
    });
  });
});
