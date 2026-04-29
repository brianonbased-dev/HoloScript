/**
 * ikSolver.ts — Inverse Kinematics Solver
 *
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver
 * for character posing and procedural animation.
 */

// Re-export THREE.js IK solver class
export { IKSolver } from './sculpt/ikSolver';

export type Vec3 = [number, number, number] | { x: number; y: number; z: number };

function toTuple(v: Vec3): [number, number, number] {
  if (Array.isArray(v)) return v;
  return [v.x, v.y, v.z];
}

function vec3Distance(a: Vec3, b: Vec3): number {
  const [ax, ay, az] = toTuple(a);
  const [bx, by, bz] = toTuple(b);
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function vec3Sub(a: Vec3, b: Vec3): [number, number, number] {
  const [ax, ay, az] = toTuple(a);
  const [bx, by, bz] = toTuple(b);
  return [ax - bx, ay - by, az - bz];
}
function vec3Add(a: Vec3, b: Vec3): [number, number, number] {
  const [ax, ay, az] = toTuple(a);
  const [bx, by, bz] = toTuple(b);
  return [ax + bx, ay + by, az + bz];
}
function vec3Scale(a: Vec3, s: number): [number, number, number] {
  const [ax, ay, az] = toTuple(a);
  return [ax * s, ay * s, az * s];
}
function vec3Length(a: Vec3): number {
  const [ax, ay, az] = toTuple(a);
  return Math.sqrt(ax * ax + ay * ay + az * az);
}
function vec3Normalize(a: Vec3): [number, number, number] {
  const len = vec3Length(a);
  if (len === 0) return [0, 0, 0];
  return vec3Scale(a, 1 / len);
}

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
  joints: [number, number, number][];
  reached: boolean;
  iterations: number;
  finalDistance: number;
}

/**
 * Solve IK using the FABRIK algorithm.
 */
export function fabrikSolve(chain: IKChain): IKResult {
  const n = chain.joints.length;
  if (n < 2) {
    return {
      joints: chain.joints.map((j) => [...toTuple(j.position)]),
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

  const positions = chain.joints.map((j) => [...toTuple(j.position)] as [number, number, number]);
  const root = [...positions[0]] as [number, number, number];

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
    positions[n - 1] = [...toTuple(chain.target)];
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
