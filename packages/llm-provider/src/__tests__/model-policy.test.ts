import { describe, it, expect } from 'vitest';
import {
  LOCAL_DEFAULT_MODEL,
  FLEET_DEFAULT_MODEL,
  CLOUD_DEFAULT_MODEL,
  SAFE_LOCAL_FALLBACK,
  MODEL_BLACKLIST,
  isBlacklistedModel,
  resolveAllowedModel,
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

  it('isBlacklistedModel matches qwen2.5 variants case-insensitively, not others', () => {
    expect(isBlacklistedModel('qwen2.5-coder:7b')).toBe(true);
    expect(isBlacklistedModel('Qwen2.5:14b-instruct')).toBe(true);
    expect(isBlacklistedModel('qwen3.5:4b')).toBe(false);
    expect(isBlacklistedModel('claude-opus-4-8')).toBe(false);
    expect(isBlacklistedModel(undefined)).toBe(false);
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
