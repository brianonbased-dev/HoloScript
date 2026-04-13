/**
 * SkeletonTrait — Production Tests
 *
 * Tests: constructor defaults, bone setup, clip management, play/stop/pause/resume,
 * animation time advancement (loop + non-loop), normalizedTime, speed multiplier,
 * crossfade initiation, parameter/float/bool/trigger API, blend tree add/activate,
 * layer weight clamping, enable/disable, event listener on/off, and serialize.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkeletonTrait, createSkeletonTrait } from '../SkeletonTrait';
import type { BoneDefinition, AnimationClip, AnimationEvent } from '../SkeletonTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────────

const BIND_POSE = {
  position: [0, 0, 0],
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

function makeBone(name: string, parent?: string): BoneDefinition {
  return { name, parent, bindPose: BIND_POSE, length: 1 };
}

function makeClip(name: string, duration: number, loop = false): AnimationClip {
  return { name, duration, loop };
}

// ─── Constructor / defaults ──────────────────────────────────────────────────────

describe('SkeletonTrait — constructor', () => {
  it('createSkeletonTrait factory returns SkeletonTrait', () => {
    expect(createSkeletonTrait()).toBeInstanceOf(SkeletonTrait);
  });

  it('starts with isPlaying=false', () => {
    const sk = new SkeletonTrait();
    expect(sk.isPlaying()).toBe(false);
  });

  it('starts with no current clip', () => {
    const sk = new SkeletonTrait();
    expect(sk.getCurrentClip()).toBeUndefined();
  });

  it('defaults speed to 1.0', () => {
    const sk = new SkeletonTrait();
    expect(sk.getSpeed()).toBe(1.0);
  });

  it('defaults to enabled', () => {
    const sk = new SkeletonTrait();
    expect(sk.isEnabled()).toBe(true);
  });

  it('rigType defaults to custom', () => {
    const sk = new SkeletonTrait();
    expect(sk.getConfig().rigType).toBe('custom');
  });
});

// ─── Bone management ─────────────────────────────────────────────────────────────

describe('SkeletonTrait — bones', () => {
  it('registers bones from config', () => {
    const sk = new SkeletonTrait({ bones: [makeBone('hip'), makeBone('spine', 'hip')] });
    expect(sk.getBoneCount()).toBe(2);
    expect(sk.getBoneNames()).toContain('hip');
    expect(sk.getBoneNames()).toContain('spine');
  });

  it('getBoneTransform returns bind pose initially', () => {
    const sk = new SkeletonTrait({ bones: [makeBone('head')] });
    const t = sk.getBoneTransform('head')!;
    expect(t.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(t.rotation.w).toBe(1);
  });

  it('setBoneTransform updates position', () => {
    const sk = new SkeletonTrait({ bones: [makeBone('arm')] });
    sk.setBoneTransform('arm', { position: [1, 2, 3] });
    expect(sk.getBoneTransform('arm')?.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('setBoneTransform on unknown bone is a no-op', () => {
    const sk = new SkeletonTrait();
    expect(() => sk.setBoneTransform('ghost', { position: [99, 0, 0] })).not.toThrow();
  });

  it('returns undefined for unknown bone', () => {
    const sk = new SkeletonTrait();
    expect(sk.getBoneTransform('nope')).toBeUndefined();
  });
});

// ─── Clip management ─────────────────────────────────────────────────────────────

describe('SkeletonTrait — clips', () => {
  it('registers clips from config', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('idle', 1), makeClip('walk', 0.8)] });
    expect(sk.getClipNames()).toContain('idle');
    expect(sk.getClipNames()).toContain('walk');
  });

  it('addClip adds a new clip', () => {
    const sk = new SkeletonTrait();
    sk.addClip(makeClip('run', 0.5));
    expect(sk.getClip('run')).toBeDefined();
  });

  it('getClipDuration returns correct duration', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('jump', 1.2)] });
    expect(sk.getClipDuration('jump')).toBe(1.2);
  });

  it('getClipDuration returns 0 for unknown clip', () => {
    const sk = new SkeletonTrait();
    expect(sk.getClipDuration('unknown')).toBe(0);
  });
});

// ─── Playback ────────────────────────────────────────────────────────────────────

describe('SkeletonTrait — playback', () => {
  let sk: SkeletonTrait;
  beforeEach(() => {
    sk = new SkeletonTrait({ clips: [makeClip('idle', 2, true), makeClip('die', 1, false)] });
  });

  it('play sets isPlaying=true and currentClip', () => {
    sk.play('idle');
    expect(sk.isPlaying()).toBe(true);
    expect(sk.getCurrentClip()).toBe('idle');
  });

  it('play resets currentTime to 0', () => {
    sk.play('idle');
    sk.update(0.5);
    sk.play('idle'); // replay
    expect(sk.getState().currentTime).toBe(0);
  });

  it('play on unknown clip is a no-op (stays not playing)', () => {
    sk.play('ghost_clip');
    expect(sk.isPlaying()).toBe(false);
  });

  it('stop sets isPlaying=false and resets time', () => {
    sk.play('idle');
    sk.update(0.5);
    sk.stop();
    expect(sk.isPlaying()).toBe(false);
    expect(sk.getState().currentTime).toBe(0);
  });

  it('pause sets isPlaying=false without resetting time', () => {
    sk.play('idle');
    sk.update(0.5);
    sk.pause();
    expect(sk.isPlaying()).toBe(false);
    expect(sk.getState().currentTime).toBeCloseTo(0.5);
  });

  it('resume sets isPlaying=true', () => {
    sk.play('idle');
    sk.pause();
    sk.resume();
    expect(sk.isPlaying()).toBe(true);
  });
});

// ─── Animation time advancement ──────────────────────────────────────────────────

describe('SkeletonTrait — update / time', () => {
  it('currentTime advances with delta when playing', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('idle', 2, true)] });
    sk.play('idle');
    sk.update(0.3);
    expect(sk.getState().currentTime).toBeCloseTo(0.3);
  });

  it('normalizedTime is currentTime/duration', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('walk', 2, true)] });
    sk.play('walk');
    sk.update(1.0); // half duration
    expect(sk.getState().normalizedTime).toBeCloseTo(0.5);
  });

  it('looping clip wraps at duration', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('loop_anim', 1, true)] });
    sk.play('loop_anim');
    sk.update(1.5); // 1.5 > 1s duration, wraps to 0.5
    expect(sk.getState().currentTime).toBeCloseTo(0.5);
    expect(sk.isPlaying()).toBe(true);
  });

  it('non-looping clip stops at duration end', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('die', 1, false)] });
    sk.play('die');
    sk.update(2); // past end
    expect(sk.isPlaying()).toBe(false);
    expect(sk.getState().currentTime).toBe(1); // clamped
  });

  it('speed=2 advances time 2x faster', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('run', 2, true)], speed: 2 });
    sk.play('run');
    sk.update(0.5); // should advance 1.0 seconds
    expect(sk.getState().currentTime).toBeCloseTo(1.0);
  });

  it('update does nothing when not playing', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('idle', 2, true)] });
    sk.play('idle');
    sk.pause();
    sk.update(1.0);
    expect(sk.getState().currentTime).toBe(0); // didn't advance (was paused before any update)
  });

  it('update does nothing when disabled', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('idle', 2, true)] });
    sk.play('idle');
    sk.setEnabled(false);
    sk.update(1.0);
    expect(sk.getState().currentTime).toBe(0);
  });
});

// ─── Speed control ───────────────────────────────────────────────────────────────

describe('SkeletonTrait — speed', () => {
  it('setSpeed changes playback speed', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('idle', 4, true)] });
    sk.setSpeed(0.5);
    sk.play('idle');
    sk.update(1.0); // at 0.5x speed, advances 0.5
    expect(sk.getState().currentTime).toBeCloseTo(0.5);
  });

  it('getSpeed returns current speed', () => {
    const sk = new SkeletonTrait();
    sk.setSpeed(3.0);
    expect(sk.getSpeed()).toBe(3.0);
  });
});

// ─── Crossfade ───────────────────────────────────────────────────────────────────

describe('SkeletonTrait — crossfade', () => {
  it('play with crossfade>0 sets crossfadeTarget', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('idle', 2, true), makeClip('walk', 1, true)] });
    sk.play('idle');
    sk.play('walk', { crossfade: 0.3 });
    expect(sk.getState().crossfadeTarget).toBe('walk');
    expect(sk.getState().crossfadeProgress).toBe(0);
  });

  it('play without crossfade switches clip immediately', () => {
    const sk = new SkeletonTrait({ clips: [makeClip('idle', 2, true), makeClip('walk', 1, true)] });
    sk.play('idle');
    sk.play('walk');
    expect(sk.getCurrentClip()).toBe('walk');
    expect(sk.getState().crossfadeTarget).toBeUndefined();
  });
});

// ─── Parameters ──────────────────────────────────────────────────────────────────

describe('SkeletonTrait — parameters', () => {
  it('setParameter and getParameter roundtrip', () => {
    const sk = new SkeletonTrait();
    sk.setParameter('speed', 0.75);
    expect(sk.getParameter('speed')).toBe(0.75);
  });

  it('setFloat stores numeric value', () => {
    const sk = new SkeletonTrait();
    sk.setFloat('blend', 0.4);
    expect(sk.getParameter('blend')).toBe(0.4);
  });

  it('setBool stores boolean', () => {
    const sk = new SkeletonTrait();
    sk.setBool('isGrounded', true);
    expect(sk.getParameter('isGrounded')).toBe(true);
  });

  it('setTrigger sets parameter to true', () => {
    const sk = new SkeletonTrait();
    sk.setTrigger('jump');
    expect(sk.getParameter('jump')).toBe(true);
  });

  it('getParameter returns undefined for unknowns', () => {
    const sk = new SkeletonTrait();
    expect(sk.getParameter('nonexistent')).toBeUndefined();
  });

  it('initialises parameters from config', () => {
    const params = new Map<string, number | boolean>([
      ['speed', 0.5],
      ['grounded', true],
    ]);
    const sk = new SkeletonTrait({ parameters: params });
    expect(sk.getParameter('speed')).toBe(0.5);
    expect(sk.getParameter('grounded')).toBe(true);
  });
});

// ─── Blend trees ─────────────────────────────────────────────────────────────────

describe('SkeletonTrait — blend trees', () => {
  it('addBlendTree registers the tree', () => {
    const sk = new SkeletonTrait();
    sk.addBlendTree('locomotion', { type: '1D', parameter: 'speed', motions: [] });
    expect(sk.getConfig().blendTrees?.has('locomotion')).toBe(true);
  });

  it('activateBlendTree sets activeBlendTree in state', () => {
    const sk = new SkeletonTrait();
    sk.addBlendTree('loco', { type: '1D', parameter: 'speed', motions: [] });
    sk.activateBlendTree('loco');
    expect(sk.getState().activeBlendTree).toBe('loco');
  });

  it('activateBlendTree on unknown tree is no-op', () => {
    const sk = new SkeletonTrait();
    sk.activateBlendTree('ghost_tree');
    expect(sk.getState().activeBlendTree).toBeUndefined();
  });
});

// ─── Layer weights ──────────────────────────────────────────────────────────────

describe('SkeletonTrait — layers', () => {
  it('default layer weight is 1', () => {
    const sk = new SkeletonTrait();
    expect(sk.getLayerWeight(0)).toBe(1);
  });

  it('setLayerWeight clamps to [0,1]', () => {
    const sk = new SkeletonTrait();
    sk.setLayerWeight(0, 1.5);
    expect(sk.getLayerWeight(0)).toBe(1);
    sk.setLayerWeight(0, -0.5);
    expect(sk.getLayerWeight(0)).toBe(0);
  });

  it('setLayerWeight on invalid index is no-op', () => {
    const sk = new SkeletonTrait();
    expect(() => sk.setLayerWeight(99, 0.5)).not.toThrow();
  });
});

// ─── Enable / Disable ────────────────────────────────────────────────────────────

describe('SkeletonTrait — enable/disable', () => {
  it('setEnabled(false) disables', () => {
    const sk = new SkeletonTrait();
    sk.setEnabled(false);
    expect(sk.isEnabled()).toBe(false);
  });

  it('setEnabled(true) re-enables', () => {
    const sk = new SkeletonTrait();
    sk.setEnabled(false);
    sk.setEnabled(true);
    expect(sk.isEnabled()).toBe(true);
  });
});

// ─── Events ──────────────────────────────────────────────────────────────────────

describe('SkeletonTrait — events', () => {
  it('on/off registers and unregisters listener', () => {
    const sk = new SkeletonTrait({
      clips: [
        {
          name: 'anim',
          duration: 1,
          loop: false,
          events: [{ time: 0.1, name: 'footstep' }],
        },
      ],
    });
    const cb = vi.fn();
    sk.on('footstep', cb);
    sk.play('anim');
    sk.update(0.1);
    expect(cb).toHaveBeenCalledTimes(1);
    const called = cb.mock.calls[0][0] as AnimationEvent;
    expect(called.name).toBe('footstep');
  });

  it('off removes listener so it no longer fires', () => {
    const sk = new SkeletonTrait({
      clips: [
        {
          name: 'anim',
          duration: 1,
          loop: true,
          events: [{ time: 0.05, name: 'hit' }],
        },
      ],
    });
    const cb = vi.fn();
    sk.on('hit', cb);
    sk.off('hit', cb);
    sk.play('anim');
    sk.update(0.05);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── Serialize ───────────────────────────────────────────────────────────────────

describe('SkeletonTrait — serialize', () => {
  it('serialize returns expected shape', () => {
    const sk = new SkeletonTrait({
      rigType: 'humanoid',
      clips: [makeClip('idle', 1)],
      bones: [makeBone('root')],
    });
    const out = sk.serialize();
    expect(out.rigType).toBe('humanoid');
    expect(out.boneCount).toBe(1);
    expect(out.clipCount).toBe(1);
    expect(out.isPlaying).toBe(false);
    expect(out.enabled).toBe(true);
  });
});
