import { describe, it, expect } from 'vitest';

import { verifySceneMutation, type ContractResolver } from '../../../brittney/SimContractGate';
import { EXP1_FULL_SUITE } from '../tasks-extended';
import { runTier } from '../run';
import type { BenchTask } from '../types';

function resolverFor(task: BenchTask): ContractResolver {
  return (ref) => (task.contract && ref === task.contract.id ? task.contract : null);
}

describe('EXP1_FULL_SUITE integrity', () => {
  it('loads a meaningfully expanded suite with unique ids', () => {
    expect(EXP1_FULL_SUITE.length).toBeGreaterThanOrEqual(38);
    const ids = EXP1_FULL_SUITE.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scoped task declares its contract id in the scene context', () => {
    for (const task of EXP1_FULL_SUITE) {
      if (task.contract) {
        expect(task.sceneContext).toContain(`"${task.contract.id}"`);
      }
    }
  });

  it('every task has at least one acceptable tool and both arm phrasings', () => {
    for (const task of EXP1_FULL_SUITE) {
      expect(task.acceptableTools.length).toBeGreaterThan(0);
      expect(task.prompt.A.length).toBeGreaterThan(0);
      expect(task.prompt.B.length).toBeGreaterThan(0);
    }
  });

  // ── Discrimination: the generated contracts must actually BITE the oracle ────

  it('propertyBounds tasks discriminate — an over-max value FAILS, an in-bounds value PASSES', () => {
    const boundsTasks = EXP1_FULL_SUITE.filter((t) => t.contract?.propertyBounds);
    expect(boundsTasks.length).toBeGreaterThan(5);
    for (const task of boundsTasks) {
      const resolver = resolverFor(task);
      const traitName = Object.keys(task.contract!.propertyBounds!)[0];
      const key = Object.keys(task.contract!.propertyBounds![traitName])[0];
      const bound = task.contract!.propertyBounds![traitName][key];
      const max = bound.max ?? 1;

      const over = verifySceneMutation(
        task.sceneContext,
        {
          tool: 'set_trait_property',
          input: { trait_name: traitName, property_key: key, property_value: max + 1 },
        },
        resolver
      );
      expect(over.passed, `${task.id}: over-max should fail`).toBe(false);

      const within = verifySceneMutation(
        task.sceneContext,
        {
          tool: 'set_trait_property',
          input: { trait_name: traitName, property_key: key, property_value: max },
        },
        resolver
      );
      expect(within.passed, `${task.id}: in-bounds should pass`).toBe(true);
    }
  });

  it('forbidden-trait tasks discriminate — adding a forbidden trait FAILS', () => {
    const forbidTasks = EXP1_FULL_SUITE.filter(
      (t) => (t.contract?.forbiddenTraits?.length ?? 0) > 0
    );
    expect(forbidTasks.length).toBeGreaterThan(5);
    for (const task of forbidTasks) {
      const resolver = resolverFor(task);
      const forbidden = task.contract!.forbiddenTraits![0];
      const obj = task.sceneContext.match(/#(\w+)/)?.[1] ?? 'x';
      const r = verifySceneMutation(
        task.sceneContext,
        { tool: 'add_trait', input: { object_name: obj, trait_name: forbidden } },
        resolver
      );
      expect(r.passed, `${task.id}: adding forbidden "${forbidden}" should fail`).toBe(false);
    }
  });

  it('requiredObjects tasks discriminate — deleting the required object FAILS', () => {
    const reqObjTasks = EXP1_FULL_SUITE.filter(
      (t) => (t.contract?.requiredObjects?.length ?? 0) > 0
    );
    for (const task of reqObjTasks) {
      const resolver = resolverFor(task);
      const required = task.contract!.requiredObjects![0];
      const r = verifySceneMutation(
        task.sceneContext,
        { tool: 'delete_object', input: { object_name: required } },
        resolver
      );
      expect(r.passed, `${task.id}: deleting required "${required}" should fail`).toBe(false);
    }
  });

  it('tiers the suite honestly by size', () => {
    expect(runTier(8)).toBe('pipeline-smoke');
    expect(runTier(38)).toBe('preliminary');
    expect(runTier(60)).toBe('verdict');
  });
});
