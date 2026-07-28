import { createHash } from 'node:crypto';
import { handleSimulationTool } from './simulation-tools';

export const SOLVER_HEALTH_SCHEMA = 'holoscript.solver-health.v1' as const;

export const SOLVER_HEALTH_CONFIG = Object.freeze({
  gridResolution: [3, 3, 3] as [number, number, number],
  domainSize: [1, 1, 1] as [number, number, number],
  timeStep: 0.01,
  materials: {},
  defaultMaterial: 'water',
  boundaryConditions: [],
  sources: [],
  initialTemperature: 20,
});

type SimulationHandler = (name: string, args: Record<string, unknown>) => Promise<unknown | null>;

export interface SolverHealthReceipt {
  schemaVersion: typeof SOLVER_HEALTH_SCHEMA;
  status: 'healthy';
  success: true;
  service: '@holoscript/mcp-server';
  tool: 'solve_thermal';
  solver: '@holoscript/engine.Simulation.ThermalSolver';
  execution: 'in-process-one-step';
  zeroSpend: true;
  spendUsd: 0;
  credentialUsed: false;
  steps: 1;
  gridResolution: [number, number, number];
  caelTraceId: string;
  traceHash: string;
  device: string;
  generatedAt: string;
  receiptHash: string;
}

interface SolverHealthDependencies {
  handleSimulationToolImpl?: SimulationHandler;
  now?: () => Date;
  platform?: string;
  architecture?: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export async function runSolverHealthProbe(
  dependencies: SolverHealthDependencies = {}
): Promise<SolverHealthReceipt> {
  const simulationHandler = dependencies.handleSimulationToolImpl || handleSimulationTool;
  const result = (await simulationHandler('solve_thermal', {
    config: SOLVER_HEALTH_CONFIG,
    steps: 1,
  })) as {
    success?: unknown;
    error?: unknown;
    caelTraceId?: unknown;
    traceHash?: unknown;
  } | null;

  if (result?.success !== true) {
    throw new Error(
      `solve_thermal health probe failed: ${String(result?.error || 'unknown solver failure')}`
    );
  }
  if (typeof result.caelTraceId !== 'string' || !result.caelTraceId.startsWith('cael:')) {
    throw new Error('solve_thermal health probe did not emit a genuine CAEL trace');
  }
  if (typeof result.traceHash !== 'string' || result.traceHash.length === 0) {
    throw new Error('solve_thermal health probe did not emit a trace hash');
  }

  const platform = dependencies.platform || process.platform;
  const architecture = dependencies.architecture || process.arch;
  const payload = {
    schemaVersion: SOLVER_HEALTH_SCHEMA,
    status: 'healthy' as const,
    success: true as const,
    service: '@holoscript/mcp-server' as const,
    tool: 'solve_thermal' as const,
    solver: '@holoscript/engine.Simulation.ThermalSolver' as const,
    execution: 'in-process-one-step' as const,
    zeroSpend: true as const,
    spendUsd: 0 as const,
    credentialUsed: false as const,
    steps: 1 as const,
    gridResolution: [...SOLVER_HEALTH_CONFIG.gridResolution] as [number, number, number],
    caelTraceId: result.caelTraceId,
    traceHash: result.traceHash,
    device: `CPU-native-${platform}-${architecture}`,
    generatedAt: (dependencies.now || (() => new Date()))().toISOString(),
  };

  return {
    ...payload,
    receiptHash: sha256(canonicalize(payload)),
  };
}
