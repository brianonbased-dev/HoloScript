/**
 * Simulation — PDE-based engineering solvers for HoloScript.
 *
 * Layer 0: Shared infrastructure (grid, materials, BCs, convergence)
 * Layer 1: Domain solvers (thermal, structural, hydraulic, saturation)
 * Layer 4: Multi-physics coupling
 *
 * Solver factories are registered with SimulationSolverFactory
 * by SimulationProvider (r3f-renderer) on mount, so trait handlers
 * can instantiate solvers without importing engine directly.
 */

// Layer 0 — Infrastructure
export { RegularGrid3D } from './RegularGrid3D';
export {
  applyBoundaryConditions,
  type BoundaryCondition,
  type BCType,
  type BCFace,
} from './BoundaryConditions';
export {
  getMaterial,
  findMaterial,
  registerMaterial,
  listMaterials,
  thermalDiffusivity,
  type ThermalMaterial,
  type StructuralMaterial,
  type HydraulicMaterial,
  type SimulationMaterial,
} from './MaterialDatabase';
export {
  conjugateGradient,
  jacobiIteration,
  type ConvergenceResult,
} from './ConvergenceControl';

// Layer 1 — Domain Solvers
export { ThermalSolver, type ThermalConfig, type ThermalSource } from './ThermalSolver';
export { StructuralSolver, type StructuralConfig, type StructuralConstraint, type StructuralLoad } from './StructuralSolver';
export { HydraulicSolver, type HydraulicConfig, type HydraulicPipe, type HydraulicNode, type HydraulicValve } from './HydraulicSolver';
export { SaturationManager, type SaturationConfig, type SaturationEvent } from './SaturationManager';

// Layer 4 — Multi-Physics Coupling
export { CouplingManager, type FieldCoupling } from './CouplingManager';

// Units — Dimensional analysis and type-safe physical quantities
export {
  // Registry
  UnitRegistry,
  DimensionalMismatchError,
  registry,
  type UnitDefinition,
} from './units/UnitRegistry';
export {
  // Branded types
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
  type Power,
  type Energy,
  type YoungsModulus,
  type YieldStrength,
  type Stress,
  type Strain,
  type PoissonRatio,
  type FlowRate,
  // Constructors
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
  thermalDiffusivity as thermalDiffusivityQuantity,
  power,
  energy,
  youngsModulus,
  yieldStrength,
  stress,
  strain,
  poissonRatio,
  flowRate,
  // Conversions
  celsiusToKelvin,
  kelvinToCelsius,
  fahrenheitToKelvin,
  kelvinToFahrenheit,
} from './units/PhysicalQuantity';

// Material Properties — Temperature-dependent lookup
export {
  getMaterialAtTemperature,
  getThermalConductivity,
  getSpecificHeat,
  getDensity,
  getDynamicViscosity,
  hasTemperatureDependentData,
  getTemperatureRange,
  listTemperatureDependentMaterials,
} from './MaterialProperties';

// Export — VTK, CSV, JSON data export for post-processing
export {
  exportStructuredPoints,
  exportUnstructuredGrid,
  exportPolyData,
  exportConvergenceHistory,
  exportScalarFieldCSV,
  exportTable,
  exportMaterialTable,
  createMetadata,
  validateMetadata,
  serializeMetadata,
  deserializeMetadata,
  type SimulationMetadata,
} from './export/index';

// Verification — Convergence analysis utilities
export {
  errorL2,
  errorLinf,
  relativeErrorL2,
  computeObservedOrder,
  convergenceOrderTwoLevel,
  richardsonExtrapolation,
  gridConvergenceIndex,
  runConvergenceStudy,
  type ConvergenceStudyResult,
} from './verification/ConvergenceAnalysis';

// Verification — V&V report generation
export {
  createVerificationReport,
  renderReportMarkdown,
  renderReportLatex,
  type BenchmarkResult,
  type VerificationReport,
} from './verification/ReportGenerator';

// Provenance — Simulation run tracking and reproducibility
export {
  createSimulationRun,
  compareRuns,
  ProvenanceTracker,
  type SimulationRun,
  type SimulationRunConfig,
  type SimulationRunResult,
  type RunComparison,
} from './provenance/index';
