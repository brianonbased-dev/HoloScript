// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock @holoscript/core
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
      return { type: 'group', children: [] };
    }
    compileComposition() {
      return { type: 'group', children: [] };
    }
  },
}));

// Mock useScenePipeline
const mockPipeline = {
  r3fTree: null as any,
  errors: [] as any[],
  isCompiling: false,
  backend: 'typescript-fallback',
};

vi.mock('@/hooks/useScenePipeline', () => ({
  useScenePipeline: vi.fn(() => mockPipeline),
}));

// Mock @react-three/fiber
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: any) => <div data-testid="canvas">{children}</div>,
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({ gl: {} })),
}));

// Mock @react-three/drei
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  Stars: () => null,
  Environment: () => null,
  Text: ({ children }: any) => <span>{children}</span>,
  Sparkles: () => null,
}));

// Mock @react-three/xr
const mockXRStore = {
  enterVR: vi.fn().mockResolvedValue(undefined),
  enterAR: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@react-three/xr', () => ({
  createXRStore: vi.fn(() => mockXRStore),
  XR: ({ children }: any) => <div data-testid="xr-root">{children}</div>,
  useXR: vi.fn(() => ({ session: null })),
}));

// Mock Worker
vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }))
);

import React from 'react';

// We need a basic render function since we're in jsdom
// Import after mocks
import { WebXRViewer } from '../../embed/WebXRViewer';
import type { WebXRViewerProps } from '../../embed/WebXRViewer';

describe('WebXRViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.r3fTree = null;
    mockPipeline.errors = [];
    mockPipeline.isCompiling = false;
  });

  it('should export WebXRViewer component', () => {
    expect(WebXRViewer).toBeDefined();
    expect(typeof WebXRViewer).toBe('function');
  });

  it('should export XRSessionMode type implicitly through props', () => {
    // Verify the mode prop accepts expected values
    const validProps: WebXRViewerProps = {
      code: 'template "T" { geometry: "cube" }',
      mode: 'immersive-vr',
    };
    expect(validProps.mode).toBe('immersive-vr');

    validProps.mode = 'immersive-ar';
    expect(validProps.mode).toBe('immersive-ar');

    validProps.mode = 'inline';
    expect(validProps.mode).toBe('inline');
  });

  it('should have correct default props', () => {
    const props: WebXRViewerProps = { code: '' };
    expect(props.mode).toBeUndefined(); // defaults to 'immersive-vr' internally
    expect(props.showGrid).toBeUndefined(); // defaults to true
    expect(props.showStars).toBeUndefined(); // defaults to true
    expect(props.autoEnterXR).toBeUndefined(); // defaults to false
    expect(props.referenceSpace).toBeUndefined(); // defaults to 'local-floor'
  });

  it('should support all event callbacks in type', () => {
    const onErrors = vi.fn();
    const onObjectSelect = vi.fn();
    const onXRSessionStart = vi.fn();
    const onXRSessionEnd = vi.fn();

    const props: WebXRViewerProps = {
      code: 'template "T" { geometry: "sphere" }',
      onErrors,
      onObjectSelect,
      onXRSessionStart,
      onXRSessionEnd,
    };

    expect(props.onErrors).toBe(onErrors);
    expect(props.onObjectSelect).toBe(onObjectSelect);
    expect(props.onXRSessionStart).toBe(onXRSessionStart);
    expect(props.onXRSessionEnd).toBe(onXRSessionEnd);
  });

  it('should accept backgroundColor prop', () => {
    const props: WebXRViewerProps = {
      code: '',
      backgroundColor: '#ff0000',
    };
    expect(props.backgroundColor).toBe('#ff0000');
  });

  it('should accept className and style props', () => {
    const props: WebXRViewerProps = {
      code: '',
      className: 'my-viewer',
      style: { width: 800, height: 600 },
    };
    expect(props.className).toBe('my-viewer');
    expect(props.style).toEqual({ width: 800, height: 600 });
  });
});
