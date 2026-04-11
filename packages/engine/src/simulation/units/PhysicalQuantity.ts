/**
 * PhysicalQuantity — Branded numeric types for dimensional safety.
 *
 * Uses TypeScript's structural type system with branded intersections
 * to prevent mixing incompatible physical quantities at compile time.
 * All internal computation uses SI base units; conversion happens
 * only at system boundaries (user input, data export).
 *
 * References:
 *   BIPM SI Brochure (9th ed., 2019) — base unit definitions
 *   NIST SP 811 — Guide for the Use of the International System of Units
 */

// ── Dimension Signature ──────────────────────────────────────────────────────

/**
 * Encodes SI base-unit exponents: [kg, m, s, K, A, mol, cd].
 * Example: Force (N = kg·m/s²) → [1, 1, -2, 0, 0, 0, 0]
 */
export type DimensionVector = readonly [
  kg: number,
  m: number,
  s: number,
  K: number,
  A: number,
  mol: number,
  cd: number,
];

// ── Branded Number Types ─────────────────────────────────────────────────────

declare const __brand: unique symbol;

/**
 * A number carrying a compile-time dimensional brand.
 * At runtime it's just a number — zero overhead.
 */
export type Quantity<Brand extends string> = number & {
  readonly [__brand]: Brand;
};

// ── Concrete Physical Quantity Types ─────────────────────────────────────────

/** Temperature in Kelvin (K) */
export type Temperature = Quantity<'Temperature_K'>;

/** Pressure in Pascals (Pa = kg/(m·s²)) */
export type Pressure = Quantity<'Pressure_Pa'>;

/** Force in Newtons (N = kg·m/s²) */
export type Force = Quantity<'Force_N'>;

/** Length in meters (m) */
export type Length = Quantity<'Length_m'>;

/** Area in square meters (m²) */
export type Area = Quantity<'Area_m2'>;

/** Volume in cubic meters (m³) */
export type Volume = Quantity<'Volume_m3'>;

/** Time in seconds (s) */
export type Time = Quantity<'Time_s'>;

/** Mass in kilograms (kg) */
export type Mass = Quantity<'Mass_kg'>;

/** Density in kg/m³ */
export type Density = Quantity<'Density_kg_m3'>;

/** Velocity in m/s */
export type Velocity = Quantity<'Velocity_m_s'>;

/** Thermal conductivity in W/(m·K) */
export type ThermalConductivity = Quantity<'ThermalConductivity_W_mK'>;

/** Specific heat capacity in J/(kg·K) */
export type SpecificHeat = Quantity<'SpecificHeat_J_kgK'>;

/** Thermal diffusivity in m²/s */
export type ThermalDiffusivity = Quantity<'ThermalDiffusivity_m2_s'>;

/** Heat transfer coefficient in W/(m²·K) */
export type HeatTransferCoefficient = Quantity<'HTC_W_m2K'>;

/** Heat flux in W/m² */
export type HeatFlux = Quantity<'HeatFlux_W_m2'>;

/** Power / heat output in Watts (W = kg·m²/s³) */
export type Power = Quantity<'Power_W'>;

/** Energy in Joules (J = kg·m²/s²) */
export type Energy = Quantity<'Energy_J'>;

/** Young's modulus in Pascals (Pa) */
export type YoungsModulus = Quantity<'YoungsModulus_Pa'>;

/** Yield strength in Pascals (Pa) */
export type YieldStrength = Quantity<'YieldStrength_Pa'>;

/** Stress in Pascals (Pa) */
export type Stress = Quantity<'Stress_Pa'>;

/** Strain (dimensionless) */
export type Strain = Quantity<'Strain'>;

/** Poisson's ratio (dimensionless, 0 < v < 0.5) */
export type PoissonRatio = Quantity<'PoissonRatio'>;

/** Dynamic viscosity in Pa·s */
export type DynamicViscosity = Quantity<'DynamicViscosity_Pa_s'>;

/** Kinematic viscosity in m²/s */
export type KinematicViscosity = Quantity<'KinematicViscosity_m2_s'>;

/** Flow rate in m³/s */
export type FlowRate = Quantity<'FlowRate_m3_s'>;

/** Pipe roughness (dimensionless Darcy-Weisbach friction factor) */
export type Roughness = Quantity<'Roughness'>;

// ── Constructors (cast raw numbers to branded types) ─────────────────────────

/**
 * Wrap a raw number as a specific physical quantity.
 * Use at system boundaries where raw numbers enter the simulation.
 */
export function temperature(value: number): Temperature {
  return value as Temperature;
}

export function pressure(value: number): Pressure {
  return value as Pressure;
}

export function force(value: number): Force {
  return value as Force;
}

