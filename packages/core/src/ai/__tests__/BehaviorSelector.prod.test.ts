/**
 * BehaviorSelector — Production Test Suite
 *
 * Covers: behavior management, priority/weighted/sequential selection,
 * conditions, lockouts, fallbacks, execution, history tracking.
 */
import { describe, it, expect, vi } from 'vitest';
import { BehaviorSelector, type Behavior } from '../BehaviorSelector';

function makeBehavior(id: string, opts: Partial<Behavior> = {}): Behavior {
  return {
    id,
    name: opts.name ?? id,
    weight: opts.weight ?? 1,
    priority: opts.priority ?? 1,
    condition: opts.condition,
    action: opts.action ?? vi.fn(),
    lockoutMs: opts.lockoutMs ?? 0,
    lastExecuted: opts.lastExecuted ?? -Infinity,
  };
}

describe('BehaviorSelector — Production', () => {
  // ─── Management ───────────────────────────────────────────────────
  it('addBehavior + getBehaviorCount', () => {
    const bs = new BehaviorSelector();
    bs.addBehavior(makeBehavior('a'));
    expect(bs.getBehaviorCount()).toBe(1);
  });

  it('removeBehavior removes by id', () => {
    const bs = new BehaviorSelector();
    bs.addBehavior(makeBehavior('a'));
    bs.removeBehavior('a');
    expect(bs.getBehaviorCount()).toBe(0);
  });

  // ─── Priority Selection ───────────────────────────────────────────
  it('priority mode selects highest priority', () => {
    const bs = new BehaviorSelector('priority');
    bs.addBehavior(makeBehavior('low', { priority: 1 }));
    bs.addBehavior(makeBehavior('high', { priority: 10 }));
    const sel = bs.select();
    expect(sel!.id).toBe('high');
  });

  // ─── Weighted Selection ───────────────────────────────────────────
  it('weighted mode returns a behavior', () => {
    const bs = new BehaviorSelector('weighted');
    bs.addBehavior(makeBehavior('a', { weight: 10 }));
    bs.addBehavior(makeBehavior('b', { weight: 1 }));
    const sel = bs.select();
    expect(sel).not.toBeNull();
  });

  // ─── Sequential Selection ─────────────────────────────────────────
  it('sequential mode cycles through behaviors', () => {
    const bs = new BehaviorSelector('sequential');
    bs.addBehavior(makeBehavior('a'));
    bs.addBehavior(makeBehavior('b'));
    expect(bs.select()!.id).toBe('a');
    expect(bs.select()!.id).toBe('b');
    expect(bs.select()!.id).toBe('a');
  });

  // ─── Conditions ───────────────────────────────────────────────────
  it('condition=false filters behavior', () => {
    const bs = new BehaviorSelector('priority');
    bs.addBehavior(makeBehavior('blocked', { priority: 10, condition: () => false }));
    bs.addBehavior(makeBehavior('ok', { priority: 1 }));
    expect(bs.select()!.id).toBe('ok');
  });

  // ─── Lockout ──────────────────────────────────────────────────────
  it('lockout prevents re-selection within window', () => {
    const bs = new BehaviorSelector('priority');
    bs.addBehavior(makeBehavior('a', { priority: 10, lockoutMs: 1000, lastExecuted: 0 }));
    bs.addBehavior(makeBehavior('b', { priority: 1 }));
    bs.setTime(500); // within lockout
    expect(bs.select()!.id).toBe('b');
    bs.setTime(1001); // past lockout
    expect(bs.select()!.id).toBe('a');
  });

  // ─── Fallback ─────────────────────────────────────────────────────
  it('fallback used when no behaviors available', () => {
    const bs = new BehaviorSelector('priority');
    bs.addBehavior(makeBehavior('a', { condition: () => false }));
    bs.setFallback(makeBehavior('fallback'));
    expect(bs.select()!.id).toBe('fallback');
  });

  // ─── Execute ──────────────────────────────────────────────────────
  it('execute calls action and returns id', () => {
    const bs = new BehaviorSelector('priority');
    const action = vi.fn();
    bs.addBehavior(makeBehavior('a', { action, priority: 1 }));
    const result = bs.execute();
    expect(result).toBe('a');
    expect(action).toHaveBeenCalled();
  });

  it('execute returns null when nothing available', () => {
    const bs = new BehaviorSelector('priority');
    expect(bs.execute()).toBeNull();
  });

  // ─── History ──────────────────────────────────────────────────────
  it('history tracks executions', () => {
    const bs = new BehaviorSelector('priority');
    bs.addBehavior(makeBehavior('a'));
    bs.setTime(100);
    bs.execute();
    const history = bs.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].behaviorId).toBe('a');
    expect(history[0].timestamp).toBe(100);
  });

  // ─── Mode Switching ───────────────────────────────────────────────
  it('setMode changes selection strategy', () => {
    const bs = new BehaviorSelector('priority');
    bs.addBehavior(makeBehavior('a'));
    bs.addBehavior(makeBehavior('b'));
    bs.setMode('sequential');
    expect(bs.select()!.id).toBe('a');
    expect(bs.select()!.id).toBe('b');
  });
});
