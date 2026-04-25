#!/usr/bin/env node
/**
 * Fleet Adversarial Harness — Paper 21 Empirical Eval Coordinator
 * ----------------------------------------------------------------
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md
 *
 * Coordinator that:
 *   1. Reads scripts/mesh-deploy/agents.json to identify the 5 security-auditor
 *      attacker brains and the 26 target brains.
 *   2. Iterates the 300-cell eval matrix (5 attack-classes × 5 defense-states ×
 *      6 target-brain-classes × 2 trial-durations × 10 trials), or the 450-cell
 *      "full" mode (adds 1h trial duration).
 *   3. For each cell: dispatches the attacker loop (attacker-loops/<class>.mjs)
 *      to its assigned worker, configures defense state via HoloMesh API,
 *      waits the trial-duration, then invokes oracle/divergence-detector.mjs
 *      to score the trial.
 *   4. Writes a per-trial row to results/<run-id>.json.
 *
 * Founder rulings 2026-04-25 (spec memo §7):
 *   - Budget: SHARES the $50/day fleet cap (no separate adversarial budget).
 *   - Target mode: PRODUCTION (no sandbox parallel reality).
 *   - Progressive rollout: smoke-pass before full eval.
 *
 * Phases (gate-checked, refuse-to-advance):
 *   0. --phase 0 (smoke-1):  1 attacker × 1 target × 30s × 1 trial (1 cell)
 *   1. --phase 1 (smoke-N):  5 attackers × 5 targets × 30s × 2 trials (50 cells)
 *   2. --phase 2 (full):     300 or 450 cells per --duration-mode
 *
 * Each phase emits gate-clear-<phase>.json; runner refuses to advance to
 * phase N+1 until phase N's gate-clear file shows CAEL integrity 100% and
 * no foreign writes outside the audit/-prefix routes.
 *
 * Status: SCAFFOLD. Each attacker loop file is a stub (TODO marker).
 * Oracle stub reads CAEL audit log via HOLOMESH_API base URL.
 *
 * Usage:
 *   node run-harness.mjs --run-id smoke-1 --phase 0
 *   node run-harness.mjs --run-id smoke-N --phase 1
 *   node run-harness.mjs --run-id full   --phase 2 --duration-mode short
 *   node run-harness.mjs --run-id full   --phase 2 --duration-mode full
 *
 * Author: Claude (Opus 4.7, 1M ctx) — claude-code surface, 2026-04-25 session.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Configuration & CLI
// ---------------------------------------------------------------------------

const ATTACK_CLASSES = [
  'whitewasher',
  'sybil-cross-vouch',
  'slow-poisoner',
  'reputation-squatter',
  'cross-brain-hijack',
];

const DEFENSE_STATES = [
  'none',
  'decay-on-anomaly',
  'cross-vouching-detector',
  'replay-audit',
  'all-three',
];

const TARGET_BRAIN_CLASSES = [
  'trait-inference',
  'sesl-training',
  'scene-composition',
  'motion-sesl',
  'adaptive-ui',
  'lean-theorist',
];

const TRIAL_DURATIONS_MS = {
  short: [30_000, 300_000],          // 30s + 5m
  full: [30_000, 300_000, 3_600_000], // + 1h
};

const TRIALS_PER_CELL = 10;

function parseArgs(argv) {
  const args = { runId: null, phase: null, durationMode: 'short' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run-id') args.runId = argv[++i];
    else if (argv[i] === '--phase') args.phase = Number(argv[++i]);
    else if (argv[i] === '--duration-mode') args.durationMode = argv[++i];
  }
  if (!args.runId) {
    args.runId = `${new Date().toISOString().slice(0, 10)}-AUTO`;
  }
  if (![0, 1, 2].includes(args.phase)) {
    throw new Error(`--phase must be 0|1|2 (got "${args.phase}"). Founder ruling 2026-04-25: progressive rollout required, no full-matrix dispatch without phase-0 + phase-1 gate-clear.`);
  }
  if (!['short', 'full'].includes(args.durationMode)) {
    throw new Error(`--duration-mode must be short|full (got "${args.durationMode}")`);
  }
  return args;
}

/**
 * Founder ruling 2026-04-25: progressive rollout in production. Phase N+1
 * requires phase N's gate-clear-<phase>.json to show CAEL integrity 100%
 * and no foreign-route writes. Refuse to advance otherwise.
 */
async function requirePriorPhaseGateClear(phase, resultsDir) {
  if (phase === 0) return; // Phase 0 has no prior; it IS the gate.
  const priorPath = join(resultsDir, `gate-clear-${phase - 1}.json`);
  if (!existsSync(priorPath)) {
    throw new Error(
      `Phase ${phase} refused: missing gate-clear artifact for phase ${phase - 1} (${priorPath}). `
      + `Run --phase ${phase - 1} first; verify CAEL integrity = 100%; then re-run.`
    );
  }
  const prior = JSON.parse(await readFile(priorPath, 'utf8'));
  if (prior.cael_integrity_pct !== 100 || prior.foreign_route_writes !== 0) {
    throw new Error(
      `Phase ${phase} refused: phase ${phase - 1} gate-clear shows `
      + `cael_integrity_pct=${prior.cael_integrity_pct}, foreign_route_writes=${prior.foreign_route_writes}. `
      + `Both must be 100 / 0 to advance.`
    );
  }
}

