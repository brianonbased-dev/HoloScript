#!/usr/bin/env tsx
/**
 * B1 (build-time half) — bake the lotus seed-pod morphogen with the ENGINE
 * ReactionDiffusionSolver under SimulationContract, emitting a replayable receipt.
 *
 * Plan §0.6 B1 + line 96 strategy: the seed pod's Turing field is solved at BUILD
 * TIME by the real engine solver (not the in-render core toy), baked to an artifact
 * with a cael receipt, and the renderer later replays the baked field as the
 * receipt-bearing AUTHORITY (the live core createLotusMorphogen2D path in
 * LotusProgram.tsx stays as the labeled low-res fallback). This script is the
 * build-time authority half; the render-CONSUMPTION half is coordination-gated
 * (the lotus render is an active peer domain — F.105, board task_1780461900674_yfzm).
 *
 * Schnakenberg activator-inhibitor kinetics expressed as engine Arrhenius
 * mass-action (the plan's "express Schnakenberg as mass-action"):
 *   du/dt = γ(a − u + u²v)   dv/dt = γ(b − u²v)
 *   R1 ∅→u   rate γa      (orders {})        constant activator feed
 *   R2 u→∅   rate γu      (orders {u:1})     activator decay
 *   R3 2u+v→3u rate γu²v  (orders {u:2,v:1}) autocatalysis: +u, −v
 *   R4 ∅→v   rate γb      (orders {})        constant inhibitor feed
 * Activator u diffuses slowly, inhibitor v fast (d = Dv/Du ≫ 1) → Turing spots
 * = the seed-pod carpel sites. A deterministic perturbation seeds symmetry-breaking
 * (the engine RD config only fills uniformly; we perturb the mutable activator grid).
 *
 * Run:  pnpm --filter @holoscript/net-service exec tsx scripts/bake-lotus-seedpod.mts
 * Determinism + receipt are the guaranteed deliverable (verified by double-run +
 * replayFromProvenance). Pattern quality (spot count) is reported, tunable via γ/d.
 *
 * @cites I.007, plan §0.6 B1 + line 96, SimulationContract (cael.v1), F.099, F.105
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  ReactionDiffusionSolver,
  type ReactionDiffusionConfig,
} from '../../../packages/engine/src/simulation/ReactionDiffusionSolver';
import { ReactionDiffusionSolverAdapter } from '../../../packages/engine/src/simulation/adapters/SolverAdapters';
import { ContractedSimulation } from '../../../packages/engine/src/simulation/SimulationContract';

// ── Schnakenberg parameters (classic Turing-unstable regime) ─────────────────
const N = 48;            // grid resolution (N×N×1); dx = 1/N ≈ 0.0208
const A = 0.1, B = 0.9;  // feed constants → steady state u*=A+B, v*=B/(A+B)²
const GAMMA = 40;        // reaction scaling — controls spot count/wavelength
const DU = 5.0e-3;       // activator diffusivity (slow)
const DV = 0.2;          // inhibitor diffusivity (fast); d = DV/DU = 40
// Turing wavelength √(Dv/γ) ≈ 0.071 ≈ 3.4·dx → grid-resolvable (the prior γ=600
// run's wavelength was sub-cell, so diffusion was negligible and no pattern formed).
const FIXED_DT = 2.0e-4; // CFL-safe: dt < dx²/(4·Dv) ≈ 5.4e-4
const STEPS = 3000;      // ~0.6 s ≈ 24 reaction times — enough to settle the pattern
const SEED = 1234567;    // deterministic perturbation seed (no RNG → bit-identical)
const OUT_PATH = process.env.B1_BAKE_OUT
  ?? join(process.env.TMPDIR ?? process.env.TEMP ?? '/tmp', 'lotus-seedpod.baked.json');

const U_STAR = A + B;            // 1.0
const V_STAR = B / ((A + B) ** 2); // 0.9

function makeConfig(): ReactionDiffusionConfig {
  return {
    gridResolution: [N, N, 1],
    domainSize: [1.0, 1.0, 1.0 / N],
    species: [
      { name: 'u', diffusivity: DU, initialConcentration: U_STAR },
      { name: 'v', diffusivity: DV, initialConcentration: V_STAR },
    ],
    reactions: [
      { label: 'feed u (γa)', stoichiometry: { u: 1 }, preExponential: GAMMA * A, activationEnergy: 0, orders: {}, enthalpy: 0 },
      { label: 'decay u (γu)', stoichiometry: { u: -1 }, preExponential: GAMMA, activationEnergy: 0, orders: { u: 1 }, enthalpy: 0 },
      { label: 'autocat 2u+v→3u (γu²v)', stoichiometry: { u: 1, v: -1 }, preExponential: GAMMA, activationEnergy: 0, orders: { u: 2, v: 1 }, enthalpy: 0 },
      { label: 'feed v (γb)', stoichiometry: { v: 1 }, preExponential: GAMMA * B, activationEnergy: 0, orders: {}, enthalpy: 0 },
    ],
    referenceTemperature: 298.15,
    maxSubsteps: 2000,
  };
}

/** Deterministic ±amplitude perturbation of the activator grid (symmetry break). */
function seedPerturbation(solver: ReactionDiffusionSolver): void {
  const grid = solver.getConcentrationGrid(0); // mutable internal activator grid
  let h = SEED >>> 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      // xorshift-ish deterministic hash → [-1,1)
      h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
      const r = (h / 0xffffffff) * 2 - 1;
      grid.set(i, j, 0, U_STAR * (1 + 0.05 * r));
    }
  }
}

