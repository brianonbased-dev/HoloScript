import type { SimSolver } from './SimSolver';
import { ContractedSimulation, type ContractConfig } from './SimulationContract';
import {
  type CAELTrace,
  decodeCAELValue,
  parseCAELJSONL,
  verifyCAELHashChain,
} from './CAELTrace';

type SolverFactory = (config: Record<string, unknown>) => SimSolver;

/**
 * Options for CAELReplayer.replay().
 *
 * Item 5b (paper-3 §5.2 Algorithm 1 dispatch): the replayer compares
 * the trace's recorded adapter fingerprint (cael.init.payload.
 * adapterFingerprint) against the current replay environment's
 * fingerprint. Matching fingerprints → same-adapter → strict digest
 * enforcement. Differing (or either absent) → cross-adapter → skip
 * digest enforcement (per Appendix A Lemma 3 regime where per-step
 * digest identity is not expected across adapters).
 */
export interface ReplayOptions {
  /** Adapter fingerprint of the CURRENT replay environment. In
   *  production this is vendor+architecture+device+driver+UA (matching
   *  the format used at record time); in tests any stable string.
   *  If omitted, replayer treats the replay as cross-adapter (safe
   *  fallback — no strict enforcement, dispute oracle falls through
   *  to metric comparison). */
  currentAdapterFingerprint?: string;
}

export class CAELReplayer {
  private readonly trace: CAELTrace;

  constructor(jsonlOrTrace: string | CAELTrace) {
    this.trace = typeof jsonlOrTrace === 'string' ? parseCAELJSONL(jsonlOrTrace) : jsonlOrTrace;
  }

  getTrace(): CAELTrace {
    return this.trace.slice();
  }

  verify(): { valid: boolean; brokenAt?: number; reason?: string } {
    return verifyCAELHashChain(this.trace);
  }

  /**
   * sameAdapter predicate (Item 5b): compares the trace's recorded
   * adapter fingerprint against the replay environment's current
   * fingerprint. Both must be present as non-empty strings AND equal
   * for sameAdapter() to return true. Any null/undefined/empty or
   * mismatch returns false (cross-adapter fallback).
   *
   * Exposed as a public static helper because paper-3 §5.2
   * Algorithm 1's pseudocode uses sameAdapter() in the dispute
   * oracle's dispatch branch; external code (dispute oracle, CRDT
   * merge) can reuse the same predicate for consistent semantics.
   */
  static sameAdapter(
    recordedFingerprint: string | null | undefined,
    currentFingerprint: string | null | undefined,
  ): boolean {
    if (!recordedFingerprint || !currentFingerprint) return false;
    return recordedFingerprint === currentFingerprint;
  }

  async replay(
    solverFactory: SolverFactory,
    options: ReplayOptions = {},
  ): Promise<ContractedSimulation> {
    const verification = this.verify();
    if (!verification.valid) {
      throw new Error(`Invalid CAEL hash chain: ${verification.reason ?? 'unknown reason'}`);
    }
    if (this.trace.length === 0) {
      throw new Error('CAEL trace is empty');
    }

    const init = this.trace[0];
    if (init.event !== 'init') {
      throw new Error(`CAEL trace must start with init event, got ${init.event}`);
    }

    const config = decodeCAELValue(init.payload.config) as Record<string, unknown>;
    const contractConfig = (decodeCAELValue(init.payload.contractConfig) as ContractConfig | undefined) ?? {};

    // Item 5b dispatch: compare the trace's recorded adapter fingerprint
    // (captured at record-time by CAELRecorder) against the replay
    // environment's current fingerprint (passed in via ReplayOptions).
    // Same-adapter → strict digest enforcement (Item 5a behavior).
    // Cross-adapter → skip digest enforcement (fall through to
    // metric-comparison in the dispute oracle, per Appendix A Lemma 3
    // regime boundary for cross-adapter replay).
    const recordedAdapterFingerprint = typeof init.payload.adapterFingerprint === 'string'
      ? init.payload.adapterFingerprint
      : null;
    const currentAdapterFingerprint = options.currentAdapterFingerprint ?? null;
    const isSameAdapter = CAELReplayer.sameAdapter(
      recordedAdapterFingerprint,
      currentAdapterFingerprint,
    );

    const solver = solverFactory(config);
    const contracted = new ContractedSimulation(solver, config, contractConfig);

    const expectedGeometryHash = init.payload.geometryHash;
    const replayGeometryHash = contracted.createReplay().geometryHash;
    if (typeof expectedGeometryHash === 'string' && replayGeometryHash !== expectedGeometryHash) {
      throw new Error(
        `CAEL replay geometry mismatch: expected ${expectedGeometryHash}, got ${replayGeometryHash}`
      );
    }

    for (let i = 1; i < this.trace.length; i++) {
      const entry = this.trace[i];
      switch (entry.event) {
        case 'step': {
          const wallDelta = entry.payload.wallDelta;
          if (typeof wallDelta !== 'number') {
            throw new Error(`CAEL step event at index ${i} missing numeric wallDelta`);
          }
          const digestsBefore = contracted.getStateDigests().length;
          contracted.step(wallDelta);
          const actualDigests = contracted.getStateDigests().slice(digestsBefore);
          this.validateDigests(i, 'step', entry.payload.stateDigests, actualDigests, isSameAdapter);
          break;
        }
        case 'interaction': {
          const type = entry.payload.type;
          const data = decodeCAELValue(entry.payload.data);
          if (typeof type !== 'string' || !data || typeof data !== 'object') {
            throw new Error(`CAEL interaction event at index ${i} has invalid payload`);
          }
          contracted.logInteraction(type, data as Record<string, unknown>);
          break;
        }
        case 'solve': {
          const digestsBefore = contracted.getStateDigests().length;
          await contracted.solve();
          const actualDigests = contracted.getStateDigests().slice(digestsBefore);
          this.validateDigests(i, 'solve', entry.payload.stateDigests, actualDigests, isSameAdapter);
          break;
        }
        case 'final':
          // Final event is informational; state already replayed.
          break;
        case 'init':
          // Ignore repeated init events for forward compatibility.
          break;
        default:
          throw new Error(`Unknown CAEL event at index ${i}`);
      }
    }

    return contracted;
  }

