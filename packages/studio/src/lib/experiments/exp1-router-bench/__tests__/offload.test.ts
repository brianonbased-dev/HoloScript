import { describe, it, expect } from 'vitest';

import { curatedOffload } from '../offload';
import { EXP1_FULL_SUITE } from '../tasks-extended';
import type { BenchTask } from '../types';

describe('curatedOffload — the Arm-C ecosystem offload (C2 mechanism)', () => {
  it('retrieves the authoritative bounds for a propertyBounds contract', () => {
    const task = EXP1_FULL_SUITE.find((t) => t.id === 'bounds-audio-01')!;
    const o = curatedOffload(task)!;
    expect(o).toContain('audio-safety-v1');
    expect(o).toContain('@audio.volume');
    expect(o).toContain('0.85'); // the max the small model needs but A/B never see
  });

  it('retrieves the forbidden-trait list', () => {
    const task = EXP1_FULL_SUITE.find((t) => t.id === 'trait-forbid-01')!;
    const o = curatedOffload(task)!;
    expect(o).toMatch(/forbidden/i);
    expect(o).toContain('explosive');
  });

  it('retrieves required objects', () => {
    const task = EXP1_FULL_SUITE.find((t) => t.id === 'obj-move-01')!;
    const o = curatedOffload(task)!;
    expect(o).toMatch(/required objects/i);
    expect(o).toContain('fountain');
  });

  it('returns undefined for an unscoped scene (nothing to offload)', () => {
    const unscoped = EXP1_FULL_SUITE.find((t) => t.contract === null)!;
    expect(curatedOffload(unscoped)).toBeUndefined();
  });

  it('provides offload for every scoped task in the suite', () => {
    const scoped = EXP1_FULL_SUITE.filter((t: BenchTask) => t.contract !== null);
    for (const task of scoped) {
      const o = curatedOffload(task);
      expect(o, `${task.id} should have offload`).toBeTruthy();
      expect(o!.length).toBeGreaterThan(20);
    }
  });

  it('does NOT leak offload into Arms A/B — only the scene id is visible there', () => {
    // The contract bounds live in task.contract, never rendered into sceneContext,
    // so A/B genuinely lack what C retrieves. Guard that invariant for bounds tasks.
    const task = EXP1_FULL_SUITE.find((t) => t.id === 'bounds-audio-01')!;
    expect(task.sceneContext).toContain('audio-safety-v1'); // id IS visible
    expect(task.sceneContext).not.toContain('0.85'); // the bound is NOT
  });
});
