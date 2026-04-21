import type { SimSolver } from './SimSolver';
import {
  ContractedSimulation,
  type ContractConfig,
  type SimulationProvenance,
} from './SimulationContract';
import {
  type CAELTrace,
  type CAELTraceEntry,
  encodeCAELValue,
  hashCAELEntry,
  toCAELJSONL,
} from './CAELTrace';

export class CAELRecorder {
  private readonly solver: SimSolver;
  private readonly contracted: ContractedSimulation;
  private readonly runId: string;
  private readonly trace: CAELTrace = [];
  private lastHash = 'cael.genesis';

  constructor(
    solver: SimSolver,
    config: Record<string, unknown>,
    contractConfig: ContractConfig = {}
  ) {
    this.solver = solver;
    this.contracted = new ContractedSimulation(solver, config, contractConfig);
    this.runId = `cael-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const replay = this.contracted.createReplay();
    this.append('init', 0, {
      solverType: replay.solverType,
      geometryHash: replay.geometryHash,
      config: encodeCAELValue(config),
      contractConfig: encodeCAELValue(contractConfig),
    });
  }

  getContractedSimulation(): ContractedSimulation {
    return this.contracted;
  }

  getSolver(): SimSolver {
    return this.solver;
  }

  step(wallDelta: number): number {
    // Route 2b state-digest capture (Wave-2 item 5a): snapshot the
    // digest array length before and after so we record only the
    // digests produced by THIS step's inner sub-steps. These land in
    // the trace payload and become the expected-digest oracle against
    // which CAELReplayer compares its own re-computed digests at
    // replay time. Same-adapter divergence is a hard error at replay;
    // cross-adapter divergence (per Appendix A Lemma 3 regime) is
    // founder-routed 5a/5b.
    const digestsBefore = this.contracted.getStateDigests().length;
    const stepsTaken = this.contracted.step(wallDelta);
    const newDigests = this.contracted.getStateDigests().slice(digestsBefore);
    const prov = this.contracted.getProvenance();
    this.append('step', prov.totalSimTime, {
      wallDelta,
      stepsTaken,
      totalSteps: prov.totalSteps,
      stateDigests: newDigests,
    });
    return stepsTaken;
  }

  async solve(): Promise<void> {
    // Route 2d terminal-digest capture (Wave-2 item 6 companion):
    // solve() pushes a single terminal digest to stateDigests[]; we
    // record it into the 'solve' event payload so the replayer can
    // validate that the steady-state converged to the same lattice
    // point as the original run.
    const digestsBefore = this.contracted.getStateDigests().length;
    await this.contracted.solve();
    const newDigests = this.contracted.getStateDigests().slice(digestsBefore);
    const prov = this.contracted.getProvenance();
    this.append('solve', prov.totalSimTime, {
      finalStats: encodeCAELValue(prov.finalStats),
      stateDigests: newDigests,
    });
  }

  logInteraction(type: string, data: Record<string, unknown>): void {
    this.contracted.logInteraction(type, data);
    const prov = this.contracted.getProvenance();
    const last = prov.interactions[prov.interactions.length - 1];
    this.append('interaction', prov.totalSimTime, {
      id: last?.id ?? null,
      type,
      data: encodeCAELValue(data),
    });
  }

  finalize(): SimulationProvenance {
    const prov = this.contracted.getProvenance();
    this.append('final', prov.totalSimTime, {
      provenance: encodeCAELValue(prov),
    });
    return prov;
  }

  getTrace(): CAELTrace {
    return this.trace.slice();
  }

  toJSONL(): string {
    return toCAELJSONL(this.trace);
  }

  dispose(): void {
    this.contracted.dispose();
  }

  private append(event: CAELTraceEntry['event'], simTime: number, payload: Record<string, unknown>): void {
    const entryWithoutHash = {
      version: 'cael.v1' as const,
      runId: this.runId,
      index: this.trace.length,
      event,
      timestamp: Date.now(),
      simTime,
      prevHash: this.lastHash,
      payload,
    };

    const hash = hashCAELEntry(entryWithoutHash);
    const entry: CAELTraceEntry = { ...entryWithoutHash, hash };
    this.trace.push(entry);
    this.lastHash = hash;
  }
}
