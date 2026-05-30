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
export { conjugateGradient, jacobiIteration, type ConvergenceResult } from './ConvergenceControl';

// Layer 1 — Domain Solvers
export { ThermalSolver, type ThermalConfig, type ThermalSource } from './ThermalSolver';
export {
  StructuralSolver,
  type StructuralConfig,
  type StructuralConstraint,
  type StructuralLoad,
} from './StructuralSolver';
export {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
  type TET10Constraint,
  type TET10Load,
  type TET10Stats,
} from './StructuralSolverTET10';
export {
  HydraulicSolver,
  type HydraulicConfig,
  type HydraulicPipe,
  type HydraulicNode,
  type HydraulicValve,
} from './HydraulicSolver';
export {
  SaturationManager,
  type SaturationConfig,
  type SaturationEvent,
} from './SaturationManager';
export {
  AcousticSolver,
  buildLayeredVelocity,
  type AcousticConfig,
  type AcousticSource,
  type AcousticBC,
  type AcousticStats,
} from './AcousticSolver';
export { FDTDSolver, type FDTDConfig, type EMSource, type FDTDStats } from './FDTDSolver';
export {
  NavierStokesSolver,
  type NavierStokesConfig,
  type CFDBC,
  type NavierStokesStats,
} from './NavierStokesSolver';
export {
  MultiphaseNSSolver,
  type MultiphaseConfig,
  type MultiphaseStats,
} from './MultiphaseNSSolver';
export { MolecularDynamicsSolver, type MDConfig, type MDStats } from './MolecularDynamicsSolver';
export {
  ReactionDiffusionSolver,
  type ReactionDiffusionConfig,
  type ReactionDiffusionStats,
  type Species,
  type Reaction,
} from './ReactionDiffusionSolver';
export {
  AffinityODESolver,
  type AffinityConfig,
  type AffinityState,
  type AffinityStats,
  type AgentParams,
  type PersonalityArchetype,
  type SternbergParams,
  type NashEffortParams,
} from './AffinityODESolver';

// Meshing — Surface-to-volume tet mesh generation
export {
  meshBox,
  meshSurface,
  meshQuality,
  findNodesOnFace,
  findNodesInSphere,
  registerWasmMesher,
  type TetMesh,
  type BoxMeshOptions,
  type SurfaceMesh,
  type SurfaceMeshOptions,
  type WasmMesher,
} from './AutoMesher';
export { TetGenWasmMesher } from './wasm/TetGenWasmMesher';

// Data Import — Universal file format parsers
export {
  parseSTL,
  buildSTL,
  parseOBJ,
  importScalarFieldCSV,
  importTableCSV,
  importStructuredPoints,
  importUnstructuredGrid,
  parseGmsh,
  MeshImportError,
  importMesh,
  importMeshSync,
  detectFormat,
  type VTKStructuredResult,
  type VTKUnstructuredResult,
  type MeshFormat,
  type ImportOptions,
  type ImportedMesh,
} from './import/index';

// Simulation Contract — Enforced guarantees for scientific reliability
export {
  ContractedSimulation,
  DeterministicStepper,
  computeStateDigest,
  hashGeometry,
  validateUnits,
  validateMeshSanity,
  validatePhysicsSanity,
  acceptsCrossScale,
  coarsestCommonScale,
  verifyContinuation,
  SCALE_ALIASES,
  SCALE_FROM_ALIAS,
  SCALE_ORDER,
  DEFAULT_SCALE_ENVELOPES,
  type SimulationProvenance,
  type ReceiptContinuation,
  type InteractionEvent,
  type ContractViolation,
  type ContractConfig,
  type SimulationScale,
  type ScaleEnvelope,
} from './SimulationContract';

// Wire equivalence (W.315) — compare two contract / replay records (twin vs device)
export {
  EQUIVALENCE_V1,
  buildEquivalenceV1Record,
  canonicalWireSnapshot,
  stableStringify,
  toEquivalenceWireInput,
  wireFormatEquivalent,
  wireKey,
  type EquivalenceV1Record,
  type EquivalenceV1SolverType,
  type EquivalenceWireInput,
} from './equivalenceRecord';

// Agent dialog wire (`agent.dialog.v1`) — third instance of the time-binding
// solverType family (W.107 ui.session.v1, W.315 equivalence.v1, this).
// Chain-typed dialog turns; replay-deterministic across agent restarts and
// fleet-instance churn (W.111). See research/2026-04-27_time-premise-
// holoscript-architecture.md for the architectural rationale.
export {
  AGENT_DIALOG_V1,
  buildAgentDialogV1Record,
  canonicalDialogSnapshot,
  dialogWireKey,
  wireFormatEquivalentDialog,
  type AgentDialogV1Record,
  type AgentDialogV1SolverType,
  type AgentDialogWireInput,
  type DialogTurn,
} from './agentDialogRecord';

