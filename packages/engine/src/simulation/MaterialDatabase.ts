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

import {
  type Temperature,
  type ThermalConductivity,
  type SpecificHeat,
  type Density,
  type YoungsModulus,
  type PoissonRatio,
  type YieldStrength,
  type Roughness,
  // Constructors
  temperature,
  thermalConductivity,
  specificHeat,
  density,
  youngsModulus,
  poissonRatio,
  yieldStrength,
  roughness,
} from './units/PhysicalQuantity';

// ── Interfaces ────────────────────────────────────────────────────────────────

/** Provenance metadata for a material property value. */
export interface PropertyProvenance {
  /** Literature source (e.g., "Incropera 7th ed., Table A.1") */
  source: string;
  /** Relative uncertainty (e.g., 0.05 = +/-5%) */
  uncertainty: number;
  /** Valid temperature range in Kelvin [min, max] */
  temperatureRange: [Temperature, Temperature];
  /** Additional notes (e.g., "Grade A36, room temperature") */
  notes?: string;
}

export interface ThermalMaterial {
  conductivity: ThermalConductivity; // W/(m·K)
  specific_heat: SpecificHeat; // J/(kg·K)
  density: Density; // kg/m³
}

export interface StructuralMaterial {
  youngs_modulus: YoungsModulus; // Pa
  poisson_ratio: PoissonRatio;
  yield_strength: YieldStrength; // Pa
  density: Density; // kg/m³
}

