import { describe, it, expect, beforeEach } from 'vitest';
import { LipSyncTrait } from '../LipSyncTrait';

describe('LipSyncTrait', () => {
  let ls: LipSyncTrait;

  beforeEach(() => {
    ls = new LipSyncTrait({
      method: 'timestamps',
      blendShapeSet: 'oculus',
      smoothing: 0.1,
      sensitivity: 1.0,
      maxWeight: 1.0,
    });
  });

  it('initializes with config', () => {
    const cfg = ls.getConfig();
    expect(cfg.method).toBe('timestamps');
    expect(cfg.blendShapeSet).toBe('oculus');
  });

  it('not speaking initially', () => {
    expect(ls.getIsSpeaking()).toBe(false);
    expect(ls.getCurrentViseme()).toBe('sil');
  });

  it('getCurrentWeight returns 0 initially', () => {
    expect(ls.getCurrentWeight()).toBe(0);
  });

  it('getMorphWeights returns record', () => {
    const weights = ls.getMorphWeights();
    expect(typeof weights).toBe('object');
  });

  it('startSession creates session', () => {
    const id = ls.startSession({
      visemeData: [
        { time: 0, viseme: 'aa', weight: 1.0, duration: 0.1 },
        { time: 0.1, viseme: 'E', weight: 0.8, duration: 0.1 },
      ],
    });
    expect(typeof id).toBe('string');
    expect(ls.getActiveSession()).toBeDefined();
  });

  it('endSession clears session', () => {
    ls.startSession();
    ls.endSession();
    expect(ls.getActiveSession()).toBeNull();
  });

  it('setViseme sets current viseme', () => {
    ls.setViseme('aa', 0.8);
    expect(ls.getCurrentViseme()).toBe('aa');
    expect(ls.getCurrentWeight()).toBe(0.8);
  });

  it('sampleVisemeAtTime returns silence by default', () => {
    const result = ls.sampleVisemeAtTime(0);
    expect(result.viseme).toBe('sil');
  });

  it('sampleVisemeAtTime with data', () => {
    const data = [
      { time: 0, viseme: 'aa', weight: 1.0, duration: 0.1 },
      { time: 0.1, viseme: 'E', weight: 0.8, duration: 0.1 },
    ];
    ls.setVisemeTimestamps(data);
    const result = ls.sampleVisemeAtTime(0.05, data);
    expect(result.viseme).toBe('aa');
  });

  it('mapPhonemeToViseme maps known phoneme', () => {
    const viseme = ls.mapPhonemeToViseme('AH');
    expect(typeof viseme).toBe('string');
  });

  it('update returns weights', () => {
    const weights = ls.update(0.016);
    expect(typeof weights).toBe('object');
  });

  it('dispose does not throw', () => {
    expect(() => ls.dispose()).not.toThrow();
  });
});