// Network event wire (`network.event.v1`) — fifth instance of the time-binding
// solverType family. Chain-typed HoloMesh team-feed events (presence joins,
// board claims, knowledge syncs, mode switches, suggestion votes); replay-
// deterministic across observer restarts and instance churn (W.111). The
// "live" team-feed framing is a UX choice, not an architectural fact —
// underneath, this is rapid cursor-advance over a shared block universe.
export {
  NETWORK_EVENT_V1,
  buildNetworkEventV1Record,
  canonicalNetworkEventSnapshot,
  networkEventWireKey,
  wireFormatEquivalentNetworkEvent,
  type NetworkEvent,
  type NetworkEventV1Record,
  type NetworkEventV1SolverType,
  type NetworkEventWireInput,
} from './networkEventRecord';

// Impossibility evidence (`impossibility.v1`) — counterweight to the
// consensus-side wire-format family. Types evidence shipped against one of
// the 28 named impossibilities (see research/2026-03-09_holoscript-three-
// format-impossibility-map.md and research/2026-03-09_holoscript-14-
// impossibilities-outside-the-box.md). Uses the existing SOLVES/PARTIALLY/
// REFRAMES/DOESN'T_HELP rating scale. EXPECTS plural ratings for the same
// impossibility from different agents (debate is first-class) and supports
// the documented historical UPGRADE pattern (W.056 Cross-Platform
// Determinism: DOESN'T_HELP → PARTIALLY after behavioral reframing).
export {
  IMPOSSIBILITY_V1,
  aggregateEvidence,
  buildImpossibilityV1Record,
  direction,
  evidenceWireKey,
  rank,
  validateEvidence,
  type EvidenceCohort,
  type FormatTag,
  type ImpossibilityEvidence,
  type ImpossibilityRating,
  type ImpossibilityV1Record,
  type ImpossibilityV1SolverType,
  type RatingDirection,
} from './impossibilityEvidence';

// Conjecture evidence (`conjecture.v1`) — executable math/geometry claims.
// A conjecture receipt evaluates candidate geometries with invariant probes,
// preserves counterexamples, and gives survivors deterministic receipt keys.
export {
  CONJECTURE_NOVELTY_THRESHOLD,
  CONJECTURE_V1,
  DEFAULT_CONJECTURE_PRIOR_ART_CORPUS,
  assessConjectureNovelty,
  buildConjectureStableKey,
  buildConjectureV1Receipt,
  computeMeshFacts,
  createDegenerateTriangleCandidate,
  createSquareSheetCandidate,
  createTetrahedronSurfaceCandidate,
  collisionEquivalenceProbe,
  curvatureBoundProbe,
  eulerCharacteristicProbe,
  geometryHashOrderInvariantProbe,
  manifoldEdgeProbe,
  nonDegenerateGeometryProbe,
  type CandidateEvaluation,
  type ConjectureClaim,
  type ConjectureCounterexample,
  type ConjectureFalsifiabilityGate,
  type ConjectureFalsifiabilityStatus,
  type ConjectureIntakeAssessment,
  type ConjectureKind,
  type ConjectureNoveltyAssessment,
  type ConjectureNoveltyMatch,
  type ConjectureParameterValue,
  type ConjectureProbe,
  type ConjectureProbeEvaluationResult,
  type ConjectureProbePredicate,
  type ConjecturePriorArtEntry,
  type ConjectureReceipt,
  type ConjectureStatus,
  type ConjectureV1SolverType,
  type GeometryConjectureCandidate,
  type MeshFacts,
  type ProbeResult,
  type ProbeStatus,
} from './ConjectureEngine';

