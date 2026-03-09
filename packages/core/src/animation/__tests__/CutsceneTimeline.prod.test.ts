/**
 * CutsceneTimeline.prod.test.ts
 * Production tests for CutsceneTimeline and CutsceneBuilder — load/play/pause/stop,
 * update() event activation, callbacks, track muting, seek, speed, loop, and the builder DSL.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CutsceneTimeline,
  CutsceneBuilder,
  CutsceneDefinition,
  TimelineEvent,
} from '../CutsceneTimeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSimpleDef(id: string, duration: number, loop = false): CutsceneDefinition {
  return {
    id,
    name: `Test ${id}`,
    duration,
    loop,
    tracks: [
      {
        id: 'track0',
        name: 'Main',
        events: [
          { id: 'ev0', type: 'animation', startTime: 0, duration: 1, data: {} },
          { id: 'ev1', type: 'camera', startTime: 1, duration: 2, data: {} },
          { id: 'ev2', type: 'dialogue', startTime: 3, duration: 1, data: {} },
        ],
        muted: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CutsceneTimeline', () => {
  let tl: CutsceneTimeline;

  beforeEach(() => {
    tl = new CutsceneTimeline();
  });

  // -------------------------------------------------------------------------
  // load / play / stop
  // -------------------------------------------------------------------------
  describe('load()', () => {
    it('returns the definition id', () => {
      expect(tl.load(makeSimpleDef('cs1', 5))).toBe('cs1');
    });

    it('loaded cutscene is not playing', () => {
      tl.load(makeSimpleDef('cs1', 5));
      expect(tl.isPlaying('cs1')).toBe(false);
    });

    it('getCurrentTime is 0 after load', () => {
      tl.load(makeSimpleDef('cs1', 5));
      expect(tl.getCurrentTime('cs1')).toBe(0);
    });
  });

  describe('play()', () => {
    it('returns true for a loaded cutscene', () => {
      tl.load(makeSimpleDef('cs1', 5));
      expect(tl.play('cs1')).toBe(true);
    });

    it('returns false for an unknown cutscene', () => {
      expect(tl.play('missing')).toBe(false);
    });

    it('isPlaying returns true after play()', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      expect(tl.isPlaying('cs1')).toBe(true);
    });

    it('play() with startTime sets currentTime', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1', 2.5);
      expect(tl.getCurrentTime('cs1')).toBeCloseTo(2.5, 5);
    });

    it('play() resets activeEvents and completedEvents', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.update(1.0); // activate first event
      tl.play('cs1'); // re-play
      const state = tl.getState('cs1')!;
      expect(state.activeEvents.size).toBe(0);
      expect(state.completedEvents.size).toBe(0);
    });
  });

  describe('stop()', () => {
    it('isPlaying becomes false', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.stop('cs1');
      expect(tl.isPlaying('cs1')).toBe(false);
    });

    it('currentTime resets to 0', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1', 3);
      tl.stop('cs1');
      expect(tl.getCurrentTime('cs1')).toBe(0);
    });

    it('is a no-op for unknown cutscene', () => {
      expect(() => tl.stop('missing')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // pause / resume
  // -------------------------------------------------------------------------
  describe('pause() / resume()', () => {
    it('paused cutscene does not advance time', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.pause('cs1');
      tl.update(2.0);
      expect(tl.getCurrentTime('cs1')).toBeCloseTo(0, 5); // no advancement
    });

    it('resume() allows time to advance again', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.pause('cs1');
      tl.update(1.0);
      tl.resume('cs1');
      tl.update(1.0);
      expect(tl.getCurrentTime('cs1')).toBeCloseTo(1.0, 4);
    });
  });

  // -------------------------------------------------------------------------
  // update() — event activation
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('returns empty map when nothing is playing', () => {
      tl.load(makeSimpleDef('cs1', 5));
      const result = tl.update(1.0);
      // cs1 not playing → its id should not be in result (or empty list)
      const events = result.get('cs1');
      expect(events ?? []).toHaveLength(0);
    });

    it('activates events within their time window', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      // ev0: startTime=0, duration=1 → active at t=0.5
      tl.update(0.5);
      const result = tl.update(0.0);
      const active = result.get('cs1') ?? [];
      const ids = active.map((e: TimelineEvent) => e.id);
      expect(ids).toContain('ev0');
    });

    it('deactivates events after their window closes', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.update(1.5); // past ev0's window (0-1)
      const result = tl.update(0.0);
      const active = result.get('cs1') ?? [];
      const ids = active.map((e: TimelineEvent) => e.id);
      expect(ids).not.toContain('ev0');
    });

    it('marks completed events in completedEvents set', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.update(2.0); // past ev0 and into ev1 window
      const state = tl.getState('cs1')!;
      expect(state.completedEvents.has('ev0')).toBe(true);
    });

    it('multiple events can be active simultaneously on same track', () => {
      const def: CutsceneDefinition = {
        id: 'multi',
        name: 'Multi',
        duration: 5,
        loop: false,
        tracks: [
          {
            id: 'track0',
            name: 'T',
            events: [
              { id: 'a', type: 'animation', startTime: 0, duration: 3, data: {} },
              { id: 'b', type: 'audio', startTime: 0, duration: 3, data: {} },
            ],
            muted: false,
          },
        ],
      };
      tl.load(def);
      tl.play('multi');
      tl.update(1.0);
      const result = tl.update(0.0);
      const active = result.get('multi') ?? [];
      expect(active.length).toBe(2);
    });

    it('muted tracks produce no active events', () => {
      const def: CutsceneDefinition = {
        id: 'muted',
        name: 'Muted',
        duration: 5,
        loop: false,
        tracks: [
          {
            id: 'track0',
            name: 'Muted',
            events: [{ id: 'ev', type: 'audio', startTime: 0, duration: 3, data: {} }],
            muted: true,
          },
        ],
      };
      tl.load(def);
      tl.play('muted');
      tl.update(1.0);
      const active = tl.update(0.0).get('muted') ?? [];
      expect(active).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------
  describe('registerCallback() / callback events', () => {
    it('callback fires when callback event activates', () => {
      let fired = false;
      tl.registerCallback('greet', () => {
        fired = true;
      });
      const def: CutsceneDefinition = {
        id: 'cb',
        name: 'CB',
        duration: 5,
        loop: false,
        tracks: [
          {
            id: 't0',
            name: 'T',
            events: [
              {
                id: 'cbe',
                type: 'callback',
                startTime: 0,
                duration: 1,
                data: { callbackId: 'greet' },
              },
            ],
            muted: false,
          },
        ],
      };
      tl.load(def);
      tl.play('cb');
      tl.update(0.5);
      expect(fired).toBe(true);
    });

    it('callback fires only once per play (dedup)', () => {
      let count = 0;
      tl.registerCallback('tick', () => count++);
      const def: CutsceneDefinition = {
        id: 'once',
        name: 'Once',
        duration: 5,
        loop: false,
        tracks: [
          {
            id: 't0',
            name: 'T',
            events: [
              {
                id: 'e',
                type: 'callback',
                startTime: 0,
                duration: 2,
                data: { callbackId: 'tick' },
              },
            ],
            muted: false,
          },
        ],
      };
      tl.load(def);
      tl.play('once');
      tl.update(0.5);
      tl.update(0.5); // still within window
      expect(count).toBe(1);
    });

    it('unregisterCallback removes the callback', () => {
      let count = 0;
      tl.registerCallback('x', () => count++);
      tl.unregisterCallback('x');
      const def: CutsceneDefinition = {
        id: 'ur',
        name: 'UR',
        duration: 5,
        loop: false,
        tracks: [
          {
            id: 't0',
            name: 'T',
            events: [
              { id: 'e', type: 'callback', startTime: 0, duration: 1, data: { callbackId: 'x' } },
            ],
            muted: false,
          },
        ],
      };
      tl.load(def);
      tl.play('ur');
      tl.update(0.5);
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // seek / speed / loop
  // -------------------------------------------------------------------------
  describe('seek()', () => {
    it('sets currentTime to the given value', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.seek('cs1', 3);
      expect(tl.getCurrentTime('cs1')).toBeCloseTo(3, 5);
    });

    it('clamps to [0, duration]', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.seek('cs1', -1);
      expect(tl.getCurrentTime('cs1')).toBe(0);
      tl.seek('cs1', 100);
      expect(tl.getCurrentTime('cs1')).toBe(5);
    });
  });

  describe('setSpeed()', () => {
    it('doubles advance rate at speed=2', () => {
      tl.load(makeSimpleDef('cs1', 10));
      tl.play('cs1');
      tl.setSpeed('cs1', 2);
      tl.update(1.0);
      expect(tl.getCurrentTime('cs1')).toBeCloseTo(2.0, 5);
    });

    it('clamps speed to >= 0', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.setSpeed('cs1', -5);
      expect(tl.getState('cs1')!.speed).toBe(0);
    });

    it('speed=0 freezes playback', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.setSpeed('cs1', 0);
      tl.update(2.0);
      expect(tl.getCurrentTime('cs1')).toBeCloseTo(0, 5);
    });
  });

  describe('loop', () => {
    it('loops back to start when duration exceeded', () => {
      const def = makeSimpleDef('loop', 2, true);
      tl.load(def);
      tl.play('loop');
      tl.update(2.5);
      // 2.5 mod 2 = 0.5
      expect(tl.getCurrentTime('loop')).toBeCloseTo(0.5, 3);
      expect(tl.isPlaying('loop')).toBe(true);
    });

    it('non-loop stops at end', () => {
      tl.load(makeSimpleDef('noloop', 2, false));
      tl.play('noloop');
      tl.update(5);
      expect(tl.isPlaying('noloop')).toBe(false);
      expect(tl.getCurrentTime('noloop')).toBeCloseTo(2, 3);
    });
  });

  // -------------------------------------------------------------------------
  // getProgress / removeCutscene
  // -------------------------------------------------------------------------
  describe('getProgress()', () => {
    it('returns 0 before play', () => {
      tl.load(makeSimpleDef('cs1', 4));
      expect(tl.getProgress('cs1')).toBe(0);
    });

    it('returns 0.5 at half duration', () => {
      tl.load(makeSimpleDef('cs1', 4));
      tl.play('cs1');
      tl.update(2.0);
      expect(tl.getProgress('cs1')).toBeCloseTo(0.5, 5);
    });

    it('returns 0 for unknown cutscene', () => {
      expect(tl.getProgress('missing')).toBe(0);
    });
  });

  describe('removeCutscene()', () => {
    it('returns true when removed successfully', () => {
      tl.load(makeSimpleDef('cs1', 5));
      expect(tl.removeCutscene('cs1')).toBe(true);
    });

    it('isPlaying returns false after removal', () => {
      tl.load(makeSimpleDef('cs1', 5));
      tl.play('cs1');
      tl.removeCutscene('cs1');
      expect(tl.isPlaying('cs1')).toBe(false);
    });

    it('returns false for missing cutscene', () => {
      expect(tl.removeCutscene('missing')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// CutsceneBuilder Tests
// ---------------------------------------------------------------------------

describe('CutsceneBuilder', () => {
  it('creates a definition with the given id and name', () => {
    const def = new CutsceneBuilder('intro', 'Intro').build();
    expect(def.id).toBe('intro');
    expect(def.name).toBe('Intro');
  });

  it('build() without tracks returns duration 0', () => {
    const def = new CutsceneBuilder('empty', 'Empty').build();
    expect(def.duration).toBe(0);
    expect(def.tracks).toHaveLength(0);
  });

  it('addTrack() creates a track', () => {
    const def = new CutsceneBuilder('cs', 'CS').addTrack('Actor1', 'hero').build();
    expect(def.tracks).toHaveLength(1);
    expect(def.tracks[0].name).toBe('Actor1');
    expect(def.tracks[0].targetEntity).toBe('hero');
  });

  it('addEvent() adds an event to the specified track', () => {
    const def = new CutsceneBuilder('cs', 'CS')
      .addTrack('Actor')
      .addEvent(0, 'animation', 0, 2, { clip: 'walk' })
      .build();
    expect(def.tracks[0].events).toHaveLength(1);
    expect(def.tracks[0].events[0].type).toBe('animation');
    expect(def.tracks[0].events[0].startTime).toBe(0);
    expect(def.tracks[0].events[0].duration).toBe(2);
    expect(def.tracks[0].events[0].data.clip).toBe('walk');
  });

  it('build() calculates duration from max event end time', () => {
    const def = new CutsceneBuilder('cs', 'CS')
      .addTrack('T')
      .addEvent(0, 'animation', 0, 3)
      .addEvent(0, 'camera', 2, 5) // ends at 7
      .build();
    expect(def.duration).toBe(7);
  });

  it('chain() returns the builder for fluent API', () => {
    const builder = new CutsceneBuilder('cs', 'CS');
    expect(builder.addTrack('T')).toBe(builder);
  });

  it('addEvent with invalid track index is silently ignored', () => {
    const def = new CutsceneBuilder('cs', 'CS')
      .addTrack('T')
      .addEvent(5, 'audio', 0, 1) // track 5 doesn't exist
      .build();
    expect(def.tracks[0].events).toHaveLength(0);
  });

  it('event IDs are unique across multiple addEvent calls', () => {
    const def = new CutsceneBuilder('cs', 'CS')
      .addTrack('T')
      .addEvent(0, 'audio', 0, 1)
      .addEvent(0, 'audio', 1, 1)
      .addEvent(0, 'audio', 2, 1)
      .build();
    const ids = def.tracks[0].events.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('loop defaults to false', () => {
    const def = new CutsceneBuilder('cs', 'CS').build();
    expect(def.loop).toBe(false);
  });

  it('can build a complex multi-track cutscene', () => {
    const def = new CutsceneBuilder('cinematic', 'Big Scene')
      .addTrack('Hero', 'hero-entity')
      .addEvent(0, 'animation', 0, 5, { clip: 'enter' })
      .addEvent(0, 'dialogue', 2, 3, { text: 'Hello' })
      .addTrack('Camera')
      .addEvent(1, 'camera', 0, 5, { fov: 60 })
      .addTrack('Audio')
      .addEvent(2, 'audio', 0, 5, { src: 'theme.ogg' })
      .build();
    expect(def.tracks).toHaveLength(3);
    expect(def.tracks[0].events).toHaveLength(2);
    expect(def.tracks[1].events).toHaveLength(1);
    expect(def.duration).toBe(5);
  });
});
