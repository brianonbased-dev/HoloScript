import { describe, it, expect } from 'vitest';

import { verifySceneMutation, type ContractResolver } from '../../../brittney/SimContractGate';
import { EXP1_COMPUTE_SUITE } from '../tasks-compute';
import type { BenchTask, SceneMutation } from '../types';

function resolverFor(task: BenchTask): ContractResolver {
  return (ref) => (task.contract && ref === task.contract.id ? task.contract : null);
}

/** The expected value each accept() gate is checking — derived by probing. */
function expectedValueOf(task: BenchTask): number {
  // accept() checks a single value; binary-search-free probe over a fine grid.
  for (let v = 0; v <= 12; v += 0.001) {
    const rounded = Math.round(v * 1000) / 1000;
    if (task.accept!({ tool: 'set_trait_property', input: { property_value: rounded } })) return rounded;
  }
  throw new Error(`no accepted value found for ${task.id}`);
}

describe('EXP1_COMPUTE_SUITE (EXP-1c separation probe)', () => {
  it('every task has an accept gate and a single acceptable tool', () => {
    for (const t of EXP1_COMPUTE_SUITE) {
      expect(typeof t.accept, t.id).toBe('function');
      expect(t.acceptableTools).toEqual(['set_trait_property']);
    }
  });

  it('accept REJECTS a wrong value that still sits inside the contract bounds', () => {
    for (const task of EXP1_COMPUTE_SUITE) {
      const bounds = Object.values(task.contract!.propertyBounds!)[0];
      const { min = 0, max = 1 } = Object.values(bounds)[0];
      const expected = expectedValueOf(task);
      // A different in-bounds value, nudged BEYOND the accept tolerance (0.01) but
      // still within [min,max] — a plausible miscomputation the oracle would pass.
      const nudge = 0.2;
      const wrong = expected + nudge <= max ? expected + nudge : expected - nudge;
      expect(wrong).toBeGreaterThanOrEqual(min);
      expect(wrong).toBeLessThanOrEqual(max);
      const m: SceneMutation = { tool: 'set_trait_property', input: { property_value: wrong } };
      expect(task.accept!(m), `${task.id}: wrong-but-in-bounds must fail accept`).toBe(false);
    }
  });

  it('the expected value is in-bounds, so a correct answer passes BOTH oracle and accept', () => {
    for (const task of EXP1_COMPUTE_SUITE) {
      const expected = expectedValueOf(task);
      const traitName = Object.keys(task.contract!.propertyBounds!)[0];
      const key = Object.keys(task.contract!.propertyBounds![traitName])[0];
      const mutation: SceneMutation = {
        tool: 'set_trait_property',
        input: { trait_name: traitName, property_key: key, property_value: expected },
      };
      const oracle = verifySceneMutation(task.sceneContext, mutation, resolverFor(task));
      expect(oracle.passed, `${task.id}: expected value must satisfy the contract`).toBe(true);
      expect(task.accept!(mutation), `${task.id}: expected value must satisfy accept`).toBe(true);
    }
  });
});
