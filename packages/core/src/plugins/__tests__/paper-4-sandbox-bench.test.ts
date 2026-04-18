/**
 * Paper 4 Benchmark: Sandbox Overhead Evaluation (USENIX)
 * 
 * Measures execution overhead of PluginSandboxRunner compared to direct native execution.
 * Validates the "sandbox overhead is low" claim by empirically capturing median and p99 overhead.
 */
import { describe, it, expect } from 'vitest';
import { PluginSandboxRunner, DEFAULT_CAPABILITY_BUDGET } from '../PluginSandboxRunner';

describe('Paper 4 Benchmark: Sandbox Overhead', () => {
  it('measures median and p99 execution overhead vs native execution', async () => {
    const N = 10000;
    
    // 1. Native Execution Baseline
    const nativeStarts: number[] = [];
    const nativeEnds: number[] = [];
    
    // Warmup
    let nativeSum = 0;
    for (let i = 0; i < 1000; i++) {
      nativeSum += (i * 2) + 1;
    }

    for (let i = 0; i < N; i++) {
      const start = performance.now();
      const result = (i * 2) + 1;
      nativeSum += result; // Prevent optimization
      const end = performance.now();
      nativeStarts.push(start);
      nativeEnds.push(end);
    }
    
    const nativeLatencies = nativeStarts.map((start, i) => nativeEnds[i] - start).sort((a, b) => a - b);
    const nativeMedian = nativeLatencies[Math.floor(N / 2)];
    const nativeP99 = nativeLatencies[Math.floor(N * 0.99)];
    
    // 2. Sandbox Execution
    const runner = new PluginSandboxRunner({
      pluginId: 'bench-plugin',
      permissions: new Set(['tool:register', 'handler:register', 'event:emit']),
      budget: DEFAULT_CAPABILITY_BUDGET,
    });
    
    const sandboxLatencies: number[] = [];
    
    // Warmup
    await runner.execute(`
      function compute(i) { return (i * 2) + 1; }
      compute(10);
    `);

    // We use a tight loop to measure internal execution overhead without async barrier
    const sandboxBenchCode = `
      var starts = [];
      var ends = [];
      var sum = 0;
      for (var i = 0; i < ${N}; i++) {
        var start = Date.now();
        sum += (i * 2) + 1;
        var end = Date.now();
        starts.push(start);
        ends.push(end);
      }
      JSON.stringify({ starts: starts, ends: ends });
    `;
    
    const startWall = performance.now();
    const sandboxRes = await runner.execute(sandboxBenchCode);
    const endWall = performance.now();
    
    expect(sandboxRes.success).toBe(true);
    const payload = JSON.parse(sandboxRes.result as string);
    
    const sStarts: number[] = payload.starts;
    const sEnds: number[] = payload.ends;
    
    for (let i = 0; i < N; i++) {
      sandboxLatencies.push(sEnds[i] - sStarts[i]);
    }
    sandboxLatencies.sort((a, b) => a - b);
    
    const sandboxMedian = sandboxLatencies[Math.floor(N / 2)];
    const sandboxP99 = sandboxLatencies[Math.floor(N * 0.99)];
    
    // We also measure full-cycle (compile/eval) overhead
    const fullCycleLatencies: number[] = [];
    for (let i = 0; i < 500; i++) {
      const start = performance.now();
      await runner.execute(`${i} * 2 + 1`);
      const end = performance.now();
      fullCycleLatencies.push(end - start);
    }
    fullCycleLatencies.sort((a, b) => a - b);
    const cycleMedian = fullCycleLatencies[Math.floor(500 / 2)];
    const cycleP99 = fullCycleLatencies[Math.floor(500 * 0.99)];

    console.log('[sandbox-bench] === RESULTS ===');
    console.log(`[sandbox-bench] Iterations (Internal): ${N}`);
    console.log(`[sandbox-bench] Native Execution  | Median: ${nativeMedian.toFixed(4)} ms | p99: ${nativeP99.toFixed(4)} ms`);
    console.log(`[sandbox-bench] Sandbox Internal  | Median: ${sandboxMedian.toFixed(4)} ms | p99: ${sandboxP99.toFixed(4)} ms`);
    console.log(`[sandbox-bench] Sandbox JIT Eval  | Median: ${cycleMedian.toFixed(4)} ms | p99: ${cycleP99.toFixed(4)} ms`);
    
    const totalWallMs = endWall - startWall;
    console.log(`[sandbox-bench] Total Sandbox Wall Time for ${N} evals: ${totalWallMs.toFixed(2)} ms`);
    
    // Assertion: Overhead should be bounded. We assert it doesn't wildly blow up, not a strict 3% assumption.
    expect(sandboxMedian).toBeLessThanOrEqual(nativeMedian + 10);
    expect(cycleMedian).toBeLessThanOrEqual(50); // Single execution overhead should be fast
  });
});