function buildContract(): ContractedSimulation {
  const solver = new ReactionDiffusionSolver(makeConfig());
  seedPerturbation(solver);
  const adapter = new ReactionDiffusionSolverAdapter(solver);
  return new ContractedSimulation(adapter, makeConfig() as unknown as Record<string, unknown>, {
    solverType: 'reaction-diffusion',
    scale: 'continuum',
    fixedDt: FIXED_DT,
    useCryptographicHash: true,
    enforceMeshSanity: false,
    enforceUnits: false,
  });
}

function run(c: ContractedSimulation): string[] {
  for (let i = 0; i < STEPS; i++) c.step(FIXED_DT);
  return c.getStateDigests();
}

/** Count interior local maxima of u above (mean + std) — the seed-pod spots. */
function analyzeField(u: Float32Array): { spots: number; min: number; max: number; mean: number; std: number } {
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of u) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  const mean = sum / u.length;
  let varAcc = 0; for (const v of u) varAcc += (v - mean) ** 2;
  const std = Math.sqrt(varAcc / u.length);
  const at = (i: number, j: number) => u[j * N + i];
  const thresh = mean + std;
  let spots = 0;
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const c = at(i, j);
      if (c <= thresh) continue;
      if (c >= at(i - 1, j) && c >= at(i + 1, j) && c >= at(i, j - 1) && c >= at(i, j + 1) &&
          c >= at(i - 1, j - 1) && c >= at(i + 1, j - 1) && c >= at(i - 1, j + 1) && c >= at(i + 1, j + 1)) {
        spots++;
      }
    }
  }
  return { spots, min, max, mean, std };
}

