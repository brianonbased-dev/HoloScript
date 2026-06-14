/**
 * E2 native panel — profiler readout (@hook + @bind value-tier styling)
 *
 * Proves the canonical example from the founder's directive compiles natively: the profiler
 * FPS/Frame/Avg/p95 readout, with FPS/p95 colored by threshold (green/amber/red), authored as
 * packages/studio/src/lib/studio/panels/profiler.holo and compiled by Native2DCompiler — no
 * hand-written .tsx ternary. The data bridge is the @hook trait (useProfiler -> { snap }), the
 * companion to @fetch for panels whose source is a React hook rather than an endpoint.
 *
 * Scope honesty: this is a native RE-AUTHORING of the readout subset, not a pixel-identical clone
 * of ProfilerPanel.tsx (units live in the labels; the RAF waterfall/controls stay hand-written
 * React, out of declarative scope). The win is that threshold-styled stat cards compile natively.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { parseHolo } from '@holoscript/core';
import { Native2DCompiler } from '../../../core/src/compiler/Native2DCompiler';
import type { HoloComposition } from '../../../core/src/parser/HoloCompositionTypes';

const PANEL_PATH = join(__dirname, '../lib/studio/panels/profiler.holo');

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function compileProfiler(): string {
  const src = readFileSync(PANEL_PATH, 'utf-8');
  const result = parseHolo(src);
  if (!result.success || !result.ast) {
    throw new Error('profiler.holo parse failed: ' + JSON.stringify(result.errors ?? []));
  }
  const ast = result.ast as unknown as HoloComposition;
  return new Native2DCompiler().generateReactComponent('profiler', ast.objects ?? [], ast, {
    format: 'react',
  });
}

describe('E2 native panel — profiler readout', () => {
  it('parses without errors', () => {
    const r = parseHolo(readFileSync(PANEL_PATH, 'utf-8'));
    expect(r.success).toBe(true);
    expect(r.errors ?? []).toHaveLength(0);
  });

  it('bridges the useProfiler hook into the component (@hook trait)', () => {
    const react = compileProfiler();
    expect(react).toContain(`import { useProfiler } from '@/hooks/useProfiler';`);
    expect(react).toContain('const { snap } = useProfiler();');
  });

  it('emits the FPS value-tier cascade (green/yellow/red) natively', () => {
    const react = compileProfiler();
    expect(react).toContain('(snap?.fps ?? 0) >= 55 ? "text-green-400"');
    expect(react).toContain('(snap?.fps ?? 0) >= 30 ? "text-yellow-400"');
    expect(react).toContain('"text-red-400"');
  });

  it('emits the p95 higher-is-worse cascade (red/yellow/green) natively', () => {
    const react = compileProfiler();
    expect(react).toContain('(snap?.p95FrameMs ?? 0) > 33 ? "text-red-400"');
    expect(react).toContain('(snap?.p95FrameMs ?? 0) > 16.67 ? "text-yellow-400"');
  });

  it('binds all four stat values to the hook snap', () => {
    const react = compileProfiler();
    expect(react).toContain('{snap?.fps ?? "0"}');
    expect(react).toContain('{snap?.frameMs ?? "0"}');
    expect(react).toContain('{snap?.avgFrameMs ?? "0"}');
    expect(react).toContain('{snap?.p95FrameMs ?? "0"}');
  });

  it('is byte-stable across two compilations', () => {
    expect(sha256(compileProfiler())).toBe(sha256(compileProfiler()));
  });
});
