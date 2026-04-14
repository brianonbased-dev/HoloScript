/**
 * CinematicSequencer.test.ts — Cycle 186
 *
 * Tests for CinematicDirector, SequenceTrack, and CameraRig.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CinematicDirector } from '../cinematic/CinematicDirector';
import { SequenceTrack } from '../cinematic/SequenceTrack';
import { CameraRig } from '../cinematic/CameraRig';

// =============================================================================
// CinematicDirector
// =============================================================================
describe('CinematicDirector', () => {
  let dir: CinematicDirector;

  beforeEach(() => {
    dir = new CinematicDirector();
  });

  it('creates and retrieves scenes', () => {
    const scene = dir.createScene('s1', 'Intro', 10);
    expect(scene.id).toBe('s1');
    expect(scene.name).toBe('Intro');
    expect(scene.duration).toBe(10);
    expect(dir.getScene('s1')).toBeDefined();
  });

  it('adds actor marks to scenes', () => {
    dir.createScene('s1', 'Intro', 10);
    dir.addActorMark('s1', {
      actorId: 'hero',
      position: [0, 0, 0],
      rotation: [0, 0, 0 ],
    });
    const scene = dir.getScene('s1')!;
    expect(scene.actors).toHaveLength(1);
    expect(scene.actors[0].actorId).toBe('hero');
  });

  it('adds cues sorted by time', () => {
    dir.createScene('s1', 'Scene', 10);
    dir.addCue('s1', { id: 'c2', time: 5, type: 'dialogue', data: {} });
    dir.addCue('s1', { id: 'c1', time: 2, type: 'sound', data: {} });
    const scene = dir.getScene('s1')!;
    expect(scene.cues[0].id).toBe('c1');
    expect(scene.cues[1].id).toBe('c2');
  });

  it('plays and stops scenes', () => {
    dir.createScene('s1', 'Test', 5);
    expect(dir.playScene('s1')).toBe(true);
    expect(dir.isPlaying()).toBe(true);
    dir.stop();
    expect(dir.isPlaying()).toBe(false);
  });

  it('fires cues during update', () => {
    dir.createScene('s1', 'Test', 10);
    dir.addCue('s1', { id: 'c1', time: 0.5, type: 'effect', data: { fx: 'flash' } });
    const fired: string[] = [];
    dir.onCue('effect', (cue) => fired.push(cue.id));
    dir.playScene('s1');
    dir.update(0.6);
    expect(fired).toContain('c1');
    expect(dir.getFiredCues()).toHaveLength(1);
  });

  it('ends scene when duration exceeded', () => {
    dir.createScene('s1', 'Short', 1);
    dir.playScene('s1');
    dir.update(1.1);
    expect(dir.isPlaying()).toBe(false);
  });

  it('pause and resume work', () => {
    dir.createScene('s1', 'Test', 10);
    dir.playScene('s1');
    dir.pause();
    expect(dir.isPlaying()).toBe(false);
    dir.resume();
    expect(dir.isPlaying()).toBe(true);
  });

  it('returns false for unknown scene', () => {
    expect(dir.playScene('nope')).toBe(false);
  });
});

// =============================================================================
// SequenceTrack
// =============================================================================
describe('SequenceTrack', () => {
  let seq: SequenceTrack;

  beforeEach(() => {
    seq = new SequenceTrack();
  });

  it('adds and retrieves tracks', () => {
    const track = seq.addTrack('t1', 'Position', 'float');
    expect(track.id).toBe('t1');
    expect(seq.getTrack('t1')).toBeDefined();
    expect(seq.getTracks()).toHaveLength(1);
  });

  it('removes tracks', () => {
    seq.addTrack('t1', 'Rot', 'rotation');
    seq.removeTrack('t1');
    expect(seq.getTrack('t1')).toBeUndefined();
  });

  it('mutes tracks', () => {
    seq.addTrack('t1', 'Pos', 'float');
    seq.muteTrack('t1', true);
    expect(seq.getTrack('t1')!.muted).toBe(true);
  });

  it('adds clips and auto-calculates duration', () => {
    seq.addTrack('t1', 'Alpha', 'float');
    const clip = seq.addClip('t1', 0, 5, [
      { time: 0, value: 0, easing: 'linear' },
      { time: 1, value: 1, easing: 'linear' },
    ]);
    expect(clip).not.toBeNull();
    expect(seq.getDuration()).toBe(5);
  });

  it('evaluates keyframes during playback', () => {
    seq.addTrack('t1', 'Val', 'float');
    seq.addClip('t1', 0, 2, [
      { time: 0, value: 0, easing: 'linear' },
      { time: 1, value: 100, easing: 'linear' },
    ]);
    seq.play();
    const out = seq.update(1); // halfway → t=0.5
    expect(out.has('t1')).toBe(true);
    expect(out.get('t1')!).toBeGreaterThan(0);
  });

  it('loops when enabled', () => {
    seq.addTrack('t1', 'Loop', 'float');
    seq.addClip('t1', 0, 1, [{ time: 0, value: 1, easing: 'linear' }]);
    seq.setLoop(true);
    seq.play();
    seq.update(1.5); // exceeds duration
    expect(seq.isPlaying()).toBe(true);
  });

  it('stops at end without loop', () => {
    seq.addTrack('t1', 'End', 'float');
    seq.addClip('t1', 0, 1, [{ time: 0, value: 1, easing: 'linear' }]);
    seq.play();
    seq.update(1.5);
    expect(seq.isPlaying()).toBe(false);
  });

  it('speed multiplier works', () => {
    seq.addTrack('t1', 'Spd', 'float');
    seq.addClip('t1', 0, 2, [{ time: 0, value: 1, easing: 'linear' }]);
    seq.setSpeed(2);
    seq.play();
    seq.update(0.5); // effective = 1
    expect(seq.getCurrentTime()).toBeCloseTo(1, 1);
  });
});

// =============================================================================
// CameraRig
// =============================================================================
describe('CameraRig', () => {
  it('defaults to static mode', () => {
    const rig = new CameraRig();
    expect(rig.getMode()).toBe('static');
  });

  it('switches modes', () => {
    const rig = new CameraRig();
    rig.setMode('dolly');
    expect(rig.getMode()).toBe('dolly');
  });

  it('has built-in shake presets', () => {
    const rig = new CameraRig();
    const presets = rig.getShakePresets();
    expect(presets).toContain('light');
    expect(presets).toContain('heavy');
    expect(presets).toContain('explosion');
  });

  it('shake modifies offset', () => {
    const rig = new CameraRig();
    rig.shake('medium');
    const state = rig.update(0.01);
    // During active shake, offsets should be non-zero
    const hasShake =
      state.shakeOffset.x !== 0 || state.shakeOffset.y !== 0 || state.shakeOffset.z !== 0;
    expect(hasShake).toBe(true);
  });

  it('dolly moves along path', () => {
    const rig = new CameraRig({ mode: 'dolly', speed: 10 });
    rig.setDollyPath([
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ]);
    const before = rig.getState().position[0];
    rig.update(0.5);
    const after = rig.getState().position[0];
    expect(after).toBeGreaterThan(before);
  });

  it('crane adjusts height', () => {
    const rig = new CameraRig({ mode: 'crane' });
    rig.setCraneParams(20, 45);
    rig.update(0.016);
    const state = rig.getState();
    expect(state.position[1]).toBeGreaterThan(5); // default y is 5, crane adds
  });
});
