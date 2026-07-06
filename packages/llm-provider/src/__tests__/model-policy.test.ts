import { describe, it, expect } from 'vitest';
import {
  LOCAL_DEFAULT_MODEL,
  FLEET_DEFAULT_MODEL,
  CLOUD_DEFAULT_MODEL,
  SAFE_LOCAL_FALLBACK,
  LANE_DEFAULTS,
  laneDefault,
  MODEL_LIBRARY,
  modelsForLane,
  modelLibraryEntry,
  MODEL_BLACKLIST,
  FINAL_OUTPUT_GATED_MODELS,
  isBlacklistedModel,
  isFinalOutputGatedModel,
  resolveAllowedModel,
  type ModelLane,
} from '../model-policy';

describe('model-policy SSOT', () => {
  it('every tier default is a non-blacklisted, non-empty model id', () => {
    for (const m of [LOCAL_DEFAULT_MODEL, FLEET_DEFAULT_MODEL, CLOUD_DEFAULT_MODEL]) {
      expect(m).toBeTruthy();
      expect(isBlacklistedModel(m)).toBe(false);
    }
  });

  it('SAFE_LOCAL_FALLBACK is the local default (never drifts apart)', () => {
    expect(SAFE_LOCAL_FALLBACK).toBe(LOCAL_DEFAULT_MODEL);
  });

  it('the blacklist is non-empty and SAFE_LOCAL_FALLBACK escapes it', () => {
    expect(MODEL_BLACKLIST.length).toBeGreaterThan(0);
    expect(isBlacklistedModel(SAFE_LOCAL_FALLBACK)).toBe(false);
  });

  it('every per-lane default is non-blacklisted, non-empty, and reachable via laneDefault()', () => {
    const lanes = Object.keys(LANE_DEFAULTS) as ModelLane[];
    expect(lanes).toEqual(['code_local', 'code_served', 'operator', 'reasoning', 'vision', 'fleet_worker']);
    for (const lane of lanes) {
      expect(LANE_DEFAULTS[lane]).toBeTruthy();
      expect(isBlacklistedModel(LANE_DEFAULTS[lane])).toBe(false);
      expect(laneDefault(lane)).toBe(LANE_DEFAULTS[lane]);
    }
    // code_local IS the local default; reasoning IS the cloud default.
    expect(LANE_DEFAULTS.code_local).toBe(LOCAL_DEFAULT_MODEL);
    expect(LANE_DEFAULTS.reasoning).toBe(CLOUD_DEFAULT_MODEL);
  });

  describe('MODEL_LIBRARY', () => {
    const validLanes = new Set(Object.keys(LANE_DEFAULTS));

    it('every entry is non-blacklisted, non-empty, with valid lanes', () => {
      expect(MODEL_LIBRARY.length).toBeGreaterThan(0);
      for (const m of MODEL_LIBRARY) {
        expect(m.id).toBeTruthy();
        expect(isBlacklistedModel(m.id)).toBe(false);
        expect(m.lanes.length).toBeGreaterThan(0);
        for (const lane of m.lanes) expect(validLanes.has(lane)).toBe(true);
        expect(['local', 'fleet', 'cloud']).toContain(m.tier);
      }
    });

    it('every entry id is unique', () => {
      const ids = MODEL_LIBRARY.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every LANE_DEFAULTS model is present in the library (defaults come from the catalog)', () => {
      for (const lane of Object.keys(LANE_DEFAULTS) as ModelLane[]) {
        expect(modelLibraryEntry(LANE_DEFAULTS[lane])).toBeDefined();
      }
    });

    it('modelsForLane returns the catalog entries for each lane', () => {
      for (const lane of Object.keys(LANE_DEFAULTS) as ModelLane[]) {
        const forLane = modelsForLane(lane);
        expect(forLane.length).toBeGreaterThan(0);
        expect(forLane.every((m) => m.lanes.includes(lane))).toBe(true);
        // the lane default is one of the lane's catalog entries
        expect(forLane.map((m) => m.id)).toContain(LANE_DEFAULTS[lane]);
      }
    });
  });

  it('isBlacklistedModel matches qwen2.5 variants case-insensitively, not others', () => {
    expect(isBlacklistedModel('qwen2.5-coder:7b')).toBe(true);
    expect(isBlacklistedModel('Qwen2.5:14b-instruct')).toBe(true);
    expect(isBlacklistedModel('qwen3.5:4b')).toBe(false);
    expect(isBlacklistedModel('claude-opus-4-8')).toBe(false);
    expect(isBlacklistedModel(undefined)).toBe(false);
  });

  it('keeps qwen3-vl gated away from Tower C final-output promotion', () => {
    expect(FINAL_OUTPUT_GATED_MODELS).toContain('qwen3-vl');
    expect(isFinalOutputGatedModel('qwen3-vl:4b')).toBe(true);
    expect(isFinalOutputGatedModel('Qwen3_VL_4B')).toBe(true);
    expect(isFinalOutputGatedModel(LANE_DEFAULTS.vision)).toBe(true);
    expect(isFinalOutputGatedModel(LOCAL_DEFAULT_MODEL)).toBe(false);
    expect(modelLibraryEntry('qwen3-vl:4b')?.note).toContain('final-output gated');
  });

  describe('resolveAllowedModel', () => {
    it('passes an allowed model through unchanged', () => {
      expect(resolveAllowedModel('llama3.1:8b')).toBe('llama3.1:8b');
    });

    it('substitutes a blacklisted model with the fallback', () => {
      expect(resolveAllowedModel('qwen2.5-coder:7b')).toBe(SAFE_LOCAL_FALLBACK);
      expect(resolveAllowedModel('qwen2.5-coder:7b', FLEET_DEFAULT_MODEL)).toBe(FLEET_DEFAULT_MODEL);
    });

    it('substitutes the safe local default when BOTH requested and fallback are blacklisted', () => {
      expect(resolveAllowedModel('qwen2.5:7b', 'qwen2.5-coder:1.5b')).toBe(LOCAL_DEFAULT_MODEL);
    });

    it('substitutes the fallback for an empty/undefined request', () => {
      expect(resolveAllowedModel(undefined)).toBe(SAFE_LOCAL_FALLBACK);
      expect(resolveAllowedModel('')).toBe(SAFE_LOCAL_FALLBACK);
    });
  });
});
