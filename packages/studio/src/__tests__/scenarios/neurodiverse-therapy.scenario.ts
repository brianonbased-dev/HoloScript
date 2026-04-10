/**
 * neurodiverse-therapy.scenario.ts — LIVING-SPEC: Adaptive Therapy
 *
 * Persona: Therapist Jordan — configures sensory environments and
 * tracks comfort milestones for neurodiverse clients.
 */
import { describe, it, expect } from 'vitest';

function adaptTolerance(current: number, overwhelm: number): number {
  if (overwhelm > 0.7) return Math.max(0.1, current - 0.1);
  return current;
}

function boostTolerance(current: number, calm: number, focus: number): number {
  if (calm > 0.8 && focus > 0.7) return Math.min(1.0, current + 0.05);
  return current;
}

function avgComfort(samples: number[]): number {
  return samples.length > 0 ? samples.reduce((s, v) => s + v, 0) / samples.length : 0;
}

function isMilestone(comfort: number, threshold: number): boolean {
  return comfort > threshold;
}

function sessionDurationValid(minutes: number, min: number, max: number): boolean {
  return minutes >= min && minutes <= max;
}

describe('Scenario: Neurodiverse Therapy — Sensory Adaptation', () => {
  it('adaptTolerance() reduces on overwhelm', () => {
    expect(adaptTolerance(0.5, 0.9)).toBeCloseTo(0.4);
  });
  it('adaptTolerance() keeps at minimum 0.1', () => {
    expect(adaptTolerance(0.15, 0.8)).toBeCloseTo(0.1);
  });
  it('boostTolerance() increases when calm+focused', () => {
    expect(boostTolerance(0.5, 0.9, 0.8)).toBeCloseTo(0.55);
  });
  it('boostTolerance() no change if not calm', () => {
    expect(boostTolerance(0.5, 0.5, 0.9)).toBe(0.5);
  });
});

describe('Scenario: Neurodiverse Therapy — Progress', () => {
  it('avgComfort() computes average', () => {
    expect(avgComfort([0.6, 0.8, 0.7])).toBeCloseTo(0.7);
  });
  it('isMilestone() — above threshold = true', () => {
    expect(isMilestone(0.8, 0.7)).toBe(true);
    expect(isMilestone(0.5, 0.7)).toBe(false);
  });
  it('sessionDurationValid() range check', () => {
    expect(sessionDurationValid(20, 15, 30)).toBe(true);
    expect(sessionDurationValid(10, 15, 30)).toBe(false);
  });
});
