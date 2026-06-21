#!/usr/bin/env tsx
/**
 * holoscript.net — Lotus Scene Compiler (native-surface dogfood)
 *
 * Compiles the papers-program "proof flower" from its HoloScript composition
 * (examples/lotus-flower/garden.seedable.holo) into a deterministic render
 * scene. The lotus is AUTHORED in HoloScript and COMPILED to R3F — it is not
 * hand-authored in the renderer (F.099; the flower is the I.007 genesis proof,
 * so it must itself be compiled HoloScript). This mirrors the Studio view
 * registry's generated-as-source doctrine (compile-view-registry.ts).
 *
 *   .holo  ──parseHolo──▶ objects ──buildLotusSceneFromComposition──▶ LotusScene
 *                                          (+ botanical_lotus render profile)
 *                          +
 *   engine  ──ReactionDiffusionSolver──▶ SimulationContract ──▶ LotusEngineReceipt
 *            (B1 build-time bake — Schnakenberg seed-pod morphogen, plan §0.6 B1)
 *
 * The renderer imports LOTUS_SCENE from the generated module; it owns NONE of the
 * flower's structure, placement, palette, or bloom state. The embedded engineReceipt
 * carries the baked activator field + CAEL replay fingerprint for receipt-bearing
 * carpel placement; renderers that don't consume it fall back to seed_pod_dot_pattern.
 *
 * Usage: pnpm lotus:build   |   pnpm lotus:check  (--strict, CI drift gate)
 *
 * @cites I.007, F.014, F.099, plan §0.6 B0+B1, SimulationContract (cael.v1)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { parseHolo } from '../../../packages/core/src/parser/HoloCompositionParser';
import {
  buildLotusSceneFromComposition,
  createBotanicalLotusRenderProfile,
  type LotusEngineReceipt,
} from '../../../packages/core/src/traits/BotanicalLotusTrait';
import {
  ReactionDiffusionSolver,
  type ReactionDiffusionConfig,
} from '../../../packages/engine/src/simulation/ReactionDiffusionSolver';
import { ReactionDiffusionSolverAdapter } from '../../../packages/engine/src/simulation/adapters/SolverAdapters';
import { ContractedSimulation } from '../../../packages/engine/src/simulation/SimulationContract';

const SCRIPT_DIR = import.meta.dirname || __dirname;
const SERVICE_ROOT = join(SCRIPT_DIR, '..');
const HOLO_SRC = join(SERVICE_ROOT, '..', '..', 'examples', 'lotus-flower', 'garden.seedable.holo');
const OUT_PATH = join(SERVICE_ROOT, 'src', 'components', 'lotus.scene.generated.ts');
const STRICT = process.argv.includes('--strict') || process.env.HOLO_STRICT === '1';

const EXPECTED_PETALS = 42; // 8 + 13 + 21 Fibonacci rings

// ── B1 Schnakenberg parameters (tuned for lotus-realistic ~14 carpels) ─────
// Matches bake-lotus-seedpod.mts exactly — same config → same deterministic receipt.
const N = 48;
const A = 0.1, B_CONST = 0.9;
const GAMMA = 15;
const DU = 5.0e-3;
const DV = 0.2;
const FIXED_DT = 2.0e-4;
const STEPS = 3000;
const BAKE_SEED = 1234567;

function makeSeedPodConfig(): ReactionDiffusionConfig {
  return {
    gridResolution: [N, N, 1],
    domainSize: [1.0, 1.0, 1.0 / N],
    species: [
      { name: 'u', diffusivity: DU, initialConcentration: A + B_CONST },
      { name: 'v', diffusivity: DV, initialConcentration: B_CONST / ((A + B_CONST) ** 2) },
    ],
    reactions: [
      { label: 'feed u (γa)', stoichiometry: { u: 1 }, preExponential: GAMMA * A, activationEnergy: 0, orders: {}, enthalpy: 0 },
      { label: 'decay u (γu)', stoichiometry: { u: -1 }, preExponential: GAMMA, activationEnergy: 0, orders: { u: 1 }, enthalpy: 0 },
      { label: 'autocat 2u+v→3u (γu²v)', stoichiometry: { u: 1, v: -1 }, preExponential: GAMMA, activationEnergy: 0, orders: { u: 2, v: 1 }, enthalpy: 0 },
      { label: 'feed v (γb)', stoichiometry: { v: 1 }, preExponential: GAMMA * B_CONST, activationEnergy: 0, orders: {}, enthalpy: 0 },
    ],
    referenceTemperature: 298.15,
    maxSubsteps: 2000,
  };
}

/** Deterministic ±5% perturbation of the activator grid (symmetry break, no RNG). */
function seedPerturbation(solver: ReactionDiffusionSolver): void {
  const grid = solver.getConcentrationGrid(0);
  const uStar = A + B_CONST;
  let h = BAKE_SEED >>> 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
      const r = (h / 0xffffffff) * 2 - 1;
      grid.set(i, j, 0, uStar * (1 + 0.05 * r));
    }
  }
}

