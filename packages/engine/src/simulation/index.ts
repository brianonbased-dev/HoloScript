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
export { StructuralSolverTET10, tet4ToTet10, type TET10Config, type TET10Constraint, type TET10Load, type TET10Stats } from './StructuralSolverTET10';
export { HydraulicSolver, type HydraulicConfig, type HydraulicPipe, type HydraulicNode, type HydraulicValve } from './HydraulicSolver';
export { SaturationManager, type SaturationConfig, type SaturationEvent } from './SaturationManager';
export { AcousticSolver, buildLayeredVelocity, type AcousticConfig, type AcousticSource, type AcousticBC, type AcousticStats } from './AcousticSolver';
export { FDTDSolver, type FDTDConfig, type EMSource, type FDTDStats } from './FDTDSolver';
export { NavierStokesSolver, type NavierStokesConfig, type CFDBC, type NavierStokesStats } from './NavierStokesSolver';
export { MultiphaseNSSolver, type MultiphaseConfig, type MultiphaseStats } from './MultiphaseNSSolver';
export { MolecularDynamicsSolver, type MDConfig, type MDStats } from './MolecularDynamicsSolver';
export { ReactionDiffusionSolver, type ReactionDiffusionConfig, type ReactionDiffusionStats, type Species, type Reaction } from './ReactionDiffusionSolver';

// Meshing — Surface-to-volume tet mesh generation
export {
  meshBox, meshSurface, meshQuality,
  findNodesOnFace, findNodesInSphere,
  registerWasmMesher,
  type TetMesh, type BoxMeshOptions, type SurfaceMesh, type SurfaceMeshOptions, type WasmMesher,
} from './AutoMesher';
export { TetGenWasmMesher } from './wasm/TetGenWasmMesher';

// Data Import — Universal file format parsers
export {
  parseSTL, buildSTL,
  parseOBJ,
  importScalarFieldCSV, importTableCSV,
  importStructuredPoints, importUnstructuredGrid,
  type VTKStructuredResult, type VTKUnstructuredResult,
} from './import/index';

// Simulation Contract — Enforced guarantees for scientific reliability
export {
  ContractedSimulation, DeterministicStepper,
  hashGeometry, validateUnits, validateMeshSanity,
  type SimulationProvenance, type InteractionEvent, type ContractViolation, type ContractConfig,
} from './SimulationContract';

// CAEL (Contracted Agent-Environment Loop) — hash-chain artifact standard
export {
  type CAELTrace,
  type CAELTraceEntry,
  type CAELTraceEvent,
  encodeCAELValue,
  decodeCAELValue,
  hashCAELEntry,
  toCAELJSONL,
  parseCAELJSONL,
  verifyCAELHashChain,
} from './CAELTrace';
export { CAELRecorder } from './CAELRecorder';
export { CAELReplayer } from './CAELReplayer';
export {
  forkTrace,
  forkAndChoose,
  dream,
  mulberry32,
  type CAELSolverFactory,
  type ForkAlternative,
  type ForkBranchResult,
  type ForkAndChooseResult,
  type DreamConfig,
  type DreamEpisodeResult,
  type DreamResult,
} from './CAELForkDream';
export {
  CAELAgentLoop,
  FieldSensorBridge,
  SimpleActionSelector,
  StructuralActionMapper,
  type SensorReading,
  type CAELSensorBridge,
  type CognitionSnapshot,
  type CAELCognitionEngine,
  type AgentAction,
  type ActionDecision,
  type CAELActionSelector,
  type WorldDelta,
  type CAELActionMapper,
  type CAELAgentConfig,
  type FieldSensorPoint,
  type FieldSensorBridgeConfig,
  type SimpleActionSelectorConfig,
  type StructuralActionMapperConfig,
} from './CAELAgent';
export {
  SNNCognitionEngine,
  type SNNCognitionEngineConfig,
} from './SNNCognitionEngine';

export {
  CRDTCAELBridge,
  type CRDTCAELBridgeConfig,
} from './CRDTCAELBridge';

// Simulation Recording & Playback — Animate time-evolving simulations
export { SimulationRecorder, type RecorderConfig, type FieldSnapshot } from './SimulationRecorder';
export { SimulationPlayback, type PlaybackConfig, type PlaybackState } from './SimulationPlayback';

// Simulation Serialization — Shareable simulation configs
export {
  serializeSimulation, deserializeSimulation,
  simulationToBase64, base64ToSimulation, estimateURLSize,
  type SerializedSimulation,
} from './SimulationSerializer';

// Intelligence — Result interpretation and natural language queries
export {
  interpretResults, querySimulation, generateAutoReport,
  type SimulationInsight, type InsightSeverity, type InsightCategory,
} from './intelligence/index';

// Layer 4 — Multi-Physics Coupling
export { CouplingManager, type FieldCoupling } from './CouplingManager';
export { CouplingManagerV2, type FieldCouplingV2, type CouplingStatsV2 } from './CouplingManagerV2';

// Generic Solver Interface
export { type SimSolver, type SolverMode, type FieldData } from './SimSolver';
export {
  ThermalSolverAdapter, StructuralSolverAdapter,
  TET10SolverAdapter, HydraulicSolverAdapter, AcousticSolverAdapter,
  FDTDSolverAdapter, ReactionDiffusionSolverAdapter,
} from './adapters/SolverAdapters';

// Experiment Orchestration
export {
  ParameterSpace, applyOverrides,
  ExperimentOrchestrator,
  summarize, sensitivity, paretoFront, exportSweepCSV,
  type ParameterRange, type ParameterSample,
  type ExperimentConfig, type ExperimentResult, type ExperimentRunResult, type SolverHandle,
  type SweepSummary, type SensitivityResult, type ParetoPoint,
} from './experiment/index';

// Uncertainty Quantification — Stochastic analysis via LHS ensembles
export {
  UncertaintyQuantification,
  computeScalarDistribution,
  computeFieldDistribution,
  type UQConfig,
  type UQResult,
  type UQSolverHandle,
  type ScalarDistribution,
  type FieldDistribution,
} from './UncertaintyQuantification';

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
  type Acceleration,
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
  acceleration,
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
  type SolverType,
  type ConvergencePlotPoint,
  type ConvergencePlotData,
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
