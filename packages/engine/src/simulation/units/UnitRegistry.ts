/**
 * UnitRegistry — Runtime dimensional analysis and unit conversion.
 *
 * Provides a registry of physical dimensions and conversion factors.
 * Used at system boundaries to validate that user-supplied values
 * have compatible dimensions before entering the solver pipeline.
 *
 * All conversions target SI base units (kg, m, s, K, A, mol, cd).
 *
 * References:
 *   BIPM SI Brochure (9th ed., 2019)
 *   NIST SP 811 — Guide for the Use of the International System of Units
 */

import type { DimensionVector } from './PhysicalQuantity';

/**
 * Definition of a unit and its conversion to the SI base unit.
 */
export interface UnitDefinition {
  symbol: string;
  name: string;
  /** Dimension signature [kg, m, s, K, A, mol, cd] */
  dimension: DimensionVector;
  /** Multiplier to convert to SI base unit */
  scale: number;
  /** Additive offset to convert to SI base unit (e.g., for Celsius to Kelvin) */
  offset: number;
}

// ── Error Types ──────────────────────────────────────────────────────────────

export class DimensionalMismatchError extends Error {
  constructor(
    public readonly fromSymbol: string,
    public readonly toSymbol: string,
    public readonly fromDimension: DimensionVector,
    public readonly toDimension: DimensionVector,
  ) {
    super(
      `Dimensional mismatch: cannot convert "${fromSymbol}" to "${toSymbol}". ` +
      `Dimensions [kg,m,s,K,A,mol,cd]: [${fromDimension.join(',')}] vs [${toDimension.join(',')}]`
    );
    this.name = 'DimensionalMismatchError';
  }
}

export class UnitRegistry {
  private units: Map<string, UnitDefinition> = new Map();

  constructor() {
    this.registerStandardUnits();
  }

  register(unit: UnitDefinition): void {
    if (this.units.has(unit.symbol)) {
      throw new Error(`Unit ${unit.symbol} is already registered.`);
    }
    this.units.set(unit.symbol, unit);
  }

  getUnit(symbol: string): UnitDefinition {
    const unit = this.units.get(symbol);
    if (!unit) {
      throw new Error(`Unknown unit symbol: ${symbol}`);
    }
    return unit;
  }

  /**
   * Convert a value from one unit to another.
   * Throws an error if the units are not dimensionally compatible.
   */
  convert(value: number, fromSymbol: string, toSymbol: string): number {
    const fromUnit = this.getUnit(fromSymbol);
    const toUnit = this.getUnit(toSymbol);

    this.assertCompatible(fromUnit, toUnit);

    // Convert from -> SI Base -> to
    const siValue = value * fromUnit.scale + fromUnit.offset;
    return (siValue - toUnit.offset) / toUnit.scale;
  }

  /**
   * Asserts that two units are dimensionally compatible.
   * Throws DimensionalMismatchError if they differ.
   */
  assertCompatible(fromUnit: UnitDefinition, toUnit: UnitDefinition): void {
    const dim1 = fromUnit.dimension;
    const dim2 = toUnit.dimension;

    for (let i = 0; i < 7; i++) {
      if (dim1[i] !== dim2[i]) {
        throw new DimensionalMismatchError(
          fromUnit.symbol,
          toUnit.symbol,
          dim1,
          dim2,
        );
      }
    }
  }

