/**
 * paper-0c Stage A — synthetic CAEL-like episodes with hash-chain verification.
 *
 * Runs a 100-step synthetic trace (a simple 2D pendulum), spike-encodes each step,
 * and builds a deterministic chain hash. Exports `runStageA()` so benchmarks can
 * invoke it programmatically; also runs on direct node invocation for smoke.
 *
 * This is the Stage A acceptance criterion from the spec:
 *   "Verify spikeChainHash on the produced training data matches the golden
 *    (spec-level check, not model-output check)."
 */

import {
  encodeStep,
  extendChain,
  toHex,
  type SpikeBatch,
  type FieldQuanta,
} from './spike-encoder';
import { decodeStep, verifyBoundedLoss } from './spike-decoder';

export interface StageAResult {
  steps: number;
  chain_hash: string;
  total_spikes: number;
  max_bounded_loss_delta: number;
  bounded_loss_violations: number;
  duration_ms: number;
}

/** 2D pendulum kinematics — deterministic given seed + step count. */
export function simulatePendulum(
  seed: number,
  num_steps: number,
  dt: number = 0.01
): Array<{ step: number; theta: number; omega: number; pos: [number, number, number] }> {
  const g = 9.81;
  const L = 1.0;
  // Seeded init: theta = seed % 2 radians, omega = 0
  let theta = (seed % 200) / 100.0; // deterministic
  let omega = 0;
  const out: Array<{ step: number; theta: number; omega: number; pos: [number, number, number] }> = [];
  for (let step = 0; step < num_steps; step++) {
    const alpha = -(g / L) * Math.sin(theta);
    omega += alpha * dt;
    theta += omega * dt;
    out.push({
      step,
      theta,
      omega,
      pos: [L * Math.sin(theta), -L * Math.cos(theta), 0],
    });
  }
  return out;
}

export function runStageA(opts?: {
  seed?: number;
  num_steps?: number;
  quanta?: FieldQuanta;
  verify_bounded_loss?: boolean;
}): StageAResult {
  const seed = opts?.seed ?? 42;
  const num_steps = opts?.num_steps ?? 100;
  const quanta: FieldQuanta = opts?.quanta ?? { theta: 0.001, omega: 0.01, pos: 0.001 };
  const verify = opts?.verify_bounded_loss ?? true;

  const t_start = Date.now();
  const trace = simulatePendulum(seed, num_steps);

  let chain = new Uint8Array(4); // zero
  let total_spikes = 0;
  let max_delta = 0;
  let violations = 0;

  const decode_opts = {
    fields: {
      theta: { type: 'float' as const, quantum: quanta.theta },
      omega: { type: 'float' as const, quantum: quanta.omega },
      pos: { type: 'vector3' as const, quantum: quanta.pos },
    },
    quanta,
  };

  for (const frame of trace) {
    const batch: SpikeBatch = encodeStep(
      {
        step: frame.step,
        floats: { theta: frame.theta, omega: frame.omega },
        vectors: { pos: frame.pos },
      },
      quanta
    );
    total_spikes += batch.spikes.length;
    chain = extendChain(chain, batch.digest) as Uint8Array<ArrayBuffer>;

    if (verify) {
      const decoded = decodeStep(frame.step, batch.spikes, decode_opts);
      const vs = verifyBoundedLoss(
        { theta: frame.theta, omega: frame.omega },
        { pos: frame.pos },
        decoded,
        decode_opts
      );
      if (vs.length > 0) violations += vs.length;
      // Track max delta observed (even within bound)
      const deltaTheta = Math.abs((decoded.floats.theta ?? 0) - frame.theta);
      const deltaOmega = Math.abs((decoded.floats.omega ?? 0) - frame.omega);
      const pos = decoded.vectors.pos ?? [0, 0, 0];
      const deltaPos = Math.max(
        Math.abs(pos[0] - frame.pos[0]),
        Math.abs(pos[1] - frame.pos[1]),
        Math.abs(pos[2] - frame.pos[2])
      );
      const delta = Math.max(deltaTheta, deltaOmega, deltaPos);
      if (delta > max_delta) max_delta = delta;
    }
  }

  return {
    steps: num_steps,
    chain_hash: toHex(chain),
    total_spikes,
    max_bounded_loss_delta: max_delta,
    bounded_loss_violations: violations,
    duration_ms: Date.now() - t_start,
  };
}

// Direct-run entry point (for smoke during development).
// Check if this is being run directly via tsx/ts-node; skipped in production builds.
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('stage-a-synthetic')) {
  const result = runStageA();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}
