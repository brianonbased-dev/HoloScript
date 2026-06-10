import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Lazy import to avoid breaking tests when @holoscript/engine isn't resolvable
let _Simulation: typeof import('@holoscript/engine').Simulation | null = null;
let _solversInitialized = false;
async function getSimulation() {
  if (!_Simulation) {
    const mod = await import('@holoscript/engine');
    _Simulation = mod.Simulation;
    // Ensure SimulationSolverFactory is populated so trait handlers can
    // instantiate solvers. Idempotent — no-ops if already registered
    // (e.g., by SimulationProvider in React context). Guard against
    // incomplete mocks in tests that don't provide initSimulationSolvers.
    if (!_solversInitialized && typeof mod.Simulation.initSimulationSolvers === 'function') {
      mod.Simulation.initSimulationSolvers();
      _solversInitialized = true;
    }
  }
  return _Simulation;
}

const traceRegistry = new Map<string, string>();

type TraceEvent = 'init' | 'step' | 'interaction' | 'solve' | 'final';
type NumberTriple = [number, number, number];
type HashMode = 'fnv1a' | 'sha256';
type DigestField = Float32Array | Float64Array | { data?: Float32Array | Float64Array };
type DigestSolver = {
  fieldNames: readonly string[];
  getField(name: string): DigestField | null;
};
type ComputeStateDigest = (solver: DigestSolver, hashMode: HashMode) => string;
type HashGeometry = (
  vertices: Float64Array | Float32Array | undefined,
  elements: Uint32Array | undefined,
  mode?: HashMode
) => string;
type SimulationModule = Awaited<ReturnType<typeof getSimulation>>;
type ThermalDigestSource = {
  getTemperatureField(): Float32Array | Float64Array | number[];
};

const LEGACY_THERMAL_FACE_MAP: Record<string, string> = {
  x0: 'x-',
  x1: 'x+',
  y0: 'y-',
  y1: 'y+',
  z0: 'z-',
  z1: 'z+',
};

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
    const arr = value as unknown as {
      constructor: { name: string };
      length: number;
      [index: number]: number;
    };
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asTriple(value: unknown, fallback: NumberTriple): NumberTriple {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  const tuple = value.slice(0, 3).map((v, i) => asNumber(v, fallback[i])) as NumberTriple;
  return tuple;
}

