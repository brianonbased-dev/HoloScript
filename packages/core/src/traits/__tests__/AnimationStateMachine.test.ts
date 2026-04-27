/**
 * AnimationStateMachine tests — vitest
 * Covers: states, parameters (float/int/bool/trigger), transitions,
 * condition evaluation (all operators), layers, updateLayer crossfade,
 * serialisation helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnimationStateMachine } from '../AnimationStateMachine';
import type {
  ActiveAnimation,
  AnimationClipDef,
  AnimationLayer,
  AnimationStateDef,
  AnimationTransition,
  CrossfadeState,
} from '../AnimationTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSM(): AnimationStateMachine {
  return new AnimationStateMachine();
}

function makeLayer(name: string, currentState?: string): AnimationLayer {
  return { name, currentState, weight: 1 } as unknown as AnimationLayer;
}

function addLayer(sm: AnimationStateMachine, name: string, currentState?: string) {
  (sm.layers as Map<string, AnimationLayer>).set(name, makeLayer(name, currentState));
}

function makeStateDef(name: string, clip?: string): AnimationStateDef {
  return { name, clip } as AnimationStateDef;
}

function makeClip(name: string): AnimationClipDef {
  return { name, duration: 1 } as AnimationClipDef;
}

function makeTransition(
  from: string,
  to: string,
  extra?: Partial<AnimationTransition>,
): AnimationTransition {
  return { from, to, conditions: [], ...extra } as AnimationTransition;
}

// ---------------------------------------------------------------------------
// 1. States
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – states', () => {
  it('addState stores and getState retrieves', () => {
    const sm = makeSM();
    const s = makeStateDef('idle');
    sm.addState(s);
    expect(sm.getState('idle')).toBe(s);
  });

  it('removeState deletes state', () => {
    const sm = makeSM();
    sm.addState(makeStateDef('idle'));
    sm.removeState('idle');
    expect(sm.getState('idle')).toBeUndefined();
  });

  it('removeState on missing name is safe', () => {
    const sm = makeSM();
    expect(() => sm.removeState('nonexistent')).not.toThrow();
  });

  it('getStateNames returns all state names', () => {
    const sm = makeSM();
    sm.addState(makeStateDef('idle'));
    sm.addState(makeStateDef('run'));
    expect(sm.getStateNames()).toEqual(expect.arrayContaining(['idle', 'run']));
    expect(sm.getStateNames()).toHaveLength(2);
  });

  it('starts with empty states', () => {
    const sm = makeSM();
    expect(sm.getStateNames()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveClipForState
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – resolveClipForState', () => {
  it('returns null for unknown state', () => {
    const sm = makeSM();
    expect(sm.resolveClipForState('idle', new Map())).toBeNull();
  });

  it('returns null when state has no clip', () => {
    const sm = makeSM();
    sm.addState({ name: 'idle' } as AnimationStateDef);
    expect(sm.resolveClipForState('idle', new Map())).toBeNull();
  });

  it('returns null when clip not in registry', () => {
    const sm = makeSM();
    sm.addState(makeStateDef('idle', 'idleClip'));
    expect(sm.resolveClipForState('idle', new Map())).toBeNull();
  });

  it('returns state and clip when both found', () => {
    const sm = makeSM();
    const s = makeStateDef('idle', 'idleClip');
    sm.addState(s);
    const clips = new Map<string, AnimationClipDef>();
    const clip = makeClip('idleClip');
    clips.set('idleClip', clip);
    const result = sm.resolveClipForState('idle', clips);
    expect(result).not.toBeNull();
    expect(result!.state).toBe(s);
    expect(result!.clip).toBe(clip);
  });

  it('falls back to clips[0] when clip field is absent', () => {
    const sm = makeSM();
    const s = { name: 'run', clips: ['runClip'] } as AnimationStateDef;
    sm.addState(s);
    const clips = new Map<string, AnimationClipDef>();
    const clip = makeClip('runClip');
    clips.set('runClip', clip);
    const result = sm.resolveClipForState('run', clips);
    expect(result!.clip).toBe(clip);
  });
});

// ---------------------------------------------------------------------------
// 3. Parameters – float
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – float parameters', () => {
  it('addParameter stores with default value', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'speed', type: 'float', default: 0 });
    expect(sm.getFloat('speed')).toBe(0);
  });

  it('setFloat updates value', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'speed', type: 'float', default: 0 });
    sm.setFloat('speed', 3.5);
    expect(sm.getFloat('speed')).toBeCloseTo(3.5);
  });

  it('setFloat ignores wrong param type', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'flag', type: 'bool', default: false });
    sm.setFloat('flag', 1.0);
    expect(sm.getBool('flag')).toBe(false);
  });

  it('getFloat returns 0 for missing param', () => {
    const sm = makeSM();
    expect(sm.getFloat('unknown')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Parameters – int
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – int parameters', () => {
  it('setInteger floors the value', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'count', type: 'int', default: 0 });
    sm.setInteger('count', 3.9);
    expect(sm.getInteger('count')).toBe(3);
  });

  it('getInteger returns 0 for missing param', () => {
    const sm = makeSM();
    expect(sm.getInteger('unknown')).toBe(0);
  });

  it('setInteger ignores wrong param type', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'speed', type: 'float', default: 2.0 });
    sm.setInteger('speed', 5);
    expect(sm.getFloat('speed')).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// 5. Parameters – bool
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – bool parameters', () => {
  it('setBool stores true/false', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'isJumping', type: 'bool', default: false });
    sm.setBool('isJumping', true);
    expect(sm.getBool('isJumping')).toBe(true);
    sm.setBool('isJumping', false);
    expect(sm.getBool('isJumping')).toBe(false);
  });

  it('getBool returns false for missing param', () => {
    const sm = makeSM();
    expect(sm.getBool('unknown')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Parameters – trigger
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – trigger parameters', () => {
  it('setTrigger fires and auto-resets', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'jump', type: 'trigger', default: false });
    // No layers → checkTransitions is a no-op
    sm.setTrigger('jump');
    const param = sm.parameters.get('jump');
    expect(param?.value).toBe(false); // auto-reset after consume
  });

  it('resetTrigger manually clears trigger', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'jump', type: 'trigger', default: false });
    const param = sm.parameters.get('jump');
    // Manually set to true, then reset
    if (param) param.value = true;
    sm.resetTrigger('jump');
    expect(sm.parameters.get('jump')?.value).toBe(false);
  });

  it('setTrigger on missing param is safe', () => {
    const sm = makeSM();
    expect(() => sm.setTrigger('notExisting')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. Transitions
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – transitions', () => {
  it('addTransition appends to list', () => {
    const sm = makeSM();
    sm.addTransition(makeTransition('idle', 'run'));
    expect(sm.transitions).toHaveLength(1);
    expect(sm.transitions[0].from).toBe('idle');
  });

  it('removeTransition deletes matching from+to', () => {
    const sm = makeSM();
    sm.addTransition(makeTransition('idle', 'run'));
    sm.removeTransition('idle', 'run');
    expect(sm.transitions).toHaveLength(0);
  });

  it('removeTransition is safe when not found', () => {
    const sm = makeSM();
    expect(() => sm.removeTransition('a', 'b')).not.toThrow();
  });

  it('sortTransitions orders by descending priority', () => {
    const sm = makeSM();
    sm.addTransition(makeTransition('idle', 'run', { priority: 1 }));
    sm.addTransition(makeTransition('idle', 'jump', { priority: 10 }));
    sm.addTransition(makeTransition('idle', 'fall', { priority: 5 }));
    expect(sm.transitions[0].to).toBe('jump');
    expect(sm.transitions[1].to).toBe('fall');
    expect(sm.transitions[2].to).toBe('run');
  });
});

// ---------------------------------------------------------------------------
// 8. evaluateCondition – all operators
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – evaluateCondition', () => {
  function smWithFloat(value: number) {
    const sm = makeSM();
    sm.addParameter({ name: 'x', type: 'float', default: value });
    return sm;
  }

  it('== returns true when equal', () => {
    const sm = smWithFloat(5);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '==', value: 5 })).toBe(true);
  });

  it('== returns false when not equal', () => {
    const sm = smWithFloat(5);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '==', value: 3 })).toBe(false);
  });

  it('!= returns true when different', () => {
    const sm = smWithFloat(5);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '!=', value: 3 })).toBe(true);
  });

  it('!= returns false when equal', () => {
    const sm = smWithFloat(5);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '!=', value: 5 })).toBe(false);
  });

  it('> returns true when greater', () => {
    const sm = smWithFloat(10);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '>', value: 5 })).toBe(true);
  });

  it('> returns false when not greater', () => {
    const sm = smWithFloat(3);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '>', value: 5 })).toBe(false);
  });

  it('< returns true when less', () => {
    const sm = smWithFloat(2);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '<', value: 5 })).toBe(true);
  });

  it('>= returns true at boundary', () => {
    const sm = smWithFloat(5);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '>=', value: 5 })).toBe(true);
  });

  it('<= returns true at boundary', () => {
    const sm = smWithFloat(5);
    expect(sm.evaluateCondition({ parameter: 'x', operator: '<=', value: 5 })).toBe(true);
  });

  it('unknown operator returns false', () => {
    const sm = smWithFloat(5);
    expect(sm.evaluateCondition({ parameter: 'x', operator: 'bad' as '<', value: 5 })).toBe(false);
  });

  it('returns false for unknown parameter', () => {
    const sm = makeSM();
    expect(sm.evaluateCondition({ parameter: 'missing', operator: '==', value: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. evaluateConditions – AND / OR chain
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – evaluateConditions', () => {
  it('empty conditions returns true', () => {
    const sm = makeSM();
    expect(sm.evaluateConditions([])).toBe(true);
  });

  it('single condition that is true returns true', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'x', type: 'float', default: 5 });
    expect(sm.evaluateConditions([{ parameter: 'x', operator: '==', value: 5 }])).toBe(true);
  });

  it('two AND conditions – both true → true', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'a', type: 'float', default: 5 });
    sm.addParameter({ name: 'b', type: 'float', default: 3 });
    expect(
      sm.evaluateConditions([
        { parameter: 'a', operator: '==', value: 5 },
        { parameter: 'b', operator: '<', value: 10 },
      ]),
    ).toBe(true);
  });

  it('two AND conditions – one false → false', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'a', type: 'float', default: 5 });
    sm.addParameter({ name: 'b', type: 'float', default: 20 });
    expect(
      sm.evaluateConditions([
        { parameter: 'a', operator: '==', value: 5 },
        { parameter: 'b', operator: '<', value: 10 },
      ]),
    ).toBe(false);
  });

  it('OR chain – one true → overall true', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'a', type: 'float', default: 99 });
    sm.addParameter({ name: 'b', type: 'float', default: 1 });
    // chain is on the PREVIOUS condition (index i-1) per implementation
    expect(
      sm.evaluateConditions([
        { parameter: 'a', operator: '==', value: 5, chain: 'or' }, // false, but chain='or' affects next
        { parameter: 'b', operator: '==', value: 1 }, // true
      ]),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. checkTransitions + crossfade callback
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – checkTransitions', () => {
  it('calls crossfade callback when conditions met', () => {
    const sm = makeSM();
    const cb = vi.fn(() => true);
    sm.setCrossfadeCallback(cb);
    addLayer(sm, 'base', 'idle');
    sm.addParameter({ name: 'speed', type: 'float', default: 0 });
    sm.addTransition(makeTransition('idle', 'run', {
      conditions: [{ parameter: 'speed', operator: '>', value: 0.5 }],
      duration: 0.2,
    }));
    sm.setFloat('speed', 1.0); // triggers checkTransitions
    expect(cb).toHaveBeenCalledWith('run', 0.2, 0);
  });

  it('does NOT call crossfade when conditions not met', () => {
    const sm = makeSM();
    const cb = vi.fn(() => true);
    sm.setCrossfadeCallback(cb);
    addLayer(sm, 'base', 'idle');
    sm.addParameter({ name: 'speed', type: 'float', default: 0 });
    sm.addTransition(makeTransition('idle', 'run', {
      conditions: [{ parameter: 'speed', operator: '>', value: 0.5 }],
    }));
    sm.setFloat('speed', 0.1);
    expect(cb).not.toHaveBeenCalled();
  });

  it('respects canTransitionToSelf=false', () => {
    const sm = makeSM();
    const cb = vi.fn(() => true);
    sm.setCrossfadeCallback(cb);
    addLayer(sm, 'base', 'idle');
    sm.addTransition(makeTransition('idle', 'idle', { canTransitionToSelf: false }));
    sm.checkTransitions();
    expect(cb).not.toHaveBeenCalled();
  });

  it('"any" source matches current state', () => {
    const sm = makeSM();
    const cb = vi.fn(() => true);
    sm.setCrossfadeCallback(cb);
    addLayer(sm, 'base', 'run');
    sm.addTransition(makeTransition('any', 'idle')); // empty conditions → always true
    sm.checkTransitions();
    expect(cb).toHaveBeenCalledWith('idle', expect.any(Number), 0);
  });

  it('skips layer with no currentState', () => {
    const sm = makeSM();
    const cb = vi.fn(() => true);
    sm.setCrossfadeCallback(cb);
    addLayer(sm, 'base', undefined); // no currentState
    sm.addTransition(makeTransition('any', 'idle'));
    sm.checkTransitions();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 11. Layers
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – layers', () => {
  it('getLayerCount returns number of layers', () => {
    const sm = makeSM();
    addLayer(sm, 'base');
    addLayer(sm, 'upper');
    expect(sm.getLayerCount()).toBe(2);
  });

  it('setLayerWeight and getLayerWeight round-trip', () => {
    const sm = makeSM();
    addLayer(sm, 'base');
    sm.setLayerWeight(0, 0.5);
    expect(sm.getLayerWeight(0)).toBeCloseTo(0.5);
  });

  it('setLayerWeight clamps to [0,1]', () => {
    const sm = makeSM();
    addLayer(sm, 'base');
    sm.setLayerWeight(0, -0.5);
    expect(sm.getLayerWeight(0)).toBe(0);
    sm.setLayerWeight(0, 2.0);
    expect(sm.getLayerWeight(0)).toBe(1);
  });

  it('getLayerName returns correct name', () => {
    const sm = makeSM();
    addLayer(sm, 'base');
    addLayer(sm, 'upper');
    expect(sm.getLayerName(0)).toBe('base');
    expect(sm.getLayerName(1)).toBe('upper');
  });

  it('getLayerWeight returns 0 for out-of-range index', () => {
    const sm = makeSM();
    expect(sm.getLayerWeight(99)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 12. updateLayer – active animation (no crossfade)
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – updateLayer (no crossfade)', () => {
  it('calls updateAnimation with delta when no crossfade', () => {
    const sm = makeSM();
    const updateAnimation = vi.fn();
    const emit = vi.fn();
    const anim = { state: 'run', weight: 1 } as unknown as ActiveAnimation;
    const activeAnimations = new Map<number, ActiveAnimation | null>([[0, anim]]);
    const crossfades = new Map<number, CrossfadeState | null>([[0, null]]);
    sm.updateLayer(0, 0.016, activeAnimations, crossfades, updateAnimation, emit);
    expect(updateAnimation).toHaveBeenCalledWith(anim, 0.016);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does nothing when no anim and no crossfade', () => {
    const sm = makeSM();
    const updateAnimation = vi.fn();
    const emit = vi.fn();
    const activeAnimations = new Map<number, ActiveAnimation | null>([[0, null]]);
    const crossfades = new Map<number, CrossfadeState | null>([[0, null]]);
    sm.updateLayer(0, 0.016, activeAnimations, crossfades, updateAnimation, emit);
    expect(updateAnimation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 13. updateLayer – crossfade in progress
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – updateLayer crossfade', () => {
  it('advances crossfade progress', () => {
    const sm = makeSM();
    addLayer(sm, 'base', 'idle');
    const fromAnim = { state: 'idle', weight: 1 } as unknown as ActiveAnimation;
    const toAnim = { state: 'run', weight: 0 } as unknown as ActiveAnimation;
    const crossfade: CrossfadeState = {
      from: fromAnim,
      to: toAnim,
      duration: 1,
      progress: 0,
    } as CrossfadeState;
    const activeAnimations = new Map<number, ActiveAnimation | null>([[0, fromAnim]]);
    const crossfades = new Map<number, CrossfadeState | null>([[0, crossfade]]);
    const updateAnimation = vi.fn();
    const emit = vi.fn();
    sm.updateLayer(0, 0.25, activeAnimations, crossfades, updateAnimation, emit);
    expect(crossfade.progress).toBeCloseTo(0.25);
    expect(updateAnimation).toHaveBeenCalledTimes(2);
  });

  it('completes crossfade when progress ≥ 1, emits transition-end and state-enter', () => {
    const sm = makeSM();
    addLayer(sm, 'base', 'idle');
    const fromAnim = { state: 'idle', weight: 1 } as unknown as ActiveAnimation;
    const toAnim = { state: 'run', weight: 0 } as unknown as ActiveAnimation;
    const crossfade: CrossfadeState = {
      from: fromAnim,
      to: toAnim,
      duration: 0.1,
      progress: 0.95,
    } as CrossfadeState;
    const activeAnimations = new Map<number, ActiveAnimation | null>([[0, fromAnim]]);
    const crossfades = new Map<number, CrossfadeState | null>([[0, crossfade]]);
    const updateAnimation = vi.fn();
    const emit = vi.fn();
    sm.updateLayer(0, 0.1, activeAnimations, crossfades, updateAnimation, emit);
    expect(crossfades.get(0)).toBeNull();
    expect(activeAnimations.get(0)).toBe(toAnim);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'transition-end', toState: 'run' }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'state-enter', state: 'run' }));
    // layer.currentState updated
    const layer = sm.layers.get('base');
    expect(layer?.currentState).toBe('run');
  });
});

// ---------------------------------------------------------------------------
// 14. Serialisation helpers
// ---------------------------------------------------------------------------

describe('AnimationStateMachine – serialisation', () => {
  it('exportParameters returns name→value map', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'speed', type: 'float', default: 1.5 });
    sm.addParameter({ name: 'isJumping', type: 'bool', default: true });
    const exported = sm.exportParameters();
    expect(exported.speed).toBe(1.5);
    expect(exported.isJumping).toBe(true);
  });

  it('exportLayerStates returns layer→currentState map', () => {
    const sm = makeSM();
    addLayer(sm, 'base', 'idle');
    addLayer(sm, 'upper', 'wave');
    const exported = sm.exportLayerStates();
    expect(exported.base).toBe('idle');
    expect(exported.upper).toBe('wave');
  });

  it('importParameters restores values', () => {
    const sm = makeSM();
    sm.addParameter({ name: 'speed', type: 'float', default: 0 });
    sm.addParameter({ name: 'isJumping', type: 'bool', default: false });
    sm.importParameters({ speed: 3.0, isJumping: true });
    expect(sm.getFloat('speed')).toBe(3.0);
    expect(sm.getBool('isJumping')).toBe(true);
  });

  it('importParameters ignores unknown parameter names', () => {
    const sm = makeSM();
    expect(() => sm.importParameters({ unknown: 5 })).not.toThrow();
  });
});
