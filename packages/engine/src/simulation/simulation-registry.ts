/**
 * simulation-registry.ts — Auto-register simulation solver factories.
 *
 * SimulationSolverFactory (in @holoscript/core) is a runtime registry that
 * avoids circular deps between core trait handlers and engine solvers.
 * Engine registers solver constructors; core trait handlers call create()
 * without importing engine directly.
 *
 * PROBLEM: The only call site was SimulationProvider.tsx (React mount),
 * meaning all trait-driven simulation silently returned null in Node/MCP/CLI.
 *
 * FIX: This module provides initSimulationSolvers(), which registers all
 * solver factories with SimulationSolverFactory. It is idempotent — calling
 * it multiple times is safe. The engine index.ts re-exports it so any
 * consumer that imports @holoscript/engine (or @holoscript/engine/simulation)
 * can call it once at startup.
 *
 * SimulationProvider.tsx now delegates here instead of registering manually.
 */

import { SimulationSolverFactory, type SimulationSolver } from '@holoscript/core/traits/simulation-solver-factory';
import { ThermalSolver, type ThermalConfig, type ThermalSource } from './ThermalSolver';
import { StructuralSolver, type StructuralConfig } from './StructuralSolver';
import {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
  type TET10Constraint,
  type TET10Load,
} from './StructuralSolverTET10';
import { HydraulicSolver, type HydraulicConfig } from './HydraulicSolver';
import { AcousticSolver, type AcousticConfig } from './AcousticSolver';
import { FDTDSolver, type FDTDConfig } from './FDTDSolver';
import { NavierStokesSolver, type NavierStokesConfig } from './NavierStokesSolver';
import { MultiphaseNSSolver, type MultiphaseConfig } from './MultiphaseNSSolver';
import { MolecularDynamicsSolver, type MDConfig } from './MolecularDynamicsSolver';
import {
  ReactionDiffusionSolver,
  type ReactionDiffusionConfig,
  type Species,
  type Reaction,
} from './ReactionDiffusionSolver';
import { MLSMPMFluid, type MLSMPMConfig } from '../physics/MLSMPMFluid';
import { registerWasmMesher } from './AutoMesher';
import { TetGenWasmMesher } from './wasm/TetGenWasmMesher';
import type { BoundaryCondition, BCFace } from './BoundaryConditions';

// ── Config parsers (shared with register.ts, kept for consistency) ─────────

function parseBoundaryConditions(
  raw: Record<string, unknown> | undefined,
): BoundaryCondition[] {
  if (!raw) return [];
  const bcs: BoundaryCondition[] = [];

  for (const [key, value] of Object.entries(raw)) {
    const bc = value as Record<string, unknown>;
    const type = (bc.type as string) ?? 'dirichlet';
    const faces: BCFace[] =
      key === 'exterior'
        ? ['x-', 'x+', 'z-', 'z+']
        : key === 'interior'
          ? ['y-', 'y+']
          : ([key] as BCFace[]);

    bcs.push({
      type: type as BoundaryCondition['type'],
      faces,
      value: (bc.T as number) ?? (bc.value as number) ?? 20,
      coefficient: bc.h as number | undefined,
      ambient: bc.T_ambient as number | undefined,
    });
  }
  return bcs;
}

function parseThermalSources(
  raw: Record<string, unknown> | undefined,
): ThermalSource[] {
  if (!raw) return [];
  const sources: ThermalSource[] = [];

  for (const [category, entries] of Object.entries(raw)) {
    if (typeof entries !== 'object' || !entries) continue;
    for (const [id, props] of Object.entries(entries as Record<string, unknown>)) {
      const p = props as Record<string, unknown>;
      sources.push({
        id: `${category}_${id}`,
        type: (p.count as number) > 1 ? 'volume' : 'point',
        position: (p.position as [number, number, number]) ?? [0, 0, 0],
        heat_output: (p.heat_output as number) ?? 0,
        radius: p.count ? 2 : undefined,
        active: p.active as boolean | undefined,
      });
    }
  }
  return sources;
}

