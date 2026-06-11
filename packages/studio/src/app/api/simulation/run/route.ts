/**
 * POST /api/simulation/run
 *
 * Run a named simulation solver for a fixed number of steps and return
 * the final state as a JSON payload suitable for client-side rendering.
 *
 * Request body (JSON):
 *   {
 *     solver:  string             — SimulationSolverFactory registry key
 *     config:  object             — solver-specific config (passed through registry parsers)
 *     steps?:  number             — steps to advance (default 100, max 2000; transient only)
 *     dt?:     number             — time step per step (default solver-appropriate; must be > 0)
 *   }
 *
 * Response 200 (JSON):
 *   {
 *     kind: 'particles' | 'scalarField',
 *     // particles (dem-granular, molecular-dynamics): flat xyz positions
 *     positions?: number[],
 *     // scalarField (thermal, reaction-diffusion): grid dimensions + values
 *     field?: { resolution: [number,number,number], values: number[] },
 *     stats: object,                 — solver getStats() result
 *     runReport: {
 *       solver: string,
 *       steps: number,
 *       dt: number,
 *       finalStateDigest: string,    — sha256 hex of final field/positions bytes
 *       wallMs: number,
 *       fieldNames: string[],
 *     },
 *   }
 *
 * Response 400:
 *   { error: string }
 *
 * Safety limits (enforced, not advisory):
 *   - Only ALLOWED_SOLVERS are accepted; others return 400 listing valid options.
 *   - steps clamped to [1, MAX_STEPS].
 *   - For grid solvers: gridResolution/grid_resolution axes clamped to MAX_GRID_AXIS.
 *   - For particle solvers: particleCount clamped to MAX_PARTICLES.
 *   - dt must be finite and > 0.
 *
 * Engine loading: same webpackIgnore pattern as the manufacturing/mesh route so
 * the engine is never bundled into the client-side webpack graph.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

// ── Engine type-only imports (no runtime cost; erased at compile time) ────────
// We import the engine namespace type for getStats() shape — the real module is
// loaded at request time via the webpackIgnore dynamic import below.
import type * as EngineNS from '@holoscript/engine';

// ── Constants ────────────────────────────────────────────────────────────────

/** Allowlisted solver keys. Requests for any other key return 400. */
const ALLOWED_SOLVERS = ['thermal', 'dem-granular', 'reaction-diffusion', 'molecular-dynamics'] as const;
type AllowedSolver = (typeof ALLOWED_SOLVERS)[number];

const DEFAULT_STEPS = 100;
const MAX_STEPS = 2000;
const MAX_GRID_AXIS = 48;
const MAX_PARTICLES = 5000;
const DEFAULT_DT: Record<AllowedSolver, number> = {
  thermal: 0.01,
  'dem-granular': 0.005,
  'reaction-diffusion': 0.5,
  'molecular-dynamics': 0.002,
};

// ── Engine loader ─────────────────────────────────────────────────────────────

/**
 * Load @holoscript/engine at runtime, bypassing webpack.
 *
 * next.config.js aliases '@holoscript/engine' to an empty stub in webpack
 * (engine is Node-heavy and must not reach client bundles). The webpackIgnore
 * comment prevents Next.js from resolving this import at build time, so Node
 * resolves the real package at request time — identical to the pattern used in
 * packages/studio/src/app/api/manufacturing/mesh/route.ts.
 */
async function loadEngine(): Promise<typeof EngineNS> {
  return (await import(
    /* webpackIgnore: true */ '@holoscript/engine'
  )) as typeof EngineNS;
}

// ── Validation helpers ────────────────────────────────────────────────────────

