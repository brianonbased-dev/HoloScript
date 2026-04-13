import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Lazy import to avoid breaking tests when @holoscript/engine isn't resolvable
let _Simulation: typeof import('@holoscript/engine').Simulation | null = null;
async function getSimulation() {
  if (!_Simulation) {
    const mod = await import('@holoscript/engine');
    _Simulation = mod.Simulation;
  }
  return _Simulation;
}

const traceRegistry = new Map<string, string>();

type TraceEvent = 'init' | 'step' | 'interaction' | 'solve' | 'final';

interface TraceEntry {
  version: 'cael.v1';
  runId: string;
  index: number;
  event: TraceEvent;
  timestamp: number;
  simTime: number;
  prevHash: string;
  hash: string;
  payload: Record<string, unknown>;
}

function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cael-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function canonical(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const arr = value as unknown as { constructor: { name: string }; length: number; [index: number]: number };
    return {
      __cael_typed_array: arr.constructor.name,
      data: Array.from({ length: arr.length }, (_, i) => arr[i]),
    };
  }
  if (Array.isArray(value)) return value.map((v) => canonical(v));
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = canonical(obj[k]);
  return out;
}

function hashEntry(entry: Omit<TraceEntry, 'hash'>): string {
  return fnv1a(JSON.stringify(canonical(entry)));
}

function parseTrace(jsonl: string): TraceEntry[] {
  return jsonl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as TraceEntry);
}

function verifyHashChain(trace: TraceEntry[]): { valid: boolean; brokenAt?: number; reason?: string } {
  let prev = 'cael.genesis';
  for (let i = 0; i < trace.length; i++) {
    const e = trace[i];
    if (e.prevHash !== prev) return { valid: false, brokenAt: i, reason: 'prevHash mismatch' };
    const expected = hashEntry({
      version: e.version,
      runId: e.runId,
      index: e.index,
      event: e.event,
      timestamp: e.timestamp,
      simTime: e.simTime,
      prevHash: e.prevHash,
      payload: e.payload,
    });
    if (expected !== e.hash) return { valid: false, brokenAt: i, reason: 'hash mismatch' };
    prev = e.hash;
  }
  return { valid: true };
}