// Conjecture runner (`conjecture.runner.v1`) — the operator-facing MVP loop.
// Encodes GENERATE -> EXECUTE -> FALSIFY -> CLASSIFY -> GRADUATE -> RENDER as a
// deterministic receipt over `conjecture.v1` claim receipts.
export {
  CONJECTURE_RUNNER_V1,
  PROOF_CARRYING_GEOMETRY_SMOKE_SUITE,
  GENERATED_GEOMETRY_FAMILY_SUITE,
  ConjectureRunner,
  attachSemanticAdvisoriesToRunnerResult,
  runConjectureRunner,
  runConjectureRunnerWithSemanticAdvisory,
  runConjectureCostCell,
  runProofCarryingGeometryConjectureCycle,
  runGeneratedGeometryConjectureCycle,
  type ConjectureCandidateCost,
  type ConjectureCostCellResult,
  type ConjectureGraduationTarget,
  type ConjectureProbeTiming,
  type ConjectureRunnerClassification,
  type ConjectureRunnerGate,
  type ConjectureRunnerInput,
  type ConjectureRunnerPhase,
  type ConjectureRunnerReplay,
  type ConjectureRunnerResult,
  type ConjectureRunnerResultWithSemanticAdvisory,
  type ConjectureRunnerSemanticAdvisory,
  type ConjectureRunnerSemanticAdvisorySummary,
  type ConjectureRunnerStage,
  type ConjectureRunnerStatus,
  type ConjectureRunnerSuite,
  type ConjectureRunnerV1SolverType,
  type ConjectureScenarioRole,
} from './ConjectureRunner';

// Render Manifold (`conjecture.render-manifold.v1`) — the RENDER leg of the
// Conjecture Engine. Produces a receipt-carrying visible geometry surface
// (render manifold) from conjecture receipts, with a deterministic SHA-256
// invariant-probe hash. The conjecture run emits discover/prove/RENDER as the
// full triple (P36 Conjecture Engine gate).
export {
  RENDER_MANIFOLD_V1,
  renderManifoldFromReceipts,
  verifyRenderManifoldReplay,
  type RenderManifoldArtifact,
  type RenderManifoldSolverType,
  type RenderedSurface,
} from './RenderManifold';

// Conjecture GENERATE leg — parametric candidate-family generators that feed
// the runner machine-generated worlds (the "discover" leg).
export {
  regularPolygonSheetCandidate,
  generateRegularPolygonSheetFamily,
  collapsingTriangleCandidate,
  generateCollapsingTriangleFamily,
  sharedEdgeFanCandidate,
  generateSharedEdgeFanFamily,
  collisionEquivalenceQuadCandidate,
  generateCollisionEquivalenceFamily,
  curvatureConeCandidate,
  generateCurvatureConeFamily,
  type RegularPolygonSheetFamilyOptions,
  type CollapsingTriangleFamilyOptions,
  type SharedEdgeFanFamilyOptions,
  type CollisionEquivalenceFamilyOptions,
  type CurvatureConeFamilyOptions,
} from './ConjectureGenerator';

// SDF point evaluation — JS-side signed-distance sampling for future
// proof-carrying SDF conjecture candidates.
export {
  SDFPointEvaluator,
  evaluateSDFNode,
  sampleSDFDistanceField,
  type SDFCSGOperation,
  type SDFDistanceField,
  type SDFDomainOperation,
  type SDFEvaluation,
  type SDFNode,
  type SDFPoint,
  type SDFPrimitive,
  type SDFSampleBounds,
  type SDFSampleResolution,
} from './SDFPointEvaluator';

// Proof-carrying SDF conjecture sub-class (`conjecture.geometry.proof-carrying-sdf.v1`)
// — carries the 1-Lipschitz invariant as receipt evidence via adversarial sampling
// of evaluateSDFNode. Falsification is sound (a sampled ratio > 1 is a real
// counterexample); survival is evidence, not proof (W.511). Sphere survives, gyroid
// is the discovering falsifier.
export {
  PROOF_CARRYING_SDF_V1,
  LIPSCHITZ_TOLERANCE,
  empiricalLipschitzRatio,
  sphereCandidate,
  gyroidCandidate,
  generateSphereFamily,
  generateGyroidFamily,
  runProofCarryingSdfConjecture,
  type SdfConjectureCandidate,
  type SdfConjectureStatus,
  type ProofCarryingSdfReceipt,
  type ProofCarryingSdfOptions,
  type LipschitzWitness,
  type LipschitzResult,
  type SdfScenario,
  type SdfEvaluation,
  type SdfCounterexample,
} from './SdfConjecture';

// Conjecture prior-art corpus — a real, bounded seed of known results for the
// `rediscovered` novelty check (the honest-NO that stops a novice from claiming
// an already-known result, D.060 / W.520). Consumes the shipped assessConjectureNovelty
// corpus parameter; full literature ingestion is the documented follow-up.
export {
  KNOWN_RESULTS_CORPUS,
  assessNoveltyAgainstKnownResults,
} from './ConjecturePriorArtCorpus';

