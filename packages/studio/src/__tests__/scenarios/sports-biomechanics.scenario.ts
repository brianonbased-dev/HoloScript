/**
 * sports-biomechanics.scenario.ts — LIVING-SPEC: Sports Biomechanics Lab
 *
 * Persona: Coach Martinez — biomechanist who analyzes athlete motion,
 * measures forces, tracks fatigue, and assesses injury risk.
 */

import { describe, it, expect } from 'vitest';
import {
  jointTorque, power, kineticEnergy, potentialEnergy,
  momentOfInertia, strideFrequency, groundContactTime,
  peakForce, averageForce, loadRate,
  fatigueIndex, injuryRiskScore, vo2AtIntensity, caloriesBurned,
  gaitSymmetryIndex, motionCaptureReplay,
  type ForceData, type MotionFrame,
} from '@/lib/sportsBiomechanics';

describe('Scenario: Biomechanics — Physics', () => {
  it('jointTorque = force × moment arm', () => {
    expect(jointTorque(500, 0.3)).toBe(150);
  });

  it('power = force × velocity', () => {
    expect(power(1000, 2)).toBe(2000);
  });

  it('kineticEnergy = ½mv²', () => {
    expect(kineticEnergy(70, 10)).toBe(3500);
  });

  it('potentialEnergy = mgh', () => {
    expect(potentialEnergy(70, 1)).toBeCloseTo(686.7, 0);
  });

  it('momentOfInertia = mr²', () => {
    expect(momentOfInertia(5, 0.4)).toBeCloseTo(0.8, 2);
  });
});

describe('Scenario: Biomechanics — Performance', () => {
  it('strideFrequency: 180 steps in 60 sec = 3 Hz', () => {
    expect(strideFrequency(180, 60)).toBe(3);
  });

  const forces: ForceData[] = [
    { magnitude: 100, direction: { x: 0, y: 1, z: 0 }, applicationPoint: { x: 0, y: 0, z: 0 }, timestamp: 0 },
    { magnitude: 800, direction: { x: 0, y: 1, z: 0 }, applicationPoint: { x: 0, y: 0, z: 0 }, timestamp: 50 },
    { magnitude: 1200, direction: { x: 0, y: 1, z: 0 }, applicationPoint: { x: 0, y: 0, z: 0 }, timestamp: 100 },
    { magnitude: 600, direction: { x: 0, y: 1, z: 0 }, applicationPoint: { x: 0, y: 0, z: 0 }, timestamp: 150 },
    { magnitude: 30, direction: { x: 0, y: 1, z: 0 }, applicationPoint: { x: 0, y: 0, z: 0 }, timestamp: 200 },
  ];

  it('peakForce = 1200 N', () => {
    expect(peakForce(forces)).toBe(1200);
  });

  it('averageForce across all readings', () => {
    expect(averageForce(forces)).toBeCloseTo(546, 0);
  });

  it('groundContactTime = time span of >50N readings', () => {
    expect(groundContactTime(forces)).toBe(150); // 100→150→200→... wait, 100-800-1200-600 all >50
  });

  it('loadRate = peak / time', () => {
    expect(loadRate(1200, 0.1)).toBe(12000);
  });
});

describe('Scenario: Biomechanics — Fatigue & Injury', () => {
  it('fatigueIndex: 1000W peak, 600W end = 40%', () => {
    expect(fatigueIndex(1000, 600)).toBe(40);
  });

  it('fatigueIndex: 0 peak = 0', () => {
    expect(fatigueIndex(0, 100)).toBe(0);
  });

  it('injuryRiskScore: high loading + asymmetry + overtraining = 100', () => {
    expect(injuryRiskScore(100, 20, 1.8)).toBe(100);
  });

  it('injuryRiskScore: low risk = 0', () => {
    expect(injuryRiskScore(30, 5, 0.9)).toBe(0);
  });

  it('vo2AtIntensity: 60 mL/kg at 80% = 48', () => {
    expect(vo2AtIntensity(60, 80)).toBe(48);
  });

  it('caloriesBurned: 40 mL/min, 30 min, 70kg', () => {
    const cal = caloriesBurned(40, 30, 70);
    expect(cal).toBeCloseTo(6.0, 0);
  });

  it('motion capture replay — 3D skeleton playback with joint annotation', () => {
    const frames: MotionFrame[] = [
      { timestamp: 0, joints: [ { joint: 'knee', angleDeg: 90, angularVelocityDegS: 10, timestamp: 0 }, { joint: 'hip', angleDeg: 130, angularVelocityDegS: 5, timestamp: 0 } ], groundReactionForce: null, centerOfMass: { x: 0, y: 1, z: 0 } },
      { timestamp: 100, joints: [ { joint: 'knee', angleDeg: 45, angularVelocityDegS: -20, timestamp: 100 }, { joint: 'hip', angleDeg: 160, angularVelocityDegS: 8, timestamp: 100 } ], groundReactionForce: null, centerOfMass: { x: 0.5, y: 0.9, z: 0 } },
    ];
    const replay = motionCaptureReplay(frames, 120);
    expect(replay).toHaveLength(2);
    // Frame 0: hip at 130° > threshold, should annotate
    expect(replay[0].annotations.length).toBe(1);
    expect(replay[0].annotations[0]).toContain('hip');
    // Frame 1: hip at 160° > threshold
    expect(replay[1].annotations.length).toBe(1);
    expect(replay[1].annotations[0]).toContain('hip');
  });

  it('gait analysis — step symmetry and pronation tracking', () => {
    // Symmetric gait (equal left/right)
    const symmetric = gaitSymmetryIndex(250, 250, 1.2, 1.2, 170);
    expect(symmetric.symmetryIndex).toBe(100);
    expect(symmetric.contactTimeAsymmetry).toBe(0);
    expect(symmetric.cadenceStepsPerMin).toBe(170);

    // Asymmetric gait (limping)
    const asymmetric = gaitSymmetryIndex(200, 280, 0.9, 1.3, 140, -5);
    expect(asymmetric.symmetryIndex).toBeLessThan(85);
    expect(asymmetric.contactTimeAsymmetry).toBeGreaterThan(10);
    expect(asymmetric.supinationAngleDeg).toBe(-5); // pronation
  });
});
