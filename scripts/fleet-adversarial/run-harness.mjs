#!/usr/bin/env node
/**
 * Fleet Adversarial Harness — Paper 21 Empirical Eval Coordinator
 * ----------------------------------------------------------------
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md
 *
 * Coordinator that:
 *   1. Reads scripts/mesh-deploy/agents.json to identify the 5 security-auditor
 *      attacker brains and the 26 target brains.
 *   2. Iterates the 450-cell eval matrix (5 attack-classes × 5 defense-states ×
 *      6 target-brain-classes × 3 trial-durations) — reduced to 300 cells in the
 *      practical run (drop the 1h trial duration; keep 30s + 5m).
 *   3. For each cell: dispatches the attacker loop (attacker-loops/<class>.mjs)
 *      to its assigned worker, configures defense state via HoloMesh API,
 *      waits the trial-duration, then invokes oracle/divergence-detector.mjs
 *      to score the trial.
 *   4. Writes a per-trial row to results/<run-id>.json.
 *
 * Status: SCAFFOLD. Each attacker loop file is a stub (TODO marker). Oracle
 * stub reads CAEL audit log via HOLOMESH_API base URL. Production execution
 * gated by founder ruling on:
 *   - Adversarial-budget allocation ($20 separate or share $50 cap)
 *   - Production vs sandboxed-fleet target mode
 *
 * Usage (when production-ready):
 *   node run-harness.mjs --run-id 2026-04-25-A --mode sandbox --duration-mode short
 *   node run-harness.mjs --run-id 2026-04-25-B --mode production --duration-mode full
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
  const args = { runId: null, mode: 'sandbox', durationMode: 'short' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run-id') args.runId = argv[++i];
    else if (argv[i] === '--mode') args.mode = argv[++i];
    else if (argv[i] === '--duration-mode') args.durationMode = argv[++i];
  }
  if (!args.runId) {
    args.runId = `${new Date().toISOString().slice(0, 10)}-AUTO`;
  }
  if (!['sandbox', 'production'].includes(args.mode)) {
    throw new Error(`--mode must be sandbox|production (got "${args.mode}")`);
  }
  if (!['short', 'full'].includes(args.durationMode)) {
    throw new Error(`--duration-mode must be short|full (got "${args.durationMode}")`);
  }
  return args;
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

function* evalMatrix(durationsMs) {
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

function totalCells(durationsMs) {
  return ATTACK_CLASSES.length
    * DEFENSE_STATES.length
    * TARGET_BRAIN_CLASSES.length
    * durationsMs.length
    * TRIALS_PER_CELL;
}

// ---------------------------------------------------------------------------
// Trial dispatcher (SCAFFOLD)
// ---------------------------------------------------------------------------

async function dispatchTrial({ attacker, target, cell, mode }) {
  // TODO: invoke `attacker-loops/${cell.attackClass}.mjs` against target via
  //       HoloMesh API. Production mode uses real x402 bearer; sandbox mode
  //       uses isolated HOLOMESH_TEAM_ID_SANDBOX.
  // TODO: configure defense state on target via /api/holomesh/agent/<id>/defense
  //       (route may need to ship in mcp-server first).
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
    mode,
    started_at: new Date().toISOString(),
    status: 'SCAFFOLD_PENDING',
    divergence_observed: null,
    time_to_detect_seconds: null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const durationsMs = TRIAL_DURATIONS_MS[args.durationMode];
  const total = totalCells(durationsMs);

  const fleet = await loadFleet();
  const { attackers, targets } = partitionFleet(fleet);

  console.log(`[fleet-adversarial] run-id=${args.runId}`);
  console.log(`[fleet-adversarial] mode=${args.mode} duration-mode=${args.durationMode}`);
  console.log(`[fleet-adversarial] attackers=${attackers.length} targets=${targets.length}`);
  console.log(`[fleet-adversarial] eval matrix cells=${total}`);
  console.log(`[fleet-adversarial] STATUS: scaffold — wiring through to attacker loops + oracle TBD`);

  if (attackers.length < ATTACK_CLASSES.length) {
    console.error(`[fleet-adversarial] FATAL: need ${ATTACK_CLASSES.length} security-auditor brains, found ${attackers.length}`);
    process.exit(2);
  }

  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) await mkdir(resultsDir, { recursive: true });

  const rows = [];
  let i = 0;
  for (const cell of evalMatrix(durationsMs)) {
    const attacker = attackers.find((a) => a._attackClass === cell.attackClass);
    const targetPool = targetsForBrainClass(targets, cell.targetBrainClass);
    if (targetPool.length === 0) {
      console.warn(`[fleet-adversarial] skip: no targets for brain class ${cell.targetBrainClass}`);
      continue;
    }
    const target = targetPool[i % targetPool.length];
    const row = await dispatchTrial({ attacker, target, cell, mode: args.mode });
    rows.push(row);
    i++;
    if (i % 50 === 0) {
      console.log(`[fleet-adversarial] dispatched ${i}/${total} trials...`);
    }
  }

  const outPath = join(resultsDir, `${args.runId}.json`);
  await writeFile(outPath, JSON.stringify({
    run_id: args.runId,
    mode: args.mode,
    duration_mode: args.durationMode,
    fleet_size: fleet.length,
    attackers_used: attackers.length,
    targets_available: targets.length,
    cells_dispatched: rows.length,
    started_at: rows[0]?.started_at,
    finished_at: new Date().toISOString(),
    rows,
  }, null, 2), 'utf8');

  console.log(`[fleet-adversarial] wrote ${outPath}`);
  console.log(`[fleet-adversarial] NOTE: status=SCAFFOLD_PENDING on every row — attacker loops are stubs.`);
}

main().catch((err) => {
  console.error(`[fleet-adversarial] FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
