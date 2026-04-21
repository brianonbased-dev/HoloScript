import type { SimSolver } from './SimSolver';
import { ContractedSimulation, type ContractConfig } from './SimulationContract';
import {
  type CAELTrace,
  decodeCAELValue,
  parseCAELJSONL,
  verifyCAELHashChain,
} from './CAELTrace';

type SolverFactory = (config: Record<string, unknown>) => SimSolver;

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

  async replay(solverFactory: SolverFactory): Promise<ContractedSimulation> {
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
          this.validateDigests(i, 'step', entry.payload.stateDigests, actualDigests);
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
          this.validateDigests(i, 'solve', entry.payload.stateDigests, actualDigests);
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
   * replay. Same-adapter mismatch is a hard error: the replay diverged
   * from the recorded state, which is a state-integrity violation.
   *
   * Cross-adapter mismatch is expected per Appendix A Lemma 3 (regime
   * boundary at n* ≈ 416 for structural stress, probability-1 in the
   * long-trace regime). 5a/5b dispatch is founder-routed; until that
   * lands, this replayer is Item-5a-style (strict enforcement always).
   * The cael.init payload schema extension needed for adapter
   * fingerprinting (F10) is a sub-dependency of 5b and not yet
   * implemented.
   *
   * Backward compat: traces recorded BEFORE Wave-2 item 5a have no
   * `stateDigests` field. Validation is skipped silently in that case.
   * New recorders always capture digests.
   *
   * Fail-closed on NaN: if computeStateDigest throws a state-integrity
   * violation (non-finite value per Wave-1.5 guard), the error
   * propagates up through `contracted.step()` or `contracted.solve()`
   * and bypasses this validator entirely — the replayer inherits the
   * same fail-closed semantics as the contract itself.
   */
  private validateDigests(
    eventIndex: number,
    eventLabel: string,
    expected: unknown,
    actual: readonly string[],
  ): void {
    // Backward compat: absent or malformed field → skip validation
    if (!Array.isArray(expected)) return;

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