// ---------------------------------------------------------------------------
// Fleet topology resolution
// ---------------------------------------------------------------------------

async function loadFleet() {
  const path = join(REPO_ROOT, 'scripts', 'mesh-deploy', 'agents.json');
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.agents)) {
    throw new Error(`Expected data.agents array in ${path}; got ${typeof data.agents}`);
  }
  return data.agents.filter((a) => a.enabled !== false);
}

function partitionFleet(agents) {
  const attackers = [];
  const targets = [];
  for (const agent of agents) {
    const brain = (agent.brainPath || '').split('/').pop().replace('.hsplus', '');
    if (brain === 'security-auditor-brain') {
      attackers.push({ ...agent, _brainClass: 'security-auditor', _attackClass: null });
    } else {
      targets.push({ ...agent, _brainClass: brain.replace('-brain', '') });
    }
  }
  // Assign one attack class per security-auditor brain (first 5).
  const assigned = attackers.slice(0, ATTACK_CLASSES.length).map((a, i) => ({
    ...a,
    _attackClass: ATTACK_CLASSES[i],
  }));
  return { attackers: assigned, targets };
}

function targetsForBrainClass(targets, brainClass) {
  return targets.filter((t) => t._brainClass === brainClass);
}

// ---------------------------------------------------------------------------
// Eval matrix iteration (lazy generator)
// ---------------------------------------------------------------------------

/**
 * Phase-aware eval-matrix generator. Founder ruling 2026-04-25: progressive
 * rollout. Phase 0 = single-cell smoke; Phase 1 = class-coverage smoke;
 * Phase 2 = full eval matrix per --duration-mode.
 */
function* evalMatrix(phase, durationsMs) {
  if (phase === 0) {
    // Phase 0 (smoke-1): 1 attacker × 1 target × 30s × 1 trial = 1 cell
    yield {
      attackClass: ATTACK_CLASSES[0],
      defenseState: DEFENSE_STATES[0],
      targetBrainClass: TARGET_BRAIN_CLASSES[0],
      durationMs: 30_000,
      trial: 0,
    };
    return;
  }
  if (phase === 1) {
    // Phase 1 (smoke-N): 5 attackers × 5 targets × 30s × 2 trials = 50 cells
    for (let i = 0; i < ATTACK_CLASSES.length; i++) {
      const targetBrainClass = TARGET_BRAIN_CLASSES[i % TARGET_BRAIN_CLASSES.length];
      for (let trial = 0; trial < 2; trial++) {
        yield {
          attackClass: ATTACK_CLASSES[i],
          defenseState: DEFENSE_STATES[0],
          targetBrainClass,
          durationMs: 30_000,
          trial,
        };
      }
    }
    return;
  }
  // Phase 2 (full): 300-cell short or 450-cell full
  for (const attackClass of ATTACK_CLASSES) {
    for (const defenseState of DEFENSE_STATES) {
      for (const targetBrainClass of TARGET_BRAIN_CLASSES) {
        for (const durationMs of durationsMs) {
          for (let trial = 0; trial < TRIALS_PER_CELL; trial++) {
            yield { attackClass, defenseState, targetBrainClass, durationMs, trial };
          }
        }
      }
    }
  }
}

function totalCells(phase, durationsMs) {
  if (phase === 0) return 1;
  if (phase === 1) return ATTACK_CLASSES.length * 2;
  return ATTACK_CLASSES.length
    * DEFENSE_STATES.length
    * TARGET_BRAIN_CLASSES.length
    * durationsMs.length
    * TRIALS_PER_CELL;
}

// ---------------------------------------------------------------------------
// Trial dispatcher (SCAFFOLD)
// ---------------------------------------------------------------------------

async function dispatchTrial({ attacker, target, cell }) {
  // PRODUCTION MODE (founder ruling 2026-04-25). All dispatches hit the live
  // HoloMesh deployment. No sandbox path.
  // TODO: invoke `attacker-loops/${cell.attackClass}.mjs` against target via
  //       HoloMesh API using attacker's x402 bearer.
  // TODO: configure defense state on target via /api/holomesh/agent/<id>/defense
  //       (route may need to ship in mcp-server first — see /room task tvw8).
  // TODO: wait cell.durationMs.
  // TODO: invoke oracle/divergence-detector.mjs to score this trial.
  return {
    attacker_handle: attacker.handle,
    target_handle: target.handle,
    attack_class: cell.attackClass,
    defense_state: cell.defenseState,
    target_brain_class: cell.targetBrainClass,
    duration_ms: cell.durationMs,
    trial: cell.trial,
    target: 'production',
    started_at: new Date().toISOString(),
    status: 'SCAFFOLD_PENDING',
    divergence_observed: null,
    time_to_detect_seconds: null,
    cael_audit_route: null, // populated by oracle when wired
    foreign_route_writes: 0, // populated by oracle (tracks non-audit/-prefix writes)
  };
}

