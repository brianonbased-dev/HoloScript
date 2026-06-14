/**
 * E2 native panel — render-time threshold correctness.
 *
 * Proves the @bind value-tier styling flips at the right thresholds at RUNTIME: it extracts the
 * exact className expression the compiler emits for the FPS and p95 cells and evaluates it for
 * representative values + the precise tier boundaries.
 *
 * Why eval the expression instead of mounting the component: a full React mount would need a JSX
 * transpiler at test time (esbuild transformSync), which cannot run inside vitest's jsdom env (a
 * TextEncoder invariant clash) — and would add nothing, because React simply applies
 * `className = <the result of this expression>`. Evaluating the emitted expression IS the
 * render-time behaviour that decides the color.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHolo } from '@holoscript/core';
import { Native2DCompiler } from '../../../core/src/compiler/Native2DCompiler';
import type { HoloComposition } from '../../../core/src/parser/HoloCompositionTypes';

const PANEL_PATH = join(__dirname, '../lib/studio/panels/profiler.holo');

function compileProfiler(): string {
  const ast = parseHolo(readFileSync(PANEL_PATH, 'utf-8')).ast as unknown as HoloComposition;
  return new Native2DCompiler().generateReactComponent('profiler', ast.objects ?? [], ast, {
    format: 'react',
  });
}

/** Extract the `${...}` value-tier ternary the compiler emits for a bound path, then evaluate it. */
function tierClassFor(path: string, value: number): string {
  const code = compileProfiler();
  const m = code.match(new RegExp('\\$\\{(\\(snap\\?\\.' + path + '[^}]+)\\}'));
  if (!m) throw new Error(`no tier expression found for snap.${path}`);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('snap', `return ${m[1]};`)({ [path]: value }) as string;
}

describe('profiler native readout — render-time threshold correctness', () => {
  it('FPS cell resolves green / amber / red by magnitude', () => {
    expect(tierClassFor('fps', 60)).toBe('text-green-400');
    expect(tierClassFor('fps', 40)).toBe('text-yellow-400');
    expect(tierClassFor('fps', 20)).toBe('text-red-400');
  });

  it('FPS flips exactly at the 55 and 30 thresholds', () => {
    expect(tierClassFor('fps', 55)).toBe('text-green-400');
    expect(tierClassFor('fps', 54)).toBe('text-yellow-400');
    expect(tierClassFor('fps', 30)).toBe('text-yellow-400');
    expect(tierClassFor('fps', 29)).toBe('text-red-400');
  });

  it('p95 cell resolves red / amber / green (higher is worse)', () => {
    expect(tierClassFor('p95FrameMs', 40)).toBe('text-red-400');
    expect(tierClassFor('p95FrameMs', 20)).toBe('text-yellow-400');
    expect(tierClassFor('p95FrameMs', 10)).toBe('text-green-400');
  });
});
