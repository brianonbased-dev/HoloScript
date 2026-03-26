/**
 * Training Constants Tests
 *
 * Gap 1: Verifies canonical constants, type narrowing, and exhaustiveness.
 */

import { describe, it, expect } from 'vitest';
import {
  TRAINING_CATEGORIES,
  DIFFICULTY_LEVELS,
  QUALITY_THRESHOLDS,
  DEFAULT_GENERATOR_THRESHOLDS,
  RULEFORGE_DOMAINS,
  getQualityTier,
  isValidCategory,
  isValidDifficulty,
} from '../constants';

describe('Training Constants', () => {
  it('has 9 training categories', () => {
    expect(TRAINING_CATEGORIES).toHaveLength(9);
    expect(TRAINING_CATEGORIES).toContain('vr-interaction');
    expect(TRAINING_CATEGORIES).toContain('ai-agents');
    expect(TRAINING_CATEGORIES).toContain('physics');
    expect(TRAINING_CATEGORIES).toContain('game-mechanics');
  });

  it('has 4 difficulty levels', () => {
    expect(DIFFICULTY_LEVELS).toHaveLength(4);
    expect(DIFFICULTY_LEVELS).toContain('beginner');
    expect(DIFFICULTY_LEVELS).toContain('intermediate');
    expect(DIFFICULTY_LEVELS).toContain('advanced');
    expect(DIFFICULTY_LEVELS).toContain('production');
  });

  it('has quality thresholds with correct ranges', () => {
    expect(QUALITY_THRESHOLDS.Excellent.min).toBe(90);
    expect(QUALITY_THRESHOLDS.Excellent.max).toBe(100);
    expect(QUALITY_THRESHOLDS.VeryGood.min).toBe(80);
    expect(QUALITY_THRESHOLDS.VeryGood.max).toBe(89);
    expect(QUALITY_THRESHOLDS.Acceptable.min).toBe(70);
    expect(QUALITY_THRESHOLDS.Acceptable.max).toBe(79);
  });

  it('has default generator thresholds', () => {
    expect(DEFAULT_GENERATOR_THRESHOLDS.min_compression_ratio).toBe(5);
    expect(DEFAULT_GENERATOR_THRESHOLDS.max_duplication_rate).toBe(0.05);
    expect(DEFAULT_GENERATOR_THRESHOLDS.min_quality_score).toBe(0.7);
  });

  it('has 8 ruleforge domains', () => {
    expect(RULEFORGE_DOMAINS).toHaveLength(8);
    expect(RULEFORGE_DOMAINS).toContain('ai_agents');
    expect(RULEFORGE_DOMAINS).toContain('physics');
  });
});

describe('getQualityTier', () => {
  it('returns Excellent for scores >= 90', () => {
    expect(getQualityTier(95)).toBe('Excellent');
    expect(getQualityTier(90)).toBe('Excellent');
    expect(getQualityTier(100)).toBe('Excellent');
  });

  it('returns VeryGood for scores 80-89', () => {
    expect(getQualityTier(85)).toBe('VeryGood');
    expect(getQualityTier(80)).toBe('VeryGood');
    expect(getQualityTier(89)).toBe('VeryGood');
  });

  it('returns Acceptable for scores 70-79', () => {
    expect(getQualityTier(75)).toBe('Acceptable');
    expect(getQualityTier(70)).toBe('Acceptable');
    expect(getQualityTier(79)).toBe('Acceptable');
  });

  it('returns BelowAcceptable for scores < 70', () => {
    expect(getQualityTier(69)).toBe('BelowAcceptable');
    expect(getQualityTier(0)).toBe('BelowAcceptable');
    expect(getQualityTier(50)).toBe('BelowAcceptable');
  });
});

describe('isValidCategory', () => {
  it('validates known categories', () => {
    expect(isValidCategory('physics')).toBe(true);
    expect(isValidCategory('ai-agents')).toBe(true);
  });

  it('rejects unknown categories', () => {
    expect(isValidCategory('unknown')).toBe(false);
    expect(isValidCategory('')).toBe(false);
  });
});

describe('isValidDifficulty', () => {
  it('validates known difficulties', () => {
    expect(isValidDifficulty('beginner')).toBe(true);
    expect(isValidDifficulty('production')).toBe(true);
  });

  it('rejects unknown difficulties', () => {
    expect(isValidDifficulty('expert')).toBe(false);
    expect(isValidDifficulty('')).toBe(false);
  });
});
