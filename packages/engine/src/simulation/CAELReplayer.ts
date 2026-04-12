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
          contracted.step(wallDelta);
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
          await contracted.solve();
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
}
