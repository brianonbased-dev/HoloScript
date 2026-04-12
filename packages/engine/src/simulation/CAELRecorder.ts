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

  step(wallDelta: number): number {
    const stepsTaken = this.contracted.step(wallDelta);
    const prov = this.contracted.getProvenance();
    this.append('step', prov.totalSimTime, {
      wallDelta,
      stepsTaken,
      totalSteps: prov.totalSteps,
    });
    return stepsTaken;
  }

  async solve(): Promise<void> {
    await this.contracted.solve();
    const prov = this.contracted.getProvenance();
    this.append('solve', prov.totalSimTime, {
      finalStats: encodeCAELValue(prov.finalStats),
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
