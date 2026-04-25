#!/usr/bin/env node
/**
 * Worker-Side Dispatch Consumer for Fleet Adversarial Harness
 * ------------------------------------------------------------
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §2.
 *
 * Runs as a daemon on each security-auditor brain's Vast.ai worker box.
 * Polls GET /api/holomesh/agent/<self-handle>/dispatch (HS 8331d48b6) on
 * a tick interval, drains pending DispatchEntries, and invokes the
 * matching attacker-loop with the cell parameters. The attacker loop
 * emits CAEL records via the same audit/-prefix POST path the oracle
 * reads from.
 *
 * This closes the LAST gap to "Phase 0 runs end-to-end":
 *   coordinator POSTs dispatch → THIS DAEMON consumes → attacker loop
 *   runs → CAEL emitted → oracle scores → gate-clear advances.
 *
 * Each security-auditor brain (workers 04, 09, 14, 19, 24 per
 * agents.json) runs ONE instance of this daemon, configured with its
 * own handle + bearer.
 *
 * Usage:
 *   HOLOMESH_API_KEY_MESH_04_X402=<bearer> \
 *     node scripts/fleet-adversarial/worker-dispatch-consumer.mjs \
 *       --handle mesh-worker-04
 *
 *   # Optional flags:
 *   --tick-ms 30000              (poll interval, default 30s)
 *   --max-concurrent-trials 1    (default 1; one trial at a time)
 *   --dry-run                    (smoke mode: don't actually emit live CAEL)
 *   --once                       (poll once, exit; for cron / CI)
 *
 * Author: Claude (Opus 4.7, 1M ctx) — claude-code surface, 2026-04-25 session.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { runWhitewasher } from './attacker-loops/whitewasher.mjs';
import { runReputationSquatter } from './attacker-loops/reputation-squatter.mjs';
import { runCrossBrainHijack } from './attacker-loops/cross-brain-hijack.mjs';
// sybil + slow-poisoner have their own runner shape that may differ; for
// now, support whitewasher + reputation-squatter + cross-brain-hijack.
// TODO(Phase 1.5): unify all 5 attacker entrypoints under a single
// runAttacker(opts) registry to drop the per-class import here.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ATTACKER_REGISTRY = {
  whitewasher: runWhitewasher,
  'reputation-squatter': runReputationSquatter,
  'cross-brain-hijack': runCrossBrainHijack,
  // sybil-cross-vouch + slow-poisoner — TODO unify entrypoint
};

function parseArgs(argv) {
  const args = {
    handle: null,
    // Bare base; URL builders append /api/holomesh/... (mirrors _base.mjs).
    apiBase: (process.env.HOLOMESH_API_BASE || 'https://mcp.holoscript.net').replace(/\/api\/holomesh\/?$/, ''),
    apiKey: null, // resolved per --handle below
    tickMs: 30_000,
    maxConcurrentTrials: 1,
    dryRun: false,
    once: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--handle') args.handle = argv[++i];
    else if (argv[i] === '--api-base') args.apiBase = argv[++i];
    else if (argv[i] === '--tick-ms') args.tickMs = Number(argv[++i]);
    else if (argv[i] === '--max-concurrent-trials') args.maxConcurrentTrials = Number(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--once') args.once = true;
  }
  if (!args.handle) {
    throw new Error('--handle required');
  }
  // Resolve bearer from per-surface env var (W.087 vertex B pattern).
  // mesh-worker-04 → HOLOMESH_API_KEY_MESH_04_X402
  const handleSuffix = args.handle.match(/mesh-worker-(\d+)/)?.[1];
  if (handleSuffix) {
    args.apiKey = process.env[`HOLOMESH_API_KEY_MESH_${handleSuffix}_X402`] || null;
  } else {
    args.apiKey = process.env.HOLOMESH_API_KEY || null;
  }
  if (!args.apiKey) {
    throw new Error(`No bearer found for handle "${args.handle}" (looked at HOLOMESH_API_KEY_MESH_<NN>_X402 and HOLOMESH_API_KEY)`);
  }
  return args;
}

/**
 * Drain the dispatch queue for our handle.
 */
async function drainQueue({ apiBase, apiKey, handle }) {
  const url = `${apiBase}/api/holomesh/agent/${encodeURIComponent(handle)}/dispatch`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'x-mcp-api-key': apiKey },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return body.dispatches || [];
}

