/**
 * AnimationTrait — Production Tests
 *
 * Covers:
 * - Constructor: default Base Layer, clips/states from config, defaultState
 * - Clip CRUD: addClip, removeClip, getClip, getClipNames, addClip default fields
 * - State CRUD: addState, removeState, getState, getStateNames
 * - setState: returns true/false, emits state-enter/clip-start, getCurrentState
 * - play: returns true/false, emits clip-start, isPlaying, getCurrentClip
 * - stop: emits clip-end, isPlaying = false
 * - stopAll: stops all layers
 * - pause: speed=0, resume: speed restored
 * - setSpeed / getSpeed
 * - getNormalizedTime
 * - crossfade: emits transition-start, crossfade state created
 * - Parameters: addParameter, setFloat/getFloat, setInteger/getInteger, setBool/getBool, setTrigger auto-reset
 * - Event system: on/off/emit
 * - Layers: default Base Layer exists, addLayer via config
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AnimationTrait,
  type AnimationClipDef,
  type AnimationStateDef,
  type AnimationParameter,
} from '../AnimationTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function clip(name: string, duration = 1.0, loop = false): AnimationClipDef {
  return { name, duration, wrapMode: loop ? 'loop' : 'once' };
}

function state(name: string, clipName: string): AnimationStateDef {
  return { name, clip: clipName };
}

function mkTrait(opts: ConstructorParameters<typeof AnimationTrait>[0] = {}) {
  return new AnimationTrait(opts);
}

// ─── Constructor ─────────────────────────────────────────────────────────────────

describe('AnimationTrait — constructor', () => {
  it('creates default Base Layer', () => {
    const t = mkTrait();
    expect(t.getCurrentState(0)).toBeUndefined();
  });

  it('loads clips from config', () => {
    const t = mkTrait({ clips: [clip('idle'), clip('walk')] });
    expect(t.getClipNames()).toContain('idle');
    expect(t.getClipNames()).toContain('walk');
  });

  it('loads states from config', () => {
    const t = mkTrait({
      clips: [clip('idle')],
      states: [state('idle_state', 'idle')],
    });
    expect(t.getStateNames()).toContain('idle_state');
  });

  it('defaultState sets initial state', () => {
    const t = mkTrait({
      clips: [clip('idle')],
      states: [state('idle_state', 'idle')],
      defaultState: 'idle_state',
    });
    expect(t.getCurrentState(0)).toBe('idle_state');
  });

  it('clips get default wrapMode = once', () => {
    const t = mkTrait({ clips: [{ name: 'run', duration: 0.8 }] });
    expect(t.getClip('run')?.wrapMode).toBe('once');
  });

  it('clips get default speed = 1', () => {
    const t = mkTrait({ clips: [{ name: 'run', duration: 0.8 }] });
    expect(t.getClip('run')?.speed).toBe(1);
  });

  it('getConfig returns applyRootMotion and updateMode defaults', () => {
    const t = mkTrait();
    expect(t.getConfig().applyRootMotion).toBe(false);
    expect(t.getConfig().updateMode).toBe('normal');
  });
});

// ─── Clip CRUD ────────────────────────────────────────────────────────────────────

describe('AnimationTrait — clip CRUD', () => {
  it('addClip stores clip', () => {
    const t = mkTrait();
    t.addClip(clip('run'));
    expect(t.getClip('run')).toBeDefined();
    expect(t.getClip('run')?.name).toBe('run');
  });

  it('removeClip deletes clip', () => {
    const t = mkTrait();
    t.addClip(clip('run'));
    t.removeClip('run');
    expect(t.getClip('run')).toBeUndefined();
  });

  it('getClipNames returns all clip names', () => {
    const t = mkTrait();
    t.addClip(clip('a'));
    t.addClip(clip('b'));
    expect(t.getClipNames()).toHaveLength(2);
    expect(t.getClipNames()).toContain('a');
  });

  it('getClip returns undefined for missing clip', () => {
    expect(mkTrait().getClip('ghost')).toBeUndefined();
  });
});

// ─── State CRUD ───────────────────────────────────────────────────────────────────

describe('AnimationTrait — state CRUD', () => {
  it('addState stores state', () => {
    const t = mkTrait();
    t.addState({ name: 's1', clip: 'c1' });
    expect(t.getState('s1')).toBeDefined();
  });

  it('removeState deletes state', () => {
    const t = mkTrait();
    t.addState({ name: 's1', clip: 'c1' });
    t.removeState('s1');
    expect(t.getState('s1')).toBeUndefined();
  });

  it('getStateNames returns all state names', () => {
    const t = mkTrait();
    t.addState({ name: 'idle', clip: 'idle' });
    t.addState({ name: 'walk', clip: 'walk' });
    expect(t.getStateNames()).toContain('idle');
    expect(t.getStateNames()).toContain('walk');
  });
});

// ─── setState ─────────────────────────────────────────────────────────────────────

describe('AnimationTrait — setState', () => {
  it('returns false for unknown state', () => {
    const t = mkTrait({ clips: [clip('x')], states: [state('x', 'x')] });
    expect(t.setState('ghost')).toBe(false);
  });

  it('returns false when clip not found', () => {
    const t = mkTrait();
    t.addState({ name: 's1', clip: 'missing' });
    expect(t.setState('s1')).toBe(false);
  });

  it('returns true and sets getCurrentState', () => {
    const t = mkTrait({ clips: [clip('idle')], states: [state('idle', 'idle')] });
    expect(t.setState('idle')).toBe(true);
    expect(t.getCurrentState(0)).toBe('idle');
  });

  it('emits state-enter event', () => {
    const t = mkTrait({ clips: [clip('idle')], states: [state('idle', 'idle')] });
    const events: string[] = [];
    t.on('state-enter', (e) => events.push(e.type));
    t.setState('idle');
    expect(events).toContain('state-enter');
  });

  it('emits clip-start event', () => {
    const t = mkTrait({ clips: [clip('idle')], states: [state('idle', 'idle')] });
    const clips: string[] = [];
    t.on('clip-start', (e) => clips.push(e.clip!));
    t.setState('idle');
    expect(clips).toContain('idle');
  });

  it('emits state-exit when transitioning from a previous state', () => {
    const t = mkTrait({
      clips: [clip('idle'), clip('walk')],
      states: [state('idle', 'idle'), state('walk', 'walk')],
    });
    t.setState('idle');
    const exits: string[] = [];
    t.on('state-exit', (e) => exits.push(e.state!));
    t.setState('walk');
    expect(exits).toContain('idle');
  });
});

// ─── play / stop / pause / resume ────────────────────────────────────────────────

describe('AnimationTrait — play / stop / pause / resume', () => {
  it('play returns false for unknown clip', () => {
    expect(mkTrait().play('ghost')).toBe(false);
  });

  it('play returns true and sets isPlaying', () => {
    const t = mkTrait({ clips: [clip('run')] });
    expect(t.play('run')).toBe(true);
    expect(t.isPlaying(0)).toBe(true);
  });

  it('getCurrentClip matches played clip', () => {
    const t = mkTrait({ clips: [clip('jump')] });
    t.play('jump');
    expect(t.getCurrentClip(0)).toBe('jump');
  });

  it('play emits clip-start', () => {
    const t = mkTrait({ clips: [clip('run')] });
    const names: string[] = [];
    t.on('clip-start', (e) => names.push(e.clip!));
    t.play('run');
    expect(names).toContain('run');
  });

  it('stop emits clip-end', () => {
    const t = mkTrait({ clips: [clip('run')] });
    t.play('run');
    const ends: string[] = [];
    t.on('clip-end', (e) => ends.push(e.clip!));
    t.stop(0);
    expect(ends).toContain('run');
  });

  it('stop sets isPlaying = false', () => {
    const t = mkTrait({ clips: [clip('run')] });
    t.play('run');
    t.stop(0);
    expect(t.isPlaying(0)).toBe(false);
  });

  it('stopAll stops all layers', () => {
    const t = mkTrait({ clips: [clip('a')] });
    t.play('a', 0);
    t.stopAll();
    expect(t.isPlaying()).toBe(false);
  });

  it('pause sets speed to 0', () => {
    const t = mkTrait({ clips: [clip('walk', 2.0)] });
    t.play('walk');
    t.pause(0);
    expect(t.getSpeed(0)).toBe(0);
  });

  it('resume restores clip speed', () => {
    const t = mkTrait({ clips: [{ name: 'walk', duration: 2.0, speed: 1.5 }] });
    t.play('walk');
    t.pause(0);
    t.resume(0);
    expect(t.getSpeed(0)).toBeCloseTo(1.5);
  });

  it('setSpeed / getSpeed round-trip', () => {
    const t = mkTrait({ clips: [clip('run')] });
    t.play('run');
    t.setSpeed(2.0, 0);
    expect(t.getSpeed(0)).toBeCloseTo(2.0);
  });

  it('getNormalizedTime = 0 initially', () => {
    const t = mkTrait({ clips: [clip('idle')] });
    t.play('idle');
    expect(t.getNormalizedTime(0)).toBe(0);
  });
});

// ─── crossfade ────────────────────────────────────────────────────────────────────

describe('AnimationTrait — crossfade', () => {
  it('crossfade returns false for unknown state', () => {
    const t = mkTrait({ clips: [clip('idle')], states: [state('idle', 'idle')] });
    t.setState('idle');
    expect(t.crossfade('ghost', 0.25)).toBe(false);
  });

  it('crossfade from null animation falls back to setState', () => {
    const t = mkTrait({ clips: [clip('walk')], states: [state('walk', 'walk')] });
    // No current animation on layer 0
    expect(t.crossfade('walk', 0.25)).toBe(true);
    expect(t.getCurrentState(0)).toBe('walk');
  });

  it('crossfade emits transition-start', () => {
    const t = mkTrait({
      clips: [clip('idle'), clip('walk')],
      states: [state('idle', 'idle'), state('walk', 'walk')],
    });
    t.setState('idle');
    const events: string[] = [];
    t.on('transition-start', (e) => events.push(`${e.fromState}->${e.toState}`));
    t.crossfade('walk', 0.3);
    expect(events).toContain('idle->walk');
  });
});

// ─── Parameters ───────────────────────────────────────────────────────────────────

describe('AnimationTrait — parameters', () => {
  it('setFloat / getFloat round-trip', () => {
    const t = mkTrait({ parameters: [{ name: 'speed', type: 'float', value: 0 }] });
    t.setFloat('speed', 3.5);
    expect(t.getFloat('speed')).toBeCloseTo(3.5);
  });

  it('setFloat ignores int param', () => {
    const t = mkTrait({ parameters: [{ name: 'count', type: 'int', value: 0 }] });
    t.setFloat('count', 3.5); // should not set (wrong type)
    expect(t.getFloat('count')).toBe(0);
  });

  it('setInteger floored', () => {
    const t = mkTrait({ parameters: [{ name: 'step', type: 'int', value: 0 }] });
    t.setInteger('step', 3.9);
    expect(t.getInteger('step')).toBe(3);
  });

  it('setBool / getBool round-trip', () => {
    const t = mkTrait({ parameters: [{ name: 'isGrounded', type: 'bool', value: false }] });
    t.setBool('isGrounded', true);
    expect(t.getBool('isGrounded')).toBe(true);
  });

  it('setTrigger resets to false after being set', () => {
    const t = mkTrait({ parameters: [{ name: 'attack', type: 'trigger', value: false }] });
    t.setTrigger('attack');
    // Trigger auto-resets: value should be false after checkTransitions
    const p = t['parameters'].get('attack');
    expect(p?.value).toBe(false);
  });

  it('getFloat returns 0 for unknown param', () => {
    expect(mkTrait().getFloat('ghost')).toBe(0);
  });

  it('getBool returns false for unknown param', () => {
    expect(mkTrait().getBool('ghost')).toBe(false);
  });
});

// ─── Event system ─────────────────────────────────────────────────────────────────

describe('AnimationTrait — events', () => {
  it('on / off wiring', () => {
    const t = mkTrait({ clips: [clip('idle')], states: [state('idle', 'idle')] });
    const cb = vi.fn();
    t.on('state-enter', cb);
    t.setState('idle');
    expect(cb).toHaveBeenCalledTimes(1);
    t.off('state-enter', cb);
    t.setState('idle');
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });

  it('getCurrentTime starts at 0', () => {
    expect(mkTrait().getCurrentTime()).toBe(0);
  });
});
