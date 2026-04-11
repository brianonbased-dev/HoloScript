/**
 * MaterialDatabase — Queryable material property library for simulation solvers.
 *
 * Every property value includes a literature citation, uncertainty bound,
 * and valid temperature range. Temperature-dependent lookup is available
 * via MaterialProperties.ts for materials with tabulated data.
 *
 * Default values sourced from:
 *   - Incropera, DeWitt et al., "Fundamentals of Heat and Mass Transfer", 7th ed.
 *   - ASM Handbook, Vol. 1 (Properties and Selection: Irons, Steels)
 *   - NIST Standard Reference Data (SRD)
 *   - Engineering Toolbox (cross-referenced with primary sources)
 */

// ── Interfaces ────────────────────────────────────────────────────────────────

/** Provenance metadata for a material property value. */
export interface PropertyProvenance {
  /** Literature source (e.g., "Incropera 7th ed., Table A.1") */
  source: string;
  /** Relative uncertainty (e.g., 0.05 = +/-5%) */
  uncertainty: number;
  /** Valid temperature range in Kelvin [min, max] */
  temperatureRange: [number, number];
  /** Additional notes (e.g., "Grade A36, room temperature") */
  notes?: string;
}

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
  Partial<HydraulicMaterial> & {
    simulation_origin?: string;
    uncertainty_margin?: number;
  };

/** Material entry with provenance tracking. */
export interface CitedMaterial {
  properties: SimulationMaterial;
  provenance: PropertyProvenance;
}

// ── Built-in Material Database (with citations) ─────────────────────────────

const CITED_DB: Record<string, CitedMaterial> = {
  concrete: {
    properties: { conductivity: 1.7, specific_heat: 880, density: 2300 },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (normal weight concrete)',
      uncertainty: 0.15,
      temperatureRange: [250, 400],
      notes: 'Normal weight concrete, 2300 kg/m³. Range 0.3-2.5 W/(m·K) depending on aggregate.',
    },
  },
  glass: {
    properties: { conductivity: 1.0, specific_heat: 840, density: 2500 },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (soda-lime glass)',
      uncertainty: 0.10,
      temperatureRange: [250, 500],
    },
  },
  air: {
    properties: { conductivity: 0.026, specific_heat: 1005, density: 1.225 },
    provenance: {
      source: 'Incropera 7th ed., Table A.4 (dry air at 300K, 1 atm)',
      uncertainty: 0.02,
      temperatureRange: [200, 400],
      notes: 'Properties at 300K, 1 atm. Highly temperature-dependent — use MaterialProperties for T > 350K.',
    },
  },
  insulation: {
    properties: { conductivity: 0.04, specific_heat: 840, density: 50 },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (mineral wool blanket)',
      uncertainty: 0.15,
      temperatureRange: [250, 450],
      notes: 'Mineral wool blanket. Range 0.03-0.06 W/(m·K) depending on density.',
    },
  },
  steel_a36: {
    properties: {
      conductivity: 50, specific_heat: 490, density: 7850,
      youngs_modulus: 200e9, poisson_ratio: 0.3, yield_strength: 250e6,
    },
    provenance: {
      source: 'ASM Handbook Vol. 1, ASTM A36/A36M',
      uncertainty: 0.05,
      temperatureRange: [200, 700],
      notes: 'ASTM A36 carbon structural steel, room temperature properties.',
    },
  },
  structural_steel: {
    properties: {
      conductivity: 50, specific_heat: 490, density: 7850,
      youngs_modulus: 200e9, poisson_ratio: 0.3, yield_strength: 250e6,
    },
    provenance: {
      source: 'ASM Handbook Vol. 1, ASTM A36/A36M',
      uncertainty: 0.05,
      temperatureRange: [200, 700],
      notes: 'Alias for steel_a36. ASTM A36 carbon structural steel.',
    },
  },
  ductile_iron: {
    properties: {
      conductivity: 36, specific_heat: 460, density: 7100, roughness: 0.015,
    },
    provenance: {
      source: 'AWWA C151/A21.51 (ductile iron pipe); Incropera 7th ed., Table A.1',
      uncertainty: 0.08,
      temperatureRange: [250, 600],
      notes: 'Roughness from Moody chart for new ductile iron pipe. Range 0.01-0.02.',
    },
  },
  pvc: {
    properties: {
      conductivity: 0.16, specific_heat: 900, density: 1400, roughness: 0.007,
    },
    provenance: {
      source: 'Engineering Toolbox (PVC pipe); Incropera 7th ed., Table A.3',
      uncertainty: 0.10,
      temperatureRange: [250, 340],
      notes: 'PVC Schedule 40. Max service temperature ~60°C (333K).',
    },
  },
  water: {
    properties: { conductivity: 0.6, specific_heat: 4186, density: 998 },
    provenance: {
      source: 'NIST Chemistry WebBook, SRD 69 (liquid water at 293K, 1 atm)',
      uncertainty: 0.01,
      temperatureRange: [273, 373],
      notes: 'Liquid water at 20°C. Highly T-dependent — use MaterialProperties for other temperatures.',
    },
  },
  copper: {
    properties: {
      conductivity: 385, specific_heat: 385, density: 8960,
      youngs_modulus: 110e9, poisson_ratio: 0.34, yield_strength: 210e6,
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.1 (pure copper at 300K)',
      uncertainty: 0.03,
      temperatureRange: [200, 800],
      notes: 'Pure copper (C11000). Yield varies widely by cold work (70-365 MPa).',
    },
  },
  aluminum: {
    properties: {
      conductivity: 205, specific_heat: 900, density: 2700,
      youngs_modulus: 69e9, poisson_ratio: 0.33, yield_strength: 270e6,
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.1 (Al 6061-T6 at 300K)',
      uncertainty: 0.05,
      temperatureRange: [200, 600],
      notes: 'Al 6061-T6 alloy. k varies 170-240 W/(m·K) depending on alloy and temper.',
    },
  },
  wood_oak: {
    properties: { conductivity: 0.17, specific_heat: 2000, density: 700 },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (oak, across grain)',
      uncertainty: 0.15,
      temperatureRange: [250, 350],
      notes: 'Oak wood, across grain. Along grain ~2x higher conductivity.',
    },
  },
  brick: {
    properties: { conductivity: 0.72, specific_heat: 840, density: 1920 },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (common building brick)',
      uncertainty: 0.10,
      temperatureRange: [250, 400],
    },
  },
  soil_dry: {
    properties: { conductivity: 0.25, specific_heat: 800, density: 1500 },
    provenance: {
      source: 'de Vries (1963) via Incropera 7th ed., Table A.3',
      uncertainty: 0.20,
      temperatureRange: [250, 350],
      notes: 'Dry sandy soil. Highly variable (0.15-2.0) with moisture content.',
    },
  },
  soil_wet: {
    properties: { conductivity: 1.5, specific_heat: 1480, density: 1800 },
    provenance: {
      source: 'de Vries (1963) via Incropera 7th ed., Table A.3',
      uncertainty: 0.20,
      temperatureRange: [273, 350],
      notes: 'Saturated sandy soil. Highly variable with soil type and saturation.',
    },
  },
  granite: {
    properties: {
      conductivity: 2.8, specific_heat: 790, density: 2750,
      youngs_modulus: 50e9, poisson_ratio: 0.25, yield_strength: 130e6,
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.3; USGS data sheets',
      uncertainty: 0.10,
      temperatureRange: [250, 600],
      notes: 'Granite. Yield strength is compressive strength (tensile ~10x lower).',
    },
  },
};

