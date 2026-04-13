/**
 * MaterialProperties — Temperature-dependent material property lookup.
 *
 * Provides piecewise-linear interpolation of material properties as
 * functions of temperature. Data sourced from peer-reviewed references.
 *
 * Usage:
 *   getMaterialAtTemperature('steel_a36', 500) → properties interpolated at 500K
 *   getThermalConductivity('copper', 600)      → k(600K) for copper
 *
 * References:
 *   [1] Incropera, DeWitt et al., "Fundamentals of Heat and Mass Transfer", 7th ed.
 *   [2] NIST Chemistry WebBook, SRD 69
 *   [3] ASM Handbook, Vol. 1
 *   [4] Touloukian, Y.S. et al., "Thermophysical Properties of Matter", TPRC Data Series
 */

import { getMaterial, type SimulationMaterial, type ThermalMaterial } from './MaterialDatabase';

// ── Types ────────────────────────────────────────────────────────────────────

/** A data point in a property-vs-temperature table. */
interface DataPoint {
  T: number; // Temperature in Kelvin
  value: number;
}

/** Temperature-dependent property tables for a material. */
export interface TemperatureDependentProperties {
  /** Source citation for the tabulated data */
  source: string;
  /** Valid temperature range [min, max] in Kelvin */
  range: [number, number];
  /** Thermal conductivity k(T) in W/(m·K) */
  conductivity?: DataPoint[];
  /** Specific heat cp(T) in J/(kg·K) */
  specific_heat?: DataPoint[];
  /** Density rho(T) in kg/m³ */
  density?: DataPoint[];
  /** Dynamic viscosity mu(T) in Pa·s (fluids only) */
  dynamic_viscosity?: DataPoint[];
}

// ── Interpolation ────────────────────────────────────────────────────────────

/**
 * Piecewise-linear interpolation of tabulated data.
 * Clamps to boundary values outside the data range.
 */
function interpolate(data: DataPoint[], T: number): number {
  if (data.length === 0) throw new Error('Empty data table');
  if (data.length === 1) return data[0].value;

  // Clamp to boundaries
  if (T <= data[0].T) return data[0].value;
  if (T >= data[data.length - 1].T) return data[data.length - 1].value;

  // Find bracketing interval
  for (let i = 0; i < data.length - 1; i++) {
    if (T >= data[i].T && T <= data[i + 1].T) {
      const frac = (T - data[i].T) / (data[i + 1].T - data[i].T);
      return data[i].value + frac * (data[i + 1].value - data[i].value);
    }
  }

  // Should not reach here
  return data[data.length - 1].value;
}

// ── Temperature-Dependent Data Tables ────────────────────────────────────────

/**
 * Data from Incropera 7th ed., Table A.1 (metals) and Table A.6 (water).
 * All temperatures in Kelvin, all properties in SI units.
 */
