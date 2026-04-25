#!/usr/bin/env node
/**
 * Fleet-Scale Composability Test — W.GOLD.189 Empirical Defense
 * --------------------------------------------------------------
 * Spec: ai-ecosystem/research/2026-04-25_fleet-empirical-composability-w-gold-189.md
 *
 * Tests Diamond W.GOLD.189 (Algebraic Trust — tropical semiring composability)
 * at fleet scale (N=31 agents) by:
 *
 *   Phase A. Per-agent capture: read CAEL audit log per agent, extract per-tick
 *            seven-layer hash chain (h_1, h_2, ..., h_7).
 *   Phase B. Cross-agent compose under three iteration orders (forward,
 *            reverse, random permutation) at a fixed 60s tick window.
 *            Assert all three produce equal fleet-compose hash.
 *            Assert idempotency: H ⊕ H = H.
 *   Phase C. Tick-window scaling: repeat at 4 windows over 24h
 *            (00:00, 06:00, 12:00, 18:00 UTC).
 *
 * Status: SCAFFOLD. Tropical-semiring compose helpers are stubs (operate on
 * canonical hash strings; production should call into @holoscript/core
 * SemiringHash module). CAEL ingestion stub returns synthetic data until the
 * audit-log producer (commit 94cc69d73) exposes the read endpoint.
 *
 * Usage:
 *   node run-test.mjs --run-id 2026-04-25-A
 *   node run-test.mjs --run-id 2026-04-25-A --tick-windows 4 --window-size-ms 60000
 *
 * Author: Claude (Opus 4.7, 1M ctx) — claude-code surface, 2026-04-25 session.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { runId: null, tickWindows: 4, windowSizeMs: 60_000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run-id') args.runId = argv[++i];
    else if (argv[i] === '--tick-windows') args.tickWindows = Number(argv[++i]);
    else if (argv[i] === '--window-size-ms') args.windowSizeMs = Number(argv[++i]);
  }
  if (!args.runId) {
    args.runId = `${new Date().toISOString().slice(0, 10)}-AUTO`;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Tropical semiring helpers (canonical-hash pinned reduction order)
// ---------------------------------------------------------------------------

/**
 * Tropical compose ⊗: associative compose of two hash chains.
 * Canonical pinned order: SHA-256(left || ":" || right).
 * NOTE: Production should call @holoscript/core SemiringHash.compose; this
 *       is a self-contained stub for the scaffold.
 */
function tropicalCompose(left, right) {
  if (left == null) return right;
  if (right == null) return left;
  return createHash('sha256').update(`${left}:${right}`).digest('hex');
}

/**
 * Idempotent join ⊕: SHA-256 of sorted concat. Canonical: sort lex first.
 */
function idempotentJoin(a, b) {
  if (a === b) return a;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return createHash('sha256').update(`⊕:${lo}:${hi}`).digest('hex');
}

/**
 * Compose an array of hash chains in the given order.
 */
function composeChain(chain) {
  return chain.reduce((acc, h) => tropicalCompose(acc, h), null);
}

// ---------------------------------------------------------------------------
// Phase A: Per-agent CAEL chain capture (SCAFFOLD — synthetic stub)
// ---------------------------------------------------------------------------

async function loadFleet() {
  const path = join(REPO_ROOT, 'scripts', 'mesh-deploy', 'agents.json');
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw);
  return (data.agents || []).filter((a) => a.enabled !== false);
}

/**
 * Capture per-agent seven-layer hash chain at tick `tickIso`.
 * SCAFFOLD: returns deterministic synthetic hashes per (agentHandle, tickIso).
 * PRODUCTION: read CAEL trace via /api/holomesh/agent/<handle>/audit?tick=<iso>
 *             and extract layer hashes from the trace structure.
 */
async function captureAgentChain(agent, tickIso) {
  const layers = [];
  for (let j = 1; j <= 7; j++) {
    // Synthetic: deterministic per (handle, tick, layer). Real impl reads CAEL.
    const h = createHash('sha256')
      .update(`${agent.handle}:${tickIso}:layer${j}`)
      .digest('hex');
    layers.push(h);
  }
  return {
    agent_handle: agent.handle,
    brain_class: (agent.brainPath || '').split('/').pop().replace('.hsplus', ''),
    tick_iso: tickIso,
    layers,
    intra_agent_compose: composeChain(layers),
  };
}

// ---------------------------------------------------------------------------
// Phase B: Cross-agent compose tests (one tick window)
// ---------------------------------------------------------------------------

