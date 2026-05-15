import { describe, it, expect } from 'vitest';
import { HoloScriptPlusRuntimeImpl } from '@holoscript/engine/runtime/HoloScriptPlusRuntime'; // Assuming export availability
// Note: HoloScriptPlusRuntimeImpl is not exported in the file. I might need to export it or use a factory.
// Checking file... It's `class HoloScriptPlusRuntimeImpl implements HSPlusRuntime`.
// I need it to be exported.

// Wait, I can't modify the file just for tests without exporting it.
// The file has `export interface HSPlusRuntime`.
// Is there a factory? `createRuntime`?
// I'll check the file content again or just assume I need to export it.
// I will export it in the previous step... wait, I didn't export it.
// I will modify the file to export the class.

import { HSPlusAST } from '../types/HoloScriptPlus';

describe('Runtime Optimization', () => {
  it('should handle 10,000 entities efficiently', () => {
    // Mock AST with 10k nodes
    const root = {
      type: 'group',
      children: [] as any[],
    };

    for (let i = 0; i < 10000; i++) {
      root.children.push({
        type: 'object',
        properties: { position: [i, 0, 0], color: '#fff' },
      });
    }

    const ast: HSPlusAST = {
      root: root as any,
      imports: [],
    };

    // Mock Renderer
    let updateElementCalls = 0;
    const renderer = {
      createElement: () => ({}),
      updateElement: () => {
        updateElementCalls += 1;
      },
      appendChild: () => {},
      destroy: () => {},
    };

    // Instantiate
    // @ts-ignore
    const runtime = new HoloScriptPlusRuntimeImpl(ast, { renderer });
    runtime.mount({});

    // Warmup (Process dirty flags from instantiation)
    runtime.update(0.016);

    // Benchmark steady-state updates. Renderer writes should be skipped by dirty
    // checks even if host scheduling makes a single wall-clock sample noisy.
    updateElementCalls = 0;
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      runtime.update(0.016);
      samples.push(performance.now() - start);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;

    console.log(
      `Steady State Update Time for 10k entities: median=${median.toFixed(3)}ms max=${max.toFixed(3)}ms`
    );

    expect(updateElementCalls).toBe(0);
    expect(median).toBeLessThan(100);
    expect(max).toBeLessThan(250);
  });
});