export function length(value: number): Length {
  return value as Length;
}

export function area(value: number): Area {
  return value as Area;
}

export function volume(value: number): Volume {
  return value as Volume;
}

export function time(value: number): Time {
  return value as Time;
}

export function mass(value: number): Mass {
  return value as Mass;
}

export function density(value: number): Density {
  return value as Density;
}

export function velocity(value: number): Velocity {
  return value as Velocity;
}

export function thermalConductivity(value: number): ThermalConductivity {
  return value as ThermalConductivity;
}

export function specificHeat(value: number): SpecificHeat {
  return value as SpecificHeat;
}

export function thermalDiffusivity(value: number): ThermalDiffusivity {
  return value as ThermalDiffusivity;
}

export function heatTransferCoefficient(value: number): HeatTransferCoefficient {
  return value as HeatTransferCoefficient;
}

export function power(value: number): Power {
  return value as Power;
}

export function energy(value: number): Energy {
  return value as Energy;
}

export function youngsModulus(value: number): YoungsModulus {
  return value as YoungsModulus;
}

export function yieldStrength(value: number): YieldStrength {
  return value as YieldStrength;
}

export function stress(value: number): Stress {
  return value as Stress;
}

export function strain(value: number): Strain {
  return value as Strain;
}

export function poissonRatio(value: number): PoissonRatio {
  return value as PoissonRatio;
}

export function dynamicViscosity(value: number): DynamicViscosity {
  return value as DynamicViscosity;
}

export function kinematicViscosity(value: number): KinematicViscosity {
  return value as KinematicViscosity;
}

export function flowRate(value: number): FlowRate {
  return value as FlowRate;
}

export function roughness(value: number): Roughness {
  return value as Roughness;
}

// ── Unit Conversion Functions ────────────────────────────────────────────────

/**
 * Temperature conversions — all return Kelvin (SI base).
 */
export function celsiusToKelvin(celsius: number): Temperature {
  return (celsius + 273.15) as Temperature;
}

export function kelvinToCelsius(kelvin: Temperature): number {
  return (kelvin as number) - 273.15;
}

export function fahrenheitToKelvin(fahrenheit: number): Temperature {
  return ((fahrenheit - 32) * (5 / 9) + 273.15) as Temperature;
}

export function kelvinToFahrenheit(kelvin: Temperature): number {
  return ((kelvin as number) - 273.15) * (9 / 5) + 32;
}

/**
 * Pressure conversions — all return Pascals (SI base).
 */
export function barToPascal(bar: number): Pressure {
  return (bar * 1e5) as Pressure;
}

export function pascalToBar(pascal: Pressure): number {
  return (pascal as number) / 1e5;
}

export function psiToPascal(psi: number): Pressure {
  return (psi * 6894.757) as Pressure;
}

export function pascalToPsi(pascal: Pressure): number {
  return (pascal as number) / 6894.757;
}

export function atmToPascal(atm: number): Pressure {
  return (atm * 101325) as Pressure;
}

export function pascalToAtm(pascal: Pressure): number {
  return (pascal as number) / 101325;
}

/**
 * Length conversions — all return meters (SI base).
 */
export function millimetersToMeters(mm: number): Length {
  return (mm * 0.001) as Length;
}

export function metersToMillimeters(m: Length): number {
  return (m as number) * 1000;
}

export function inchesToMeters(inches: number): Length {
  return (inches * 0.0254) as Length;
}

export function metersToInches(m: Length): number {
  return (m as number) / 0.0254;
}

export function feetToMeters(feet: number): Length {
  return (feet * 0.3048) as Length;
}

export function metersToFeet(m: Length): number {
  return (m as number) / 0.3048;
}

/**
 * Power / energy conversions.
 */
export function kilowattsToWatts(kw: number): Power {
  return (kw * 1000) as Power;
}

export function wattsToKilowatts(w: Power): number {
  return (w as number) / 1000;
}

export function btuPerHourToWatts(btu_hr: number): Power {
  return (btu_hr * 0.29307107) as Power;
}

export function wattsToBtuPerHour(w: Power): number {
  return (w as number) / 0.29307107;
}

/**
 * Flow rate conversions — all return m³/s (SI base).
 */
export function litersPerSecondToM3s(lps: number): FlowRate {
  return (lps * 0.001) as FlowRate;
}

export function m3sToLitersPerSecond(m3s: FlowRate): number {
  return (m3s as number) / 0.001;
}

export function gallonsPerMinuteToM3s(gpm: number): FlowRate {
  return (gpm * 6.30902e-5) as FlowRate;
}

export function m3sToGallonsPerMinute(m3s: FlowRate): number {
  return (m3s as number) / 6.30902e-5;
}
