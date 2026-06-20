import { describe, expect, it } from 'vitest';
import { handleSimulationTool } from '../simulation-tools';

// gcd oracle in the .hs logic layer (same grammar as the verifiable-math oracles/*.hs).
const GCD = `function gcd(a, b) {
  let x = abs(a)
  let y = abs(b)
  while (y != 0) {
    const t = y
    y = x % y
    x = t
  }
  return x
}`;

describe('solve_logic MCP tool', () => {
  it('executes a .hs logic function and returns a CAEL receipt with a verifyUrl', async () => {
    const res = (await handleSimulationTool('solve_logic', {
      code: GCD,
      functionName: 'gcd',
      args: [48, 36],
    })) as Record<string, unknown>;
    expect(res.success).toBe(true);
    expect(res.result).toBe(12); // gcd(48, 36)
    expect(res.verified).toBe(true);
    expect(typeof res.caelTraceId).toBe('string');
    expect((res.traceJSONL as string).length).toBeGreaterThan(0);
    expect(res.verifyUrl as string).toContain('/verify-cael?traceId=');
  });

  it('verify_cael_trace RE-RUNS the logic and confirms the result (re-runnable proof)', async () => {
    const solved = (await handleSimulationTool('solve_logic', {
      code: GCD,
      functionName: 'gcd',
      args: [1071, 462],
    })) as Record<string, unknown>;
    expect(solved.result).toBe(21);

    const verdict = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: solved.traceJSONL,
    })) as Record<string, unknown>;
    expect(verdict.success).toBe(true);
    expect(verdict.hashChainValid).toBe(true);
    expect(verdict.replayValid).toBe(true); // re-execution reproduced the result
    expect(verdict.solverType).toBe('hs-logic');
    expect(verdict.replayResult).toBe(21);
  });

  it('detects tampering — a modified recorded result fails verification', async () => {
    const solved = (await handleSimulationTool('solve_logic', {
      code: GCD,
      functionName: 'gcd',
      args: [100, 64],
    })) as Record<string, unknown>;
    expect(solved.result).toBe(4);

    // Flip the recorded result 4 -> 7 inside the hashed payload. The hash chain breaks (the
    // result is part of the hashed final entry), so verification fails — tamper-evident.
    const tampered = (solved.traceJSONL as string).replace('"result":4', '"result":7');
    expect(tampered).not.toBe(solved.traceJSONL);
    const verdict = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: tampered,
    })) as Record<string, unknown>;
    expect(verdict.success).toBe(false);
  });

  it('rejects logic that references a blocked global (security gate holds end to end)', async () => {
    const res = (await handleSimulationTool('solve_logic', {
      code: 'function leak() { return process }',
      functionName: 'leak',
      args: [],
    })) as Record<string, unknown>;
    expect(res.success).toBe(false);
  });
});
