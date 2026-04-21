/**
 * ikSolver.ts — Inverse Kinematics Solver
 *
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver
 * for character posing and procedural animation.
 */

// Re-export THREE.js IK solver class
export { IKSolver } from './sculpt/ikSolver';

function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function vec3Scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function vec3Length(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}
function vec3Normalize(a: Vec3): Vec3 {
  const len = vec3Length(a);
  if (len === 0) return [0, 0, 0];
  return vec3Scale(a, 1 / len);
}

/*
 */

export type Vec3 = [number, number, number];

export interface IKJoint {
  id: string;
  position: Vec3;
  constraints?: {
    minAngle: number; // degrees
    maxAngle: number;
  };
}

export interface IKChain {
  joints: IKJoint[];
  target: Vec3;
  tolerance: number;
  maxIterations: number;
}

export interface IKResult {
  joints: Vec3[];
  reached: boolean;
  iterations: number;
  finalDistance: number;
}

// Removed duplicate vec3Dist - using centralized vec3Distance

// Removed duplicate vec3Sub, vec3Scale, vec3Add, vec3Normalize - using centralized math utilities

/**
 * Solve IK using the FABRIK algorithm.
 */
export function fabrikSolve(chain: IKChain): IKResult {
  const n = chain.joints.length;
  if (n < 2) {
    return {
      joints: chain.joints.map((j) => j.position),
      reached: false,
      iterations: 0,
      finalDistance: Infinity,
    };
  }

  // Pre-compute bone lengths
  const boneLengths: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    boneLengths.push(vec3Distance(chain.joints[i].position, chain.joints[i + 1].position));
  }

  const totalLength = boneLengths.reduce((s, l) => s + l, 0);
  const targetDist = vec3Distance(chain.joints[0].position, chain.target);

  const positions = chain.joints.map((j) => [...j.position] as Vec3);
  const root = [...positions[0]] as Vec3;

  // If target is unreachable, stretch toward it
  if (targetDist > totalLength) {
    const dir = vec3Normalize(vec3Sub(chain.target, root));
    let cumDist = 0;
    for (let i = 1; i < n; i++) {
      cumDist += boneLengths[i - 1];
      positions[i] = vec3Add(root, vec3Scale(dir, cumDist));
    }
    return {
      joints: positions,
      reached: false,
      iterations: 0,
      finalDistance: targetDist - totalLength,
    };
  }

  // FABRIK iterations
  let iterations = 0;
  for (iterations = 0; iterations < chain.maxIterations; iterations++) {
    const endDist = vec3Distance(positions[n - 1], chain.target);
    if (endDist <= chain.tolerance) break;

    // Forward pass: move end effector to target
    positions[n - 1] = [...chain.target];
    for (let i = n - 2; i >= 0; i--) {
      const dir = vec3Normalize(vec3Sub(positions[i], positions[i + 1]));
      positions[i] = vec3Add(positions[i + 1], vec3Scale(dir, boneLengths[i]));
    }

    // Backward pass: fix root position
    positions[0] = [...root];
    for (let i = 1; i < n; i++) {
      const dir = vec3Normalize(vec3Sub(positions[i], positions[i - 1]));
      positions[i] = vec3Add(positions[i - 1], vec3Scale(dir, boneLengths[i - 1]));
    }
  }

  const finalDist = vec3Distance(positions[n - 1], chain.target);

  return {
    joints: positions,
    reached: finalDist <= chain.tolerance,
    iterations,
    finalDistance: finalDist,
  };
}

/**
 * Create a simple bone chain from positions.
 */
export function createChain(
  positions: Vec3[],
  target: Vec3,
  tolerance: number = 0.01,
  maxIterations: number = 10
): IKChain {
  return {
    joints: positions.map((p, i) => ({ id: `joint-${i}`, position: p })),
    target,
    tolerance,
    maxIterations,
  };
}

/**
 * Calculate total chain length from joints.
 */
export function chainLength(joints: Vec3[]): number {
  let total = 0;
  for (let i = 1; i < joints.length; i++) {
    total += vec3Distance(joints[i - 1], joints[i]);
  }
  return total;
}
