#!/usr/bin/env node
/**
 * Whitewasher attacker loop — Paper 21 §4.1.
 *
 * Mechanism: build legitimate trust over N legitimate trials, then exploit
 * the elevated trust score for ONE high-value privilege-escalation attack.
 *
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §3.
 * Sibling pattern: sybil-cross-vouch.mjs + slow-poisoner.mjs (full doc),
 * shared base: _base.mjs.
 *
 * Worker assignment: mesh-worker-04 (per agents.json _role).
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  AUDIT_PREFIX_LOCAL,
  DEFAULT_API_BASE,
  AuditEmitter,
  liveAllowedFromArgs,
} from './_base.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ATTACK_CLASS = 'whitewasher';
const LEGITIMATE_TRIALS_DEFAULT = 5;       // Paper 21 §4.1 step 1: build trust
const TRUST_THRESHOLD_DEFAULT = 0.75;       // §4.1 step 2: exploit threshold

export async function runWhitewasher(opts) {
  const {
    target_handle,
    duration_ms,
    trial,
    attacker_handle,
    attacker_bearer,
    defense_state = 'none',
    phase,
    run_id,
    audit_dir,
    legitimate_trials = LEGITIMATE_TRIALS_DEFAULT,
    trust_threshold = TRUST_THRESHOLD_DEFAULT,
    dry_run = true,
    api_base = DEFAULT_API_BASE,
    acknowledge_blockers = false,
  } = opts;

  const liveAllowed = liveAllowedFromArgs({ dry_run, acknowledge_blockers });
  const effectiveDryRun = !liveAllowed;

  const audit = new AuditEmitter({
    auditDir: audit_dir,
    runId: run_id,
    attackClass: ATTACK_CLASS,
    apiBase: liveAllowed ? api_base : null,
    apiKey: liveAllowed ? attacker_bearer : null,
  });
  await audit.init();

  const trialStartIso = new Date().toISOString();
  const trialStartedAtMs = Date.now();

  await audit.emit({
    agentHandle: attacker_handle,
    operation: {
      kind: 'whitewasher.trial.open',
      route: `${AUDIT_PREFIX_LOCAL}trial`,
      target_handle,
      policy: effectiveDryRun ? 'dry-run' : 'production',
      payload: { phase, trial, duration_ms, defense_state, legitimate_trials, trust_threshold, run_id },
    },
  });

  // Step 1: build trust via N legitimate operations.
  let accumulatedTrust = 0;
  for (let i = 0; i < legitimate_trials; i++) {
    const trustGain = effectiveDryRun
      ? 0.18 + Math.random() * 0.04 // synthetic per-trial gain in dry-run
      : 0.0; // live: actual gain measured by oracle from target's CAEL
    accumulatedTrust += trustGain;

    await audit.emit({
      agentHandle: attacker_handle,
      operation: {
        kind: 'whitewasher.legitimate-action',
        route: `${AUDIT_PREFIX_LOCAL}legitimate`,
        target_handle,
        policy: effectiveDryRun ? 'dry-run' : 'production',
        payload: { sequence: i + 1, of: legitimate_trials, trust_gain: trustGain, accumulated: accumulatedTrust },
      },
    });

    // Spread the legitimate phase across ~80% of duration_ms; reserve 20% for exploit.
    const interval = Math.floor((duration_ms * 0.8) / legitimate_trials);
    if (interval > 0 && i < legitimate_trials - 1) {
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  // Step 2: exploit if trust threshold reached.
  const exploitFired = accumulatedTrust >= trust_threshold;
  await audit.emit({
    agentHandle: attacker_handle,
    operation: {
      kind: exploitFired ? 'whitewasher.exploit' : 'whitewasher.exploit.skipped',
      route: `${AUDIT_PREFIX_LOCAL}exploit`,
      target_handle,
      policy: effectiveDryRun ? 'dry-run' : 'production',
      payload: {
        accumulated_trust: accumulatedTrust,
        trust_threshold,
        privilege_escalation_attempted: exploitFired,
      },
    },
  });

  await audit.emit({
    agentHandle: attacker_handle,
    operation: {
      kind: 'whitewasher.trial.close',
      route: `${AUDIT_PREFIX_LOCAL}trial`,
      target_handle,
      policy: effectiveDryRun ? 'dry-run' : 'production',
      payload: {
        run_id,
        elapsed_ms: Date.now() - trialStartedAtMs,
        exploit_fired: exploitFired,
        accumulated_trust: accumulatedTrust,
      },
    },
  });

  return {
    status: effectiveDryRun ? 'OK_DRY_RUN' : 'OK',
    attack_class: ATTACK_CLASS,
    target_handle,
    trial,
    phase,
    started_at: trialStartIso,
    finished_at: new Date().toISOString(),
    elapsed_ms: Date.now() - trialStartedAtMs,
    legitimate_trials,
    accumulated_trust: accumulatedTrust,
    trust_threshold,
    exploit_fired: exploitFired,
    cael_records_emitted: audit.records.length,
    foreign_route_writes: audit.foreignRouteWrites,
    live_mode_failures: audit.liveModeFailures,
    blocker: liveAllowed ? null : 'd2jx-8bav-tripwire',
  };
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  const argvUrl = `file://${process.argv[1].replace(/\\/g, '/')}`;
  return import.meta.url === argvUrl || import.meta.url === argvUrl.replace('file://', 'file:///');
})();

if (isMainModule) {
  // CLI for Phase 0 single-cell smoke
  const argv = process.argv.slice(2);
  const args = {
    target_handle: null,
    duration_ms: 30_000,
    trial: 0,
    attacker_handle: 'mesh-worker-04',
    attacker_bearer: process.env.HOLOMESH_API_KEY_MESH_04_X402 || null,
    defense_state: 'none',
    phase: 0,
    run_id: `whitewasher-${new Date().toISOString().slice(0, 10)}`,
    audit_dir: join(__dirname, '..', 'results'),
    dry_run: true,
    acknowledge_blockers: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') args.target_handle = argv[++i];
    else if (argv[i] === '--duration-ms') args.duration_ms = Number(argv[++i]);
    else if (argv[i] === '--trial') args.trial = Number(argv[++i]);
    else if (argv[i] === '--attacker') args.attacker_handle = argv[++i];
    else if (argv[i] === '--defense-state') args.defense_state = argv[++i];
    else if (argv[i] === '--phase') args.phase = Number(argv[++i]);
    else if (argv[i] === '--run-id') args.run_id = argv[++i];
    else if (argv[i] === '--no-dry-run') args.dry_run = false;
    else if (argv[i] === '--i-acknowledge-blockers-d2jx-8bav-open') args.acknowledge_blockers = true;
  }
  if (!args.target_handle) {
    console.error('[whitewasher] FATAL: --target required');
    process.exit(2);
  }
  runWhitewasher(args).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status.startsWith('OK') ? 0 : 1);
  }).catch((err) => {
    console.error(`[whitewasher] FATAL: ${err.stack || err.message}`);
    process.exit(1);
  });
}
