import { describe, it, expect, beforeEach } from 'vitest';
import { CinematicDirector } from '../CinematicDirector';
import type { CuePoint } from '../CinematicDirector';

describe('CinematicDirector', () => {
  let director: CinematicDirector;

  beforeEach(() => {
    director = new CinematicDirector();
  });

  // ---------------------------------------------------------------------------
  // Scene Management
  // ---------------------------------------------------------------------------

  it('createScene registers a scene', () => {
    director.createScene('intro', 'Introduction', 5);
    expect(director.getScene('intro')).toBeDefined();
  });

  it('getScene returns undefined for unknown', () => {
    expect(director.getScene('nope')).toBeUndefined();
  });

  it('scene has correct properties', () => {
    const scene = director.createScene('s1', 'Scene 1', 10);
    expect(scene.id).toBe('s1');
    expect(scene.name).toBe('Scene 1');
    expect(scene.duration).toBe(10);
    expect(scene.actors).toEqual([]);
    expect(scene.cues).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  it('playScene starts playing', () => {
    director.createScene('test', 'Test', 5);
    expect(director.playScene('test')).toBe(true);
    expect(director.isPlaying()).toBe(true);
  });

  it('playScene returns false for unknown scene', () => {
    expect(director.playScene('nope')).toBe(false);
  });

  it('stop ends playback', () => {
    director.createScene('test', 'Test', 5);
    director.playScene('test');
    director.stop();
    expect(director.isPlaying()).toBe(false);
  });

  it('pause / resume toggles playback', () => {
    director.createScene('test', 'Test', 5);
    director.playScene('test');
    director.pause();
    expect(director.isPlaying()).toBe(false);
    director.resume();
    expect(director.isPlaying()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------------

  it('update advances elapsed time', () => {
    director.createScene('test', 'Test', 5);
    director.playScene('test');
    director.update(1.0);
    expect(director.getElapsed()).toBeCloseTo(1.0, 1);
  });

  it('playback ends when duration reached', () => {
    director.createScene('short', 'Short', 2);
    director.playScene('short');
    director.update(3.0);
    expect(director.isPlaying()).toBe(false);
  });

  it('does not advance when paused', () => {
    director.createScene('test', 'Test', 5);
    director.playScene('test');
    director.update(1.0);
    director.pause();
    director.update(2.0);
    expect(director.getElapsed()).toBeCloseTo(1.0, 1);
  });

  // ---------------------------------------------------------------------------
  // Active Scene
  // ---------------------------------------------------------------------------

  it('getActiveScene returns current scene', () => {
    director.createScene('active', 'Active', 5);
    director.playScene('active');
    expect(director.getActiveScene()?.id).toBe('active');
  });

  it('getActiveScene is null when stopped', () => {
    director.createScene('test', 'Test', 5);
    director.playScene('test');
    director.stop();
    expect(director.getActiveScene()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Cues
  // ---------------------------------------------------------------------------

  it('addCue registers a timed cue', () => {
    director.createScene('cued', 'Cued', 5);
    director.addCue('cued', { id: 'c1', time: 2.0, type: 'effect', data: { name: 'explosion' } });
    const scene = director.getScene('cued')!;
    expect(scene.cues).toHaveLength(1);
    expect(scene.cues[0].time).toBe(2.0);
  });

  it('cue fires at correct time', () => {
    let firedCue: CuePoint | null = null;
    director.createScene('cued', 'Cued', 5);
    director.addCue('cued', { id: 'flash', time: 1.0, type: 'effect', data: {} });
    director.onCue('effect', (cue) => {
      firedCue = cue;
    });
    director.playScene('cued');
    director.update(1.5);
    expect(firedCue).not.toBeNull();
    expect(firedCue!.id).toBe('flash');
  });

  it('cue does not fire before its time', () => {
    let fired = false;
    director.createScene('cued', 'Cued', 5);
    director.addCue('cued', { id: 'late', time: 3.0, type: 'sound', data: {} });
    director.onCue('sound', () => {
      fired = true;
    });
    director.playScene('cued');
    director.update(2.0);
    expect(fired).toBe(false);
  });

  it('getFiredCues returns cues that fired', () => {
    director.createScene('test', 'Test', 5);
    director.addCue('test', { id: 'c1', time: 0.5, type: 'custom', data: {} });
    director.playScene('test');
    director.update(1.0);
    const fired = director.getFiredCues();
    expect(fired).toHaveLength(1);
    expect(fired[0].id).toBe('c1');
  });

  // ---------------------------------------------------------------------------
  // Actors
  // ---------------------------------------------------------------------------

  it('addActorMark adds actor to scene', () => {
    director.createScene('s', 'S', 3);
    director.addActorMark('s', {
      actorId: 'hero',
      position: [0, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
      animation: 'idle',
    });
    const scene = director.getScene('s')!;
    expect(scene.actors).toHaveLength(1);
    expect(scene.actors[0].actorId).toBe('hero');
  });

  // ---------------------------------------------------------------------------
  // Sequencer
  // ---------------------------------------------------------------------------

  it('getSequencer returns SequenceTrack', () => {
    expect(director.getSequencer()).toBeDefined();
  });
});
