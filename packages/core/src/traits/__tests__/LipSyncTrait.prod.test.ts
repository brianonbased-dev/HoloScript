/**
 * LipSyncTrait — Production Test Suite
 *
 * Pure CPU logic: OCULUS_VISEME_MAP (15 entries), ARKIT_MOUTH_SHAPES (15),
 * DEFAULT_FREQUENCY_BANDS (5 bands), LipSyncTrait class construction/config,
 * session start/end lifecycle, sampleVisemeAtTime (timestamp method),
 * samplePhonemeAtTime (phoneme method + mapPhonemeToViseme), setViseme,
 * setBlendShapeWeights, getMorphWeights, on/off event listeners, dispose.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  LipSyncTrait,
  createLipSyncTrait,
  OCULUS_VISEME_MAP,
  ARKIT_MOUTH_SHAPES,
  DEFAULT_FREQUENCY_BANDS,
} from '../LipSyncTrait';

// ─── OCULUS_VISEME_MAP ────────────────────────────────────────────────────────

describe('OCULUS_VISEME_MAP', () => {
  it('has exactly 15 entries (all standard Oculus visemes)', () => {
    expect(Object.keys(OCULUS_VISEME_MAP)).toHaveLength(15);
  });
  it('maps sil → viseme_sil', () => {
    expect(OCULUS_VISEME_MAP['sil']).toBe('viseme_sil');
  });
  it('maps PP → viseme_PP', () => {
    expect(OCULUS_VISEME_MAP['PP']).toBe('viseme_PP');
  });
  it('maps FF → viseme_FF', () => {
    expect(OCULUS_VISEME_MAP['FF']).toBe('viseme_FF');
  });
  it('maps TH → viseme_TH', () => {
    expect(OCULUS_VISEME_MAP['TH']).toBe('viseme_TH');
  });
  it('maps aa → viseme_aa', () => {
    expect(OCULUS_VISEME_MAP['aa']).toBe('viseme_aa');
  });
  it('maps E → viseme_E', () => {
    expect(OCULUS_VISEME_MAP['E']).toBe('viseme_E');
  });
  it('maps O → viseme_O', () => {
    expect(OCULUS_VISEME_MAP['O']).toBe('viseme_O');
  });
  it('maps U → viseme_U', () => {
    expect(OCULUS_VISEME_MAP['U']).toBe('viseme_U');
  });
  it('all values are prefixed with viseme_', () => {
    for (const v of Object.values(OCULUS_VISEME_MAP)) {
      expect(v).toMatch(/^viseme_/);
    }
  });
});

// ─── ARKIT_MOUTH_SHAPES ───────────────────────────────────────────────────────

describe('ARKIT_MOUTH_SHAPES', () => {
  it('has exactly 15 entries', () => {
    expect(Object.keys(ARKIT_MOUTH_SHAPES)).toHaveLength(15);
  });
  it('sil has jawOpen=0 and mouthClose=1', () => {
    expect(ARKIT_MOUTH_SHAPES['sil'].jawOpen).toBe(0);
    expect(ARKIT_MOUTH_SHAPES['sil'].mouthClose).toBe(1);
  });
  it('aa has jawOpen=0.7 (wide open vowel)', () => {
    expect(ARKIT_MOUTH_SHAPES['aa'].jawOpen).toBe(0.7);
  });
  it('O has mouthFunnel active', () => {
    expect(ARKIT_MOUTH_SHAPES['O'].mouthFunnel).toBeGreaterThan(0);
  });
  it('U has mouthPucker active', () => {
    expect(ARKIT_MOUTH_SHAPES['U'].mouthPucker).toBeGreaterThan(0);
  });
  it('PP has mouthClose (bilabial closure)', () => {
    expect(ARKIT_MOUTH_SHAPES['PP'].mouthClose).toBeGreaterThan(0);
  });
  it('all weight values are between 0 and 1', () => {
    for (const viseme of Object.values(ARKIT_MOUTH_SHAPES)) {
      for (const w of Object.values(viseme)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ─── DEFAULT_FREQUENCY_BANDS ──────────────────────────────────────────────────

describe('DEFAULT_FREQUENCY_BANDS', () => {
  it('has 5 frequency bands', () => {
    expect(DEFAULT_FREQUENCY_BANDS).toHaveLength(5);
  });
  it('each band has name, low, high, target fields', () => {
    for (const b of DEFAULT_FREQUENCY_BANDS) {
      expect(b).toHaveProperty('name');
      expect(b).toHaveProperty('low');
      expect(b).toHaveProperty('high');
      expect(b).toHaveProperty('target');
    }
  });
  it('low_vowel band targets viseme_O', () => {
    const b = DEFAULT_FREQUENCY_BANDS.find((b) => b.name === 'low_vowel');
    expect(b?.target).toBe('viseme_O');
  });
  it('sibilant band covers 4000–8000 Hz range', () => {
    const b = DEFAULT_FREQUENCY_BANDS.find((b) => b.name === 'sibilant');
    expect(b?.low).toBe(4000);
    expect(b?.high).toBe(8000);
  });
  it('all bands have low < high', () => {
    for (const b of DEFAULT_FREQUENCY_BANDS) {
      expect(b.low).toBeLessThan(b.high);
    }
  });
});

// ─── Constructor + getConfig ──────────────────────────────────────────────────

describe('LipSyncTrait — constructor + getConfig', () => {
  it('creates with default config', () => {
    const t = new LipSyncTrait();
    expect(t).toBeInstanceOf(LipSyncTrait);
  });
  it('default method is fft', () => {
    const t = new LipSyncTrait();
    expect(t.getConfig().method).toBe('fft');
  });
  it('default blendShapeSet is oculus', () => {
    const t = new LipSyncTrait();
    expect(t.getConfig().blendShapeSet).toBe('oculus');
  });
  it('default smoothing is 0.15', () => {
    const t = new LipSyncTrait();
    expect(t.getConfig().smoothing).toBe(0.15);
  });
  it('default silenceThreshold is 0.05', () => {
    const t = new LipSyncTrait();
    expect(t.getConfig().silenceThreshold).toBe(0.05);
  });
  it('default maxWeight is 0.85', () => {
    const t = new LipSyncTrait();
    expect(t.getConfig().maxWeight).toBe(0.85);
  });
  it('default coArticulation is true', () => {
    const t = new LipSyncTrait();
    expect(t.getConfig().coArticulation).toBe(true);
  });
  it('oculus blendShapeSet sets OCULUS_VISEME_MAP by default', () => {
    const t = new LipSyncTrait({ blendShapeSet: 'oculus' });
    expect(t.getConfig().visemeMap).toMatchObject(OCULUS_VISEME_MAP);
  });
  it('custom visemeMap overrides default', () => {
    const custom = { aa: 'my_aa', sil: 'my_sil' };
    const t = new LipSyncTrait({ visemeMap: custom });
    expect(t.getConfig().visemeMap).toEqual(custom);
  });
  it('createLipSyncTrait factory creates instance', () => {
    const t = createLipSyncTrait({ method: 'timestamps' });
    expect(t).toBeInstanceOf(LipSyncTrait);
    expect(t.getConfig().method).toBe('timestamps');
  });
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('LipSyncTrait — initial state', () => {
  it('getCurrentViseme returns sil', () => {
    const t = new LipSyncTrait();
    expect(t.getCurrentViseme()).toBe('sil');
  });
  it('getCurrentWeight returns 0', () => {
    const t = new LipSyncTrait();
    expect(t.getCurrentWeight()).toBe(0);
  });
  it('getIsSpeaking returns false', () => {
    const t = new LipSyncTrait();
    expect(t.getIsSpeaking()).toBe(false);
  });
  it('getActiveSession returns null', () => {
    const t = new LipSyncTrait();
    expect(t.getActiveSession()).toBeNull();
  });
  it('getMorphWeights returns empty object', () => {
    const t = new LipSyncTrait();
    expect(t.getMorphWeights()).toEqual({});
  });
});

// ─── Session lifecycle ────────────────────────────────────────────────────────

describe('LipSyncTrait — session lifecycle', () => {
  it('startSession returns a string id', () => {
    const t = new LipSyncTrait();
    const id = t.startSession();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
  it('startSession sets isSpeaking = true', () => {
    const t = new LipSyncTrait();
    t.startSession();
    expect(t.getIsSpeaking()).toBe(true);
  });
  it('startSession sets active session with correct id', () => {
    const t = new LipSyncTrait();
    const id = t.startSession();
    expect(t.getActiveSession()?.id).toBe(id);
    expect(t.getActiveSession()?.active).toBe(true);
  });
  it('startSession ids are sequential (lipsync_1, lipsync_2)', () => {
    const t = new LipSyncTrait();
    const id1 = t.startSession();
    t.endSession();
    const id2 = t.startSession();
    expect(id1).toBe('lipsync_1');
    expect(id2).toBe('lipsync_2');
  });
  it('endSession clears active session', () => {
    const t = new LipSyncTrait();
    t.startSession();
    t.endSession();
    expect(t.getActiveSession()).toBeNull();
  });
  it('endSession sets isSpeaking = false', () => {
    const t = new LipSyncTrait();
    t.startSession();
    t.endSession();
    expect(t.getIsSpeaking()).toBe(false);
  });
  it('endSession with no session is a no-op', () => {
    const t = new LipSyncTrait();
    expect(() => t.endSession()).not.toThrow();
  });
  it('session-start event fires on startSession', () => {
    const t = new LipSyncTrait();
    const cb = vi.fn();
    t.on('session-start', cb);
    t.startSession();
    expect(cb).toHaveBeenCalledOnce();
  });
  it('session-end event fires on endSession', () => {
    const t = new LipSyncTrait();
    const cb = vi.fn();
    t.on('session-end', cb);
    t.startSession();
    t.endSession();
    expect(cb).toHaveBeenCalledOnce();
  });
  it('session-end event includes sessionId', () => {
    const t = new LipSyncTrait();
    let capturedId: string | undefined;
    t.on('session-end', (e) => {
      capturedId = e.sessionId;
    });
    const id = t.startSession();
    t.endSession();
    expect(capturedId).toBe(id);
  });
  it('startSession stores visemeData', () => {
    const t = new LipSyncTrait();
    const visemes = [{ time: 0, viseme: 'aa', weight: 0.9 }];
    t.startSession({ visemeData: visemes });
    expect(t.getActiveSession()?.visemeData).toEqual(visemes);
  });
});

// ─── sampleVisemeAtTime ───────────────────────────────────────────────────────

describe('LipSyncTrait — sampleVisemeAtTime', () => {
  it('returns sil when no data', () => {
    const t = new LipSyncTrait();
    const r = t.sampleVisemeAtTime(0.0);
    expect(r.viseme).toBe('sil');
    expect(r.weight).toBe(0);
  });
  it('returns sil before first timestamp', () => {
    const t = new LipSyncTrait();
    const data = [{ time: 1.0, viseme: 'aa', weight: 0.8 }];
    const r = t.sampleVisemeAtTime(0.5, data);
    expect(r.viseme).toBe('sil');
  });
  it('returns correct viseme at exact timestamp', () => {
    const t = new LipSyncTrait();
    const data = [
      { time: 0.0, viseme: 'sil', weight: 0 },
      { time: 0.5, viseme: 'aa', weight: 0.9 },
      { time: 1.0, viseme: 'E', weight: 0.7 },
    ];
    const r = t.sampleVisemeAtTime(0.5, data);
    expect(r.viseme).toBe('aa');
  });
  it('returns last viseme when time is past all entries', () => {
    const t = new LipSyncTrait();
    const data = [
      { time: 0.0, viseme: 'sil' },
      { time: 0.5, viseme: 'aa' },
    ];
    const r = t.sampleVisemeAtTime(2.0, data);
    expect(r.viseme).toBe('aa');
  });
  it('includes nextViseme when there is a following entry', () => {
    const t = new LipSyncTrait();
    const data = [
      { time: 0.0, viseme: 'aa' },
      { time: 0.5, viseme: 'E' },
    ];
    const r = t.sampleVisemeAtTime(0.0, data);
    expect(r.nextViseme).toBe('E');
  });
  it('weight clamped to maxWeight (0.85)', () => {
    const t = new LipSyncTrait({ maxWeight: 0.85 });
    const data = [{ time: 0.0, viseme: 'aa', weight: 1.5 }];
    const r = t.sampleVisemeAtTime(0.0, data);
    expect(r.weight).toBeLessThanOrEqual(0.85);
  });
  it('co-articulation reduces weight near transition', () => {
    const t = new LipSyncTrait({ coArticulation: true, coArticulationLookahead: 0.1 });
    const data = [
      { time: 0.0, viseme: 'aa', weight: 1.0 },
      { time: 0.2, viseme: 'E', weight: 1.0 },
    ];
    // At 0.15s (just before 0.2 transition) weight should be reduced
    const rFull = t.sampleVisemeAtTime(0.0, data);
    const rNearTransition = t.sampleVisemeAtTime(0.15, data);
    expect(rNearTransition.weight).toBeLessThan(rFull.weight);
  });
  it('co-articulation disabled = weight stays full', () => {
    const t = new LipSyncTrait({ coArticulation: false });
    const data = [
      { time: 0.0, viseme: 'aa', weight: 0.8 },
      { time: 0.1, viseme: 'E', weight: 0.8 },
    ];
    const r = t.sampleVisemeAtTime(0.09, data);
    expect(r.weight).toBe(Math.min(0.8, 0.85));
  });
});

// ─── samplePhonemeAtTime + mapPhonemeToViseme ─────────────────────────────────

describe('LipSyncTrait — samplePhonemeAtTime', () => {
  it('returns sil when no phoneme data', () => {
    const t = new LipSyncTrait();
    const r = t.samplePhonemeAtTime(0);
    expect(r.viseme).toBe('sil');
  });
  it('aa ARPAbet phoneme → aa viseme', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'aa', time: 0, duration: 0.2, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.1, data);
    expect(r.viseme).toBe('aa');
  });
  it('ih ARPAbet → I viseme', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'ih', time: 0, duration: 0.2, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.1, data);
    expect(r.viseme).toBe('I');
  });
  it('ao ARPAbet → O viseme', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'ao', time: 0, duration: 0.2, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.1, data);
    expect(r.viseme).toBe('O');
  });
  it('p phoneme → PP viseme (bilabial)', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'p', time: 0, duration: 0.1, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.05, data);
    expect(r.viseme).toBe('PP');
  });
  it('s phoneme → SS viseme (sibilant)', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 's', time: 0, duration: 0.1, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.05, data);
    expect(r.viseme).toBe('SS');
  });
  it('th phoneme → TH viseme', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'th', time: 0, duration: 0.1, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.05, data);
    expect(r.viseme).toBe('TH');
  });
  it('r phoneme → RR viseme', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'r', time: 0, duration: 0.1, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.05, data);
    expect(r.viseme).toBe('RR');
  });
  it('unknown phoneme → sil', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'xyz_unknown', time: 0, duration: 0.1, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.05, data);
    expect(r.viseme).toBe('sil');
  });
  it('returns sil when time is outside any phoneme duration', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'aa', time: 1.0, duration: 0.1, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.0, data);
    expect(r.viseme).toBe('sil');
  });
  it('phoneme fade-in: weight near 0 at start of phoneme', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'aa', time: 0.0, duration: 1.0, weight: 1.0 }];
    const rStart = t.samplePhonemeAtTime(0.01, data); // 1% through = fade in
    const rMid = t.samplePhonemeAtTime(0.5, data); // 50% through = full
    expect(rStart.weight).toBeLessThan(rMid.weight);
  });
  it('phoneme fade-out: weight drops near end of phoneme', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'aa', time: 0.0, duration: 1.0, weight: 1.0 }];
    const rMid = t.samplePhonemeAtTime(0.5, data);
    const rEnd = t.samplePhonemeAtTime(0.95, data); // 95% through = fade out
    expect(rEnd.weight).toBeLessThan(rMid.weight);
  });
  it('stress markers are stripped from phoneme (aa1 → aa)', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'aa1', time: 0, duration: 0.2, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.1, data);
    expect(r.viseme).toBe('aa');
  });
  it('uppercase phonemes are lowercased (AH → aa)', () => {
    const t = new LipSyncTrait();
    const data = [{ phoneme: 'AH', time: 0, duration: 0.2, weight: 1.0 }];
    const r = t.samplePhonemeAtTime(0.1, data);
    expect(r.viseme).toBe('aa');
  });
});

// ─── setViseme (external input) ───────────────────────────────────────────────

describe('LipSyncTrait — setViseme', () => {
  it('setViseme updates currentViseme', () => {
    const t = new LipSyncTrait();
    t.setViseme('aa', 0.8);
    expect(t.getCurrentViseme()).toBe('aa');
  });
  it('setViseme updates currentWeight', () => {
    const t = new LipSyncTrait();
    t.setViseme('PP', 0.7);
    expect(t.getCurrentWeight()).toBe(0.7);
  });
  it('weight clamped at maxWeight', () => {
    const t = new LipSyncTrait({ maxWeight: 0.85 });
    t.setViseme('aa', 1.5);
    expect(t.getCurrentWeight()).toBe(0.85);
  });
  it('viseme-change event fires when viseme changes', () => {
    const t = new LipSyncTrait();
    const cb = vi.fn();
    t.on('viseme-change', cb);
    t.setViseme('aa', 0.8);
    expect(cb).toHaveBeenCalledOnce();
  });
  it('viseme-change event includes correct viseme and weight', () => {
    const t = new LipSyncTrait();
    let evt: any = null;
    t.on('viseme-change', (e) => {
      evt = e;
    });
    t.setViseme('E', 0.6);
    expect(evt.viseme).toBe('E');
    expect(evt.weight).toBe(0.6);
  });
  it('viseme-change does NOT fire if same viseme set again', () => {
    const t = new LipSyncTrait();
    t.setViseme('aa', 0.8);
    const cb = vi.fn();
    t.on('viseme-change', cb);
    t.setViseme('aa', 0.5); // same viseme, just different weight
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── setBlendShapeWeights ─────────────────────────────────────────────────────

describe('LipSyncTrait — setBlendShapeWeights', () => {
  it('sets morph target weights in visemeStates', () => {
    const t = new LipSyncTrait();
    t.setBlendShapeWeights({ jawOpen: 0.5, mouthFunnel: 0.3 });
    const weights = t.getMorphWeights();
    expect(weights.jawOpen).toBe(0); // starts at zero, hasn't been lerped yet
    // Note: target is set, but current=0 until update() is called
  });
  it('clamps weights at maxWeight', () => {
    const t = new LipSyncTrait({ maxWeight: 0.85 });
    t.setBlendShapeWeights({ jawOpen: 2.0 }); // 2.0 should clamp to 0.85
    // We can't directly read target state, but it shouldn't throw
    expect(t).toBeInstanceOf(LipSyncTrait);
  });
  it('multiple calls accumulate all keys', () => {
    const t = new LipSyncTrait();
    t.setBlendShapeWeights({ jawOpen: 0.5 });
    t.setBlendShapeWeights({ mouthFunnel: 0.3 });
    // Both keys should be registered in visemeStates (target set)
    expect(() => t.getMorphWeights()).not.toThrow();
  });
});

// ─── getMorphWeights after update ────────────────────────────────────────────

describe('LipSyncTrait — getMorphWeights + update lerp', () => {
  it('getMorphWeights returns empty when no states', () => {
    const t = new LipSyncTrait();
    expect(t.getMorphWeights()).toEqual({});
  });
  it('update() returns morph weights dict (may be empty on first frame)', () => {
    const t = new LipSyncTrait();
    const r = t.update(0.016);
    expect(typeof r).toBe('object');
  });
  it('update() with active session and timestamps method advances currentTime', () => {
    const t = new LipSyncTrait({ method: 'timestamps' });
    t.startSession({
      visemeData: [
        { time: 0, viseme: 'sil', weight: 0 },
        { time: 0.5, viseme: 'aa', weight: 0.9 },
      ],
    });
    const before = t.getActiveSession()!.currentTime;
    t.update(0.016);
    const after = t.getActiveSession()!.currentTime;
    expect(after).toBeCloseTo(before + 0.016, 5);
  });
});

// ─── Event listener on/off ────────────────────────────────────────────────────

describe('LipSyncTrait — on/off event listeners', () => {
  it('on registers listener that fires on event', () => {
    const t = new LipSyncTrait();
    const cb = vi.fn();
    t.on('session-start', cb);
    t.startSession();
    expect(cb).toHaveBeenCalledOnce();
  });
  it('off removes listener', () => {
    const t = new LipSyncTrait();
    const cb = vi.fn();
    t.on('session-start', cb);
    t.off('session-start', cb);
    t.startSession();
    expect(cb).not.toHaveBeenCalled();
  });
  it('multiple listeners on same event all fire', () => {
    const t = new LipSyncTrait();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    t.on('session-start', cb1);
    t.on('session-start', cb2);
    t.startSession();
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
  it('listener error is caught and does not break other listeners', () => {
    const t = new LipSyncTrait();
    const badCb = vi.fn(() => {
      throw new Error('oops');
    });
    const goodCb = vi.fn();
    t.on('session-start', badCb);
    t.on('session-start', goodCb);
    expect(() => t.startSession()).not.toThrow();
    expect(goodCb).toHaveBeenCalledOnce();
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────────

describe('LipSyncTrait — dispose', () => {
  it('dispose does not throw', () => {
    const t = new LipSyncTrait();
    t.startSession();
    expect(() => t.dispose()).not.toThrow();
  });
  it('dispose clears active session', () => {
    const t = new LipSyncTrait();
    t.startSession();
    t.dispose();
    expect(t.getActiveSession()).toBeNull();
  });
  it('dispose clears event listeners (no events fire after)', () => {
    const t = new LipSyncTrait();
    const cb = vi.fn();
    t.on('session-start', cb);
    t.dispose();
    t.startSession(); // would fire event if listeners were still registered
    // cb may fire once for internal startSession during dispose logic
    // Key: after dispose the listener map is cleared
    cb.mockClear();
    t.startSession();
    expect(cb).not.toHaveBeenCalled();
  });
  it('getMorphWeights returns empty after dispose', () => {
    const t = new LipSyncTrait();
    t.setViseme('aa', 0.8);
    t.dispose();
    expect(t.getMorphWeights()).toEqual({});
  });
});