const T_DEP_DB: Record<string, TemperatureDependentProperties> = {
  // ── Steel A36 ──────────────────────────────────────────────────────────
  // Source: Incropera 7th ed., Table A.1 (carbon steel, 1% C)
  steel_a36: {
    source: 'Incropera 7th ed., Table A.1 (plain carbon steel, 1%C)',
    range: [300, 1200],
    conductivity: [
      { T: 300, value: 43 },
      { T: 400, value: 43 },
      { T: 600, value: 36 },
      { T: 800, value: 30 },
      { T: 1000, value: 29 },
      { T: 1200, value: 29 },
    ],
    specific_heat: [
      { T: 300, value: 490 },
      { T: 400, value: 530 },
      { T: 600, value: 620 },
      { T: 800, value: 720 },
      { T: 1000, value: 620 },
      { T: 1200, value: 540 },
    ],
    density: [
      { T: 300, value: 7850 },
      { T: 600, value: 7750 },
      { T: 1000, value: 7600 },
      { T: 1200, value: 7520 },
    ],
  },

  // Alias
  structural_steel: {
    source: 'Incropera 7th ed., Table A.1 (alias for steel_a36)',
    range: [300, 1200],
    conductivity: [
      { T: 300, value: 43 },
      { T: 400, value: 43 },
      { T: 600, value: 36 },
      { T: 800, value: 30 },
      { T: 1000, value: 29 },
      { T: 1200, value: 29 },
    ],
    specific_heat: [
      { T: 300, value: 490 },
      { T: 400, value: 530 },
      { T: 600, value: 620 },
      { T: 800, value: 720 },
      { T: 1000, value: 620 },
      { T: 1200, value: 540 },
    ],
    density: [
      { T: 300, value: 7850 },
      { T: 600, value: 7750 },
      { T: 1000, value: 7600 },
      { T: 1200, value: 7520 },
    ],
  },

  // ── Aluminum 6061-T6 ───────────────────────────────────────────────────
  // Source: Incropera 7th ed., Table A.1 (Al alloy 2024-T6, similar to 6061)
  aluminum: {
    source: 'Incropera 7th ed., Table A.1 (Al alloy)',
    range: [300, 800],
    conductivity: [
      { T: 300, value: 177 },
      { T: 400, value: 186 },
      { T: 500, value: 186 },
      { T: 600, value: 186 },
      { T: 800, value: 186 },
    ],
    specific_heat: [
      { T: 300, value: 875 },
      { T: 400, value: 925 },
      { T: 500, value: 1000 },
      { T: 600, value: 1075 },
      { T: 800, value: 1175 },
    ],
    density: [
      { T: 300, value: 2770 },
      { T: 500, value: 2720 },
      { T: 800, value: 2660 },
    ],
  },

  // ── Copper (pure) ──────────────────────────────────────────────────────
  // Source: Incropera 7th ed., Table A.1 (pure copper)
  copper: {
    source: 'Incropera 7th ed., Table A.1 (pure copper)',
    range: [200, 1200],
    conductivity: [
      { T: 200, value: 413 },
      { T: 300, value: 401 },
      { T: 400, value: 393 },
      { T: 600, value: 379 },
      { T: 800, value: 366 },
      { T: 1000, value: 352 },
      { T: 1200, value: 339 },
    ],
    specific_heat: [
      { T: 200, value: 356 },
      { T: 300, value: 385 },
      { T: 400, value: 397 },
      { T: 600, value: 417 },
      { T: 800, value: 433 },
      { T: 1000, value: 451 },
      { T: 1200, value: 480 },
    ],
    density: [
      { T: 300, value: 8933 },
      { T: 600, value: 8800 },
      { T: 1000, value: 8600 },
    ],
  },

  // ── Water (liquid) ─────────────────────────────────────────────────────
  // Source: NIST Chemistry WebBook, SRD 69 (saturated liquid at 1 atm)
  water: {
    source: 'NIST SRD 69 (saturated liquid water, 1 atm)',
    range: [275, 373],
    conductivity: [
      { T: 275, value: 0.574 },
      { T: 300, value: 0.613 },
      { T: 325, value: 0.645 },
      { T: 350, value: 0.668 },
      { T: 373, value: 0.679 },
    ],
    specific_heat: [
      { T: 275, value: 4211 },
      { T: 300, value: 4179 },
      { T: 325, value: 4182 },
      { T: 350, value: 4195 },
      { T: 373, value: 4217 },
    ],
    density: [
      { T: 275, value: 1000 },
      { T: 300, value: 997 },
      { T: 325, value: 987 },
      { T: 350, value: 974 },
      { T: 373, value: 958 },
    ],
    dynamic_viscosity: [
      { T: 275, value: 1.519e-3 },
      { T: 300, value: 0.855e-3 },
      { T: 325, value: 0.528e-3 },
      { T: 350, value: 0.365e-3 },
      { T: 373, value: 0.279e-3 },
    ],
  },

  // ── Air (dry, 1 atm) ──────────────────────────────────────────────────
  // Source: Incropera 7th ed., Table A.4
  air: {
    source: 'Incropera 7th ed., Table A.4 (dry air, 1 atm)',
    range: [200, 1000],
    conductivity: [
      { T: 200, value: 0.0181 },
      { T: 300, value: 0.0263 },
      { T: 400, value: 0.0338 },
      { T: 500, value: 0.0407 },
      { T: 600, value: 0.0469 },
      { T: 800, value: 0.0573 },
      { T: 1000, value: 0.0667 },
    ],
    specific_heat: [
      { T: 200, value: 1007 },
      { T: 300, value: 1007 },
      { T: 400, value: 1014 },
      { T: 500, value: 1030 },
      { T: 600, value: 1051 },
      { T: 800, value: 1099 },
      { T: 1000, value: 1141 },
    ],
    density: [
      { T: 200, value: 1.7458 },
      { T: 300, value: 1.1614 },
      { T: 400, value: 0.8711 },
      { T: 500, value: 0.6964 },
      { T: 600, value: 0.5804 },
      { T: 800, value: 0.4354 },
      { T: 1000, value: 0.3482 },
    ],
    dynamic_viscosity: [
      { T: 200, value: 1.329e-5 },
      { T: 300, value: 1.846e-5 },
      { T: 400, value: 2.286e-5 },
      { T: 500, value: 2.671e-5 },
      { T: 600, value: 3.018e-5 },
      { T: 800, value: 3.625e-5 },
      { T: 1000, value: 4.152e-5 },
    ],
  },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get thermal properties at a specific temperature (Kelvin).
 * Uses piecewise-linear interpolation of tabulated data.
 * Falls back to room-temperature values if no T-dependent data exists.
 */
export function getMaterialAtTemperature(
  name: string,
  T: number
): ThermalMaterial {
  const tDep = T_DEP_DB[name];
  if (!tDep) {
    return getMaterial(name);
  }

  return {
    conductivity: tDep.conductivity
      ? (interpolate(tDep.conductivity, T) as any)
      : getMaterialFallback(name).conductivity,
    specific_heat: tDep.specific_heat
      ? (interpolate(tDep.specific_heat, T) as any)
      : getMaterialFallback(name).specific_heat,
    density: tDep.density
      ? (interpolate(tDep.density, T) as any)
      : getMaterialFallback(name).density,
  };
}

/**
 * Get a single thermal conductivity value at temperature T (Kelvin).
 */
export function getThermalConductivity(name: string, T: number): number {
  const tDep = T_DEP_DB[name];
  if (tDep?.conductivity) return (interpolate(tDep.conductivity, T) as any);
  return getMaterialFallback(name).conductivity;
}

/**
 * Get a single specific heat value at temperature T (Kelvin).
 */
export function getSpecificHeat(name: string, T: number): number {
  const tDep = T_DEP_DB[name];
  if (tDep?.specific_heat) return (interpolate(tDep.specific_heat, T) as any);
  return getMaterialFallback(name).specific_heat;
}

/**
 * Get density at temperature T (Kelvin).
 */
export function getDensity(name: string, T: number): number {
  const tDep = T_DEP_DB[name];
  if (tDep?.density) return (interpolate(tDep.density, T) as any);
  return getMaterialFallback(name).density;
}

/**
 * Get dynamic viscosity at temperature T (Kelvin). Fluids only.
 * Returns undefined if not available for this material.
 */
export function getDynamicViscosity(name: string, T: number): number | undefined {
  const tDep = T_DEP_DB[name];
  if (tDep?.dynamic_viscosity) return interpolate(tDep.dynamic_viscosity, T);
  return undefined;
}

/**
 * Check if temperature-dependent data exists for a material.
 */
export function hasTemperatureDependentData(name: string): boolean {
  return name in T_DEP_DB;
}

/**
 * Get the valid temperature range for a material's T-dependent data.
 */
export function getTemperatureRange(name: string): [number, number] | undefined {
  return T_DEP_DB[name]?.range;
}

/**
 * List all materials with temperature-dependent data.
 */
export function listTemperatureDependentMaterials(): string[] {
  return Object.keys(T_DEP_DB);
}

// ── Internal Helpers ─────────────────────────────────────────────────────────



/** Lazy import to avoid circular dependency with MaterialDatabase. */
function getMaterialFallback(name: string): SimulationMaterial {
  return getMaterial(name);
}
