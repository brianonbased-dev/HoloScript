/**
 * robot-training.scenario.ts — LIVING-SPEC: Physical-AI Robot Training
 *
 * Persona: Eng. Torres — roboticist training manipulation policies
 * in simulation, then transferring to real hardware via sim-to-real.
 */
import { describe, it, expect } from 'vitest';

function successRate(history: boolean[], windowSize: number): number {
  const window = history.slice(-windowSize);
  return window.length > 0 ? window.filter(Boolean).length / window.length : 0;
}

function sim2realGap(simReward: number, realReward: number): number {
  return Math.abs(simReward - realReward) / Math.max(Math.abs(simReward), 1);
}

function isTransferReady(
  rate: number,
  threshold: number,
  minEpisodes: number,
  episodes: number
): boolean {
  return rate >= threshold && episodes >= minEpisodes;
}

function curriculumDifficulty(level: number, maxLevel: number): number {
  return Math.min(1.0, level / maxLevel);
}

function rewardShaping(success: boolean, difficulty: number): number {
  return success ? 1.0 - difficulty * 0.3 : -0.1;
}

describe('Scenario: Robot Training — Episode Evaluation', () => {
  it('successRate() with sliding window', () => {
    const h = [true, false, true, true, true];
    expect(successRate(h, 3)).toBeCloseTo(1.0);
    expect(successRate(h, 5)).toBeCloseTo(0.8);
  });
  it('successRate() empty history = 0', () => {
    expect(successRate([], 10)).toBe(0);
  });
  it('rewardShaping() success scales with difficulty', () => {
    expect(rewardShaping(true, 0.5)).toBeCloseTo(0.85);
    expect(rewardShaping(false, 0.5)).toBe(-0.1);
  });
});

describe('Scenario: Robot Training — Sim-to-Real', () => {
  it('sim2realGap() measures relative gap', () => {
    expect(sim2realGap(1.0, 0.8)).toBeCloseTo(0.2);
    expect(sim2realGap(1.0, 1.0)).toBe(0);
  });
  it('isTransferReady() requires both rate and episodes', () => {
    expect(isTransferReady(0.9, 0.85, 20, 25)).toBe(true);
    expect(isTransferReady(0.9, 0.85, 20, 10)).toBe(false);
    expect(isTransferReady(0.7, 0.85, 20, 25)).toBe(false);
  });
  it('curriculumDifficulty() clamps at 1.0', () => {
    expect(curriculumDifficulty(5, 10)).toBe(0.5);
    expect(curriculumDifficulty(15, 10)).toBe(1.0);
  });
});
