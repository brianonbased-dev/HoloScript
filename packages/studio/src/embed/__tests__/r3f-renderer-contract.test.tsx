// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.mock('@holoscript/core', () => ({
  parseHolo: vi.fn().mockReturnValue({ type: 'composition', body: [] }),
  MATERIAL_PRESETS: {},
  HoloScriptValidator: class {
    validate() {
      return [];
    }
  },
  HoloScriptPlusParser: class {
    parse() {
      return { ast: { type: 'program', body: [] } };
    }
  },
  HoloCompositionParser: class {
    parse() {
      return { ast: { type: 'composition', body: [] } };
    }
  },
  R3FCompiler: class {
    compile() {
      return { type: 'group', props: {}, children: [] };
    }
    compileComposition() {
      return { type: 'group', props: {}, children: [] };
    }
  },
}));

vi.mock('@/hooks/useScenePipeline', () => ({
  useScenePipeline: vi.fn(() => ({
    r3fTree: null,
    errors: [],
    isCompiling: false,
    backend: 'typescript-fallback',
  })),
}));

vi.mock('@/hooks/useSkeletalAnimation', () => ({
  useSkeletalAnimation: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useLoader: vi.fn(),
  useThree: vi.fn(() => ({ gl: {} })),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  Stars: () => null,
  Environment: () => null,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Sparkles: () => null,
  Html: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Detailed: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Float: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  RoundedBox: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Ring: () => null,
  Sphere: () => null,
  useGLTF: vi.fn(() => ({
    scene: { clone: () => ({}) },
    animations: [],
  })),
}));

vi.mock('@react-three/xr', () => ({
  createXRStore: vi.fn(() => ({
    enterVR: vi.fn().mockResolvedValue(undefined),
    enterAR: vi.fn().mockResolvedValue(undefined),
  })),
  XR: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useXR: vi.fn(() => ({ session: null })),
}));

vi.mock('@react-three/postprocessing', () => ({
  EffectComposer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Bloom: () => null,
  SSAO: () => null,
  Vignette: () => null,
  DepthOfField: () => null,
  ChromaticAberration: () => null,
  Noise: () => null,
  ToneMapping: () => null,
}));

import React from 'react';
import { WebSurfaceRenderer, resolveWebSurfaceConfig } from '@holoscript/r3f-renderer';
import { R3FNodeRenderer } from '../../components/scene/R3FNodeRenderer';
import { SceneViewer } from '../SceneViewer';
import { WebXRViewer } from '../WebXRViewer';

describe('Studio R3F renderer contract', () => {
  it('keeps Studio viewer imports aligned with @holoscript/r3f-renderer exports', () => {
    expect(typeof WebSurfaceRenderer).toBe('function');
    expect(typeof resolveWebSurfaceConfig).toBe('function');
    expect(typeof SceneViewer).toBe('function');
    expect(typeof R3FNodeRenderer).toBe('function');
    expect(typeof WebXRViewer).toBe('function');
  });

  it('resolves web surface config for Studio viewers', () => {
    const config = resolveWebSurfaceConfig({
      type: 'mesh',
      props: {
        webSurface: {
          url: 'https://holoscript.studio',
          size: [1024, 768],
        },
      },
      children: [],
      traits: new Map(),
    });

    expect(config).toEqual({
      url: 'https://holoscript.studio',
      size: [1024, 768],
    });
  });
});
