import { describe, it, expect } from 'vitest';
import { within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHolo } from '@holoscript/core';
import { Native2DCompiler } from '../../../core/src/compiler/Native2DCompiler';
import type { HoloComposition } from '../../../core/src/parser/HoloCompositionTypes';

const PANEL_PATH = join(__dirname, '../lib/studio/panels/profiler.holo');

function compileProfiler(): { react: string; html: string } {
  const ast = parseHolo(readFileSync(PANEL_PATH, 'utf-8')).ast as unknown as HoloComposition;
  const compiler = new Native2DCompiler();
  return {
    react: compiler.generateReactComponent('profiler', ast.objects ?? [], ast, {
      format: 'react',
    }),
    html: compiler.generateHTMLPage('profiler', ast.objects ?? [], ast),
  };
}

function reactTierClassFor(react: string, path: string, value: number): string {
  const m = react.match(new RegExp('\\$\\{(\\(snap\\?\\.' + path + '[^}]+)\\}'));
  if (!m) throw new Error(`no React tier expression found for snap.${path}`);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('snap', `return ${m[1]};`)({ [path]: value }) as string;
}

describe('profiler native readout - React/HTML DOM equivalence', () => {
  it('applies matching @bind value-tier classes for every profiler tier', async () => {
    let JSDOM: typeof import('jsdom').JSDOM;
    try {
      ({ JSDOM } = await import('jsdom'));
    } catch {
      throw new Error('jsdom is required for profiler native DOM equivalence');
    }

    const { react, html } = compileProfiler();
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const doc = dom.window.document;
    expect(within(doc.body).getByText('FPS')).toBeTruthy();
    expect(within(doc.body).getByText('p95 (ms)')).toBeTruthy();

    const apply = (
      dom.window as unknown as {
        __holoApplyNativeBindings: (state: unknown) => void;
      }
    ).__holoApplyNativeBindings;
    expect(typeof apply).toBe('function');

    const cases: Array<{ path: 'fps' | 'p95FrameMs'; value: number }> = [
      { path: 'fps', value: 60 },
      { path: 'fps', value: 40 },
      { path: 'fps', value: 20 },
      { path: 'p95FrameMs', value: 40 },
      { path: 'p95FrameMs', value: 20 },
      { path: 'p95FrameMs', value: 10 },
    ];

    for (const c of cases) {
      apply({
        snap: {
          fps: c.path === 'fps' ? c.value : 60,
          frameMs: 12,
          avgFrameMs: 14,
          p95FrameMs: c.path === 'p95FrameMs' ? c.value : 10,
        },
      });
      const cell = doc.querySelector(`[data-holo-bind-path="${c.path}"]`);
      expect(cell).toBeTruthy();
      const reactTier = reactTierClassFor(react, c.path, c.value);
      expect(cell?.className.split(/\s+/)).toContain(reactTier);
      expect(cell?.textContent).toBe(String(c.value));
    }
  });
});