/**
 * Compute the gate-clear artifact for a phase. Founder ruling 2026-04-25:
 * Phase N+1 only proceeds if the gate-clear shows CAEL integrity = 100%
 * and foreign-route-writes = 0.
 */
function computeGateClear(phase, rows) {
  const total = rows.length;
  const withCaelRoute = rows.filter((r) => r.cael_audit_route != null).length;
  const foreignRouteWrites = rows.reduce((sum, r) => sum + (r.foreign_route_writes || 0), 0);
  // SCAFFOLD: until oracle wires through, treat synthetic rows as cael_integrity=0.
  // Production wire-up flips this to 100 when every row has a real audit route.
  const caelIntegrityPct = total === 0 ? 0 : Math.round((withCaelRoute / total) * 100);
  return {
    phase,
    total_trials: total,
    cael_integrity_pct: caelIntegrityPct,
    foreign_route_writes: foreignRouteWrites,
    advance_allowed: caelIntegrityPct === 100 && foreignRouteWrites === 0,
    computed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const durationsMs = TRIAL_DURATIONS_MS[args.durationMode];
  const total = totalCells(args.phase, durationsMs);

  const fleet = await loadFleet();
  const { attackers, targets } = partitionFleet(fleet);

  console.log(`[fleet-adversarial] run-id=${args.runId}`);
  console.log(`[fleet-adversarial] phase=${args.phase} target=production (founder ruling 2026-04-25)`);
  console.log(`[fleet-adversarial] duration-mode=${args.durationMode}`);
  console.log(`[fleet-adversarial] attackers=${attackers.length} targets=${targets.length}`);
  console.log(`[fleet-adversarial] cells in this phase=${total}`);
  console.log(`[fleet-adversarial] STATUS: scaffold — wiring through to attacker loops + oracle TBD (/room task tvw8)`);

  if (attackers.length < ATTACK_CLASSES.length) {
    console.error(`[fleet-adversarial] FATAL: need ${ATTACK_CLASSES.length} security-auditor brains, found ${attackers.length}`);
    process.exit(2);
  }

  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) await mkdir(resultsDir, { recursive: true });

  // Founder ruling 2026-04-25: phase gate enforcement. Refuse to advance.
  await requirePriorPhaseGateClear(args.phase, resultsDir);

  const rows = [];
  let i = 0;
  for (const cell of evalMatrix(args.phase, durationsMs)) {
    const attacker = attackers.find((a) => a._attackClass === cell.attackClass);
    const targetPool = targetsForBrainClass(targets, cell.targetBrainClass);
    if (targetPool.length === 0) {
      console.warn(`[fleet-adversarial] skip: no targets for brain class ${cell.targetBrainClass}`);
      continue;
    }
    const target = targetPool[i % targetPool.length];
    const row = await dispatchTrial({ attacker, target, cell });
    rows.push(row);
    i++;
    if (args.phase === 2 && i % 50 === 0) {
      console.log(`[fleet-adversarial] dispatched ${i}/${total} trials...`);
    }
  }

  const outPath = join(resultsDir, `${args.runId}.json`);
  await writeFile(outPath, JSON.stringify({
    run_id: args.runId,
    phase: args.phase,
    target: 'production',
    duration_mode: args.durationMode,
    fleet_size: fleet.length,
    attackers_used: attackers.length,
    targets_available: targets.length,
    cells_dispatched: rows.length,
    started_at: rows[0]?.started_at,
    finished_at: new Date().toISOString(),
    rows,
  }, null, 2), 'utf8');

  // Phase gate-clear artifact (founder ruling 2026-04-25)
  const gateClear = computeGateClear(args.phase, rows);
  const gatePath = join(resultsDir, `gate-clear-${args.phase}.json`);
  await writeFile(gatePath, JSON.stringify(gateClear, null, 2), 'utf8');

  console.log(`[fleet-adversarial] wrote ${outPath}`);
  console.log(`[fleet-adversarial] wrote ${gatePath} (advance_allowed=${gateClear.advance_allowed})`);
  console.log(`[fleet-adversarial] NOTE: status=SCAFFOLD_PENDING on every row — attacker loops are stubs.`);
  if (!gateClear.advance_allowed) {
    console.log(`[fleet-adversarial] phase ${args.phase + 1} GATED until cael_integrity_pct=100 + foreign_route_writes=0.`);
  }
}

main().catch((err) => {
  console.error(`[fleet-adversarial] FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
