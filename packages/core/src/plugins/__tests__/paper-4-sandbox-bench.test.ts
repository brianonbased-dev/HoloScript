import { describe, it, expect } from 'vitest';
import { PluginSandboxRunner, DEFAULT_CAPABILITY_BUDGET } from '../PluginSandboxRunner';

describe('Paper 4 Benchmark: Sandbox Overhead', () => {
  it('measures median and p99 execution overhead per category', async () => {
    const N = Number(process.env.PAPER_BENCH_N ?? 300);
    
    // 1. VM Creation Overhead
    const vmCreationLatencies: number[] = [];
    for (let i = 0; i < N; i++) {
      const start = performance.now();
      const runner = new PluginSandboxRunner({
        pluginId: `bench-${i}`,
        permissions: new Set(['tool:register']),
        budget: DEFAULT_CAPABILITY_BUDGET,
      });
      // We do one empty execution to force isolate creation
      await runner.execute('"init"');
      const end = performance.now();
      vmCreationLatencies.push(end - start);
    }
    vmCreationLatencies.sort((a, b) => a - b);
    const vmCreationMedian = vmCreationLatencies[Math.floor(N / 2)];
    const vmCreationP99 = vmCreationLatencies[Math.floor(N * 0.99)];

    // 2. Sandbox Boundary Cost (Entry/Exit without compilation overhead)
    // We can't cleanly separate vm2 boundary from JIT compilation via execute(string), 
    // so we measure simple expression execution which bounds the entry/exit + JIT cost.
    const boundaryRunner = new PluginSandboxRunner({
      pluginId: 'boundary-bench',
      permissions: new Set([]),
      budget: DEFAULT_CAPABILITY_BUDGET,
    });
    
    await boundaryRunner.execute('"warmup"');

    const simpleExpLatencies: number[] = [];
    for (let i = 0; i < N; i++) {
      const start = performance.now();
      await boundaryRunner.execute(`1 + 1`);
      const end = performance.now();
      simpleExpLatencies.push(end - start);
    }
    simpleExpLatencies.sort((a, b) => a - b);
    const simpleExpMedian = simpleExpLatencies[Math.floor(N / 2)];
    const simpleExpP99 = simpleExpLatencies[Math.floor(N * 0.99)];

    // 3. JIT Eval Cost (Code Parsing + Execution)
    const jitEvalLatencies: number[] = [];
    for (let i = 0; i < N; i++) {
      const code = `
        var sum = 0;
        for (var j = 0; j < 1000; j++) {
          sum += (j * ${i}) % 100;
        }
        sum;
      `;
      const start = performance.now();
      await boundaryRunner.execute(code);
      const end = performance.now();
      jitEvalLatencies.push(end - start);
    }
    jitEvalLatencies.sort((a, b) => a - b);
    const jitEvalMedian = jitEvalLatencies[Math.floor(N / 2)];
    const jitEvalP99 = jitEvalLatencies[Math.floor(N * 0.99)];

    console.log('[sandbox-bench] === RESULTS ===');
    console.log(`[sandbox-bench] Iterations: ${N}`);
    console.log(`[sandbox-bench] VM Creation       | Median: ${vmCreationMedian.toFixed(2)} ms | p99: ${vmCreationP99.toFixed(2)} ms`);
    console.log(`[sandbox-bench] Simple Expression | Median: ${simpleExpMedian.toFixed(2)} ms | p99: ${simpleExpP99.toFixed(2)} ms`);
    console.log(`[sandbox-bench] JIT Eval Cost     | Median: ${jitEvalMedian.toFixed(2)} ms | p99: ${jitEvalP99.toFixed(2)} ms`);
    
    // Structural checks only: absolute medians vary by CPU/OS load. Paper prose
    // must cite the logged numbers for this machine, not legacy hard caps.
    expect(vmCreationMedian).toBeGreaterThan(0);
    expect(simpleExpMedian).toBeGreaterThan(0);
    expect(jitEvalMedian).toBeGreaterThan(0);
    expect(simpleExpMedian).toBeLessThan(vmCreationMedian);
    expect(simpleExpMedian).toBeLessThan(Math.max(15, vmCreationMedian * 0.9));
    expect(vmCreationMedian).toBeLessThan(10_000);
  }, 120_000);
});