function buildSeedPodContract(): ContractedSimulation {
  const solver = new ReactionDiffusionSolver(makeSeedPodConfig());
  seedPerturbation(solver);
  const adapter = new ReactionDiffusionSolverAdapter(solver);
  return new ContractedSimulation(adapter, makeSeedPodConfig() as unknown as Record<string, unknown>, {
    solverType: 'reaction-diffusion',
    scale: 'continuum',
    fixedDt: FIXED_DT,
    useCryptographicHash: true,
    enforceMeshSanity: false,
    enforceUnits: false,
  });
}

/** Count interior activator peaks above (mean + std) — the seed-pod carpel sites. */
function analyzeActivatorField(u: Float32Array): { spots: number; min: number; max: number; mean: number; std: number } {
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

/**
 * Run the B1 engine bake: Schnakenberg ReactionDiffusion under SimulationContract.
 * Returns a LotusEngineReceipt with the baked activator field + CAEL provenance.
 * Exits non-zero if determinism gate fails (two independent cold runs must match).
 */
function bakeEngineReceipt(): LotusEngineReceipt {
  console.log(`  B1 engine bake — Schnakenberg ${N}×${N}, γ=${GAMMA}, d=${(DV / DU).toFixed(0)}, ${STEPS} steps`);

  // Run 1 — primary contracted simulation (captures per-step digests)
  const c1 = buildSeedPodContract();
  for (let i = 0; i < STEPS; i++) c1.step(FIXED_DT);
  const d1 = c1.getStateDigests();

  // Run 2 — independent cold re-run for determinism verification
  const c2 = buildSeedPodContract();
  for (let i = 0; i < STEPS; i++) c2.step(FIXED_DT);
  const d2 = c2.getStateDigests();

  // Run 3 — replayFromProvenance (CAEL receipt gate)
  const replayed = ContractedSimulation.replayFromProvenance(
    () => { const s = new ReactionDiffusionSolver(makeSeedPodConfig()); seedPerturbation(s); return new ReactionDiffusionSolverAdapter(s); },
    c1.createReplay(),
  );
  for (let i = 0; i < STEPS; i++) replayed.step(FIXED_DT);
  const d3 = replayed.getStateDigests();

  const eq = (a: string[], b: string[]) => a.length === b.length && a.length > 0 && a.every((x, i) => x === b[i]);
  const reRunBitIdentical = eq(d1, d2);
  const replayBitIdentical = eq(d1, d3);

  if (!reRunBitIdentical || !replayBitIdentical) {
    throw new Error(
      `B1 bake NOT deterministic — reRun=${reRunBitIdentical} replay=${replayBitIdentical}. ` +
      `Seed-pod receipt cannot be embedded until the engine solver is bit-identical.`
    );
  }

  // Derive the activator field from a fresh solve (same config+seed → identical)
  const solverField = new ReactionDiffusionSolver(makeSeedPodConfig());
  seedPerturbation(solverField);
  for (let i = 0; i < STEPS; i++) solverField.step(FIXED_DT);
  const u = solverField.getConcentrationField(0);
  const fieldStats = analyzeActivatorField(u);

  const chainHash = createHash('sha256').update(d1.join('|')).digest('hex');
  const replay = c1.createReplay();

  const relAmp = (fieldStats.max - fieldStats.min) / Math.max(fieldStats.mean, 1e-9);
  const patterned = fieldStats.spots >= 5 && fieldStats.spots <= N * 2 && relAmp > 0.1;
  console.log(`    field: spots=${fieldStats.spots} relAmp=${(relAmp * 100).toFixed(1)}% ` +
    `[${reRunBitIdentical ? 'PASS' : 'FAIL'}] re-run [${replayBitIdentical ? 'PASS' : 'FAIL'}] replay ` +
    `[${patterned ? 'PASS' : 'INFO'}] pattern`);
  console.log(`    digestChainHash: ${chainHash}`);

  return {
    proof: 'B1 build-time bake — engine ReactionDiffusion lotus seed-pod',
    kinetics: 'Schnakenberg as Arrhenius mass-action (u²v autocatalysis via orders{u:2,v:1})',
    grid: [N, N, 1],
    gamma: GAMMA,
    d_ratio: DV / DU,
    steps: STEPS,
    fixedDt: FIXED_DT,
    seed: BAKE_SEED,
    geometryHash: replay.geometryHash,
    contractId: replay.contractId,
    digestChainHash: chainHash,
    field: fieldStats,
    reRunBitIdentical,
    replayBitIdentical,
    activator: Array.from(u, (x) => Math.round(x * 1e4) / 1e4),
  };
}

function render(): { out: string; petalCount: number } {
  const src = readFileSync(HOLO_SRC, 'utf-8');
  const parsed = parseHolo(src);
  if (!parsed.success || !parsed.ast) {
    throw new Error(
      `garden.seedable.holo did not parse: ${JSON.stringify(parsed.errors?.[0] ?? 'unknown')}`
    );
  }
  const objects = (parsed.ast as { objects?: unknown[] }).objects ?? [];
  const scene = buildLotusSceneFromComposition(
    objects as Parameters<typeof buildLotusSceneFromComposition>[0],
    createBotanicalLotusRenderProfile()
  );
  if (scene.petals.length !== EXPECTED_PETALS) {
    throw new Error(
      `expected ${EXPECTED_PETALS} petals from the composition, compiled ${scene.petals.length}`
    );
  }

  // B1: run the engine bake and embed the receipt into the scene.
  // The bake is deterministic (verified inside bakeEngineReceipt); any non-determinism
  // is a hard failure. Renderers that can't use the engineReceipt fall back to
  // seed_pod_dot_pattern (the existing low-res labeled fallback).
  const engineReceipt = bakeEngineReceipt();
  const sceneWithReceipt = { ...scene, engineReceipt };

  const out =
    '// @generated by scripts/compile-lotus-scene.mts from ' +
    'examples/lotus-flower/garden.seedable.holo — DO NOT EDIT.\n' +
    '// Edit the .holo composition (or the botanical_lotus trait) and run `pnpm lotus:build`.\n' +
    '// The lotus is compiled HoloScript: structure + per-paper bloom from the .holo,\n' +
    '// geometry + pink palette + PBR from the @holoscript/core botanical_lotus trait.\n' +
    '// engineReceipt: B1 engine ReactionDiffusion bake (Schnakenberg Turing spots = carpels).\n' +
    "import type { LotusScene } from '@holoscript/core/traits/botanical-lotus';\n\n" +
    `export const LOTUS_SCENE: LotusScene = ${JSON.stringify(sceneWithReceipt, null, 2)};\n`;
  return { out, petalCount: scene.petals.length };
}

function main(): void {
  const { out, petalCount } = render();

  if (STRICT) {
    // Drift gate: the committed generated scene must match a fresh compile.
    // NOTE: the engineReceipt activator field is deterministic — same config+seed
    // always produces the same baked field — so a fresh compile is always comparable.
    if (!existsSync(OUT_PATH)) {
      throw new Error(`lotus:check (strict): ${OUT_PATH} missing — run pnpm lotus:build`);
    }
    const current = readFileSync(OUT_PATH, 'utf-8');
    if (current.trim() !== out.trim()) {
      throw new Error(
        'lotus:check (strict): generated lotus scene is STALE.\n' +
          'The .holo composition, botanical_lotus trait, or B1 bake parameters changed without regenerating.\n' +
          'Run `pnpm lotus:build` and commit src/components/lotus.scene.generated.ts.'
      );
    }
    console.log(`✓ lotus scene up to date (${EXPECTED_PETALS} petals, B1 receipt present) — no drift`);
    return;
  }

  writeFileSync(OUT_PATH, out);
  console.log(`✓ compiled garden.seedable.holo → ${OUT_PATH} (${petalCount} petals, B1 engine receipt embedded)`);
}

main();