/** Legacy flat database for backward compatibility. */
const MATERIAL_DB: Record<string, SimulationMaterial> = Object.fromEntries(
  Object.entries(CITED_DB).map(([name, cited]) => [name, cited.properties])
);

// ── Custom materials registry ─────────────────────────────────────────────────

const customMaterials = new Map<string, SimulationMaterial>();

/**
 * Get a material by name. Checks custom registry first, then built-in DB.
 * Supports uncertainty sampling via sigma standard deviations.
 * Throws if material not found.
 */
export function getMaterial(name: string, sigma: number = 0): SimulationMaterial {
  const custom = customMaterials.get(name);
  if (custom) return custom;

  const cited = CITED_DB[name];
  if (cited) {
    const base = cited.properties;
    const factor = 1 + sigma * cited.provenance.uncertainty;
    const origin = sigma === 0 ? cited.provenance.source : `${cited.provenance.source} (σ=${sigma})`;
    
    const mat: SimulationMaterial = {
      ...base,
      conductivity: base.conductivity * factor,
      specific_heat: base.specific_heat * factor,
      density: base.density * factor,
      simulation_origin: origin,
      uncertainty_margin: cited.provenance.uncertainty,
    };
    
    if (base.youngs_modulus !== undefined) mat.youngs_modulus = base.youngs_modulus * factor;
    if (base.poisson_ratio !== undefined) mat.poisson_ratio = base.poisson_ratio * factor;
    if (base.yield_strength !== undefined) mat.yield_strength = base.yield_strength * factor;
    if (base.roughness !== undefined) mat.roughness = base.roughness * factor;
    
    return mat;
  }

  throw new Error(
    `Unknown material: "${name}". Available: ${listMaterials().join(', ')}`
  );
}

/**
 * Get a material by name, returning undefined if not found.
 */
export function findMaterial(name: string, sigma: number = 0): SimulationMaterial | undefined {
  if (customMaterials.has(name) || name in CITED_DB) {
    return getMaterial(name, sigma);
  }
  return undefined;
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
 * Get a material with full provenance. Returns undefined if not found.
 */
export function getCitedMaterial(name: string): CitedMaterial | undefined {
  return CITED_DB[name];
}

/**
 * Get provenance for a built-in material. Returns undefined for custom materials.
 */
export function getMaterialProvenance(name: string): PropertyProvenance | undefined {
  return CITED_DB[name]?.provenance;
}

/**
 * List all materials that have provenance citations.
 */
export function listCitedMaterials(): string[] {
  return Object.keys(CITED_DB);
}

/**
 * Thermal diffusivity α = k / (ρ·cₚ) in m²/s.
 * Used for CFL stability checks in thermal solver.
 */
export function thermalDiffusivity(mat: ThermalMaterial): number {
  return mat.conductivity / (mat.density * mat.specific_heat);
}
