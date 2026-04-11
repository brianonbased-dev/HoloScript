/**
 * register.ts — Register simulation solver factories with @holoscript/core.
 *
 * Call registerSimulationSolvers() on app startup (e.g., in R3F app init)
 * to make solver constructors available to trait handlers.
 */

import { ThermalSolver, type ThermalConfig, type ThermalSource } from './ThermalSolver';
import { StructuralSolver, type StructuralConfig } from './StructuralSolver';
import { HydraulicSolver, type HydraulicConfig } from './HydraulicSolver';
import type { BoundaryCondition, BCFace } from './BoundaryConditions';

// ── Config parsers ───────────────────────────────────────────────────────────
// Convert raw .hsplus parsed config objects into typed solver configs.

function parseBoundaryConditions(
  raw: Record<string, unknown> | undefined
): BoundaryCondition[] {
  if (!raw) return [];
  const bcs: BoundaryCondition[] = [];

  for (const [key, value] of Object.entries(raw)) {
    const bc = value as Record<string, unknown>;
    const type = (bc.type as string) ?? 'dirichlet';
    const faces: BCFace[] = key === 'exterior'
      ? ['x-', 'x+', 'z-', 'z+']
      : key === 'interior'
        ? ['y-', 'y+']
        : [key as BCFace];

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
  raw: Record<string, unknown> | undefined
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
      raw.boundary_conditions as Record<string, unknown> | undefined
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

// ── Registration ─────────────────────────────────────────────────────────────

export interface SolverFactoryRegistry {
  register(type: string, factory: (config: Record<string, unknown>) => unknown): void;
}

/**
 * Register all simulation solver factories.
 * Call once on app startup with the SimulationSolverFactory from @holoscript/core.
 */
export function registerSimulationSolvers(factory: SolverFactoryRegistry): void {
  factory.register('thermal', (raw) => new ThermalSolver(parseThermalConfig(raw)));
  factory.register('structural', (raw) => new StructuralSolver(parseStructuralConfig(raw)));
  factory.register('hydraulic', (raw) => new HydraulicSolver(parseHydraulicConfig(raw)));
}