/**
 * Execute a single dispatch entry by invoking the matching attacker loop.
 */
async function executeDispatch({ args, dispatch }) {
  const runner = ATTACKER_REGISTRY[dispatch.attack_class];
  if (!runner) {
    return {
      cell_id: dispatch.cell_id,
      attack_class: dispatch.attack_class,
      status: 'UNSUPPORTED_ATTACK_CLASS',
      error: `No attacker registered for class "${dispatch.attack_class}"`,
    };
  }
  try {
    const result = await runner({
      target_handle: dispatch.target_handle,
      duration_ms: dispatch.duration_ms,
      trial: dispatch.trial,
      attacker_handle: args.handle,
      attacker_bearer: args.apiKey,
      defense_state: dispatch.defense_state,
      phase: 0, // Phase derived from cell_id if present; default 0 for now
      run_id: dispatch.cell_id,
      audit_dir: join(__dirname, 'results'),
      dry_run: args.dryRun,
      api_base: args.apiBase,
      acknowledge_blockers: !args.dryRun, // live mode auto-acks (we're past blockers)
    });
    return {
      cell_id: dispatch.cell_id,
      attack_class: dispatch.attack_class,
      status: result.status,
      summary: {
        cael_records_emitted: result.cael_records_emitted,
        foreign_route_writes: result.foreign_route_writes,
        live_mode_failures: result.live_mode_failures,
      },
    };
  } catch (err) {
    return {
      cell_id: dispatch.cell_id,
      attack_class: dispatch.attack_class,
      status: 'EXECUTION_ERROR',
      error: String(err.stack || err.message || err),
    };
  }
}

/**
 * One poll cycle: drain queue, execute up to maxConcurrentTrials in
 * parallel (Phase 0 default 1; Phase 2 raises to allow multi-target
 * trials per attacker if needed).
 */
async function pollOnce(args) {
  const dispatches = await drainQueue(args);
  if (dispatches.length === 0) {
    return { polled_at: new Date().toISOString(), pending: 0, executed: [] };
  }
  console.log(`[worker-dispatch] handle=${args.handle} pending=${dispatches.length}, executing...`);
  // Process in chunks of maxConcurrentTrials.
  const executed = [];
  for (let i = 0; i < dispatches.length; i += args.maxConcurrentTrials) {
    const chunk = dispatches.slice(i, i + args.maxConcurrentTrials);
    const results = await Promise.all(chunk.map((d) => executeDispatch({ args, dispatch: d })));
    executed.push(...results);
  }
  return { polled_at: new Date().toISOString(), pending: dispatches.length, executed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[worker-dispatch] handle=${args.handle} tick-ms=${args.tickMs} dry-run=${args.dryRun}`);
  console.log(`[worker-dispatch] api-base=${args.apiBase}`);
  console.log(`[worker-dispatch] supported attack classes: ${Object.keys(ATTACKER_REGISTRY).join(', ')}`);

  if (args.once) {
    const result = await pollOnce(args);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Long-running daemon mode.
  // Trap SIGINT/SIGTERM for clean shutdown.
  let shuttingDown = false;
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log(`\n[worker-dispatch] ${sig} received, shutting down after current poll...`);
      shuttingDown = true;
    });
  }

  while (!shuttingDown) {
    try {
      const result = await pollOnce(args);
      if (result.executed.length > 0) {
        console.log(`[worker-dispatch] poll: pending=${result.pending} executed=${result.executed.length} ` +
          `(${result.executed.filter((r) => r.status === 'OK' || r.status === 'OK_DRY_RUN').length} OK)`);
      }
    } catch (err) {
      console.error(`[worker-dispatch] poll FAILED: ${err.message || err}`);
    }
    if (shuttingDown) break;
    await new Promise((r) => setTimeout(r, args.tickMs));
  }
  console.log('[worker-dispatch] daemon stopped.');
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  const argvUrl = `file://${process.argv[1].replace(/\\/g, '/')}`;
  return import.meta.url === argvUrl || import.meta.url === argvUrl.replace('file://', 'file:///');
})();

if (isMainModule) {
  main().catch((err) => {
    console.error(`[worker-dispatch] FATAL: ${err.stack || err.message}`);
    process.exit(1);
  });
}
