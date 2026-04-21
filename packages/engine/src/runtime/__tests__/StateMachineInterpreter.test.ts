/**
 * StateMachineInterpreter tests
 *
 * Covers the pure interpreter surface (no expression evaluator dependency).
 * The host runtime wires setHookExecutor / setGuardEvaluator; here we inject
 * spies to observe ordering and verify contract.
 *
 * Contract under test:
 *   - createInstance registers and fires initial onEntry
 *   - sendEvent matches (from,event), runs exit → state change → entry
 *   - unmatched events are tolerated (no throw, returns false)
 *   - guard expressions gate conditional transitions
 *   - entry/exit hooks receive the instance context
 *   - removeInstance discards registration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StateMachineInterpreter,
  type HookExecutor,
  type GuardEvaluator,
} from '../StateMachineInterpreter';
import type { StateMachineNode } from '@holoscript/core';

// Minimal StateMachineNode factory — avoids depending on the full ASTNode hierarchy.
function makeMachine(
  name: string,
  initialState: string,
  states: Array<{ name: string; onEntry?: string; onExit?: string }>,
  transitions: Array<{ from: string; to: string; event: string; condition?: string }>
): StateMachineNode {
  return {
    type: 'state-machine',
    name,
    initialState,
    states: states.map((s) => ({ type: 'state', ...s })),
    transitions: transitions.map((t) => ({ type: 'transition', ...t })),
  } as unknown as StateMachineNode;
}

// ── createInstance ──────────────────────────────────────────────────────────

describe('StateMachineInterpreter — createInstance', () => {
  let sm: StateMachineInterpreter;
  beforeEach(() => {
    sm = new StateMachineInterpreter();
  });

  it('registers the instance and seeds currentState to initialState', () => {
    const machine = makeMachine('door', 'closed', [{ name: 'closed' }, { name: 'open' }], []);
    const inst = sm.createInstance('door-1', machine, {});
    expect(inst.currentState).toBe('closed');
    expect(sm.getInstance('door-1')).toBe(inst);
  });

  it('fires initial onEntry with instance context', () => {
    const hook = vi.fn();
    sm.setHookExecutor(hook);
    const machine = makeMachine('door', 'closed', [{ name: 'closed', onEntry: 'log("entered")' }], []);
    sm.createInstance('door-1', machine, { owner: 'alice' });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith('log("entered")', { owner: 'alice' });
  });

  it('does not fire onEntry when initial state has no onEntry', () => {
    const hook = vi.fn();
    sm.setHookExecutor(hook);
    const machine = makeMachine('door', 'closed', [{ name: 'closed' }], []);
    sm.createInstance('door-1', machine, {});
    expect(hook).not.toHaveBeenCalled();
  });
});

// ── sendEvent / transitionTo — ordering ─────────────────────────────────────

describe('StateMachineInterpreter — transition ordering', () => {
  it('runs exit → state change → entry in order', () => {
    const sm = new StateMachineInterpreter();
    const order: string[] = [];
    sm.setHookExecutor((code) => {
      // Track which hook fired and what state we're in when the exit fires
      // (exit must run BEFORE currentState changes; entry AFTER).
      order.push(`${code}@${sm.getInstance('door-1')?.currentState}`);
    });

    const machine = makeMachine(
      'door',
      'closed',
      [
        { name: 'closed', onEntry: 'enter-closed', onExit: 'exit-closed' },
        { name: 'open', onEntry: 'enter-open', onExit: 'exit-open' },
      ],
      [{ from: 'closed', to: 'open', event: 'unlock' }]
    );

    sm.createInstance('door-1', machine, {});
    // initial onEntry fires while currentState is already 'closed'
    expect(order).toEqual(['enter-closed@closed']);

    const fired = sm.sendEvent('door-1', 'unlock');
    expect(fired).toBe(true);

    // Expected order: exit-closed (while currentState still 'closed'),
    // then enter-open (after change, currentState == 'open').
    expect(order).toEqual([
      'enter-closed@closed',
      'exit-closed@closed',
      'enter-open@open',
    ]);
    expect(sm.getInstance('door-1')!.currentState).toBe('open');
  });
});

// ── unmatched-event tolerance ───────────────────────────────────────────────

describe('StateMachineInterpreter — unmatched events', () => {
  it('returns false and does not throw when no transition matches', () => {
    const sm = new StateMachineInterpreter();
    const hook = vi.fn();
    sm.setHookExecutor(hook);
    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed' }, { name: 'open' }],
      [{ from: 'closed', to: 'open', event: 'unlock' }]
    );
    sm.createInstance('door-1', machine, {});

    expect(() => sm.sendEvent('door-1', 'kick')).not.toThrow();
    expect(sm.sendEvent('door-1', 'kick')).toBe(false);
    expect(sm.getInstance('door-1')!.currentState).toBe('closed');
    // no hook fired for the unmatched event
    expect(hook).not.toHaveBeenCalled();
  });

  it('returns false when id is unknown', () => {
    const sm = new StateMachineInterpreter();
    expect(sm.sendEvent('ghost', 'any')).toBe(false);
  });
});

// ── guard evaluation ────────────────────────────────────────────────────────

describe('StateMachineInterpreter — guards', () => {
  it('blocks transition when guard is falsy', () => {
    const sm = new StateMachineInterpreter();
    const guard: GuardEvaluator = vi.fn((expr, ctx) => {
      // emulate expression eval against context
      if (expr === 'hasKey') return (ctx as any).hasKey === true;
      return false;
    });
    sm.setGuardEvaluator(guard);

    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed' }, { name: 'open' }],
      [{ from: 'closed', to: 'open', event: 'unlock', condition: 'hasKey' }]
    );

    sm.createInstance('door-1', machine, { hasKey: false });
    expect(sm.sendEvent('door-1', 'unlock')).toBe(false);
    expect(sm.getInstance('door-1')!.currentState).toBe('closed');
    expect(guard).toHaveBeenCalledWith('hasKey', { hasKey: false });
  });

  it('fires transition when guard is truthy', () => {
    const sm = new StateMachineInterpreter();
    sm.setGuardEvaluator((expr, ctx) => (ctx as any)[expr] === true);

    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed' }, { name: 'open' }],
      [{ from: 'closed', to: 'open', event: 'unlock', condition: 'hasKey' }]
    );

    sm.createInstance('door-1', machine, { hasKey: true });
    expect(sm.sendEvent('door-1', 'unlock')).toBe(true);
    expect(sm.getInstance('door-1')!.currentState).toBe('open');
  });

  it('picks the first matching guarded transition among multiple candidates', () => {
    const sm = new StateMachineInterpreter();
    sm.setGuardEvaluator((expr, ctx) => (ctx as any)[expr] === true);

    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed' }, { name: 'open' }, { name: 'alarm' }],
      [
        // Unlock only fires the alarm path when intruder is true; otherwise opens normally.
        { from: 'closed', to: 'alarm', event: 'unlock', condition: 'intruder' },
        { from: 'closed', to: 'open', event: 'unlock' },
      ]
    );

    sm.createInstance('door-1', machine, { intruder: true });
    expect(sm.sendEvent('door-1', 'unlock')).toBe(true);
    expect(sm.getInstance('door-1')!.currentState).toBe('alarm');

    sm.createInstance('door-2', machine, { intruder: false });
    expect(sm.sendEvent('door-2', 'unlock')).toBe(true);
    expect(sm.getInstance('door-2')!.currentState).toBe('open');
  });

  it('treats guard as passing if no guard evaluator is registered (ungated fallback)', () => {
    const sm = new StateMachineInterpreter();
    // no setGuardEvaluator
    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed' }, { name: 'open' }],
      [{ from: 'closed', to: 'open', event: 'unlock', condition: 'anything' }]
    );
    sm.createInstance('door-1', machine, {});
    expect(sm.sendEvent('door-1', 'unlock')).toBe(true);
    expect(sm.getInstance('door-1')!.currentState).toBe('open');
  });

  it('treats guard as failing if the evaluator throws', () => {
    const sm = new StateMachineInterpreter();
    sm.setGuardEvaluator(() => {
      throw new Error('bad expression');
    });
    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed' }, { name: 'open' }],
      [{ from: 'closed', to: 'open', event: 'unlock', condition: 'hasKey' }]
    );
    sm.createInstance('door-1', machine, {});
    expect(sm.sendEvent('door-1', 'unlock')).toBe(false);
    expect(sm.getInstance('door-1')!.currentState).toBe('closed');
  });
});

// ── hook executor failure tolerance ─────────────────────────────────────────

describe('StateMachineInterpreter — hook failure tolerance', () => {
  it('state still changes even if entry/exit hook throws', () => {
    const sm = new StateMachineInterpreter();
    const exec: HookExecutor = vi.fn(() => {
      throw new Error('hook exploded');
    });
    sm.setHookExecutor(exec);

    const machine = makeMachine(
      'door',
      'closed',
      [
        { name: 'closed', onEntry: 'boom' },
        { name: 'open', onEntry: 'boom', onExit: 'boom' },
      ],
      [{ from: 'closed', to: 'open', event: 'unlock' }]
    );

    sm.createInstance('door-1', machine, {});
    expect(() => sm.sendEvent('door-1', 'unlock')).not.toThrow();
    // transition completed despite hook errors
    expect(sm.getInstance('door-1')!.currentState).toBe('open');
  });
});

// ── idempotent transitions ──────────────────────────────────────────────────

describe('StateMachineInterpreter — idempotent transitions', () => {
  it('transitionTo to the same state is a no-op (no exit/entry re-fire)', () => {
    const sm = new StateMachineInterpreter();
    const hook = vi.fn();
    sm.setHookExecutor(hook);
    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed', onEntry: 'e-closed', onExit: 'x-closed' }],
      []
    );
    sm.createInstance('door-1', machine, {});
    expect(hook).toHaveBeenCalledTimes(1); // initial onEntry
    sm.transitionTo('door-1', 'closed');
    expect(hook).toHaveBeenCalledTimes(1); // no extra fire
  });

  it('transitionTo unknown state logs error and leaves state unchanged', () => {
    const sm = new StateMachineInterpreter();
    const machine = makeMachine(
      'door',
      'closed',
      [{ name: 'closed' }, { name: 'open' }],
      []
    );
    sm.createInstance('door-1', machine, {});
    sm.transitionTo('door-1', 'zzz-does-not-exist');
    expect(sm.getInstance('door-1')!.currentState).toBe('closed');
  });
});

// ── removeInstance ──────────────────────────────────────────────────────────

describe('StateMachineInterpreter — removeInstance', () => {
  it('discards registration', () => {
    const sm = new StateMachineInterpreter();
    const machine = makeMachine('door', 'closed', [{ name: 'closed' }], []);
    sm.createInstance('door-1', machine, {});
    sm.removeInstance('door-1');
    expect(sm.getInstance('door-1')).toBeUndefined();
    expect(sm.sendEvent('door-1', 'anything')).toBe(false);
  });
});