function parseThermalConfig(raw: Record<string, unknown>): ThermalConfig {
  return {
    gridResolution: (raw.grid_resolution as [number, number, number]) ?? [64, 16, 64],
    domainSize: (raw.domain_size as [number, number, number]) ?? [10, 5, 10],
    timeStep: (raw.time_step as number) ?? 0.5,
    materials: (raw.materials as Record<string, Record<string, number>>) ?? {},
    defaultMaterial: (raw.default_material as string) ?? 'air',
    boundaryConditions: parseBoundaryConditions(
      raw.boundary_conditions as Record<string, unknown> | undefined,
    ),
    sources: parseThermalSources(raw.sources as Record<string, unknown> | undefined),
    initialTemperature: (raw.initial_temperature as number) ?? 20,
  };
}

function parseStructuralConfig(raw: Record<string, unknown>): StructuralConfig {
  const mat = raw.material as Record<string, unknown> | string | undefined;
  return {
    vertices: (raw.vertices as Float32Array) ?? new Float32Array(0),
    tetrahedra: (raw.tetrahedra as Uint32Array) ?? new Uint32Array(0),
    material: typeof mat === 'string' ? mat : (mat?.type as string) ?? 'steel_a36',
    constraints: (raw.constraints as StructuralConfig['constraints']) ?? [],
    loads: (raw.loads as StructuralConfig['loads']) ?? [],
    maxIterations: (raw.max_iterations as number) ?? 1000,
    tolerance: (raw.tolerance as number) ?? 1e-8,
  };
}

function parseTET10Config(raw: Record<string, unknown>): TET10Config {
  const base = parseStructuralConfig(raw);

  // If mesh is TET4, auto-upgrade to TET10
  let vertices: Float64Array | Float32Array = base.vertices;
  let tetrahedra: Uint32Array = base.tetrahedra;

  if (
    tetrahedra.length > 0 &&
    tetrahedra.length % 4 === 0 &&
    (raw.isTET10 === false || raw.nodesPerElement === 4)
  ) {
    const upgraded = tet4ToTet10(vertices, tetrahedra);
    vertices = upgraded.vertices;
    tetrahedra = upgraded.tetrahedra;
  }

  return {
    material: base.material,
    constraints: base.constraints as TET10Constraint[],
    loads: base.loads as TET10Load[],
    maxIterations: base.maxIterations,
    tolerance: base.tolerance,
    vertices,
    tetrahedra,
    useGPU: (raw.useGPU as boolean) ?? true,
  };
}

function parseHydraulicConfig(raw: Record<string, unknown>): HydraulicConfig {
  return {
    pipes: (raw.pipes as HydraulicConfig['pipes']) ?? [],
    nodes: (raw.nodes as HydraulicConfig['nodes']) ?? [],
    connections: (raw.connections as HydraulicConfig['connections']) ?? [],
    valves: (raw.valves as HydraulicConfig['valves']) ?? [],
    maxIterations: (raw.max_iterations as number) ?? 100,
    convergence: (raw.convergence as number) ?? 0.001,
  };
}

function parseMLSMPMConfig(raw: Record<string, unknown>): Partial<MLSMPMConfig> {
  return {
    type: (raw.type as 'liquid' | 'gas') ?? undefined,
    particleCount: (raw.particleCount as number) ?? undefined,
    viscosity: (raw.viscosity as number) ?? undefined,
    gridResolution: (raw.gridResolution as number) ?? undefined,
    domainSize: (raw.domainSize as number) ?? undefined,
    resolutionScale: (raw.resolutionScale as number) ?? undefined,
    restDensity: (raw.restDensity as number) ?? undefined,
    bulkModulus: (raw.bulkModulus as number) ?? undefined,
    particleRadius: (raw.particleRadius as number) ?? undefined,
    gravity: (raw.gravity as number) ?? undefined,
    absorptionColor: (raw.absorptionColor as [number, number, number]) ?? undefined,
    absorptionStrength: (raw.absorptionStrength as number) ?? undefined,
  };
}