async function main(): Promise<void> {
  console.log(`B1 BAKE — engine ReactionDiffusion lotus seed-pod (Schnakenberg mass-action)`);
  console.log(`  ${N}×${N}, γ=${GAMMA}, d=Dv/Du=${(DV / DU).toFixed(0)}, ${STEPS} steps @ dt=${FIXED_DT}\n`);

  const c1 = buildContract();
  const d1 = run(c1);
  // Re-derive the final field from a fresh deterministic run for analysis/bake
  // (same seed + config + steps → identical to c1's internal state).
  const solverField = new ReactionDiffusionSolver(makeConfig());
  seedPerturbation(solverField);
  for (let i = 0; i < STEPS; i++) solverField.step(FIXED_DT);
  const u = solverField.getConcentrationField(0);
  const stats = analyzeField(u);

  // Determinism: independent cold re-run + contract replay must match.
  const c2 = buildContract();
  const d2 = run(c2);
  const replayed = ContractedSimulation.replayFromProvenance(
    () => { const s = new ReactionDiffusionSolver(makeConfig()); seedPerturbation(s); return new ReactionDiffusionSolverAdapter(s); },
    c1.createReplay(),
  );
  const d3 = run(replayed);
  const eq = (a: string[], b: string[]) => a.length === b.length && a.length > 0 && a.every((x, i) => x === b[i]);
  const reRun = eq(d1, d2);
  const replay = eq(d1, d3);

  const chainHash = createHash('sha256').update(d1.join('|')).digest('hex');
  const artifact = {
    proof: 'B1 build-time bake — engine ReactionDiffusion lotus seed-pod',
    kinetics: 'Schnakenberg as Arrhenius mass-action (u²v autocatalysis via orders{u:2,v:1})',
    grid: [N, N, 1], gamma: GAMMA, d_ratio: DV / DU, steps: STEPS, fixedDt: FIXED_DT, seed: SEED,
    geometryHash: c1.createReplay().geometryHash,
    contractId: c1.createReplay().contractId,
    digestChainHash: chainHash,
    field: { spots: stats.spots, min: stats.min, max: stats.max, mean: stats.mean, std: stats.std },
    reRunBitIdentical: reRun,
    replayBitIdentical: replay,
    // Baked activator field (the seed-pod morphogen the renderer would replay).
    activator: Array.from(u, (x) => Math.round(x * 1e4) / 1e4),
  };
  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2));

  console.log(`  field: spots=${stats.spots} range=[${stats.min.toFixed(3)}, ${stats.max.toFixed(3)}] mean=${stats.mean.toFixed(3)} std=${stats.std.toFixed(4)}`);
  console.log(`  digestChainHash: ${chainHash} (sha256)`);
  console.log(`  baked → ${OUT_PATH}\n`);
  console.log(`  [${reRun ? 'PASS' : 'FAIL'}] independent cold re-run bit-identical`);
  console.log(`  [${replay ? 'PASS' : 'FAIL'}] replayFromProvenance bit-identical`);
  // Honest pattern test: a real Turing pattern has O(10%) relative amplitude,
  // NOT sub-percent residual noise. (kinetics are analytically supercritical —
  // d_c≈8.57 for a=0.1,b=0.9, d=40 ≫ that — so a non-pattern means the unstable
  // mode is unresolved/unsaturated at this γ/grid/time, a tuning matter.)
  const relAmp = (stats.max - stats.min) / Math.max(stats.mean, 1e-9);
  const patterned = stats.spots >= 5 && stats.spots <= N * 2 && relAmp > 0.1;
  console.log(`  relAmp=${(relAmp * 100).toFixed(2)}%  ` +
    `[${patterned ? 'PASS' : 'INFO'}] saturated Turing pattern (spots 5..${N * 2} & relAmp>10%)` +
    (patterned ? '' : ' — under-saturated; tune γ/grid/steps so a resolvable unstable mode saturates'));

  if (!reRun || !replay) {
    console.error('\n✗ B1 bake NOT deterministic — engine seed-pod run is not bit-identically reproducible.');
    process.exit(1);
  }
  // Determinism + receipt is the guaranteed B1 build-time deliverable; pattern
  // saturation is a bounded tuning follow-on (coordinate target look w/ render peer).
  console.log(`\n✓ B1 seam — engine seed-pod solved deterministically with a replayable receipt.` +
    (patterned ? ' Saturated Turing spots present.' : ' Pattern under-saturated (tuning follow-on).'));
}

main().catch((err) => { console.error('✗ B1 bake threw:', err); process.exit(1); });
