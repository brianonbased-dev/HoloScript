/**
 * StateMachineInterpreter — Production Test Suite
 *
 * Covers: createInstance, sendEvent, transitionTo, setHookExecutor,
 * executeHook, getInstance, removeInstance.
 */
import { describe, it, expect, vi } from 'vitest';
import { StateMachineInterpreter } from '../StateMachineInterpreter';
import type { StateMachineNode } from '../../types';

function mkDef(extra: Partial<StateMachineNode> = {}): StateMachineNode {
  return {
    type: 'state-machine',
    name: 'TrafficLight',
    initialState: 'red',
    states: [
      { type: 'state', name: 'red', onEntry: 'log("red")' },
      { type: 'state', name: 'green', onEntry: 'log("green")' },
      { type: 'state', name: 'yellow', onExit: 'log("leaving yellow")' },
    ],
    transitions: [
      { type: 'transition', from: 'red', to: 'green', event: 'GO' },
      { type: 'transition', from: 'green', to: 'yellow', event: 'SLOW' },
      { type: 'transition', from: 'yellow', to: 'red', event: 'STOP' },
    ],
    ...extra,
  } as StateMachineNode;
}

describe('StateMachineInterpreter — Production', () => {
  // ─── createInstance ───────────────────────────────────────────────
  it('createInstance sets initial state', () => {
    const interp = new StateMachineInterpreter();
    const inst = interp.createInstance('tl1', mkDef(), {});
    expect(inst.currentState).toBe('red');
  });

  it('createInstance calls onEntry hook for initial state', () => {
    const interp = new StateMachineInterpreter();
    const executor = vi.fn();
    interp.setHookExecutor(executor);
    interp.createInstance('tl1', mkDef(), {});
    expect(executor).toHaveBeenCalledWith('log("red")', expect.anything());
  });

  it('getInstance returns the instance', () => {
    const interp = new StateMachineInterpreter();
    interp.createInstance('tl1', mkDef(), {});
    expect(interp.getInstance('tl1')).toBeDefined();
  });

  it('getInstance returns undefined for unknown', () => {
    const interp = new StateMachineInterpreter();
    expect(interp.getInstance('nope')).toBeUndefined();
  });

  // ─── sendEvent ────────────────────────────────────────────────────
  it('sendEvent transitions on matching event', () => {
    const interp = new StateMachineInterpreter();
    interp.createInstance('tl1', mkDef(), {});
    const result = interp.sendEvent('tl1', 'GO');
    expect(result).toBe(true);
    expect(interp.getInstance('tl1')!.currentState).toBe('green');
  });

  it('sendEvent returns false for non-matching event', () => {
    const interp = new StateMachineInterpreter();
    interp.createInstance('tl1', mkDef(), {});
    expect(interp.sendEvent('tl1', 'INVALID')).toBe(false);
    expect(interp.getInstance('tl1')!.currentState).toBe('red');
  });

  it('sendEvent returns false for unknown instance', () => {
    const interp = new StateMachineInterpreter();
    expect(interp.sendEvent('unknown', 'GO')).toBe(false);
  });

  it('chained events traverse full cycle', () => {
    const interp = new StateMachineInterpreter();
    interp.createInstance('tl1', mkDef(), {});
    interp.sendEvent('tl1', 'GO'); // red -> green
    interp.sendEvent('tl1', 'SLOW'); // green -> yellow
    interp.sendEvent('tl1', 'STOP'); // yellow -> red
    expect(interp.getInstance('tl1')!.currentState).toBe('red');
  });

  // ─── transitionTo ─────────────────────────────────────────────────
  it('transitionTo forces state change', () => {
    const interp = new StateMachineInterpreter();
    interp.createInstance('tl1', mkDef(), {});
    interp.transitionTo('tl1', 'yellow');
    expect(interp.getInstance('tl1')!.currentState).toBe('yellow');
  });

  it('transitionTo executes onExit and onEntry', () => {
    const interp = new StateMachineInterpreter();
    const executor = vi.fn();
    interp.setHookExecutor(executor);
    interp.createInstance('tl1', mkDef(), {});
    executor.mockClear();
    interp.transitionTo('tl1', 'green');
    // Should have called onEntry for 'green'
    expect(executor).toHaveBeenCalledWith('log("green")', expect.anything());
  });

  it('transitionTo to same state is no-op', () => {
    const interp = new StateMachineInterpreter();
    const executor = vi.fn();
    interp.setHookExecutor(executor);
    interp.createInstance('tl1', mkDef(), {});
    executor.mockClear();
    interp.transitionTo('tl1', 'red'); // already in 'red'
    expect(executor).not.toHaveBeenCalled();
  });

  // ─── removeInstance ───────────────────────────────────────────────
  it('removeInstance removes the instance', () => {
    const interp = new StateMachineInterpreter();
    interp.createInstance('tl1', mkDef(), {});
    interp.removeInstance('tl1');
    expect(interp.getInstance('tl1')).toBeUndefined();
  });

  // ─── Hook error handling ──────────────────────────────────────────
  it('hook errors are caught and do not crash', () => {
    const interp = new StateMachineInterpreter();
    interp.setHookExecutor(() => {
      throw new Error('boom');
    });
    // Should not throw
    expect(() => interp.createInstance('tl1', mkDef(), {})).not.toThrow();
  });
});
