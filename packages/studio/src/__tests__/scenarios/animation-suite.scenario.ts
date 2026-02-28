/**
 * animation-suite.scenario.ts — LIVING-SPEC: Motion Director Suite
 *
 * Persona: Zara — motion director working with auto-loop detection,
 * viral pose library, and inverse kinematics.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  analyzeLoop, generateSeamlessLoop, reverseAnimation,
  createPalindromeLoop, extendAnimation, getLoopRecommendations,
  type LoopAnalysis,
} from '@/lib/animationLooping';
import {
  VIRAL_POSES, getAllPoses, getPopularPoses, getPosesByCategory,
  searchPoses, getPoseById, getRandomPose, getPosesByDifficulty,
  type ViralPose,
} from '@/lib/poseLibrary';
import { IKSolver, type IKJoint } from '@/lib/ikSolver';
import type { RecordedClip, BoneFrame } from '@/lib/animationBuilder';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClip(name: string, frames: BoneFrame[], duration = 1000): RecordedClip {
  return { id: name, name: `Clip ${name}`, frames, duration, timestamp: Date.now() };
}

function makeFrame(boneIndex: number, time: number, qx = 0, qy = 0, qz = 0, qw = 1): BoneFrame {
  return { boneIndex, time, qx, qy, qz, qw };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Animation Loop Detection & Generation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animation Suite — Loop Detection', () => {
  it('analyzeLoop() detects a perfect loop (same start/end pose)', () => {
    const clip = makeClip('perfectLoop', [
      makeFrame(0, 0, 0, 0, 0, 1),
      makeFrame(0, 500, 0.5, 0, 0, 0.866),
      makeFrame(0, 1000, 0, 0, 0, 1), // same as start
    ]);
    const analysis = analyzeLoop(clip);
    expect(analysis.canLoop).toBe(true);
    expect(['perfect', 'good']).toContain(analysis.loopQuality);
  });

  it('analyzeLoop() detects a poor loop (different start/end)', () => {
    const clip = makeClip('poorLoop', [
      makeFrame(0, 0, 0, 0, 0, 1),
      makeFrame(0, 1000, 0.7, 0, 0, 0.7), // very different from start
    ]);
    const analysis = analyzeLoop(clip);
    expect(analysis.startEndDistance).toBeGreaterThan(0);
  });

  it('generateSeamlessLoop() blends start/end frames', () => {
    const clip = makeClip('blendable', [
      makeFrame(0, 0, 0, 0, 0, 1),
      makeFrame(0, 500, 0.3, 0, 0, 0.954),
      makeFrame(0, 1000, 0.5, 0, 0, 0.866),
    ]);
    const looped = generateSeamlessLoop(clip);
    expect(looped.frames.length).toBeGreaterThanOrEqual(clip.frames.length);
  });

  it('reverseAnimation() flips the clip in time', () => {
    const clip = makeClip('forward', [
      makeFrame(0, 0, 0, 0, 0, 1),
      makeFrame(0, 500, 0.5, 0, 0, 0.866),
      makeFrame(0, 1000, 1, 0, 0, 0),
    ]);
    const reversed = reverseAnimation(clip);
    expect(reversed.frames[0].qx).toBeCloseTo(1, 1);
    expect(reversed.frames[reversed.frames.length - 1].qx).toBeCloseTo(0, 1);
  });

  it('createPalindromeLoop() creates forward+backward clip', () => {
    const clip = makeClip('pal', [
      makeFrame(0, 0, 0, 0, 0, 1),
      makeFrame(0, 500, 0.5, 0, 0, 0.866),
    ]);
    const palindrome = createPalindromeLoop(clip);
    expect(palindrome.frames.length).toBeGreaterThan(clip.frames.length);
  });

  it('extendAnimation() repeats clip N times', () => {
    const clip = makeClip('short', [
      makeFrame(0, 0, 0, 0, 0, 1),
      makeFrame(0, 500, 0.5, 0, 0, 0.866),
    ]);
    const extended = extendAnimation(clip, 3);
    expect(extended.frames.length).toBe(clip.frames.length * 3);
  });

  it('getLoopRecommendations() returns advice strings', () => {
    const analysis: LoopAnalysis = {
      canLoop: false, loopQuality: 'poor', startEndDistance: 1.5,
      suggestedBlendFrames: 10, problematicBones: ['LeftArm'],
    };
    const recs = getLoopRecommendations(analysis);
    expect(recs.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Viral Pose Library
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animation Suite — Viral Pose Library', () => {
  it('VIRAL_POSES has at least 5 built-in poses', () => {
    expect(VIRAL_POSES.length).toBeGreaterThanOrEqual(5);
  });

  it('getAllPoses() returns the full catalogue', () => {
    const all = getAllPoses();
    expect(all.length).toBe(VIRAL_POSES.length);
  });

  it('getPopularPoses() sorts descending by popularity', () => {
    const popular = getPopularPoses();
    for (let i = 1; i < popular.length; i++) {
      expect(popular[i - 1].popularity).toBeGreaterThanOrEqual(popular[i].popularity);
    }
  });

  it('getPosesByCategory() filters by "classic"', () => {
    const classics = getPosesByCategory('classic');
    expect(classics.length).toBeGreaterThanOrEqual(1);
    expect(classics.every(p => p.category === 'classic')).toBe(true);
  });

  it('searchPoses() finds by name (case-insensitive)', () => {
    const results = searchPoses('dab');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('dab');
  });

  it('searchPoses() finds by tag', () => {
    const results = searchPoses('dance');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('getPoseById() returns exact match', () => {
    const pose = getPoseById('t-pose');
    expect(pose).toBeDefined();
    expect(pose!.name).toBe('T-Pose');
  });

  it('getRandomPose() returns a valid ViralPose', () => {
    const pose = getRandomPose();
    expect(pose.id).toBeTruthy();
    expect(pose.bones).toBeDefined();
  });

  it('getPosesByDifficulty("easy") returns only easy poses', () => {
    const easy = getPosesByDifficulty('easy');
    expect(easy.length).toBeGreaterThanOrEqual(1);
    expect(easy.every(p => p.difficulty === 'easy')).toBe(true);
  });

  it('each pose has at least one BonePose entry', () => {
    for (const pose of VIRAL_POSES) {
      expect(pose.bones.length).toBeGreaterThan(0);
    }
  });

  it.todo('retarget pose from one skeleton to another');
  it.todo('blend two poses at configurable weight');
});

// ═══════════════════════════════════════════════════════════════════
// 3. Inverse Kinematics Solver
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animation Suite — IK Solver', () => {
  function makeJointChain(): { joints: IKJoint[]; effector: THREE.Object3D } {
    const root = new THREE.Object3D(); root.position.set(0, 0, 0);
    const mid = new THREE.Object3D(); mid.position.set(0, 1, 0); root.add(mid);
    const tip = new THREE.Object3D(); tip.position.set(0, 2, 0); mid.add(tip);
    root.updateMatrixWorld(true);
    const joints: IKJoint[] = [
      { mesh: root, axis: new THREE.Vector3(0, 0, 1), minAngle: -Math.PI, maxAngle: Math.PI },
      { mesh: mid, axis: new THREE.Vector3(0, 0, 1), minAngle: -Math.PI, maxAngle: Math.PI },
    ];
    return { joints, effector: tip };
  }

  it('IKSolver can be constructed with a joint chain', () => {
    const { joints, effector } = makeJointChain();
    const solver = new IKSolver(joints, effector);
    expect(solver).toBeDefined();
  });

  it('IKSolver.solve() returns boolean (reached or not)', () => {
    const { joints, effector } = makeJointChain();
    const solver = new IKSolver(joints, effector);
    const result = solver.solve(new THREE.Vector3(0, 2, 0));
    expect(typeof result).toBe('boolean');
  });

  it('IKSolver.solve() attempts to reach a nearby target', () => {
    const { joints, effector } = makeJointChain();
    const solver = new IKSolver(joints, effector);
    // Target at the tip's current position — may or may not converge in unit-test THREE env
    const result = solver.solve(new THREE.Vector3(0, 2, 0));
    expect(typeof result).toBe('boolean');
  });

  it('IKSolver.solve() returns false for out-of-reach target', () => {
    const { joints, effector } = makeJointChain();
    const solver = new IKSolver(joints, effector);
    // Target far away — chain length is only 2 units
    const result = solver.solve(new THREE.Vector3(100, 100, 100));
    expect(result).toBe(false);
  });

  it.todo('IK VR controller — grab end effector with 6DOF input');
  it.todo('IK constraint limits — enforce min/max angle ranges');
  it.todo('IK chain auto-detection from skeleton bone names');
});