function normalizeStructuralConfig(config: Record<string, unknown>): Record<string, unknown> {
  // Pass-through: already engine-shaped (vertices/tetrahedra typed arrays + loads).
  if (config.vertices !== undefined || config.tetrahedra !== undefined) return config;

  // Map the advertised MCP schema {nodes, elements, materials, forces, constraints}
  // → solver TET10Config {vertices, tetrahedra, material, loads, constraints}. The
  // structural path previously bypassed normalization (only thermal was mapped), so a
  // schema-correct config hit `config.vertices.length` on undefined and crashed.
  const nodes = Array.isArray(config.nodes) ? config.nodes : [];
  const elements = Array.isArray(config.elements) ? config.elements : [];

  if (nodes.length === 0)
    throw new Error(
      'solve_structural: config.nodes must be a non-empty array of [x,y,z] coordinates'
    );
  if (elements.length === 0)
    throw new Error(
      'solve_structural: config.elements must be a non-empty array of 10-node TET10 index arrays'
    );

  const vertices = new Float64Array(nodes.length * 3);
  nodes.forEach((node, i) => {
    const [x, y, z] = asTriple(node, [0, 0, 0]);
    vertices[i * 3] = x;
    vertices[i * 3 + 1] = y;
    vertices[i * 3 + 2] = z;
  });

  const tetrahedra = new Uint32Array(elements.length * 10);
  elements.forEach((el, e) => {
    if (!Array.isArray(el) || el.length !== 10) {
      throw new Error(
        `solve_structural: element ${e} must have exactly 10 node indices (TET10), got ${Array.isArray(el) ? el.length : typeof el}`
      );
    }
    for (let a = 0; a < 10; a++) {
      const idx = asNumber(el[a], -1);
      if (!Number.isInteger(idx) || idx < 0 || idx >= nodes.length) {
        throw new Error(
          `solve_structural: element ${e} node ${a} index ${el[a]} out of range [0, ${nodes.length - 1}]`
        );
      }
      tetrahedra[e * 10 + a] = idx;
    }
  });

  const mat = asRecord(config.materials) ?? asRecord(config.material) ?? {};
  const material = {
    youngs_modulus: asNumber(mat.E ?? mat.youngs_modulus, 200e9),
    poisson_ratio: asNumber(mat.nu ?? mat.poisson_ratio, 0.3),
    yield_strength: asNumber(mat.yield_strength ?? mat.yieldStrength, 250e6),
    density: asNumber(mat.density, 7850),
  };

  const rawConstraints = Array.isArray(config.constraints) ? config.constraints : [];
  const constraints = rawConstraints.map((raw, i) => {
    const c = asRecord(raw) ?? {};
    const nodeIndex = asNumber(c.nodeIndex, -1);
    if (nodeIndex < 0 || nodeIndex >= nodes.length) {
      throw new Error(
        `solve_structural: constraint ${i} nodeIndex ${c.nodeIndex} out of range [0, ${nodes.length - 1}]`
      );
    }
    const dofs = [c.dx === true ? 0 : -1, c.dy === true ? 1 : -1, c.dz === true ? 2 : -1].filter(
      (d): d is 0 | 1 | 2 => d >= 0
    );
    // No axis flagged → treat as fully fixed (matches "fix this node" intent).
    const allFixed = dofs.length === 0 || dofs.length === 3;
    return allFixed
      ? { id: `c-${i}`, type: 'fixed' as const, nodes: [nodeIndex] }
      : { id: `c-${i}`, type: 'roller' as const, nodes: [nodeIndex], dofs };
  });

  const rawForces = Array.isArray(config.forces) ? config.forces : [];
  const loads = rawForces.map((raw, i) => {
    const f = asRecord(raw) ?? {};
    const nodeIndex = asNumber(f.nodeIndex, -1);
    if (nodeIndex < 0 || nodeIndex >= nodes.length) {
      throw new Error(
        `solve_structural: force ${i} nodeIndex ${f.nodeIndex} out of range [0, ${nodes.length - 1}]`
      );
    }
    return {
      id: `f-${i}`,
      type: 'point' as const,
      nodeIndex,
      force: [asNumber(f.fx, 0), asNumber(f.fy, 0), asNumber(f.fz, 0)] as [number, number, number],
    };
  });

  return {
    vertices,
    tetrahedra,
    material,
    constraints,
    loads,
    useGPU: config.useGPU === true, // default CPU on server (no WebGPU) — avoids GPU init churn
    ...(typeof config.maxIterations === 'number' ? { maxIterations: config.maxIterations } : {}),
    ...(typeof config.tolerance === 'number' ? { tolerance: config.tolerance } : {}),
    ...(config.nonlinear === true ? { nonlinear: true } : {}),
  };
}

function normalizeThermalSource(value: unknown, index: number): Record<string, unknown> | null {
  const source = asRecord(value);
  if (!source) return null;
  const position = asTriple(source.position, [0, 0, 0]);
  return {
    ...source,
    id: asString(source.id, `source-${index}`),
    type: asString(source.type, 'point'),
    position,
    heat_output: asNumber(source.heat_output ?? source.power, 0),
    active: source.active !== false,
  };
}

function normalizeThermalBoundary(value: unknown): Record<string, unknown> | null {
  const bc = asRecord(value);
  if (!bc) return null;
  const faces = Array.isArray(bc.faces)
    ? bc.faces
    : [LEGACY_THERMAL_FACE_MAP[String(bc.face)] ?? bc.face].filter(
        (face): face is string => typeof face === 'string'
      );
  return {
    ...bc,
    faces,
  };
}

function normalizeThermalConfig(config: Record<string, unknown>): Record<string, unknown> {
  const gridResolution = asTriple(config.gridResolution ?? config.gridSize, [3, 3, 3]).map((n) =>
    Math.max(2, Math.trunc(n))
  ) as NumberTriple;
  const spacing = asNumber(config.spacing, 1);
  const fallbackDomainSize = gridResolution.map((n) =>
    Math.max(spacing, (n - 1) * spacing)
  ) as NumberTriple;
  const domainSize = asTriple(config.domainSize, fallbackDomainSize);
  const defaultMaterial = asString(config.defaultMaterial, 'water');
  const materialOverride = asRecord(config.material);
  const materials = { ...(asRecord(config.materials) ?? {}) };

  if (materialOverride) {
    materials[defaultMaterial] = {
      ...(asRecord(materials[defaultMaterial]) ?? {}),
      ...materialOverride,
    };
  }

  const rawSources = Array.isArray(config.sources) ? config.sources : [];
  const sources = rawSources
    .map((source, index) => normalizeThermalSource(source, index))
    .filter((source): source is Record<string, unknown> => source !== null);

  const rawBoundaryConditions = Array.isArray(config.boundaryConditions)
    ? config.boundaryConditions
    : [];
  const boundaryConditions = rawBoundaryConditions
    .map((bc) => normalizeThermalBoundary(bc))
    .filter((bc): bc is Record<string, unknown> => bc !== null);

  return {
    ...config,
    gridResolution,
    domainSize,
    timeStep: asNumber(config.timeStep, 0.01),
    materials,
    defaultMaterial,
    boundaryConditions,
    sources,
    initialTemperature: asNumber(config.initialTemperature, 20),
  };
}