  /**
   * Validate per-step (Route 2b) or terminal (Route 2d) state digests
   * captured by CAELRecorder against the digests re-computed during
   * replay.
   *
   * Item 5b dispatch (founder-approved 2026-04-20):
   *   - same-adapter → strict enforcement: mismatch is a hard error,
   *     indicating state-integrity violation (replay diverged from
   *     recorded state on the same physical adapter, which should not
   *     happen under a deterministic contract).
   *   - cross-adapter → skip validation: per Appendix A Lemma 3, the
   *     per-step straddle probability p_f is non-zero across adapters,
   *     and digest-sequence mismatch over n steps is *expected* in the
   *     regime n > n* (~416 for structural stress). Disputes between
   *     cross-adapter branches fall through to end-to-end metric
   *     comparison in the dispute oracle (paper-3 §5.2 Algorithm 1's
   *     else branch).
   *
   * Backward compat:
   *   - Traces recorded BEFORE Wave-2 item 5a have no `stateDigests`
   *     field. Validation is skipped silently for absent/malformed
   *     fields (Array.isArray guard).
   *   - Traces recorded BEFORE Item 5b have no `adapterFingerprint`
   *     field; isSameAdapter evaluates to false (cross-adapter
   *     fallback), so validation is skipped. This is the safe default.
   *
   * Fail-closed on NaN: if computeStateDigest throws a state-integrity
   * violation (non-finite value per Wave-1.5 guard), the error
   * propagates up through `contracted.step()` or `contracted.solve()`
   * and bypasses this validator entirely — the replayer inherits the
   * same fail-closed semantics as the contract itself, even on
   * cross-adapter replays where digest comparison is skipped.
   */
  private validateDigests(
    eventIndex: number,
    eventLabel: string,
    expected: unknown,
    actual: readonly string[],
    isSameAdapter: boolean,
  ): void {
    // Backward compat: absent or malformed field → skip validation
    if (!Array.isArray(expected)) return;

    // Item 5b dispatch: skip strict enforcement on cross-adapter
    // replays. Mismatch would be expected, not a bug. Dispute oracle
    // handles cross-adapter resolution via metric comparison.
    if (!isSameAdapter) return;

    if (expected.length !== actual.length) {
      throw new Error(
        `[CAELReplayer] state-digest count mismatch at ${eventLabel} event (index ${eventIndex}): ` +
        `expected ${expected.length} digest(s), got ${actual.length}. ` +
        `Replay produced a different number of sub-steps/solves than the recorded trace — ` +
        `this indicates the replay diverged before the digest comparison could even run.`,
      );
    }

    for (let j = 0; j < actual.length; j++) {
      const e = expected[j];
      const a = actual[j];
      if (typeof e !== 'string') {
        throw new Error(
          `[CAELReplayer] malformed expected digest at ${eventLabel} event (index ${eventIndex}, sub-step ${j}): ` +
          `expected string, got ${typeof e}.`,
        );
      }
      if (e !== a) {
        throw new Error(
          `[CAELReplayer] state-digest mismatch at ${eventLabel} event (index ${eventIndex}, sub-step ${j}): ` +
          `expected "${e}", got "${a}". Trace divergence detected — replay state drifted from recorded state. ` +
          `For same-adapter replay this is a state-integrity violation. For cross-adapter replay this can be ` +
          `expected per Appendix A Lemma 3 regime (founder-routed 5a/5b dispatch pending).`,
        );
      }
    }
  }
}