function isAllowedSolver(v: unknown): v is AllowedSolver {
  return typeof v === 'string' && (ALLOWED_SOLVERS as readonly string[]).includes(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFinitePositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Clamp gridResolution / grid_resolution fields in the config in-place. */
function clampGridResolution(cfg: Record<string, unknown>): void {
  for (const key of ['gridResolution', 'grid_resolution']) {
    const r = cfg[key];
    if (Array.isArray(r) && r.length >= 3) {
      cfg[key] = [
        Math.min(Number(r[0]) || MAX_GRID_AXIS, MAX_GRID_AXIS),
        Math.min(Number(r[1]) || MAX_GRID_AXIS, MAX_GRID_AXIS),
        Math.min(Number(r[2]) || MAX_GRID_AXIS, MAX_GRID_AXIS),
      ];
    }
  }
}

/** Clamp particleCount field in the config in-place. */
function clampParticleCount(cfg: Record<string, unknown>): void {
  if (typeof cfg['particleCount'] === 'number') {
    cfg['particleCount'] = Math.min(cfg['particleCount'] as number, MAX_PARTICLES);
  }
}

// ── SHA-256 state digest ──────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hex digest over the raw bytes of a typed
 * numeric array. For Float64Array the byte-level layout is platform-dependent
 * with respect to endianness, but we are server-side (little-endian x86) and
 * the digest is used as a run fingerprint (not a portable canonical hash), so
 * platform endianness is acceptable here.
 */
function stateDigest(data: Float32Array | Float64Array | number[]): string {
  let buf: Buffer;
  if (data instanceof Float64Array) {
    buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof Float32Array) {
    buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else {
    // Plain number[] — convert to Float64
    const f64 = new Float64Array(data);
    buf = Buffer.from(f64.buffer);
  }
  return createHash('sha256').update(buf).digest('hex');
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const raw = body;

  // Validate solver
  if (!isAllowedSolver(raw['solver'])) {
    return NextResponse.json(
      {
        error: `Unknown solver "${String(raw['solver'])}". Allowed: ${ALLOWED_SOLVERS.join(', ')}`,
      },
      { status: 400 }
    );
  }
  const solver = raw['solver'];

  // Validate config
  if (raw['config'] !== undefined && !isPlainObject(raw['config'])) {
    return NextResponse.json({ error: '`config` must be a plain object' }, { status: 400 });
  }
  const config: Record<string, unknown> = isPlainObject(raw['config'])
    ? { ...(raw['config'] as Record<string, unknown>) }
    : {};

  // Validate steps
  let steps = DEFAULT_STEPS;
  if (raw['steps'] !== undefined) {
    const s = Number(raw['steps']);
    if (!Number.isInteger(s) || s < 1) {
      return NextResponse.json({ error: '`steps` must be a positive integer' }, { status: 400 });
    }
    steps = Math.min(s, MAX_STEPS);
  }

  // Validate dt
  let dt = DEFAULT_DT[solver];
  if (raw['dt'] !== undefined) {
    if (!isFinitePositive(raw['dt'])) {
      return NextResponse.json({ error: '`dt` must be a finite positive number' }, { status: 400 });
    }
    dt = raw['dt'] as number;
  }

  // Apply safety limits to config (mutate the copy, not the original)
  clampGridResolution(config);
  clampParticleCount(config);

  // Load engine and register solvers
  let engine: typeof EngineNS;
  try {
    engine = await loadEngine();
    engine.Simulation.initSimulationSolvers();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Engine load failed: ${msg}` }, { status: 400 });
  }

  const { SimulationSolverFactory } = engine.Simulation as unknown as {
    SimulationSolverFactory: {
      create: (type: string, cfg: Record<string, unknown>) => {
        step?: (dt: number) => void;
        solve?: () => void;
        dispose: () => void;
        getStats?: () => Record<string, unknown>;
        [key: string]: unknown;
      } | null;
    };
  };

  // Create solver via factory (uses registered config parsers)
  // We bypass SimulationSolverFactory and use the concrete classes directly so
  // we can access their data methods (positions, getTemperatureGrid, etc.) after
  // stepping. The factory-created objects are cast as unknown — it's easier to
  // import concrete classes the same way.
  //
  // NOTE: SimulationSolverFactory.create() returns the concrete solver cast as
  // SimulationSolver; we then downcast to access data fields. This mirrors the
  // double-as pattern (as unknown as SimulationSolver) used in simulation-registry.ts.

  const t0 = performance.now();

  try {
    switch (solver) {
      case 'thermal': {
        const { ThermalSolver } = engine.Simulation;
        const thermalConfig = buildThermalConfig(config);
        const s = new ThermalSolver(thermalConfig);

        for (let i = 0; i < steps; i++) {
          s.step(dt);
        }

        const grid = s.getTemperatureGrid();
        const values = Array.from(grid.data) as number[];
        const resolution: [number, number, number] = [grid.nx, grid.ny, grid.nz];
        const digest = stateDigest(grid.data);
        const stats = s.getStats() as unknown as Record<string, unknown>;
        const wallMs = performance.now() - t0;

        return NextResponse.json({
          kind: 'scalarField',
          field: { resolution, values },
          stats,
          runReport: {
            solver,
            steps,
            dt,
            finalStateDigest: digest,
            wallMs,
            fieldNames: ['temperature'],
          },
        });
      }

      case 'dem-granular': {
        const { DEMSolver } = engine.Simulation;
        const demConfig = buildDEMConfig(config);
        const s = new DEMSolver(demConfig);

        for (let i = 0; i < steps; i++) {
          s.step(dt);
        }

        const positions = Array.from(s.positions) as number[];
        const digest = stateDigest(s.positions);
        const stats = s.getStats() as unknown as Record<string, unknown>;
        const wallMs = performance.now() - t0;

        return NextResponse.json({
          kind: 'particles',
          positions,
          stats,
          runReport: {
            solver,
            steps,
            dt,
            finalStateDigest: digest,
            wallMs,
            fieldNames: ['positions', 'velocities'],
          },
        });
      }

      case 'reaction-diffusion': {
        const { ReactionDiffusionSolver } = engine.Simulation;
        const rdConfig = buildReactionDiffusionConfig(config);
        const s = new ReactionDiffusionSolver(rdConfig);

        for (let i = 0; i < steps; i++) {
          s.step(dt);
        }

        // Return the first species' concentration field as the primary scalar field
        const primaryField = s.getConcentrationGrid(0);
        const values = Array.from(primaryField.data) as number[];
        const resolution: [number, number, number] = [primaryField.nx, primaryField.ny, primaryField.nz];
        const digest = stateDigest(primaryField.data);
        const stats = s.getStats() as unknown as Record<string, unknown>;
        const wallMs = performance.now() - t0;

        return NextResponse.json({
          kind: 'scalarField',
          field: { resolution, values },
          stats,
          runReport: {
            solver,
            steps,
            dt,
            finalStateDigest: digest,
            wallMs,
            fieldNames: s.getSpeciesNames().map((n) => `concentration_${n}`),
          },
        });
      }

      case 'molecular-dynamics': {
        const { MolecularDynamicsSolver } = engine.Simulation;
        const mdConfig = buildMDConfig(config);
        const s = new MolecularDynamicsSolver(mdConfig);

        for (let i = 0; i < steps; i++) {
          s.step(dt);
        }

        const positions = Array.from(s.getPositions()) as number[];
        const digest = stateDigest(s.getPositions());
        const stats = s.getStats() as unknown as Record<string, unknown>;
        const wallMs = performance.now() - t0;

        return NextResponse.json({
          kind: 'particles',
          positions,
          stats,
          runReport: {
            solver,
            steps,
            dt,
            finalStateDigest: digest,
            wallMs,
            fieldNames: ['positions'],
          },
        });
      }

      default: {
        // TypeScript exhaustiveness — ALLOWED_SOLVERS check above makes this unreachable
        return NextResponse.json({ error: 'Unknown solver' }, { status: 400 });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Simulation failed: ${msg}` }, { status: 400 });
  }
}

// ── Config builders ───────────────────────────────────────────────────────────
// These mirror the parsing logic in simulation-registry.ts but operate on the
// route's validated+clamped config object, keeping the route self-contained.

// Type-only imports from the engine simulation sub-package (erased at compile time).
// @holoscript/engine/simulation is a registered subpath export in the engine's
// package.json and re-exports all solver types from the simulation index.
import type {
  ThermalConfig,
  ThermalSource,
  DEMConfig,
  ReactionDiffusionConfig,
  Species,
  Reaction,
  MDConfig,
  BoundaryCondition,
  BCFace,
} from '@holoscript/engine/simulation';

function buildThermalConfig(cfg: Record<string, unknown>): ThermalConfig {
  // Support both camelCase (gridResolution) and snake_case (grid_resolution)
  const res = (cfg['gridResolution'] ?? cfg['grid_resolution'] ?? [24, 24, 24]) as [number, number, number];
  const dom = (cfg['domainSize'] ?? cfg['domain_size'] ?? [1, 1, 1]) as [number, number, number];
  const clampedRes: [number, number, number] = [
    Math.min(Math.max(2, Math.round(res[0])), MAX_GRID_AXIS),
    Math.min(Math.max(2, Math.round(res[1])), MAX_GRID_AXIS),
    Math.min(Math.max(2, Math.round(res[2])), MAX_GRID_AXIS),
  ];

  // Parse boundary conditions
  const bcs: BoundaryCondition[] = [];
  const rawBCs = cfg['boundary_conditions'] as Record<string, unknown> | undefined;
  if (rawBCs) {
    for (const [key, value] of Object.entries(rawBCs)) {
      const bc = value as Record<string, unknown>;
      const type = (bc['type'] as string) ?? 'dirichlet';
      const faces: BCFace[] =
        key === 'exterior'
          ? ['x-', 'x+', 'z-', 'z+']
          : key === 'interior'
            ? ['y-', 'y+']
            : ([key] as BCFace[]);
      bcs.push({
        type: type as BoundaryCondition['type'],
        faces,
        value: (bc['T'] as number) ?? (bc['value'] as number) ?? 20,
        coefficient: bc['h'] as number | undefined,
        ambient: bc['T_ambient'] as number | undefined,
      });
    }
  }

  // Parse sources
  const sources: ThermalSource[] = [];
  const rawSources = cfg['sources'] as Record<string, unknown> | undefined;
  if (rawSources) {
    for (const [category, entries] of Object.entries(rawSources)) {
      if (typeof entries !== 'object' || !entries) continue;
      for (const [id, props] of Object.entries(entries as Record<string, unknown>)) {
        const p = props as Record<string, unknown>;
        sources.push({
          id: `${category}_${id}`,
          type: (p['count'] as number) > 1 ? 'volume' : 'point',
          position: (p['position'] as [number, number, number]) ?? [0, 0, 0],
          heat_output: (p['heat_output'] as number) ?? 0,
          radius: p['count'] ? 2 : undefined,
          active: p['active'] as boolean | undefined,
        });
      }
    }
  }

  return {
    gridResolution: clampedRes,
    domainSize: dom,
    timeStep: (cfg['time_step'] as number) ?? (cfg['timeStep'] as number) ?? 0.01,
    materials: (cfg['materials'] as Record<string, Record<string, number>>) ?? {},
    defaultMaterial: (cfg['default_material'] as string) ?? (cfg['defaultMaterial'] as string) ?? 'air',
    boundaryConditions: bcs,
    sources,
    initialTemperature: (cfg['initial_temperature'] as number) ?? (cfg['initialTemperature'] as number) ?? 20,
  };
}

function buildDEMConfig(cfg: Record<string, unknown>): DEMConfig {
  const rawRadii = cfg['radii'] as number[] | undefined;
  const rawMasses = cfg['masses'] as number[] | undefined;
  const boxRaw = cfg['boxBounds'] as [[number, number], [number, number], [number, number]] | undefined;
  const posRaw = cfg['initialPositions'] as number[] | undefined;
  const velRaw = cfg['initialVelocities'] as number[] | undefined;

  const particleCount = Math.min(
    (cfg['particleCount'] as number) ?? 64,
    MAX_PARTICLES
  );

  return {
    particleCount,
    radii: rawRadii ? new Float64Array(rawRadii) : undefined,
    masses: rawMasses ? new Float64Array(rawMasses) : undefined,
    defaultRadius: (cfg['defaultRadius'] as number) ?? 0.05,
    defaultMass: (cfg['defaultMass'] as number) ?? 1.0,
    kn: (cfg['kn'] as number) ?? 1e5,
    kt: cfg['kt'] as number | undefined,
    restitution: (cfg['restitution'] as number) ?? 0.5,
    friction: (cfg['friction'] as number) ?? 0.3,
    gravity: (cfg['gravity'] as [number, number, number]) ?? [0, -9.81, 0],
    boxBounds: boxRaw ?? [
      [-1, 1],
      [-1, 1],
      [-1, 1],
    ],
    dtSafety: cfg['dtSafety'] as number | undefined,
    initialPositions: posRaw ? new Float64Array(posRaw) : undefined,
    initialVelocities: velRaw ? new Float64Array(velRaw) : undefined,
  };
}

function buildReactionDiffusionConfig(cfg: Record<string, unknown>): ReactionDiffusionConfig {
  const res = (cfg['gridResolution'] ?? cfg['grid_resolution'] ?? [16, 16, 16]) as [number, number, number];
  const clampedRes: [number, number, number] = [
    Math.min(Math.max(2, Math.round(res[0])), MAX_GRID_AXIS),
    Math.min(Math.max(2, Math.round(res[1])), MAX_GRID_AXIS),
    Math.min(Math.max(2, Math.round(res[2])), MAX_GRID_AXIS),
  ];

  return {
    gridResolution: clampedRes,
    domainSize: (cfg['domainSize'] ?? cfg['domain_size'] ?? [1, 1, 1]) as [number, number, number],
    species: (cfg['species'] as Species[]) ?? [],
    reactions: (cfg['reactions'] as Reaction[]) ?? [],
    referenceTemperature: cfg['referenceTemperature'] as number | undefined,
    absoluteTolerance: cfg['absoluteTolerance'] as number | undefined,
    relativeTolerance: cfg['relativeTolerance'] as number | undefined,
    maxSubsteps: cfg['maxSubsteps'] as number | undefined,
  };
}

function buildMDConfig(cfg: Record<string, unknown>): MDConfig {
  const particleCount = Math.min(
    (cfg['particleCount'] as number) ?? 100,
    MAX_PARTICLES
  );

  return {
    particleCount,
    boxSize: (cfg['boxSize'] as [number, number, number]) ?? [8, 8, 8],
    epsilon: cfg['epsilon'] as number | undefined,
    sigma: cfg['sigma'] as number | undefined,
    mass: cfg['mass'] as number | undefined,
    cutoff: cfg['cutoff'] as number | undefined,
    temperature: cfg['temperature'] as number | undefined,
    thermostatTau: cfg['thermostatTau'] as number | undefined,
    initialConfig: cfg['initialConfig'] as 'fcc' | 'random' | undefined,
  };
}