export interface HydraulicMaterial {
  roughness: Roughness; // Darcy-Weisbach or Hazen-Williams coefficient
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
    properties: {
      conductivity: thermalConductivity(1.7),
      specific_heat: specificHeat(880),
      density: density(2300),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (normal weight concrete)',
      uncertainty: 0.15,
      temperatureRange: [temperature(250), temperature(400)],
      notes: 'Normal weight concrete, 2300 kg/m³. Range 0.3-2.5 W/(m·K) depending on aggregate.',
    },
  },
  glass: {
    properties: {
      conductivity: thermalConductivity(1.0),
      specific_heat: specificHeat(840),
      density: density(2500),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (soda-lime glass)',
      uncertainty: 0.10,
      temperatureRange: [temperature(250), temperature(500)],
    },
  },
  air: {
    properties: {
      conductivity: thermalConductivity(0.026),
      specific_heat: specificHeat(1005),
      density: density(1.225),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.4 (dry air at 300K, 1 atm)',
      uncertainty: 0.02,
      temperatureRange: [temperature(200), temperature(400)],
      notes: 'Properties at 300K, 1 atm. Highly temperature-dependent — use MaterialProperties for T > 350K.',
    },
  },
  insulation: {
    properties: {
      conductivity: thermalConductivity(0.04),
      specific_heat: specificHeat(840),
      density: density(50),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (mineral wool blanket)',
      uncertainty: 0.15,
      temperatureRange: [temperature(250), temperature(450)],
      notes: 'Mineral wool blanket. Range 0.03-0.06 W/(m·K) depending on density.',
    },
  },
  steel_a36: {
    properties: {
      conductivity: thermalConductivity(50),
      specific_heat: specificHeat(490),
      density: density(7850),
      youngs_modulus: youngsModulus(200e9),
      poisson_ratio: poissonRatio(0.3),
      yield_strength: yieldStrength(250e6),
    },
    provenance: {
      source: 'ASM Handbook Vol. 1, ASTM A36/A36M',
      uncertainty: 0.05,
      temperatureRange: [temperature(200), temperature(700)],
      notes: 'ASTM A36 carbon structural steel, room temperature properties.',
    },
  },
  structural_steel: {
    properties: {
      conductivity: thermalConductivity(50),
      specific_heat: specificHeat(490),
      density: density(7850),
      youngs_modulus: youngsModulus(200e9),
      poisson_ratio: poissonRatio(0.3),
      yield_strength: yieldStrength(250e6),
    },
    provenance: {
      source: 'ASM Handbook Vol. 1, ASTM A36/A36M',
      uncertainty: 0.05,
      temperatureRange: [temperature(200), temperature(700)],
      notes: 'Alias for steel_a36. ASTM A36 carbon structural steel.',
    },
  },
  ductile_iron: {
    properties: {
      conductivity: thermalConductivity(36),
      specific_heat: specificHeat(460),
      density: density(7100),
      roughness: roughness(0.015),
    },
    provenance: {
      source: 'AWWA C151/A21.51 (ductile iron pipe); Incropera 7th ed., Table A.1',
      uncertainty: 0.08,
      temperatureRange: [temperature(250), temperature(600)],
      notes: 'Roughness from Moody chart for new ductile iron pipe. Range 0.01-0.02.',
    },
  },
  pvc: {
    properties: {
      conductivity: thermalConductivity(0.16),
      specific_heat: specificHeat(900),
      density: density(1400),
      roughness: roughness(0.007),
    },
    provenance: {
      source: 'Engineering Toolbox (PVC pipe); Incropera 7th ed., Table A.3',
      uncertainty: 0.10,
      temperatureRange: [temperature(250), temperature(340)],
      notes: 'PVC Schedule 40. Max service temperature ~60°C (333K).',
    },
  },
  water: {
    properties: {
      conductivity: thermalConductivity(0.6),
      specific_heat: specificHeat(4186),
      density: density(998),
    },
    provenance: {
      source: 'NIST Chemistry WebBook, SRD 69 (liquid water at 293K, 1 atm)',
      uncertainty: 0.01,
      temperatureRange: [temperature(273), temperature(373)],
      notes: 'Liquid water at 20°C. Highly T-dependent — use MaterialProperties for other temperatures.',
    },
  },
  copper: {
    properties: {
      conductivity: thermalConductivity(385),
      specific_heat: specificHeat(385),
      density: density(8960),
      youngs_modulus: youngsModulus(110e9),
      poisson_ratio: poissonRatio(0.34),
      yield_strength: yieldStrength(210e6),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.1 (pure copper at 300K)',
      uncertainty: 0.03,
      temperatureRange: [temperature(200), temperature(800)],
      notes: 'Pure copper (C11000). Yield varies widely by cold work (70-365 MPa).',
    },
  },
  aluminum: {
    properties: {
      conductivity: thermalConductivity(205),
      specific_heat: specificHeat(900),
      density: density(2700),
      youngs_modulus: youngsModulus(69e9),
      poisson_ratio: poissonRatio(0.33),
      yield_strength: yieldStrength(270e6),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.1 (Al 6061-T6 at 300K)',
      uncertainty: 0.05,
      temperatureRange: [temperature(200), temperature(600)],
      notes: 'Al 6061-T6 alloy. k varies 170-240 W/(m·K) depending on alloy and temper.',
    },
  },
  wood_oak: {
    properties: {
      conductivity: thermalConductivity(0.17),
      specific_heat: specificHeat(2000),
      density: density(700),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (oak, across grain)',
      uncertainty: 0.15,
      temperatureRange: [temperature(250), temperature(350)],
      notes: 'Oak wood, across grain. Along grain ~2x higher conductivity.',
    },
  },
  brick: {
    properties: {
      conductivity: thermalConductivity(0.72),
      specific_heat: specificHeat(840),
      density: density(1920),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.3 (common building brick)',
      uncertainty: 0.10,
      temperatureRange: [temperature(250), temperature(400)],
    },
  },
  soil_dry: {
    properties: {
      conductivity: thermalConductivity(0.25),
      specific_heat: specificHeat(800),
      density: density(1500),
    },
    provenance: {
      source: 'de Vries (1963) via Incropera 7th ed., Table A.3',
      uncertainty: 0.20,
      temperatureRange: [temperature(250), temperature(350)],
      notes: 'Dry sandy soil. Highly variable (0.15-2.0) with moisture content.',
    },
  },
  soil_wet: {
    properties: {
      conductivity: thermalConductivity(1.5),
      specific_heat: specificHeat(1480),
      density: density(1800),
    },
    provenance: {
      source: 'de Vries (1963) via Incropera 7th ed., Table A.3',
      uncertainty: 0.20,
      temperatureRange: [temperature(273), temperature(350)],
      notes: 'Saturated sandy soil. Highly variable with soil type and saturation.',
    },
  },
  granite: {
    properties: {
      conductivity: thermalConductivity(2.8),
      specific_heat: specificHeat(790),
      density: density(2750),
      youngs_modulus: youngsModulus(50e9),
      poisson_ratio: poissonRatio(0.25),
      yield_strength: yieldStrength(130e6),
    },
    provenance: {
      source: 'Incropera 7th ed., Table A.3; USGS data sheets',
      uncertainty: 0.10,
      temperatureRange: [temperature(250), temperature(600)],
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
      conductivity: thermalConductivity(base.conductivity * factor),
      specific_heat: specificHeat(base.specific_heat * factor),
      density: density(base.density * factor),
      simulation_origin: origin,
      uncertainty_margin: cited.provenance.uncertainty,
    };
    
    if (base.youngs_modulus !== undefined) mat.youngs_modulus = youngsModulus(base.youngs_modulus * factor);
    if (base.poisson_ratio !== undefined) mat.poisson_ratio = poissonRatio(base.poisson_ratio * factor);
    if (base.yield_strength !== undefined) mat.yield_strength = yieldStrength(base.yield_strength * factor);
    if (base.roughness !== undefined) mat.roughness = roughness(base.roughness * factor);
    
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
