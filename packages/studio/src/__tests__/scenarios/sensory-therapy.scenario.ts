/**
 * sensory-therapy.scenario.ts — LIVING-SPEC: Sensory Therapy Worlds
 *
 * Persona: Therapist Sky — configures sensory stimulation zones
 * and tracks progress milestones for persistent therapy worlds.
 */
import { describe, it, expect } from 'vitest';

function globalIntensityAfterReduction(current: number, factor: number): number {
  return current * factor;
}

function zoneIntensityClamp(intensity: number): number {
  return Math.max(0, Math.min(1.0, intensity));
}

function progressLevel(milestones: number): string {
  if (milestones >= 10) return 'advanced';
  if (milestones >= 5) return 'intermediate';
  if (milestones >= 1) return 'beginner';
  return 'new';
}

function rewardAmount(level: number, baseReward: number): number {
  return baseReward + level * 2;
}

describe('Scenario: Sensory Therapy — Stimulation Control', () => {
  it('globalIntensityAfterReduction()', () => {
    expect(globalIntensityAfterReduction(0.8, 0.3)).toBeCloseTo(0.24);
  });
  it('zoneIntensityClamp() lower bound', () => {
    expect(zoneIntensityClamp(-0.1)).toBe(0);
  });
  it('zoneIntensityClamp() upper bound', () => {
    expect(zoneIntensityClamp(1.5)).toBe(1.0);
  });
});

describe('Scenario: Sensory Therapy — Progress', () => {
  it('progressLevel() classification', () => {
    expect(progressLevel(0)).toBe('new');
    expect(progressLevel(1)).toBe('beginner');
    expect(progressLevel(5)).toBe('intermediate');
    expect(progressLevel(15)).toBe('advanced');
  });
  it('rewardAmount() scales with level', () => {
    expect(rewardAmount(3, 5)).toBe(11);
  });
});
