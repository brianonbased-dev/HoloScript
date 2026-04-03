/**
 * Tests for @holoscript/video-tutorials
 *
 * Covers: theme constants, walkthroughDuration computation, compiler data
 * structural validation, component rendering with mocked Remotion, and
 * Root composition registry.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Remotion before any component imports ──────────────────────────────

let mockFrame = 0;
let mockFps = 30;

vi.mock('remotion', () => ({
  AbsoluteFill: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) =>
    React.createElement('div', { 'data-testid': 'absolute-fill', style }, children),
  Sequence: ({
    children,
    from,
    durationInFrames,
  }: {
    children: React.ReactNode;
    from: number;
    durationInFrames: number;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'sequence', 'data-from': from, 'data-duration': durationInFrames },
      children,
    ),
  Composition: ({
    id,
    component,
    durationInFrames,
    fps,
    width,
    height,
  }: {
    id: string;
    component: React.ComponentType;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
    defaultProps: Record<string, unknown>;
  }) =>
    React.createElement('div', {
      'data-testid': 'composition',
      'data-id': id,
      'data-duration': durationInFrames,
      'data-fps': fps,
      'data-width': width,
      'data-height': height,
    }),
  useCurrentFrame: () => mockFrame,
  useVideoConfig: () => ({ fps: mockFps, width: 1920, height: 1080, durationInFrames: 900 }),
  interpolate: (
    frame: number,
    inputRange: number[],
    outputRange: number[],
    _options?: Record<string, unknown>,
  ) => {
    // Simplified linear interpolation for tests
    const [inStart, inEnd] = inputRange;
    const [outStart, outEnd] = outputRange;
    if (frame <= inStart) return outStart;
    if (frame >= inEnd) return outEnd;
    const t = (frame - inStart) / (inEnd - inStart);
    return outStart + t * (outEnd - outStart);
  },
  Easing: {
    out: (fn: (t: number) => number) => fn,
    ease: (t: number) => t,
    back: (_overshoot: number) => (t: number) => t,
  },
  registerRoot: vi.fn(),
}));

// ── Imports after mocks ─────────────────────────────────────────────────────

import { theme } from '../src/utils/theme';
import {
  walkthroughDuration,
  type CompilerWalkthroughData,
} from '../src/components/CompilerWalkthroughTemplate';
import { r3fData } from '../src/data/compilers/r3f';
import { androidData } from '../src/data/compilers/android';
import { babylonData } from '../src/data/compilers/babylon';
import { godotData } from '../src/data/compilers/godot';
import { unrealData } from '../src/data/compilers/unreal';
import { usdData } from '../src/data/compilers/usd';
import { wasmData } from '../src/data/compilers/wasm';
import { webgpuData } from '../src/data/compilers/webgpu';
import { vrchatData } from '../src/data/compilers/vrchat';
import { urdfData } from '../src/data/compilers/urdf';

// ── 1. Theme Constants ──────────────────────────────────────────────────────

describe('theme', () => {
  it('should have all required color tokens', () => {
    expect(theme.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.surface).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.text).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.success).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.error).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.warning).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('should have monospace code font and sans-serif title font', () => {
    expect(theme.font).toContain('monospace');
    expect(theme.titleFont).toContain('sans-serif');
  });

  it('should have positive layout values', () => {
    expect(theme.borderRadius).toBeGreaterThan(0);
    expect(theme.padding).toBeGreaterThan(0);
    expect(theme.codePadding).toBeGreaterThan(0);
    expect(theme.fps).toBe(30);
  });
});

// ── 2. walkthroughDuration ──────────────────────────────────────────────────

describe('walkthroughDuration', () => {
  it('should compute correct duration for known data', () => {
    // r3fData has 2 holoSteps + 1 outputStep = 3 steps total
    // Formula: fps*3 + totalSteps * fps*6 + fps*5
    const expected = 30 * 3 + 3 * 30 * 6 + 30 * 5;
    expect(walkthroughDuration(r3fData, 30)).toBe(expected);
  });

  it('should scale with custom fps', () => {
    const at60 = walkthroughDuration(r3fData, 60);
    const at30 = walkthroughDuration(r3fData, 30);
    expect(at60).toBe(at30 * 2);
  });

  it('should handle data with many steps', () => {
    const manySteps: CompilerWalkthroughData = {
      compilerTarget: 'Test',
      outputLanguage: 'JS',
      holoSteps: Array.from({ length: 5 }, (_, i) => ({
        title: `Step ${i}`,
        description: `Desc ${i}`,
        lines: [{ content: 'code' }],
      })),
      outputSteps: Array.from({ length: 3 }, (_, i) => ({
        title: `Out ${i}`,
        description: `Desc ${i}`,
        lines: [{ content: 'output' }],
      })),
    };
    // 8 total steps: 30*3 + 8*30*6 + 30*5 = 90 + 1440 + 150 = 1680
    expect(walkthroughDuration(manySteps, 30)).toBe(1680);
  });

  it('should default to 30 fps when not specified', () => {
    const withDefault = walkthroughDuration(r3fData);
    const explicit30 = walkthroughDuration(r3fData, 30);
    expect(withDefault).toBe(explicit30);
  });
});

// ── 3. Compiler Data Structural Validation ──────────────────────────────────

const allCompilerData: [string, CompilerWalkthroughData][] = [
  ['r3f', r3fData],
  ['android', androidData],
  ['babylon', babylonData],
  ['godot', godotData],
  ['unreal', unrealData],
  ['usd', usdData],
  ['wasm', wasmData],
  ['webgpu', webgpuData],
  ['vrchat', vrchatData],
  ['urdf', urdfData],
];

describe('compiler walkthrough data', () => {
  it.each(allCompilerData)(
    '%s data should have non-empty compilerTarget and outputLanguage',
    (_name, data) => {
      expect(data.compilerTarget.length).toBeGreaterThan(0);
      expect(data.outputLanguage.length).toBeGreaterThan(0);
    },
  );

  it.each(allCompilerData)('%s data should have at least one holo step and one output step', (_name, data) => {
    expect(data.holoSteps.length).toBeGreaterThanOrEqual(1);
    expect(data.outputSteps.length).toBeGreaterThanOrEqual(1);
  });

  it.each(allCompilerData)('%s data steps should have non-empty titles and lines', (_name, data) => {
    const allSteps = [...data.holoSteps, ...data.outputSteps];
    for (const step of allSteps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
      expect(step.lines.length).toBeGreaterThan(0);
    }
  });

  it.each(allCompilerData)('%s data lines should have valid type values', (_name, data) => {
    const allSteps = [...data.holoSteps, ...data.outputSteps];
    const validTypes = new Set(['added', 'removed', 'normal', undefined]);
    for (const step of allSteps) {
      for (const line of step.lines) {
        expect(validTypes.has(line.type)).toBe(true);
      }
    }
  });
});

// ── 4. Component Rendering ──────────────────────────────────────────────────

// We import these after Remotion mock is in place
import { TitleCard } from '../src/components/TitleCard';
import { CodeStep } from '../src/components/CodeStep';
import { CompilerWalkthroughTemplate } from '../src/components/CompilerWalkthroughTemplate';

// Minimal React render helper (no react-testing-library needed)
function renderToString(element: React.ReactElement): string {
  // Use ReactDOMServer for simple rendering validation
  const ReactDOMServer = require('react-dom/server');
  return ReactDOMServer.renderToStaticMarkup(element);
}

describe('TitleCard component', () => {
  beforeEach(() => {
    mockFrame = 15;
    mockFps = 30;
  });

  it('should render with title text', () => {
    const html = renderToString(
      React.createElement(TitleCard, { title: 'Test Video Title' }),
    );
    expect(html).toContain('Test Video Title');
  });

  it('should render subtitle when provided', () => {
    const html = renderToString(
      React.createElement(TitleCard, {
        title: 'Main',
        subtitle: 'A subtitle description',
      }),
    );
    expect(html).toContain('A subtitle description');
  });

  it('should render tag badge when provided', () => {
    const html = renderToString(
      React.createElement(TitleCard, {
        title: 'Demo',
        tag: 'Beginner',
      }),
    );
    expect(html).toContain('Beginner');
  });

  it('should render compilerTarget with accent styling', () => {
    const html = renderToString(
      React.createElement(TitleCard, {
        title: 'HoloScript →',
        compilerTarget: 'Unity',
      }),
    );
    expect(html).toContain('Unity');
    expect(html).toContain(theme.accent);
  });
});

describe('CodeStep component', () => {
  beforeEach(() => {
    mockFrame = 30;
    mockFps = 30;
  });

  it('should render title and description', () => {
    const html = renderToString(
      React.createElement(CodeStep, {
        title: 'Define a Scene',
        description: 'Start with a scene block',
        lines: [{ content: 'scene MyScene {' }],
      }),
    );
    expect(html).toContain('Define a Scene');
    expect(html).toContain('Start with a scene block');
  });

  it('should render line numbers by default', () => {
    const html = renderToString(
      React.createElement(CodeStep, {
        title: 'Code',
        lines: [{ content: 'line one' }, { content: 'line two' }],
      }),
    );
    // Line numbers 1 and 2 should appear
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
  });

  it('should hide line numbers when showLineNumbers is false', () => {
    const html = renderToString(
      React.createElement(CodeStep, {
        title: 'Code',
        lines: [{ content: 'no numbers' }],
        showLineNumbers: false,
      }),
    );
    // The tokenizer splits words, so check for individual tokens
    expect(html).toContain('no');
    expect(html).toContain('numbers');
    // No line number container with min-width:40 (line numbers hidden)
    expect(html).not.toContain('min-width:40');
  });

  it('should render annotations when provided', () => {
    const html = renderToString(
      React.createElement(CodeStep, {
        title: 'Annotated',
        lines: [{ content: 'scene Test {', annotation: 'scene keyword' }],
      }),
    );
    expect(html).toContain('scene keyword');
  });

  it('should show added/removed indicators', () => {
    const html = renderToString(
      React.createElement(CodeStep, {
        title: 'Diff',
        lines: [
          { content: 'added line', type: 'added' },
          { content: 'removed line', type: 'removed' },
        ],
      }),
    );
    expect(html).toContain('+');
    // U+2212 MINUS SIGN used in the component
    expect(html).toContain('\u2212');
  });

  it('should render step counter when stepNumber and totalSteps provided', () => {
    const html = renderToString(
      React.createElement(CodeStep, {
        title: 'Step',
        lines: [{ content: 'code' }],
        stepNumber: 3,
        totalSteps: 7,
      }),
    );
    expect(html).toContain('3 / 7');
  });

  it('should display the language in the tab bar', () => {
    const html = renderToString(
      React.createElement(CodeStep, {
        title: 'Lang',
        language: 'tsx',
        lines: [{ content: 'code' }],
      }),
    );
    expect(html).toContain('scene.tsx');
  });
});

// ── 5. CompilerWalkthroughTemplate ──────────────────────────────────────────

describe('CompilerWalkthroughTemplate', () => {
  beforeEach(() => {
    mockFrame = 0;
    mockFps = 30;
  });

  it('should render title card and sequences for all steps', () => {
    const html = renderToString(
      React.createElement(CompilerWalkthroughTemplate, r3fData),
    );
    // Title card content
    expect(html).toContain('React Three Fiber');
    // Sequences: 1 title + 3 steps + 1 summary = 5
    const sequenceCount = (html.match(/data-testid="sequence"/g) ?? []).length;
    expect(sequenceCount).toBe(5);
  });

  it('should use default summary when summaryItems not provided', () => {
    const dataWithoutSummary: CompilerWalkthroughData = {
      compilerTarget: 'TestTarget',
      outputLanguage: 'JS',
      holoSteps: [{ title: 'Write', description: 'Desc', lines: [{ content: 'code' }] }],
      outputSteps: [{ title: 'Output', description: 'Desc', lines: [{ content: 'out' }] }],
    };
    const html = renderToString(
      React.createElement(CompilerWalkthroughTemplate, dataWithoutSummary),
    );
    expect(html).toContain('TestTargetCompiler.compile(composition)');
    expect(html).toContain('production-ready JS output');
  });
});

// ── 6. Root Composition Registry ────────────────────────────────────────────

describe('RemotionRoot', () => {
  it('should register all expected composition IDs', async () => {
    const { RemotionRoot } = await import('../src/Root');
    const html = renderToString(React.createElement(RemotionRoot));

    const expectedIds = [
      'SyntaxIntroduction',
      'TraitsDeepDive',
      'StateAndLogic',
      'TimelinesAndAnimation',
      'NPCsAndDialogue',
      'TemplatesAndReuse',
      'UnityCompilerWalkthrough',
      'GodotCompilerWalkthrough',
      'BabylonCompilerWalkthrough',
      'R3FCompilerWalkthrough',
      'PythonBindings',
      'MCPServerIntegration',
      'LLMProviderSDK',
      'SecuritySandbox',
      'CICDIntegration',
      'CustomTraitCreation',
    ];

    for (const id of expectedIds) {
      expect(html).toContain(`data-id="${id}"`);
    }
  });

  it('should set all compositions to 1920x1080 at 30fps', async () => {
    const { RemotionRoot } = await import('../src/Root');
    const html = renderToString(React.createElement(RemotionRoot));

    // All compositions should have consistent dimensions
    const compositionCount = (html.match(/data-testid="composition"/g) ?? []).length;
    expect(compositionCount).toBeGreaterThanOrEqual(20); // 6 beginner + 15 compiler + 6 advanced

    const widthMatches = (html.match(/data-width="1920"/g) ?? []).length;
    const heightMatches = (html.match(/data-height="1080"/g) ?? []).length;
    const fpsMatches = (html.match(/data-fps="30"/g) ?? []).length;

    expect(widthMatches).toBe(compositionCount);
    expect(heightMatches).toBe(compositionCount);
    expect(fpsMatches).toBe(compositionCount);
  });
});
