/**
 * Units — Dimensional analysis and type-safe physical quantities.
 *
 * Provides:
 * - Branded numeric types for compile-time dimensional safety
 * - Runtime unit conversion with dimensional mismatch detection
 * - SI base unit enforcement for all internal computation
 */

// Branded types + constructors + conversion functions
export {
  // Types
  type DimensionVector,
  type Quantity,
  type Temperature,
  type Pressure,
  type Force,
  type Length,
  type Area,
  type Volume,
  type Time,
  type Mass,
  type Density,
  type Velocity,
  type ThermalConductivity,
  type SpecificHeat,
  type ThermalDiffusivity,
  type HeatTransferCoefficient,
  type HeatFlux,
  type Power,
  type Energy,
  type YoungsModulus,
  type YieldStrength,
  type Stress,
  type Strain,
  type PoissonRatio,
  type DynamicViscosity,
  type KinematicViscosity,
  type FlowRate,
  type Roughness,

  // Constructors (brand raw numbers)
  temperature,
  pressure,
  force,
  length,
  area,
  volume,
  time,
  mass,
  density,
  velocity,
  thermalConductivity,
  specificHeat,
  thermalDiffusivity,
  heatTransferCoefficient,
  power,
  energy,
  youngsModulus,
  yieldStrength,
  stress,
  strain,
  poissonRatio,
  dynamicViscosity,
  kinematicViscosity,
  flowRate,
  roughness,

  // Temperature conversions
  celsiusToKelvin,
  kelvinToCelsius,
  fahrenheitToKelvin,
  kelvinToFahrenheit,

  // Pressure conversions
  barToPascal,
  pascalToBar,
  psiToPascal,
  pascalToPsi,
  atmToPascal,
  pascalToAtm,

  // Length conversions
  millimetersToMeters,
  metersToMillimeters,
  inchesToMeters,
  metersToInches,
  feetToMeters,
  metersToFeet,

  // Power conversions
  kilowattsToWatts,
  wattsToKilowatts,
  btuPerHourToWatts,
  wattsToBtuPerHour,

  // Flow rate conversions
  litersPerSecondToM3s,
  m3sToLitersPerSecond,
  gallonsPerMinuteToM3s,
  m3sToGallonsPerMinute,
} from './PhysicalQuantity';

// Registry + runtime dimensional analysis
export {
  UnitRegistry,
  DimensionalMismatchError,
  registry,
  type UnitDefinition,
} from './UnitRegistry';
