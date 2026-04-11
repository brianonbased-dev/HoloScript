/**
 * MaterialDatabase — Queryable material property library for simulation solvers.
 *
 * Default values sourced from the existing digital twin compositions
 * (hvac-building.hsplus, bridge-load-test.hsplus, water-network.hsplus).
 */

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ThermalMaterial {
  conductivity: number; // W/(m·K)
  specific_heat: number; // J/(kg·K)
  density: number; // kg/m³
}

export interface StructuralMaterial {
  youngs_modulus: number; // Pa
  poisson_ratio: number;
  yield_strength: number; // Pa
  density: number; // kg/m³
}

export interface HydraulicMaterial {
  roughness: number; // Darcy-Weisbach or Hazen-Williams coefficient
}

export type SimulationMaterial = ThermalMaterial &
  Partial<StructuralMaterial> &
  Partial<HydraulicMaterial>;

// ── Built-in Material Database ────────────────────────────────────────────────

const MATERIAL_DB: Record<string, SimulationMaterial> = {
  // From hvac-building.hsplus
  concrete: { conductivity: 1.7, specific_heat: 880, density: 2300 },
  glass: { conductivity: 1.0, specific_heat: 840, density: 2500 },
  air: { conductivity: 0.026, specific_heat: 1005, density: 1.225 },
  insulation: { conductivity: 0.04, specific_heat: 840, density: 50 },

  // From bridge-load-test.hsplus
  steel_a36: {
    conductivity: 50,
    specific_heat: 490,
    density: 7850,
    youngs_modulus: 200e9,
    poisson_ratio: 0.3,
    yield_strength: 250e6,
  },
  structural_steel: {
    conductivity: 50,
    specific_heat: 490,
    density: 7850,
    youngs_modulus: 200e9,
    poisson_ratio: 0.3,
    yield_strength: 250e6,
  },

  // From water-network.hsplus
  ductile_iron: {
    conductivity: 36,
    specific_heat: 460,
    density: 7100,
    roughness: 0.015,
  },
  pvc: {
    conductivity: 0.16,
    specific_heat: 900,
    density: 1400,
    roughness: 0.007,
  },

  // Common simulation materials
  water: { conductivity: 0.6, specific_heat: 4186, density: 998 },
  copper: {
    conductivity: 385,
    specific_heat: 385,
    density: 8960,
    youngs_modulus: 110e9,
    poisson_ratio: 0.34,
    yield_strength: 210e6,
  },
  aluminum: {
    conductivity: 205,
    specific_heat: 900,
    density: 2700,
    youngs_modulus: 69e9,
    poisson_ratio: 0.33,
    yield_strength: 270e6,
  },
  wood_oak: { conductivity: 0.17, specific_heat: 2000, density: 700 },
  brick: { conductivity: 0.72, specific_heat: 840, density: 1920 },
  soil_dry: { conductivity: 0.25, specific_heat: 800, density: 1500 },
  soil_wet: { conductivity: 1.5, specific_heat: 1480, density: 1800 },
  granite: {
    conductivity: 2.8,
    specific_heat: 790,
    density: 2750,
    youngs_modulus: 50e9,
    poisson_ratio: 0.25,
    yield_strength: 130e6,
  },
};

// ── Custom materials registry ─────────────────────────────────────────────────

const customMaterials = new Map<string, SimulationMaterial>();

/**
 * Get a material by name. Checks custom registry first, then built-in DB.
 * Throws if material not found.
 */
export function getMaterial(name: string): SimulationMaterial {
  const custom = customMaterials.get(name);
  if (custom) return custom;

  const builtin = MATERIAL_DB[name];
  if (builtin) return builtin;

  throw new Error(
    `Unknown material: "${name}". Available: ${listMaterials().join(', ')}`
  );
}

/**
 * Get a material by name, returning undefined if not found.
 */
export function findMaterial(name: string): SimulationMaterial | undefined {
  return customMaterials.get(name) ?? MATERIAL_DB[name];
}

/**
 * Register a custom material (overrides built-in if same name).
 */
export function registerMaterial(
  name: string,
  props: SimulationMaterial
): void {
  customMaterials.set(name, props);
}

/**
 * List all available material names.
 */
export function listMaterials(): string[] {
  return [
    ...new Set([...Object.keys(MATERIAL_DB), ...customMaterials.keys()]),
  ];
}

/**
 * Thermal diffusivity α = k / (ρ·cₚ) in m²/s.
 * Used for CFL stability checks in thermal solver.
 */
export function thermalDiffusivity(mat: ThermalMaterial): number {
  return mat.conductivity / (mat.density * mat.specific_heat);
}
