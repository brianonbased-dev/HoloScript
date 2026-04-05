import { describe, it, expect, beforeEach } from 'vitest';
import { BehaviorSelector, type Behavior } from '../BehaviorSelector';

function beh(
  id: string,
  priority: number,
  weight = 1,
  lockoutMs = 0,
  condition?: () => boolean
): Behavior {
  return {
    id,
    name: id,
    weight,
    priority,
    condition,
    action: () => {},
    lockoutMs,
    lastExecuted: -Infinity,
  };
}

describe('BehaviorSelector', () => {
  let bs: BehaviorSelector;

  beforeEach(() => {
    bs = new BehaviorSelector('priority');
  });

  // Management
  it('addBehavior increases count', () => {
    bs.addBehavior(beh('a', 1));
    expect(bs.getBehaviorCount()).toBe(1);
  });

  it('removeBehavior removes', () => {
    bs.addBehavior(beh('a', 1));
    bs.removeBehavior('a');
    expect(bs.getBehaviorCount()).toBe(0);
  });

  // Priority mode
  it('select picks highest priority', () => {
    bs.addBehavior(beh('low', 1));
    bs.addBehavior(beh('high', 10));
    const selected = bs.select();
    expect(selected).not.toBeNull();
    expect(selected!.id).toBe('high');
  });

  // Weighted mode
  it('weighted mode selects behavior', () => {
    bs.setMode('weighted');
    bs.addBehavior(beh('a', 1, 100));
    const selected = bs.select();
    expect(selected).not.toBeNull();
    expect(selected!.id).toBe('a');
  });

  // Sequential mode
  it('sequential mode rotates', () => {
    bs.setMode('sequential');
    bs.addBehavior(beh('a', 1));
    bs.addBehavior(beh('b', 1));
    expect(bs.select()!.id).toBe('a');
    expect(bs.select()!.id).toBe('b');
    expect(bs.select()!.id).toBe('a'); // wraps
  });

  // Conditions
  it('select skips behaviors that fail condition', () => {
    bs.addBehavior(beh('blocked', 10, 1, 0, () => false));
    bs.addBehavior(beh('ok', 5));
    const selected = bs.select();
    expect(selected!.id).toBe('ok');
  });

  // Lockout
  it('lockout prevents re-selection', () => {
    bs.addBehavior(beh('a', 10, 1, 1000));
    bs.addBehavior(beh('b', 5));
    bs.setTime(0);
    bs.execute(); // executes 'a'
    bs.setTime(500); // within lockout
    const selected = bs.select();
    expect(selected!.id).toBe('b');
  });

  it('lockout expires after time', () => {
    bs.addBehavior(beh('a', 10, 1, 1000));
    bs.setTime(0);
    bs.execute();
    bs.setTime(2000); // past lockout
    expect(bs.select()!.id).toBe('a');
  });

  // Fallback
  it('returns fallback when no behaviors available', () => {
    bs.setFallback(beh('fallback', 0));
    const selected = bs.select();
    expect(selected!.id).toBe('fallback');
  });

  it('returns null when no fallback and empty', () => {
    expect(bs.select()).toBeNull();
  });

  // Execute
  it('execute runs action and returns id', () => {
    let ran = false;
    bs.addBehavior({
      ...beh('a', 1),
      action: () => {
        ran = true;
      },
    });
    const id = bs.execute();
    expect(id).toBe('a');
    expect(ran).toBe(true);
  });

  it('execute records history', () => {
    bs.addBehavior(beh('a', 1));
    bs.execute();
    expect(bs.getHistory().length).toBe(1);
    expect(bs.getHistory()[0].behaviorId).toBe('a');
  });

  it('execute returns null when nothing available', () => {
    expect(bs.execute()).toBeNull();
  });
});