function verifyHashChain(trace: TraceEntry[]): {
  valid: boolean;
  brokenAt?: number;
  reason?: string;
} {
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

function getComputeStateDigest(Sim: SimulationModule): ComputeStateDigest | null {
  const candidate = (Sim as unknown as { computeStateDigest?: unknown }).computeStateDigest;
  return typeof candidate === 'function' ? (candidate as ComputeStateDigest) : null;
}

function getHashGeometry(Sim: SimulationModule): HashGeometry | null {
  const candidate = (Sim as unknown as { hashGeometry?: unknown }).hashGeometry;
  return typeof candidate === 'function' ? (candidate as HashGeometry) : null;
}

/**
 * Compute a geometry hash for a structural mesh.
 *
 * Delegates to Simulation.hashGeometry (hashes.ts) which uses FNV-1a over
 * canonicalized vertex coordinates and connectivity indices.  Falls back to a
 * local FNV-1a digest of the buffer lengths when the engine export is absent
 * (e.g., in test environments that do not expose hashGeometry).
 */
function computeStructuralGeometryHash(
  Sim: SimulationModule,
  solverConfig: Record<string, unknown>,
  hashMode: HashMode
): string {
  const hashGeometryFn = getHashGeometry(Sim);
  const vertices =
    solverConfig.vertices instanceof Float64Array || solverConfig.vertices instanceof Float32Array
      ? (solverConfig.vertices as Float64Array | Float32Array)
      : undefined;
  const tetrahedra =
    solverConfig.tetrahedra instanceof Uint32Array
      ? (solverConfig.tetrahedra as Uint32Array)
      : undefined;

  if (hashGeometryFn && vertices && tetrahedra) {
    return hashGeometryFn(vertices, tetrahedra, hashMode);
  }

  // Fallback: hash the count of vertices and indices as a minimal fingerprint.
  const vLen = vertices ? vertices.length : 0;
  const tLen = tetrahedra ? tetrahedra.length : 0;
  return fnv1a(`geo-fallback:v${vLen}:t${tLen}`);
}

/**
 * Compute a geometry hash for a thermal grid configuration.
 *
 * The thermal solver has no explicit vertex/element mesh — only a
 * structured grid.  We hash the gridResolution and domainSize arrays as
 * a stable content fingerprint so the init trace entry reflects the
 * actual spatial discretization instead of the 'geo-unavailable' placeholder.
 */
function computeThermalGeometryHash(solverConfig: Record<string, unknown>): string {
  const gridRes = Array.isArray(solverConfig.gridResolution)
    ? (solverConfig.gridResolution as number[])
    : [];
  const domainSize = Array.isArray(solverConfig.domainSize)
    ? (solverConfig.domainSize as number[])
    : [];
  const key = `thermal-grid:${gridRes.join('x')}:domain:${domainSize.map((d) => d.toFixed(6)).join('x')}`;
  return `geo-${fnv1a(key).replace('cael-', '')}`;
}

/**
 * Compute a state digest for the structural solver after solve().
 *
 * StructuralSolverTET10 does not expose fieldNames/getField, so we build
 * a synthetic field adapter from the displacement and vonMisesStress arrays
 * and delegate to computeStateDigest.  The field names ('displacement',
 * 'vonMisesStress') match the FIELD_QUANTUM_REGISTRY patterns in hashes.ts
 * so the quantum discretization is physically appropriate.
 */
function computeStructuralStateDigest(
  Sim: SimulationModule,
  displacements: number[] | Float32Array | Float64Array,
  vonMisesStress: number[] | Float32Array | Float64Array,
  hashMode: HashMode
): string | null {
  const computeSD = getComputeStateDigest(Sim);
  if (!computeSD) return null;

  const dispField = toFloatField(
    displacements instanceof Float32Array || displacements instanceof Float64Array
      ? displacements
      : new Float32Array(displacements)
  );
  const vmField = toFloatField(
    vonMisesStress instanceof Float32Array || vonMisesStress instanceof Float64Array
      ? vonMisesStress
      : new Float32Array(vonMisesStress)
  );

  return computeSD(
    {
      fieldNames: ['displacement', 'vonMisesStress'],
      getField(name: string): DigestField | null {
        if (name === 'displacement') return dispField;
        if (name === 'vonMisesStress') return vmField;
        return null;
      },
    },
    hashMode
  );
}

function toFloatField(value: Float32Array | Float64Array | number[]): Float32Array | Float64Array {
  if (value instanceof Float32Array || value instanceof Float64Array) return value;
  return new Float32Array(value);
}

function computeThermalStateDigest(
  Sim: SimulationModule,
  solver: ThermalDigestSource,
  hashMode: HashMode
): string | null {
  const computeStateDigest = getComputeStateDigest(Sim);
  if (!computeStateDigest) return null;

  return computeStateDigest(
    {
      fieldNames: ['temperature'],
      getField(name: string): DigestField | null {
        return name === 'temperature' ? toFloatField(solver.getTemperatureField()) : null;
      },
    },
    hashMode
  );
}

function verifyStateDigests(entry: TraceEntry, actualDigests: readonly string[]): void {
  const expected = entry.payload.stateDigests;
  if (!Array.isArray(expected)) return;

  if (expected.length !== actualDigests.length) {
    throw new Error(
      `state-digest count mismatch at ${entry.event} event (index ${entry.index}): ` +
        `expected ${expected.length}, got ${actualDigests.length}`
    );
  }

  for (let i = 0; i < actualDigests.length; i++) {
    const expectedDigest = expected[i];
    if (typeof expectedDigest !== 'string') {
      throw new Error(
        `malformed state digest at ${entry.event} event (index ${entry.index}, digest ${i})`
      );
    }
    if (expectedDigest !== actualDigests[i]) {
      throw new Error(
        `state-digest mismatch at ${entry.event} event (index ${entry.index}, digest ${i}): ` +
          `expected ${expectedDigest}, got ${actualDigests[i]}`
      );
    }
  }
}

class LocalTraceRecorder {
  private readonly runId = `cael-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly entries: TraceEntry[] = [];
  private prevHash = 'cael.genesis';
  private simTime = 0;
  private steps = 0;
  private readonly hashMode: HashMode = 'fnv1a';

  constructor(
    private solverType: string,
    config: Record<string, unknown>,
    geometryHash: string
  ) {
    this.append('init', {
      solverType,
      config: canonical(config),
      contractConfig: {},
      geometryHash,
      hashMode: this.hashMode,
    });
  }

  step(dt: number, stateDigests: readonly string[] = []): void {
    this.simTime += dt;
    this.steps += 1;
    this.append('step', { wallDelta: dt, stepsTaken: 1, totalSteps: this.steps, stateDigests });
  }

  solve(stateDigests: readonly string[] = []): void {
    this.append('solve', { totalSteps: this.steps, stateDigests });
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
    description:
      'Run a TET10 structural FEA simulation. Returns displacement/stress results + a CAEL trace proving execution integrity. Input: nodes, elements, materials, forces, constraints.',
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
    description:
      'Run a thermal conduction simulation on a structured grid. Returns temperature field + a CAEL trace proving execution integrity. Input: grid, material, sources, BCs.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Thermal solver configuration.',
          properties: {
            gridSize: {
              type: 'array',
              description: 'Legacy alias for gridResolution: grid dimensions [nx, ny, nz].',
              items: { type: 'number' },
            },
            gridResolution: {
              type: 'array',
              description: 'Grid dimensions [nx, ny, nz].',
              items: { type: 'number' },
            },
            spacing: {
              type: 'number',
              description: 'Legacy shortcut for domainSize: grid spacing in meters.',
            },
            domainSize: {
              type: 'array',
              description: 'Physical domain size [lx, ly, lz] in meters.',
              items: { type: 'number' },
            },
            timeStep: {
              type: 'number',
              description: 'Solver time step in seconds.',
            },
            material: {
              type: 'object',
              description: 'Legacy shortcut for materials[defaultMaterial].',
              properties: {
                conductivity: { type: 'number', description: 'Thermal conductivity (W/m·K)' },
              },
            },
            materials: {
              type: 'object',
              description: 'Material name to thermal property overrides.',
            },
            defaultMaterial: {
              type: 'string',
              description: 'Default material name, e.g. water, air, concrete.',
            },
            sources: {
              type: 'array',
              description:
                'Heat sources: array of { id?, type?, position: [x,y,z], heat_output | power, radius?, active? }.',
            },
            boundaryConditions: {
              type: 'array',
              description:
                'BCs: engine shape { faces: ["x-"|"x+"|"y-"|"y+"|"z-"|"z+"], type, value } or legacy { face: "x0"|"x1"|"y0"|"y1"|"z0"|"z1", type, value }.',
            },
            initialTemperature: {
              type: 'number',
              description: 'Initial temperature for the domain.',
            },
          },
        },
      },
      required: ['config'],
    },
  },
  {
    name: 'verify_cael_trace',
    description:
      'Verify a CAEL trace hash-chain for tamper detection. Pass traceId (from solve_* result) or raw JSONL. Returns { valid, entries, brokenAt?, reason? }.',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: 'Trace identifier returned by solve_structural or solve_thermal.',
        },
        traceJSONL: {
          type: 'string',
          description:
            'Raw CAEL trace as newline-delimited JSON. Used directly if provided (traceId ignored).',
        },
      },
    },
  },
];

export async function handleSimulationTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name === 'verify_cael_trace') {
    return verifyTrace(args);
  }

  if (name !== 'solve_structural' && name !== 'solve_thermal') {
    return null;
  }

  const { config } = args as { config: Record<string, unknown> };
  if (!config) throw new Error('config is required for simulation tools');
  const solverConfig =
    name === 'solve_thermal' ? normalizeThermalConfig(config) : normalizeStructuralConfig(config);

  try {
    let recorder: LocalTraceRecorder;
    let result: Record<string, unknown> = {};

    const Sim = await getSimulation();

    if (name === 'solve_structural') {
      const solver = new Sim.StructuralSolverTET10(
        solverConfig as unknown as ConstructorParameters<typeof Sim.StructuralSolverTET10>[0]
      );
      const structGeoHash = computeStructuralGeometryHash(Sim, solverConfig, 'fnv1a');
      recorder = new LocalTraceRecorder(name, solverConfig, structGeoHash);

      await Promise.resolve(solver.solve());
      const displacements = solver.getDisplacements();
      const vonMisesStress = solver.getVonMisesStress();
      const structStateDigest = computeStructuralStateDigest(
        Sim,
        displacements,
        vonMisesStress,
        'fnv1a'
      );
      recorder.solve(structStateDigest ? [structStateDigest] : []);
      result = {
        displacements,
        vonMisesStress,
        safetyFactor: solver.getSafetyFactor(),
      };
    } else {
      const solver = new Sim.ThermalSolver(
        solverConfig as unknown as ConstructorParameters<typeof Sim.ThermalSolver>[0]
      );
      const thermalGeoHash = computeThermalGeometryHash(solverConfig);
      recorder = new LocalTraceRecorder(name, solverConfig, thermalGeoHash);

      const dt = typeof solverConfig.timeStep === 'number' ? solverConfig.timeStep : 0.01;
      const steps =
        typeof (args as { steps?: unknown }).steps === 'number'
          ? (args as { steps: number }).steps | 0
          : 10;

      for (let i = 0; i < Math.max(1, steps); i++) {
        solver.step(dt);
        const stateDigest = computeThermalStateDigest(Sim, solver, 'fnv1a');
        recorder.step(dt, stateDigest ? [stateDigest] : []);
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

  const traceJSONL = traceJSONLFromArgs ?? (traceId ? (traceRegistry.get(traceId) ?? null) : null);
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
  const hashMode: HashMode = init?.payload?.hashMode === 'sha256' ? 'sha256' : 'fnv1a';

  try {
    let totalSteps = 0;
    let totalSimTime = 0;

    const Sim = await getSimulation();

    if (solverType === 'solve_structural') {
      const solver = new Sim.StructuralSolverTET10(
        (init?.payload?.config ?? {}) as unknown as ConstructorParameters<
          typeof Sim.StructuralSolverTET10
        >[0]
      );
      await Promise.resolve(solver.solve());
    } else if (solverType === 'solve_thermal') {
      const solver = new Sim.ThermalSolver(
        (init?.payload?.config ?? {}) as unknown as ConstructorParameters<
          typeof Sim.ThermalSolver
        >[0]
      );
      for (const e of trace) {
        if (e.event === 'step') {
          const dt = Number(e.payload.wallDelta ?? 0.01);
          solver.step(dt);
          const stateDigest = computeThermalStateDigest(Sim, solver, hashMode);
          verifyStateDigests(e, stateDigest ? [stateDigest] : []);
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