// ── Idempotent registration ─────────────────────────────────────────────────

let initialized = false;

/**
 * Register all simulation solver factories with SimulationSolverFactory.
 *
 * Idempotent — safe to call multiple times. After the first call, subsequent
 * calls are no-ops. This is the canonical registration path for non-React
 * contexts (Node, CLI, MCP server). In React contexts,
 * SimulationProvider also calls this for belt-and-suspenders coverage.
 *
 * Also registers WASM meshers (TetGen) as a side effect, matching the
 * behavior of the former registerSimulationSolvers() in register.ts.
 */
export function initSimulationSolvers(): void {
  if (initialized) return;
  initialized = true;

  // Solver classes have typed getStats() returns (ThermalStats, etc.) that lack
  // index signatures, so they don't directly satisfy SimulationSolver. The
  // double-as pattern (as unknown as SimulationSolver) matches the same approach
  // in register.ts — safe at runtime, necessary for strict TS.
  SimulationSolverFactory.register('thermal', (raw) => new ThermalSolver(parseThermalConfig(raw)) as unknown as SimulationSolver);
  SimulationSolverFactory.register('structural', (raw) => new StructuralSolver(parseStructuralConfig(raw)) as unknown as SimulationSolver);
  SimulationSolverFactory.register('structural-tet10', (raw) => new StructuralSolverTET10(parseTET10Config(raw)) as unknown as SimulationSolver);
  SimulationSolverFactory.register('hydraulic', (raw) => new HydraulicSolver(parseHydraulicConfig(raw)) as unknown as SimulationSolver);
  SimulationSolverFactory.register('acoustic', (raw) => new AcousticSolver(raw as unknown as AcousticConfig) as unknown as SimulationSolver);
  SimulationSolverFactory.register('fdtd', (raw) => new FDTDSolver(raw as unknown as FDTDConfig) as unknown as SimulationSolver);
  SimulationSolverFactory.register('navier-stokes', (raw) => new NavierStokesSolver(raw as unknown as NavierStokesConfig) as unknown as SimulationSolver);
  SimulationSolverFactory.register('multiphase', (raw) => new MultiphaseNSSolver(raw as unknown as MultiphaseConfig) as unknown as SimulationSolver);
  SimulationSolverFactory.register('molecular-dynamics', (raw) => new MolecularDynamicsSolver(raw as unknown as MDConfig) as unknown as SimulationSolver);
  SimulationSolverFactory.register('mls-mpm-fluid', (raw) => new MLSMPMFluid(parseMLSMPMConfig(raw)) as unknown as SimulationSolver);
  SimulationSolverFactory.register('reaction-diffusion', (raw) => {
    const cfg = raw as Record<string, unknown>;
    return new ReactionDiffusionSolver({
      gridResolution: (cfg.gridResolution as [number, number, number]) ?? [32, 32, 32],
      domainSize: (cfg.domainSize as [number, number, number]) ?? [1, 1, 1],
      species: (cfg.species as Species[]) ?? [],
      reactions: (cfg.reactions as Reaction[]) ?? [],
      referenceTemperature: cfg.referenceTemperature as number | undefined,
      absoluteTolerance: cfg.absoluteTolerance as number | undefined,
      relativeTolerance: cfg.relativeTolerance as number | undefined,
      maxSubsteps: cfg.maxSubsteps as number | undefined,
    }) as unknown as SimulationSolver;
  });

  // Register WASM meshers (idempotent — AutoMesher guards against double-reg)
  const tetgen = new TetGenWasmMesher();
  registerWasmMesher(tetgen);
}

/**
 * Reset the initialization state. For testing only — allows re-running
 * initSimulationSolvers() after SimulationSolverFactory.clear().
 */
export function resetSimulationRegistry(): void {
  initialized = false;
}