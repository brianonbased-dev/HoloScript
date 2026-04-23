/**
 * paper-0c Stage C — full-replay shadow with per-step bounded-loss logging.
 *
 * Production path:
 *   (a) an SNN runtime (external) replays a canonical CAEL trace
 *   (b) each step of that replay is captured as a spike batch by the runtime
 *   (c) runStageC compares decoded spike-batch state against canonical JSONL
 *       state and records per-step, per-field bounded-loss violations
 *
 * Pass criterion (from the spec §Stage C):
 *   All fields within q_f / 2 for ≥ 99.99% of steps; any violation is logged
 *   with step index + field.
 *
 * This module provides the *skeleton* — the comparison + logging harness —
 * because the SNN runtime integration is framework-specific (snnTorch, Norse,
 * Nengo) and hardware-gated (Loihi, Akida, SpiNNaker). Users plug in their
 * runtime by implementing `SNNReplayer` and feeding the result to runStageC.
 */

import { canonicalSort, encodeStep, fnv1a, serializeSpikes, toHex, type Spike, type SpikeBatch } from './spike-encoder';
import { decodeStep, verifyBoundedLoss, type DecodeOptions, type BoundedLossViolation } from './spike-decoder';
import { quantumForField } from './quantum-registry';

/** Canonical JSONL-derived "truth" for one step. */
export interface CanonicalStep {
  step: number;
  floats?: Record<string, number>;
  vectors?: Record<string, [number, number, number]>;
}

/** Adapter interface every SNN runtime must satisfy to participate in Stage C. */
export interface SNNReplayer {
  /**
   * Return the spike batch produced by the runtime for a given step. Must be
   * synchronous and deterministic across calls with the same input; the
   * canonical-sort assertion below depends on the runtime not re-ordering
   * events between calls.
   */
  replayStep(step: number): Spike[];
}

export interface StageCPerStepLog {
  step: number;
  runtime_spike_digest: string;   // hex of canonical-sorted spikes from runtime
  canonical_spike_digest: string; // hex of what encodeStep would have produced
  digest_match: boolean;          // lossless bit-identity check
  bounded_loss_violations: BoundedLossViolation[];
}

export interface StageCResult {
  total_steps: number;
  digest_match_count: number;     // lossless spike-chain property (expected: all)
  violation_step_count: number;   // steps with ≥ 1 bounded-loss violation
  total_violation_count: number;  // total per-field violations across all steps
  worst_step: StageCPerStepLog | null;
  pass_criterion_hit: boolean;    // ≥ 99.99% of steps violation-free
  duration_ms: number;
  log: StageCPerStepLog[];        // per-step detail (truncated to first 100 if long)
}

export interface StageCOptions {
  field_specs: DecodeOptions['fields']; // how to decode each field back
  max_log_entries?: number;              // cap per-step detail in result.log (default 100)
  fail_fast?: boolean;                   // stop at first violation (default false)
}

/**
 * Run Stage C: the runtime replays `canonical_trace.length` steps; for each
 * step we compare (a) the runtime's spike-batch digest against the canonical
 * encode, and (b) the decoded state against the canonical JSONL state.
 */
export function runStageC(
  canonical_trace: CanonicalStep[],
  replayer: SNNReplayer,
  opts: StageCOptions
): StageCResult {
  const t_start = Date.now();
  const max_log = opts.max_log_entries ?? 100;
  const log: StageCPerStepLog[] = [];

  let digest_match_count = 0;
  let violation_step_count = 0;
  let total_violation_count = 0;
  let worst: StageCPerStepLog | null = null;

  // Build an auto-quanta map from field names present in canonical trace
  const field_names = new Set<string>();
  for (const s of canonical_trace) {
    if (s.floats) for (const f of Object.keys(s.floats)) field_names.add(f);
    if (s.vectors) for (const f of Object.keys(s.vectors)) field_names.add(f);
  }
  const quanta: Record<string, number> = {};
  for (const f of field_names) quanta[f] = quantumForField(f);

  const decode_opts: DecodeOptions = { fields: opts.field_specs, quanta };

  for (const canonical of canonical_trace) {
    const runtime_spikes = canonicalSort(replayer.replayStep(canonical.step));
    const runtime_digest = toHex(fnv1a(serializeSpikes(runtime_spikes)));

    // What would encodeStep produce for this canonical step?
    const canonical_batch: SpikeBatch = encodeStep(
      { step: canonical.step, floats: canonical.floats, vectors: canonical.vectors },
      quanta
    );
    const canonical_digest = toHex(canonical_batch.digest);

    // Decode runtime spikes back to state and measure bounded-loss
    const decoded = decodeStep(canonical.step, runtime_spikes, decode_opts);
    const violations = verifyBoundedLoss(canonical.floats, canonical.vectors, decoded, decode_opts);

    const entry: StageCPerStepLog = {
      step: canonical.step,
      runtime_spike_digest: runtime_digest,
      canonical_spike_digest: canonical_digest,
      digest_match: runtime_digest === canonical_digest,
      bounded_loss_violations: violations,
    };

    if (entry.digest_match) digest_match_count++;
    if (violations.length > 0) {
      violation_step_count++;
      total_violation_count += violations.length;
      if (!worst || violations.length > worst.bounded_loss_violations.length) {
        worst = entry;
      }
    }

    if (log.length < max_log) log.push(entry);

    if (opts.fail_fast && violations.length > 0) break;
  }

  const total = canonical_trace.length;
  const violation_rate = total === 0 ? 0 : violation_step_count / total;
  const pass = violation_rate <= 0.0001; // ≥ 99.99% violation-free

  return {
    total_steps: total,
    digest_match_count,
    violation_step_count,
    total_violation_count,
    worst_step: worst,
    pass_criterion_hit: pass,
    duration_ms: Date.now() - t_start,
    log,
  };
}

/**
 * A reference replayer: uses the canonical encodeStep to produce the "runtime"
 * spikes. Useful as a sanity harness — Stage C should trivially pass with this.
 * Real integrations replace this with a genuine SNN runtime adapter.
 */
export function referenceReplayer(canonical_trace: CanonicalStep[]): SNNReplayer {
  // Precompute expected spikes per step (deterministic, same inputs every call)
  const byStep = new Map<number, Spike[]>();
  for (const s of canonical_trace) {
    const quanta: Record<string, number> = {};
    if (s.floats) for (const f of Object.keys(s.floats)) quanta[f] = quantumForField(f);
    if (s.vectors) for (const f of Object.keys(s.vectors)) quanta[f] = quantumForField(f);
    const batch = encodeStep({ step: s.step, floats: s.floats, vectors: s.vectors }, quanta);
    byStep.set(s.step, batch.spikes);
  }
  return {
    replayStep(step: number): Spike[] {
      return byStep.get(step) ?? [];
    },
  };
}