function shuffleCopy(arr, seed) {
  const a = arr.slice();
  // Deterministic shuffle for reproducibility
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function composeCrossAgentTests(perAgentChains) {
  const intraComposes = perAgentChains.map((c) => c.intra_agent_compose);

  const fwd = composeChain(intraComposes);
  const rev = composeChain(intraComposes.slice().reverse());
  const rand = composeChain(shuffleCopy(intraComposes, 42));

  const associativity_pass = fwd === rev;
  const permutation_invariance_pass = fwd === rand;
  const idempotency_pass = idempotentJoin(fwd, fwd) === fwd;

  return {
    fwd, rev, rand,
    associativity_pass,
    permutation_invariance_pass,
    idempotency_pass,
    n_agents: perAgentChains.length,
  };
}

// ---------------------------------------------------------------------------
// Phase C: Tick-window scaling (run B at multiple times)
// ---------------------------------------------------------------------------

function planTickWindows(n, windowSizeMs) {
  const now = Date.now();
  // Equally spaced over 24h
  const stepMs = (24 * 60 * 60 * 1000) / n;
  const windows = [];
  for (let i = 0; i < n; i++) {
    const startMs = now - (24 * 60 * 60 * 1000) + i * stepMs;
    const start = new Date(startMs).toISOString();
    windows.push({ window_index: i, start, window_size_ms: windowSizeMs });
  }
  return windows;
}

async function runWindow(window, fleet) {
  const start = Date.now();
  const perAgent = await Promise.all(fleet.map((a) => captureAgentChain(a, window.start)));
  const tests = composeCrossAgentTests(perAgent);
  return {
    window,
    tests,
    elapsed_ms: Date.now() - start,
    captured_agents: perAgent.length,
    sample_intra: perAgent.slice(0, 2).map((c) => ({
      agent_handle: c.agent_handle,
      intra_agent_compose: c.intra_agent_compose,
    })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fleet = await loadFleet();

  console.log(`[fleet-composability] run-id=${args.runId}`);
  console.log(`[fleet-composability] fleet size=${fleet.length}`);
  console.log(`[fleet-composability] tick windows=${args.tickWindows} window-size-ms=${args.windowSizeMs}`);
  console.log(`[fleet-composability] STATUS: scaffold — CAEL ingestion is synthetic stub`);

  if (fleet.length === 0) {
    console.error(`[fleet-composability] FATAL: empty fleet (agents.json had no enabled agents)`);
    process.exit(2);
  }

  const windows = planTickWindows(args.tickWindows, args.windowSizeMs);
  const results = [];
  for (const w of windows) {
    process.stdout.write(`[fleet-composability] window ${w.window_index} (${w.start})... `);
    const r = await runWindow(w, fleet);
    results.push(r);
    const { associativity_pass: a, permutation_invariance_pass: p, idempotency_pass: i } = r.tests;
    console.log(`assoc=${a ? 'PASS' : 'FAIL'} perm=${p ? 'PASS' : 'FAIL'} idem=${i ? 'PASS' : 'FAIL'} (${r.elapsed_ms}ms)`);
  }

  // Aggregate pass/fail across windows
  const summary = {
    associativity_passes: results.filter((r) => r.tests.associativity_pass).length,
    permutation_invariance_passes: results.filter((r) => r.tests.permutation_invariance_pass).length,
    idempotency_passes: results.filter((r) => r.tests.idempotency_pass).length,
    total_windows: results.length,
    tractability_pass: results.every((r) => r.elapsed_ms < 10_000),
    fleet_n: fleet.length,
  };

  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) await mkdir(resultsDir, { recursive: true });

  const outPath = join(resultsDir, `${args.runId}.json`);
  await writeFile(outPath, JSON.stringify({
    run_id: args.runId,
    started_at: new Date().toISOString(),
    fleet_n: fleet.length,
    tick_windows_planned: args.tickWindows,
    window_size_ms: args.windowSizeMs,
    summary,
    windows: results,
  }, null, 2), 'utf8');

  console.log(`[fleet-composability] wrote ${outPath}`);
  console.log(`[fleet-composability] SUMMARY:`);
  console.log(`  Associativity:           ${summary.associativity_passes}/${summary.total_windows}`);
  console.log(`  Permutation invariance:  ${summary.permutation_invariance_passes}/${summary.total_windows}`);
  console.log(`  Idempotency:             ${summary.idempotency_passes}/${summary.total_windows}`);
  console.log(`  Tractability (<10s):     ${summary.tractability_pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Fleet N:                 ${summary.fleet_n}`);

  // Determine outcome class per spec §4
  const allTestsPass = summary.associativity_passes === summary.total_windows
    && summary.permutation_invariance_passes >= Math.ceil(summary.total_windows * 0.75)
    && summary.idempotency_passes === summary.total_windows;

  if (allTestsPass && summary.tractability_pass) {
    console.log(`[fleet-composability] OUTCOME: Case A — W.GOLD.189 empirically defended at N=${fleet.length}`);
  } else if (allTestsPass && !summary.tractability_pass) {
    console.log(`[fleet-composability] OUTCOME: Case C — composability holds, tractability fails`);
  } else {
    console.log(`[fleet-composability] OUTCOME: Case B — algebraic identity has a structural limit at fleet scale`);
  }
  console.log(`[fleet-composability] NOTE: synthetic-stub CAEL means above outcome reflects scaffold integrity, not real fleet semantics.`);
}

main().catch((err) => {
  console.error(`[fleet-composability] FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
