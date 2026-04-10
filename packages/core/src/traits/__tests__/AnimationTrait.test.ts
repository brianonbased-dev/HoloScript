import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationTrait } from '../AnimationTrait';

describe('AnimationTrait', () => {
  let anim: AnimationTrait;

  beforeEach(() => {
    anim = new AnimationTrait({
      clips: [
        { name: 'idle', duration: 2, wrapMode: 'loop' },
        { name: 'walk', duration: 1, wrapMode: 'loop', speed: 1.5 },
        { name: 'jump', duration: 0.5, wrapMode: 'once' },
      ],
      states: [
        { name: 'locomotion', clips: ['idle', 'walk'], parameter: 'speed' },
        { name: 'airborne', clip: 'jump' },
      ],
      transitions: [
        {
          from: 'locomotion',
          to: 'airborne',
          conditions: [{ parameter: 'isGrounded', operator: '==', value: false }],
          duration: 0.1,
        },
      ],
      parameters: [
        { name: 'speed', type: 'float', value: 0 },
        { name: 'isGrounded', type: 'bool', value: true },
      ],
      defaultState: 'locomotion',
    });
  });

  it('initializes with config', () => {
    expect(anim.getClipNames()).toEqual(['idle', 'walk', 'jump']);
    expect(anim.getStateNames()).toContain('locomotion');
    expect(anim.getStateNames()).toContain('airborne');
  });

  it('default state is set', () => {
    expect(anim.getCurrentState()).toBe('locomotion');
    expect(anim.isPlaying()).toBe(true);
  });

  it('addClip and getClip work', () => {
    anim.addClip({ name: 'run', duration: 0.8, wrapMode: 'loop' });
    expect(anim.getClip('run')).toBeDefined();
    expect(anim.getClip('run')!.duration).toBe(0.8);
  });

  it('removeClip removes', () => {
    anim.removeClip('jump');
    expect(anim.getClip('jump')).toBeUndefined();
  });

  it('setState changes state', () => {
    anim.setState('airborne');
    expect(anim.getCurrentState()).toBe('airborne');
  });

  it('setState returns false for unknown state', () => {
    expect(anim.setState('nonexistent')).toBe(false);
  });

  it('play plays clip directly', () => {
    anim.play('jump');
    expect(anim.getCurrentClip()).toBe('jump');
    expect(anim.isPlaying()).toBe(true);
  });

  it('stop stops animation on layer', () => {
    anim.stop();
    expect(anim.isPlaying(0)).toBe(false);
  });

  it('pause and resume work', () => {
    anim.pause();
    expect(anim.getSpeed()).toBe(0);
    anim.resume();
    expect(anim.getSpeed()).toBeGreaterThan(0);
  });

  it('setSpeed changes speed', () => {
    anim.setSpeed(2.0);
    expect(anim.getSpeed()).toBe(2.0);
  });

  it('setFloat sets float parameter', () => {
    anim.setFloat('speed', 5.0);
    expect(anim.getFloat('speed')).toBe(5.0);
  });

  it('setBool sets bool parameter', () => {
    anim.setBool('isGrounded', false);
    expect(anim.getBool('isGrounded')).toBe(false);
  });

  it('crossfade transitions between states', () => {
    const ok = anim.crossfade('airborne', 0.2);
    expect(ok).toBe(true);
  });

  it('getNormalizedTime returns 0 at start', () => {
    expect(anim.getNormalizedTime()).toBe(0);
  });

  it('getCurrentTime returns 0 initially', () => {
    expect(anim.getCurrentTime()).toBe(0);
  });

  it('addState adds new state', () => {
    anim.addState({ name: 'crouch', clip: 'idle' });
    expect(anim.getState('crouch')).toBeDefined();
  });

  it('removeState removes', () => {
    anim.removeState('airborne');
    expect(anim.getState('airborne')).toBeUndefined();
  });

  it('addParameter adds new param', () => {
    anim.addParameter({ name: 'health', type: 'float', value: 100 });
    expect(anim.getFloat('health')).toBe(100);
  });

  it('stopAll stops all layers', () => {
    anim.stopAll();
    expect(anim.isPlaying()).toBe(false);
  });

  it('event listeners receive events', () => {
    const events: any[] = [];
    (anim as any).on('state-enter', (e: any) => events.push(e));
    anim.setState('airborne');
    expect(events.some((e) => e.state === 'airborne')).toBe(true);
  });
});
