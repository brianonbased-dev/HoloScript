/**
 * sportsBiomechanics.ts — Sports Biomechanics Engine
 *
 * Motion capture analysis, joint angles, force measurement,
 * power output, fatigue modeling, and injury risk assessment.
 */

export type Vec3 = [number, number, number];

export type Joint = 'hip' | 'knee' | 'ankle' | 'shoulder' | 'elbow' | 'wrist' | 'spine';
export type MotionPhase =
  | 'preparation'
  | 'acceleration'
  | 'execution'
  | 'follow-through'
  | 'recovery';
export type Sport =
  | 'running'
  | 'swimming'
  | 'cycling'
  | 'weightlifting'
  | 'tennis'
  | 'baseball'
  | 'basketball'
  | 'soccer';

export interface JointAngle {
  joint: Joint;
  angleDeg: number;
  angularVelocityDegS: number;
  timestamp: number;
}

export interface ForceData {
  magnitude: number; // Newtons
  direction: Vec3;
  applicationPoint: Vec3;
  timestamp: number;
}

export interface AthleteProfile {
  id: string;
  name: string;
  sport: Sport;
  massKg: number;
  heightCm: number;
  maxHeartRate: number;
  vo2Max: number; // mL/kg/min
  limbLengths: Record<string, number>; // cm
}

export interface MotionFrame {
  timestamp: number;
  joints: JointAngle[];
  groundReactionForce: ForceData | null;
  centerOfMass: Vec3;
}

// ═══════════════════════════════════════════════════════════════════
// Biomechanics Calculations
// ═══════════════════════════════════════════════════════════════════

export function jointTorque(force: number, momentArm: number): number {
  return force * momentArm; // N·m
}

export function power(force: number, velocity: number): number {
  return force * velocity; // Watts
}

export function kineticEnergy(massKg: number, velocityMs: number): number {
  return 0.5 * massKg * velocityMs ** 2; // Joules
}

export function potentialEnergy(massKg: number, heightM: number): number {
  return massKg * 9.81 * heightM;
}

export function momentOfInertia(massKg: number, radiusM: number): number {
  return massKg * radiusM ** 2;
}

// ═══════════════════════════════════════════════════════════════════
// Performance Metrics
// ═══════════════════════════════════════════════════════════════════

export function strideFrequency(stepsInInterval: number, intervalSec: number): number {
  return stepsInInterval / intervalSec; // Hz
}

export function groundContactTime(forceData: ForceData[]): number {
  // Duration where GRF > threshold (50N)
  const contacts = forceData.filter((f) => f.magnitude > 50);
  if (contacts.length < 2) return 0;
  return contacts[contacts.length - 1].timestamp - contacts[0].timestamp;
}

export function peakForce(forces: ForceData[]): number {
  return Math.max(...forces.map((f) => f.magnitude));
}

export function averageForce(forces: ForceData[]): number {
  if (forces.length === 0) return 0;
  return forces.reduce((sum, f) => sum + f.magnitude, 0) / forces.length;
}

export function loadRate(peakForceN: number, timeToReachSec: number): number {
  if (timeToReachSec <= 0) return 0;
  return peakForceN / timeToReachSec; // N/s (loading rate)
}

// ═══════════════════════════════════════════════════════════════════
// Fatigue & Injury Risk
// ═══════════════════════════════════════════════════════════════════

export function fatigueIndex(peakPower: number, endPower: number): number {
  // (peak - end) / peak × 100 — higher = more fatigued
  if (peakPower <= 0) return 0;
  return ((peakPower - endPower) / peakPower) * 100;
}

export function injuryRiskScore(
  loadingRateNs: number,
  jointAsymmetry: number, // % difference between sides
  trainingLoadRatio: number // acute:chronic workload ratio
): number {
  let risk = 0;
  if (loadingRateNs > 80) risk += 30;
  else if (loadingRateNs > 50) risk += 15;
  if (jointAsymmetry > 15) risk += 30;
  else if (jointAsymmetry > 10) risk += 15;
  if (trainingLoadRatio > 1.5) risk += 40;
  else if (trainingLoadRatio > 1.2) risk += 20;
  return Math.min(100, risk);
}

export function vo2AtIntensity(vo2Max: number, intensityPercent: number): number {
  return vo2Max * (intensityPercent / 100);
}

export function caloriesBurned(vo2Ml: number, durationMin: number, _massKg: number): number {
  // kcal ≈ VO₂ (L/min) × 5.0 × duration
  return (vo2Ml / 1000) * 5.0 * durationMin;
}

// ═══════════════════════════════════════════════════════════════════
// Gait Analysis
// ═══════════════════════════════════════════════════════════════════

export interface GaitMetrics {
  symmetryIndex: number; // 0-100% (100 = perfect symmetry)
  cadenceStepsPerMin: number;
  strideLengthM: number;
  supinationAngleDeg: number; // 0 neutral, + supination, - pronation
  contactTimeAsymmetry: number; // % difference between left/right
}

/**
 * Gait symmetry analysis — compares left/right step characteristics.
 * Robinson Symmetry Index: SI = 100 × (1 - |L-R| / max(L,R))
 */
export function gaitSymmetryIndex(
  leftContactTimeMs: number,
  rightContactTimeMs: number,
  leftStrideLengthM: number,
  rightStrideLengthM: number,
  stepsPerMin: number,
  footAngleDeg: number = 0
): GaitMetrics {
  const maxContact = Math.max(leftContactTimeMs, rightContactTimeMs);
  const contactSymmetry =
    maxContact > 0
      ? 100 * (1 - Math.abs(leftContactTimeMs - rightContactTimeMs) / maxContact)
      : 100;

  const maxStride = Math.max(leftStrideLengthM, rightStrideLengthM);
  const strideSymmetry =
    maxStride > 0 ? 100 * (1 - Math.abs(leftStrideLengthM - rightStrideLengthM) / maxStride) : 100;

  const symmetryIndex = (contactSymmetry + strideSymmetry) / 2;
  const avgStride = (leftStrideLengthM + rightStrideLengthM) / 2;
  const contactAsymmetry =
    maxContact > 0 ? (Math.abs(leftContactTimeMs - rightContactTimeMs) / maxContact) * 100 : 0;

  return {
    symmetryIndex: Math.round(symmetryIndex * 10) / 10,
    cadenceStepsPerMin: stepsPerMin,
    strideLengthM: Math.round(avgStride * 100) / 100,
    supinationAngleDeg: footAngleDeg,
    contactTimeAsymmetry: Math.round(contactAsymmetry * 10) / 10,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Motion Capture Replay
// ═══════════════════════════════════════════════════════════════════

export interface MocapReplayFrame {
  timestamp: number;
  joints: { joint: Joint; position: Vec3; angleDeg: number }[];
  annotations: string[];
}

/**
 * Generate a motion capture replay sequence from raw frames.
 * Returns annotated frames with joint positions and angle labels.
 */
export function motionCaptureReplay(
  frames: MotionFrame[],
  annotationThresholdDeg: number = 120
): MocapReplayFrame[] {
  return frames.map((f) => ({
    timestamp: f.timestamp,
    joints: f.joints.map((j) => ({
      joint: j.joint,
      position: [0, 0, 0], // Would come from IK solver in real impl
      angleDeg: j.angleDeg,
    })),
    annotations: f.joints
      .filter((j) => Math.abs(j.angleDeg) > annotationThresholdDeg)
      .map((j) => `⚠ ${j.joint}: ${j.angleDeg.toFixed(0)}° (extreme)`),
  }));
}