  /**
   * Check whether two unit symbols share the same physical dimension.
   */
  isCompatible(fromSymbol: string, toSymbol: string): boolean {
    try {
      const fromUnit = this.getUnit(fromSymbol);
      const toUnit = this.getUnit(toSymbol);
      this.assertCompatible(fromUnit, toUnit);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert a value to SI base units from the given unit.
   */
  toSI(value: number, fromSymbol: string): number {
    const unit = this.getUnit(fromSymbol);
    return value * unit.scale + unit.offset;
  }

  /**
   * Convert a value from SI base units to the given unit.
   */
  fromSI(siValue: number, toSymbol: string): number {
    const unit = this.getUnit(toSymbol);
    return (siValue - unit.offset) / unit.scale;
  }

  /**
   * List all registered unit symbols.
   */
  listUnits(): string[] {
    return [...this.units.keys()];
  }

  /**
   * Register common standard units.
   */
  private registerStandardUnits(): void {
    const DIM_DIMENSIONLESS: DimensionVector = [0, 0, 0, 0, 0, 0, 0];
    const DIM_LENGTH: DimensionVector      = [0, 1, 0, 0, 0, 0, 0];
    const DIM_MASS: DimensionVector        = [1, 0, 0, 0, 0, 0, 0];
    const DIM_TIME: DimensionVector        = [0, 0, 1, 0, 0, 0, 0];
    const DIM_TEMPERATURE: DimensionVector = [0, 0, 0, 1, 0, 0, 0];
    const DIM_PRESSURE: DimensionVector    = [1, -1, -2, 0, 0, 0, 0];
    const DIM_FORCE: DimensionVector       = [1, 1, -2, 0, 0, 0, 0];

    // Dimensionless
    this.register({ symbol: '1', name: 'Dimensionless', dimension: DIM_DIMENSIONLESS, scale: 1, offset: 0 });

    // Length
    this.register({ symbol: 'm', name: 'Meter', dimension: DIM_LENGTH, scale: 1, offset: 0 });
    this.register({ symbol: 'cm', name: 'Centimeter', dimension: DIM_LENGTH, scale: 0.01, offset: 0 });
    this.register({ symbol: 'mm', name: 'Millimeter', dimension: DIM_LENGTH, scale: 0.001, offset: 0 });
    this.register({ symbol: 'in', name: 'Inch', dimension: DIM_LENGTH, scale: 0.0254, offset: 0 });
    this.register({ symbol: 'ft', name: 'Foot', dimension: DIM_LENGTH, scale: 0.3048, offset: 0 });
    this.register({ symbol: 'km', name: 'Kilometer', dimension: DIM_LENGTH, scale: 1000, offset: 0 });

    // Mass
    this.register({ symbol: 'kg', name: 'Kilogram', dimension: DIM_MASS, scale: 1, offset: 0 });
    this.register({ symbol: 'g', name: 'Gram', dimension: DIM_MASS, scale: 0.001, offset: 0 });

    // Time
    this.register({ symbol: 's', name: 'Second', dimension: DIM_TIME, scale: 1, offset: 0 });
    this.register({ symbol: 'minute', name: 'Minute', dimension: DIM_TIME, scale: 60, offset: 0 });
    this.register({ symbol: 'h', name: 'Hour', dimension: DIM_TIME, scale: 3600, offset: 0 });

    // Temperature
    this.register({ symbol: 'K', name: 'Kelvin', dimension: DIM_TEMPERATURE, scale: 1, offset: 0 });
    this.register({ symbol: 'C', name: 'Celsius', dimension: DIM_TEMPERATURE, scale: 1, offset: 273.15 });
    this.register({ symbol: 'F', name: 'Fahrenheit', dimension: DIM_TEMPERATURE, scale: 5/9, offset: 273.15 - (32 * 5/9) });

    // Pressure
    this.register({ symbol: 'Pa', name: 'Pascal', dimension: DIM_PRESSURE, scale: 1, offset: 0 });
    this.register({ symbol: 'kPa', name: 'Kilopascal', dimension: DIM_PRESSURE, scale: 1000, offset: 0 });
    this.register({ symbol: 'MPa', name: 'Megapascal', dimension: DIM_PRESSURE, scale: 1e6, offset: 0 });
    this.register({ symbol: 'bar', name: 'Bar', dimension: DIM_PRESSURE, scale: 1e5, offset: 0 });
    this.register({ symbol: 'atm', name: 'Atmosphere', dimension: DIM_PRESSURE, scale: 101325, offset: 0 });
    this.register({ symbol: 'psi', name: 'Pound per square inch', dimension: DIM_PRESSURE, scale: 6894.757293, offset: 0 });

    // Force
    this.register({ symbol: 'N', name: 'Newton', dimension: DIM_FORCE, scale: 1, offset: 0 });
    this.register({ symbol: 'kN', name: 'Kilonewton', dimension: DIM_FORCE, scale: 1000, offset: 0 });

    // Derived dimensions for simulation solvers
    const DIM_DENSITY: DimensionVector         = [1, -3, 0, 0, 0, 0, 0];
    const DIM_VELOCITY: DimensionVector        = [0, 1, -1, 0, 0, 0, 0];
    const DIM_POWER: DimensionVector           = [1, 2, -3, 0, 0, 0, 0];
    const DIM_ENERGY: DimensionVector          = [1, 2, -2, 0, 0, 0, 0];
    const DIM_THERMAL_K: DimensionVector       = [1, 1, -3, -1, 0, 0, 0]; // W/(m·K)
    const DIM_SPECIFIC_HEAT: DimensionVector   = [0, 2, -2, -1, 0, 0, 0]; // J/(kg·K)
    const DIM_THERMAL_DIFF: DimensionVector    = [0, 2, -1, 0, 0, 0, 0]; // m²/s
    const DIM_HTC: DimensionVector             = [1, 0, -3, -1, 0, 0, 0]; // W/(m²·K)
    const DIM_FLOW_RATE: DimensionVector       = [0, 3, -1, 0, 0, 0, 0]; // m³/s
    const DIM_DYN_VISCOSITY: DimensionVector   = [1, -1, -1, 0, 0, 0, 0]; // Pa·s
    const DIM_AREA: DimensionVector            = [0, 2, 0, 0, 0, 0, 0];

    // Density
    this.register({ symbol: 'kg/m3', name: 'Kilograms per cubic meter', dimension: DIM_DENSITY, scale: 1, offset: 0 });

    // Velocity
    this.register({ symbol: 'm/s', name: 'Meters per second', dimension: DIM_VELOCITY, scale: 1, offset: 0 });

    // Area
    this.register({ symbol: 'm2', name: 'Square meter', dimension: DIM_AREA, scale: 1, offset: 0 });
    this.register({ symbol: 'mm2', name: 'Square millimeter', dimension: DIM_AREA, scale: 1e-6, offset: 0 });

    // Power
    this.register({ symbol: 'W', name: 'Watt', dimension: DIM_POWER, scale: 1, offset: 0 });
    this.register({ symbol: 'kW', name: 'Kilowatt', dimension: DIM_POWER, scale: 1000, offset: 0 });
    this.register({ symbol: 'BTU/hr', name: 'BTU per hour', dimension: DIM_POWER, scale: 0.29307107, offset: 0 });

    // Energy
    this.register({ symbol: 'J', name: 'Joule', dimension: DIM_ENERGY, scale: 1, offset: 0 });
    this.register({ symbol: 'kJ', name: 'Kilojoule', dimension: DIM_ENERGY, scale: 1000, offset: 0 });

    // Thermal conductivity — W/(m·K)
    this.register({ symbol: 'W/(m*K)', name: 'Watts per meter-kelvin', dimension: DIM_THERMAL_K, scale: 1, offset: 0 });

    // Specific heat — J/(kg·K)
    this.register({ symbol: 'J/(kg*K)', name: 'Joules per kilogram-kelvin', dimension: DIM_SPECIFIC_HEAT, scale: 1, offset: 0 });

    // Thermal diffusivity — m²/s
    this.register({ symbol: 'm2/s', name: 'Square meters per second', dimension: DIM_THERMAL_DIFF, scale: 1, offset: 0 });

    // Heat transfer coefficient — W/(m²·K)
    this.register({ symbol: 'W/(m2*K)', name: 'Watts per square meter-kelvin', dimension: DIM_HTC, scale: 1, offset: 0 });

    // Flow rate
    this.register({ symbol: 'm3/s', name: 'Cubic meters per second', dimension: DIM_FLOW_RATE, scale: 1, offset: 0 });
    this.register({ symbol: 'L/s', name: 'Liters per second', dimension: DIM_FLOW_RATE, scale: 0.001, offset: 0 });
    this.register({ symbol: 'gpm', name: 'Gallons per minute (US)', dimension: DIM_FLOW_RATE, scale: 6.30902e-5, offset: 0 });

    // Dynamic viscosity — Pa·s
    this.register({ symbol: 'Pa*s', name: 'Pascal-second', dimension: DIM_DYN_VISCOSITY, scale: 1, offset: 0 });

    // Stress (same dimension as pressure — alias for clarity)
    this.register({ symbol: 'GPa', name: 'Gigapascal', dimension: DIM_PRESSURE, scale: 1e9, offset: 0 });
  }
}

// Global registry export
export const registry = new UnitRegistry();
