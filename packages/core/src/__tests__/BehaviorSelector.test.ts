import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorSelector, type Behavior } from '../ai/BehaviorSelector';

// =============================================================================
// C280 — Behavior Selector
// =============================================================================

function behavior(id: string, priority: number, weight: number, lockoutMs = 0): Behavior {
  return { id, name: id, weight, priority, action: vi.fn(), lockoutMs, lastExecuted: -Infinity };
}

describe('BehaviorSelector', () => {
  let sel: BehaviorSelector;
  beforeEach(() => { sel = new BehaviorSelector('priority'); });

  it('addBehavior and getBehaviorCount', () => {
    sel.addBehavior(behavior('a', 1, 1));
    expect(sel.getBehaviorCount()).toBe(1);
  });

  it('removeBehavior removes by id', () => {
    sel.addBehavior(behavior('a', 1, 1));
    sel.removeBehavior('a');
    expect(sel.getBehaviorCount()).toBe(0);
  });

  it('priority mode selects highest priority', () => {
    sel.addBehavior(behavior('low', 1, 1));
    sel.addBehavior(behavior('high', 10, 1));
    const selected = sel.select();
    expect(selected!.id).toBe('high');
  });

  it('sequential mode cycles through behaviors', () => {
    sel.setMode('sequential');
    sel.addBehavior(behavior('a', 1, 1));
    sel.addBehavior(behavior('b', 1, 1));
    sel.addBehavior(behavior('c', 1, 1));
    const first = sel.select()!.id;
    const second = sel.select()!.id;
    const third = sel.select()!.id;
    expect([first, second, third]).toEqual(['a', 'b', 'c']);
  });

  it('lockout prevents re-selection within lockout window', () => {
    sel.addBehavior(behavior('only', 10, 1, 1000));
    sel.setTime(0);
    sel.execute(); // executes at t=0
    sel.setTime(500); // still within 1000ms lockout
    expect(sel.select()).toBeNull(); // no fallback, no available
  });

  it('fallback returns when no behaviors available', () => {
    const fb = behavior('fallback', 0, 0);
    sel.setFallback(fb);
    expect(sel.select()!.id).toBe('fallback');
  });

  it('condition prevents selection if false', () => {
    const b = behavior('guarded', 10, 1);
    b.condition = () => false;
    sel.addBehavior(b);
    expect(sel.select()).toBeNull();
  });

  it('execute calls action and records history', () => {
    const b = behavior('act', 5, 1);
    sel.addBehavior(b);
    sel.setTime(100);
    const id = sel.execute();
    expect(id).toBe('act');
    expect(b.action).toHaveBeenCalled();
    expect(sel.getHistory()).toHaveLength(1);
    expect(sel.getHistory()[0].behaviorId).toBe('act');
  });

  it('execute returns null when nothing available and no fallback', () => {
    expect(sel.execute()).toBeNull();
  });

  it('weighted mode distributes selections', () => {
    sel.setMode('weighted');
    sel.addBehavior(behavior('heavy', 1, 100));
    sel.addBehavior(behavior('light', 1, 1));
    // Over many selections, heavy should dominate
    const counts: Record<string, number> = { heavy: 0, light: 0 };
    for (let i = 0; i < 100; i++) counts[sel.select()!.id]++;
    expect(counts.heavy).toBeGreaterThan(80);
  });
});
