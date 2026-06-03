import { describe, it, expect } from 'vitest';

import { liveOffload } from '../liveOffload';
import { EXP1_FULL_SUITE } from '../tasks-extended';

const scoped = EXP1_FULL_SUITE.filter((t) => t.contract?.propertyBounds);

describe('liveOffload (at-scale retrieval)', () => {
  it('always includes the scene’s true contract among the candidates', () => {
    for (const task of scoped) {
      const out = liveOffload(task);
      expect(out, task.id).toBeDefined();
      expect(out!).toContain(`"${task.contract!.id}"`);
    }
  });

  it('returns MULTIPLE candidates (noise present — not a perfect oracle)', () => {
    const out = liveOffload(scoped[0]) ?? '';
    const candidateCount = (out.match(/contract "/g) ?? []).length;
    expect(candidateCount).toBeGreaterThan(1);
  });

  it('returns undefined for an unscoped task', () => {
    const unscoped = { ...scoped[0], contract: null };
    expect(liveOffload(unscoped)).toBeUndefined();
  });

  it('surfaces the true contract’s real bound (so a correct read is possible)', () => {
    const task = scoped[0];
    const bound = Object.values(Object.values(task.contract!.propertyBounds!)[0])[0];
    const out = liveOffload(task) ?? '';
    // the true max should appear in the formatted candidate block
    expect(out).toContain(String(bound.max));
  });
});