// Semantic novelty ADVISORY layer (scope 2026-05-23) — a learned local model
// (Xenova/all-MiniLM-L6-v2 via the already-present @huggingface/transformers, offline)
// that catches PARAPHRASES of known results the lexical trigram guard misses (W.520).
// ADVISORY only — never receipt-binding until cross-fleet determinism is proven.
export {
  SEMANTIC_NOVELTY_MODEL,
  SEMANTIC_NOVELTY_THRESHOLD,
  embedSemantic,
  cosineSimilarity as semanticCosineSimilarity,
  assessSemanticNovelty,
  calibrateNoveltyThreshold,
  LABELED_NOVELTY_EVAL_SET,
  type SemanticNoveltyStatus,
  type SemanticNoveltyMatch,
  type SemanticNoveltyAssessment,
  type LabeledNoveltyPair,
  type ThresholdCalibration,
} from './SemanticNoveltyEncoder';

// Semantic determinism gate (scope 2026-05-23, P1) — the cross-fleet reproducibility
// harness that decides advisory → receipt-binding promotion. A single machine is always
// `insufficient-evidence`; only ≥2 distinct machines producing byte-identical fingerprints
// are eligible. The honest fallback (stays advisory if the fleet can't reproduce) is structural.
export {
  DETERMINISM_MANIFEST_VERSION,
  DETERMINISM_DEFAULT_PRECISION,
  DETERMINISM_DEFAULT_REPEATS,
  DETERMINISM_PROBE_TEXTS,
  quantizeToken,
  vectorFingerprint,
  buildDeterminismManifest,
  compareDeterminismManifests,
  assessDeterminismGate,
  DEFAULT_DETERMINISM_TOLERANCE,
  compareRawWithinTolerance,
  assessRawToleranceGate,
  type DeterminismProbeEntry,
  type DeterminismManifest,
  type BuildDeterminismManifestOptions,
  type ManifestComparison,
  type DeterminismVerdict,
  type DeterminismGateAssessment,
  type RawVectorManifest,
  type RawToleranceComparison,
  type RawToleranceGateAssessment,
} from './SemanticDeterminismGate';

// Scalable pre-embedded corpus index (scope 2026-05-23, P3) — embeds a large prior-art
// corpus (10^3+ real arXiv abstracts) ONCE, then serves O(N)-cosine novelty queries that
// embed the query only. The path that makes the semantic advisory layer non-theater (D.060).
// ADVISORY only (one-machine cache is fleet-valid for cosine; see module note + P1 finding).
export {
  SEMANTIC_CORPUS_INDEX_VERSION,
  buildSemanticCorpusIndex,
  nearestByCosine,
  assessSemanticNoveltyIndexed,
  serializeIndex,
  deserializeIndex,
  type EmbeddedCorpusEntry,
  type SemanticCorpusIndex,
  type BuildIndexOptions,
} from './SemanticCorpusIndex';

// Conjecture-engine semantic advisory (scope 2026-05-23, P3) — attaches the learned-semantic
// novelty second-opinion to a finished receipt WITHOUT touching the receipt or its hash. The
// trigram leg stays receipt-binding; this is a sibling annotation (advisory, async). D.060.
export {
  attachSemanticAdvisory,
  type ConjectureReceiptWithAdvisory,
  type AttachSemanticAdvisoryOptions,
} from './ConjectureSemanticAdvisory';

// Verdict ledger (`conjecture.verdict-ledger.v1`) — temporal, assumption-bound
// conjecture verdicts ("knowledge is fluid", D.060). A verdict holds "as of T under
// assumptions A"; overturning a depended-on assumption RE-OPENS it (falsified →
// undecided, never auto-survived — the Wegener mechanism). Append-only history.
export {
  VERDICT_LEDGER_V1,
  recordVerdict,
  reopenVerdict,
  currentVerdict,
  hasBeenReopened,
  verdictHistory,
  conjectureStatusToVerdict,
  verdictFromConjectureReceipt,
  type VerdictStatus,
  type VerdictEntry,
  type VerdictLedger,
  type VerdictLedgerSolverType,
  type RecordVerdictInput,
  type ReopenVerdictInput,
} from './VerdictLedger';

// Number-theory conjecture sub-class (`conjecture.numbertheory.erdos-straus.v1`)
// — the first NON-geometry Conjecture Engine target. Reuses the generic receipt
// key primitive; survivor-by-construction with honest `undecided` on the open case.
export {
  ERDOS_STRAUS_V1,
  verifyErdosStraus,
  findErdosStrausDecomposition,
  findEqualUnitFraction,
  runErdosStrausConjecture,
  type ErdosStrausReceipt,
  type ErdosStrausOptions,
  type ErdosStrausSolverType,
  type NumberConjectureStatus,
  type NumberConjectureScenario,
  type NumberConjectureEvaluation,
  type NumberConjectureCounterexample,
  type UnitFractionDecomposition,
} from './NumberTheoryConjecture';

