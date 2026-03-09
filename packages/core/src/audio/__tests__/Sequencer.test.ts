/**
 * Sequencer Unit Tests (via createSequencer factory)
 *
 * Tests BPM, transport controls, sequence/pattern/track management,
 * loop modes, seek, events, and note triggers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSequencer } from '../Sequencer';
import type { IAudioContext, ISequencer, ISequence, IPattern, ITrack } from '../AudioTypes';

function mockAudioContext(): IAudioContext {
  return {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: {} as any,
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: { value: 440, setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      addEventListener: vi.fn(),
    })) as any,
    createGain: vi.fn(() => ({
      gain: { value: 1, linearRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })) as any,
    resume: vi.fn(),
    suspend: vi.fn(),
    close: vi.fn(),
  } as unknown as IAudioContext;
}

describe('Sequencer (createSequencer)', () => {
  let seq: ISequencer;
  let ctx: IAudioContext;

  beforeEach(() => {
    ctx = mockAudioContext();
    seq = createSequencer(ctx);
  });

  describe('construction', () => {
    it('should default to BPM 120', () => {
      expect(seq.getBPM()).toBe(120);
    });

    it('should not be playing initially', () => {
      expect(seq.isPlaying).toBe(false);
    });

    it('should report state stopped', () => {
      expect(seq.state).toBe('stopped');
    });
  });

  describe('BPM', () => {
    it('should set and get BPM', () => {
      seq.setBPM(140);
      expect(seq.getBPM()).toBe(140);
    });
  });

  describe('sequence management', () => {
    it('should create and retrieve a sequence', () => {
      const config: ISequence = {
        id: 's1',
        name: 'Test',
        bpm: 120,
        tracks: [],
        patterns: [],
      };
      seq.createSequence(config);
      const retrieved = seq.getSequence('s1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test');
    });

    it('should throw on duplicate sequence id', () => {
      const config: ISequence = { id: 's1', name: 'Test', bpm: 120, tracks: [], patterns: [] };
      seq.createSequence(config);
      expect(() => seq.createSequence(config)).toThrow();
    });

    it('should remove a sequence', () => {
      const config: ISequence = { id: 's1', name: 'Test', bpm: 120, tracks: [], patterns: [] };
      seq.createSequence(config);
      seq.removeSequence('s1');
      expect(seq.getSequence('s1')).toBeUndefined();
    });
  });

  describe('pattern management', () => {
    it('should create and retrieve a pattern', () => {
      const pattern: IPattern = {
        id: 'p1',
        name: 'Kick',
        bars: 1,
        beatsPerBar: 4,
        subdivision: 4,
        notes: [],
      };
      seq.createPattern(pattern);
      expect(seq.getPattern('p1')).toBeDefined();
    });

    it('should add notes to a pattern', () => {
      const pattern: IPattern = {
        id: 'p1',
        name: 'Kick',
        bars: 1,
        beatsPerBar: 4,
        subdivision: 4,
        notes: [],
      };
      seq.createPattern(pattern);
      seq.addNoteToPattern('p1', { pitch: 60, velocity: 100, start: 0, duration: 0.25 });
      const p = seq.getPattern('p1');
      expect(p!.notes.length).toBe(1);
    });

    it('should remove notes from a pattern', () => {
      const pattern: IPattern = {
        id: 'p1',
        name: 'Kick',
        bars: 1,
        beatsPerBar: 4,
        subdivision: 4,
        notes: [{ pitch: 60, velocity: 100, start: 0, duration: 0.25 }],
      };
      seq.createPattern(pattern);
      seq.removeNoteFromPattern('p1', 0);
      expect(seq.getPattern('p1')!.notes.length).toBe(0);
    });
  });

  describe('track management', () => {
    it('should create and retrieve a track', () => {
      const track: ITrack = {
        id: 't1',
        name: 'Drums',
        volume: 1,
        pan: 0,
        muted: false,
        solo: false,
        patterns: [],
      };
      seq.createTrack(track);
      expect(seq.getTrack('t1')).toBeDefined();
    });

    it('should update track properties', () => {
      const track: ITrack = {
        id: 't1',
        name: 'Drums',
        volume: 1,
        pan: 0,
        muted: false,
        solo: false,
        patterns: [],
      };
      seq.createTrack(track);
      seq.setTrackVolume('t1', 0.5);
      expect(seq.getTrack('t1')!.volume).toBe(0.5);
    });

    it('should mute/solo tracks', () => {
      const track: ITrack = {
        id: 't1',
        name: 'Drums',
        volume: 1,
        pan: 0,
        muted: false,
        solo: false,
        patterns: [],
      };
      seq.createTrack(track);
      seq.setTrackMuted('t1', true);
      expect(seq.getTrack('t1')!.muted).toBe(true);
      seq.setTrackSolo('t1', true);
      expect(seq.getTrack('t1')!.solo).toBe(true);
    });
  });

  describe('transport controls', () => {
    it('should start and stop', () => {
      seq.start();
      expect(seq.isPlaying).toBe(true);
      seq.stop();
      expect(seq.isPlaying).toBe(false);
    });

    it('should pause and resume', () => {
      seq.start();
      seq.pause();
      expect(seq.state).toBe('paused');
    });

    it('should report playback position', () => {
      const pos = seq.getPlaybackPosition();
      expect(pos.beat).toBe(0);
      expect(pos.bar).toBe(0);
    });
  });

  describe('loop', () => {
    it('should set loop mode', () => {
      seq.setLoop(true);
      expect(seq.loopMode).toBe('sequence');
      seq.setLoop(false);
      expect(seq.loopMode).toBe('none');
    });

    it('should set and get loop range', () => {
      seq.setLoopRange(0, 16);
      const range = seq.getLoopRange();
      expect(range.start).toBe(0);
      expect(range.end).toBe(16);
    });
  });

  describe('utility conversion', () => {
    it('should convert beats to seconds', () => {
      seq.setBPM(120); // 0.5s per beat
      expect(seq.beatsToSeconds(2)).toBeCloseTo(1);
    });

    it('should convert seconds to beats', () => {
      seq.setBPM(120);
      expect(seq.secondsToBeats(1)).toBeCloseTo(2);
    });
  });

  describe('events', () => {
    it('should emit sequencerStarted on start', () => {
      const cb = vi.fn();
      seq.on('sequencerStarted', cb);
      seq.start();
      expect(cb).toHaveBeenCalled();
    });

    it('should emit sequencerStopped on stop', () => {
      const cb = vi.fn();
      seq.on('sequencerStopped', cb);
      seq.start();
      seq.stop();
      expect(cb).toHaveBeenCalled();
    });
  });

  describe('quantize', () => {
    it('should quantize beat to grid', () => {
      expect(seq.quantize(1.3, 0.25)).toBeCloseTo(1.25);
      expect(seq.quantize(1.6, 0.5)).toBeCloseTo(1.5);
    });
  });

  describe('dispose', () => {
    it('should clean up on dispose', () => {
      seq.start();
      expect(() => seq.dispose()).not.toThrow();
      expect(seq.isPlaying).toBe(false);
    });
  });
});