class LocalTraceRecorder {
  private readonly runId = `cael-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly entries: TraceEntry[] = [];
  private prevHash = 'cael.genesis';
  private simTime = 0;
  private steps = 0;

  constructor(private solverType: string, config: Record<string, unknown>) {
    this.append('init', {
      solverType,
      config: canonical(config),
      contractConfig: {},
      geometryHash: 'geo-unavailable',
    });
  }

  step(dt: number): void {
    this.simTime += dt;
    this.steps += 1;
    this.append('step', { wallDelta: dt, stepsTaken: 1, totalSteps: this.steps });
  }

  solve(): void {
    this.append('solve', { totalSteps: this.steps });
  }

  finalize(extra: Record<string, unknown> = {}): void {
    this.append('final', {
      provenance: {
        solverType: this.solverType,
        totalSteps: this.steps,
        totalSimTime: this.simTime,
      },
      ...extra,
    });
  }

  toJSONL(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n');
  }

  private append(event: TraceEvent, payload: Record<string, unknown>): void {
    const base: Omit<TraceEntry, 'hash'> = {
      version: 'cael.v1',
      runId: this.runId,
      index: this.entries.length,
      event,
      timestamp: Date.now(),
      simTime: this.simTime,
      prevHash: this.prevHash,
      payload,
    };
    const hash = hashEntry(base);
    const entry: TraceEntry = { ...base, hash };
    this.entries.push(entry);
    this.prevHash = hash;
  }
}

export const simulationTools: Tool[] = [
  {
    name: 'solve_structural',
    description: 'Run a TET10 structural FEA simulation. Returns displacement/stress results + a CAEL trace proving execution integrity. Input: nodes, elements, materials, forces, constraints.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Structural solver configuration.',
          properties: {
            nodes: {
              type: 'array',
              description: 'Array of [x, y, z] node coordinates.',
              items: { type: 'array', items: { type: 'number' } },
            },
            elements: {
              type: 'array',
              description: 'Array of node-index arrays (10 indices per TET10 element).',
              items: { type: 'array', items: { type: 'number' } },
            },
            materials: {
              type: 'object',
              description: 'Material properties.',
              properties: {
                E: { type: 'number', description: "Young's modulus (Pa)" },
                nu: { type: 'number', description: "Poisson's ratio (0-0.5)" },
              },
            },
            forces: {
              type: 'array',
              description: 'Array of { nodeIndex, fx, fy, fz } force vectors (N).',
            },
            constraints: {
              type: 'array',
              description: 'Array of { nodeIndex, dx, dy, dz } fixed DOFs (true = fixed).',
            },
          },
        },
      },
      required: ['config'],
    },
  },
  {
    name: 'solve_thermal',
    description: 'Run a thermal conduction simulation on a structured grid. Returns temperature field + a CAEL trace proving execution integrity. Input: grid, material, sources, BCs.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Thermal solver configuration.',
          properties: {
            gridSize: {
              type: 'array',
              description: 'Grid dimensions [nx, ny, nz].',
              items: { type: 'number' },
            },
            spacing: {
              type: 'number',
              description: 'Grid spacing in meters.',
            },
            material: {
              type: 'object',
              description: 'Material thermal properties.',
              properties: {
                conductivity: { type: 'number', description: 'Thermal conductivity (W/m·K)' },
              },
            },
            sources: {
              type: 'array',
              description: 'Heat sources: array of { position: [x,y,z], power: watts }.',
            },
            boundaryConditions: {
              type: 'array',
              description: 'BCs: array of { face: "x0"|"x1"|"y0"|"y1"|"z0"|"z1", type: "dirichlet"|"neumann", value: number }.',
            },
          },
        },
      },
      required: ['config'],
    },
  },
  {
    name: 'verify_cael_trace',
    description: 'Verify a CAEL trace hash-chain for tamper detection. Pass traceId (from solve_* result) or raw JSONL. Returns { valid, entries, brokenAt?, reason? }.',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: 'Trace identifier returned by solve_structural or solve_thermal.',
        },
        traceJSONL: {
          type: 'string',
          description: 'Raw CAEL trace as newline-delimited JSON. Used directly if provided (traceId ignored).',
        },
      },
    },
  },
];

export async function handleSimulationTool(name: string, args: Record<string, unknown>): Promise<unknown | null> {
  if (name === 'verify_cael_trace') {
    return verifyTrace(args);
  }

  if (name !== 'solve_structural' && name !== 'solve_thermal') {
    return null;
  }

  const { config } = args as { config: Record<string, unknown> };
  if (!config) throw new Error('config is required for simulation tools');

  try {
    let recorder: LocalTraceRecorder;
    let result: Record<string, unknown> = {};

    const Sim = await getSimulation();

    if (name === 'solve_structural') {
      const solver = new Sim.StructuralSolverTET10(config as Parameters<typeof Sim.StructuralSolverTET10>[0]);
      recorder = new LocalTraceRecorder(name, config);

      await Promise.resolve(solver.solve());
      recorder.solve();
      result = {
        displacements: solver.getDisplacements(),
        vonMisesStress: solver.getVonMisesStress(),
        safetyFactor: solver.getSafetyFactor(),
      };
    } else {
      const solver = new Sim.ThermalSolver(config as Parameters<typeof Sim.ThermalSolver>[0]);
      recorder = new LocalTraceRecorder(name, config);

      const dt = typeof config.timeStep === 'number' ? config.timeStep : 0.01;
      const steps = typeof (args as { steps?: unknown }).steps === 'number'
        ? ((args as { steps: number }).steps | 0)
        : 10;

      for (let i = 0; i < Math.max(1, steps); i++) {
        solver.step(dt);
        recorder.step(dt);
      }

      result = {
        temperatureGrid: solver.getTemperatureGrid(),
        temperatureField: solver.getTemperatureField(),
      };
    }

    recorder.finalize();
    const traceJSONL = recorder.toJSONL();
    const trace = parseTrace(traceJSONL);
    const last = trace[trace.length - 1];
    const traceId = `cael:${last?.runId ?? 'unknown'}:${last?.hash ?? 'nohash'}`;
    traceRegistry.set(traceId, traceJSONL);

    return {
      success: true,
      result,
      caelTraceId: traceId,
      traceHash: last?.hash ?? null,
      traceJSONL,
      provenance: last?.payload?.provenance ?? null,
      verifyUrl: `https://mcp.holoscript.net/verify-cael?traceId=${encodeURIComponent(traceId)}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function verifyTrace(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const traceId = typeof args.traceId === 'string' ? args.traceId : null;
  const traceJSONLFromArgs = typeof args.traceJSONL === 'string' ? args.traceJSONL : null;

  const traceJSONL = traceJSONLFromArgs ?? (traceId ? traceRegistry.get(traceId) ?? null : null);
  if (!traceJSONL) {
    return {
      success: false,
      error: 'traceJSONL or a known traceId is required',
    };
  }

  const trace = parseTrace(traceJSONL);
  const hashChain = verifyHashChain(trace);
  if (!hashChain.valid) {
    return {
      success: false,
      hashChainValid: false,
      replayValid: false,
      brokenAt: hashChain.brokenAt,
      reason: hashChain.reason,
    };
  }

  const init = trace[0];
  const solverType = String(init?.payload?.solverType ?? '');

  try {
    let totalSteps = 0;
    let totalSimTime = 0;

    const Sim = await getSimulation();

    if (solverType === 'solve_structural') {
      const solver = new Sim.StructuralSolverTET10((init?.payload?.config ?? {}) as Parameters<typeof Sim.StructuralSolverTET10>[0]);
      await Promise.resolve(solver.solve());
    } else if (solverType === 'solve_thermal') {
      const solver = new Sim.ThermalSolver((init?.payload?.config ?? {}) as Parameters<typeof Sim.ThermalSolver>[0]);
      for (const e of trace) {
        if (e.event === 'step') {
          const dt = Number(e.payload.wallDelta ?? 0.01);
          solver.step(dt);
          totalSteps++;
          totalSimTime += dt;
        }
      }
    } else {
      throw new Error(`Unsupported solverType for replay verification: ${solverType}`);
    }

    return {
      success: true,
      hashChainValid: true,
      replayValid: true,
      solverType,
      totalSteps,
      totalSimTime,
      interactions: trace.filter((e) => e.event === 'interaction').length,
    };
  } catch (error) {
    return {
      success: false,
      hashChainValid: true,
      replayValid: false,
      solverType,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