// String-math conjecture sub-class (`conjecture.stringmath.tropical-bezout.v1`) —
// verifies BKK / tropical Bézout (mixed volume of Newton polytopes == classical
// intersection number) by a real Minkowski-sum + convex-hull + shoelace pipeline.
// Receipt-tier instance verification, NOT a mirror-symmetry proof (Lean-tier).
export {
  TROPICAL_BEZOUT_V1,
  degreeTriangle,
  twiceArea,
  convexHull,
  minkowskiSum,
  mixedVolume2D,
  runTropicalBezoutConjecture,
  type LatticePoint,
  type TropicalBezoutReceipt,
  type TropicalBezoutOptions,
  type TropicalBezoutSolverType,
  type TropicalConjectureStatus,
  type TropicalScenario,
  type MixedVolumeEvaluation,
  type TropicalCounterexample,
} from './TropicalBezoutConjecture';

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
export { SNNCognitionEngine, type SNNCognitionEngineConfig } from './SNNCognitionEngine';

export { CRDTCAELBridge, type CRDTCAELBridgeConfig } from './CRDTCAELBridge';

// Simulation Recording & Playback — Animate time-evolving simulations
export { SimulationRecorder, type RecorderConfig, type FieldSnapshot } from './SimulationRecorder';
export { SimulationPlayback, type PlaybackConfig, type PlaybackState } from './SimulationPlayback';
export { registerSimulationSolvers } from './register';
export { initSimulationSolvers, resetSimulationRegistry } from './simulation-registry';

// Simulation Serialization — Shareable simulation configs
export {
  serializeSimulation,
  deserializeSimulation,
  simulationToBase64,
  base64ToSimulation,
  estimateURLSize,
  type SerializedSimulation,
} from './SimulationSerializer';

// Intelligence — Result interpretation and natural language queries
export {
  interpretResults,
  querySimulation,
  generateAutoReport,
  type SimulationInsight,
  type InsightSeverity,
  type InsightCategory,
} from './intelligence/index';

// Layer 4 — Multi-Physics Coupling
export { CouplingManager, type FieldCoupling } from './CouplingManager';
export { CouplingManagerV2, type FieldCouplingV2, type CouplingStatsV2 } from './CouplingManagerV2';

// Generic Solver Interface
export { type SimSolver, type SolverMode, type FieldData } from './SimSolver';
export {
  ThermalSolverAdapter,
  StructuralSolverAdapter,
  TET10SolverAdapter,
  HydraulicSolverAdapter,
  AcousticSolverAdapter,
  FDTDSolverAdapter,
  ReactionDiffusionSolverAdapter,
  AffinityODESolverAdapter,
} from './adapters/SolverAdapters';

// Experiment Orchestration
export {
  ParameterSpace,
  applyOverrides,
  ExperimentOrchestrator,
  summarize,
  sensitivity,
  paretoFront,
  exportSweepCSV,
  type ParameterRange,
  type ParameterSample,
  type ExperimentConfig,
  type ExperimentResult,
  type ExperimentRunResult,
  type SolverHandle,
  type SweepSummary,
  type SensitivityResult,
  type ParetoPoint,
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

// Fairness — verifiable, replayable algorithmic-fairness sweep on the
// experiment + UQ engines, with a sovereign FairnessReceipt (domain-free, D.007)
export {
  runFairnessSweep,
  runFairnessRobustness,
  analyzeDisparity,
  defaultPerturber,
  emitFairnessReceipt,
  emitRobustnessReceipt,
  computeReplayFingerprint,
  computeDecisionDigest,
  verifyReceiptIntegrity,
  replayFairnessReceipt,
  verifyReplayExecution,
  canonicalize,
  hashContent,
  DEFAULT_FAIRNESS_CROSSWALK,
  DEFAULT_ROBUSTNESS_CROSSWALK,
  type FairnessModel,
  type FairnessRecord,
  type FairnessPerturbation,
  type CohortPerturber,
  type FairnessSweepOptions,
  type FairnessSweepResult,
  type FairnessRobustnessOptions,
  type FairnessRobustnessResult,
  type DeterminismGrade,
  type FairnessMetrics,
  type FairnessReplayKey,
  type FairnessReceipt,
  type FairnessRobustnessReceipt,
  type RobustnessBand,
  type ReplayVerdict,
} from './fairness/index';

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
