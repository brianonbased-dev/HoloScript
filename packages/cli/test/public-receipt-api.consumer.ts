import {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  DEVICE_PACKAGE_MATERIALIZATION_SCHEMA,
  DEVICE_RELEASE_INDEX_SCHEMA,
  DEVICE_RELEASE_PLAN_SCHEMA,
  HEADLESS_OBSERVER_PROJECTION_SCHEMA,
  HEADLESS_OBSERVER_PROOF_SCHEMA,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V4,
  HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4,
  HOLO_WORLD_PROJECTION_COVERAGE,
  HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
  HOLOLAND_PHYSICS_OBSERVER_SCHEMA,
  HOLO_CPU_PHYSICS_ENGINE,
  HOLO_CPU_PHYSICS_EVIDENCE_SCHEMA,
  HOLO_CPU_PHYSICS_RECEIPT_SCHEMA,
  HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA,
  POST_SEAL_OBSERVER_PROCESS,
  SINGLE_EXECUTION_POST_SEAL_OBSERVER,
  executeHoloCpuPhysicsReceipt,
  executeHoloWorldProjection,
  createDeviceReleasePlan,
  listDeviceProfiles,
  materializeDevicePackage,
  createSignedDeviceReleaseIndex,
  verifySignedDeviceReleaseIndex,
  observeHeadlessExperimentReceipt,
  runHeadlessExperimentSources,
  verifyHeadlessExperimentSourceRunReceipt,
  verifyHoloCpuPhysicsReceipt,
  verifyHoloWorldProjectionProvenance,
  verifyHsPlanKernelExecutionProvenance,
  type HoloCpuPhysicsEngineDefaultsSnapshot,
  type HoloCpuPhysicsExecutionReceipt,
  type HeadlessExperimentSourceRun,
  type HeadlessExperimentSourceRunReceiptV4,
  type HeadlessExperimentSourceRunSources,
  type HeadlessObserverEquivalenceProof,
  type HeadlessObserverProjection,
  type HoloWorldProjectionProvenance,
  type HsPlanKernelExecutionProvenance,
  type DeviceReleasePlan,
  type DevicePackageMaterialization,
} from '../dist/index.js';

declare const untrustedSourceRunReceipt: unknown;
declare const untrustedInnerExecutionReceipt: unknown;
declare const untrustedPlanProvenance: unknown;
declare const untrustedWorldProvenance: unknown;
declare const untrustedPhysicsReceipt: unknown;
declare const verifiedPhysicsReceipt: HoloCpuPhysicsExecutionReceipt;
declare const verifiedPlanProvenance: HsPlanKernelExecutionProvenance;
declare const verifiedWorldProvenance: HoloWorldProjectionProvenance;
declare const verifiedSourceRunReceiptV4: HeadlessExperimentSourceRunReceiptV4;
declare const verifiedSourceRun: HeadlessExperimentSourceRun;
declare const verifiedObserverProjection: HeadlessObserverProjection;
declare const verifiedObserverProof: HeadlessObserverEquivalenceProof;

const sources: HeadlessExperimentSourceRunSources = {
  worldSource: 'composition "Canary" {}',
  planSource: 'export function main(): string { return "[]" }',
  behaviorSource: 'state Canary {}',
};

const devicePlan: DeviceReleasePlan = createDeviceReleasePlan({
  sourcePath: 'public-holon-node.holo',
  source: sources.worldSource,
  device: 'linux-arm64',
  compilerVersion: 'consumer-test',
});
const devicePlanSchema: 'holoscript-device-release-plan/v0.1.0' = DEVICE_RELEASE_PLAN_SCHEMA;
const publicDeviceProfiles = listDeviceProfiles();
const deviceMaterialization: DevicePackageMaterialization = materializeDevicePackage({
  sourcePath: 'public-holon-node.holo',
  source: sources.worldSource,
  device: 'linux-arm64',
  compilerVersion: 'consumer-test',
});
const deviceMaterializationSchema: 'holoscript-device-package-materialization/v0.1.0' =
  DEVICE_PACKAGE_MATERIALIZATION_SCHEMA;
const deviceReleaseIndexSchema: 'holoscript-device-release-index/v0.1.0' =
  DEVICE_RELEASE_INDEX_SCHEMA;
const releaseIndexSigner: typeof createSignedDeviceReleaseIndex = createSignedDeviceReleaseIndex;
const releaseIndexVerifier: typeof verifySignedDeviceReleaseIndex = verifySignedDeviceReleaseIndex;

const sourceRunVerdict = verifyHeadlessExperimentSourceRunReceipt(
  untrustedSourceRunReceipt,
  untrustedInnerExecutionReceipt,
  sources
);
const planVerdict = verifyHsPlanKernelExecutionProvenance(untrustedPlanProvenance, {
  expectedSource: sources.planSource,
});
const projectedWorld = executeHoloWorldProjection(sources.worldSource);
const worldVerdict = verifyHoloWorldProjectionProvenance(untrustedWorldProvenance, {
  expectedSource: sources.worldSource,
  expectedScene: projectedWorld.scene,
  expectedPosePhysics: projectedWorld.posePhysics,
});
const physicsReceipt = executeHoloCpuPhysicsReceipt(sources.worldSource, {
  runSeed: 'public-api-canary',
  steps: 1,
});
const physicsVerdict = verifyHoloCpuPhysicsReceipt(untrustedPhysicsReceipt, {
  expectedSource: sources.worldSource,
  expectedRunSeed: 'public-api-canary',
  expectedSteps: 1,
});

const sourceRunSchema: 'holoscript.headless-experiment-source-run.v2' =
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA;
const sourceRunSchemaV3: 'holoscript.headless-experiment-source-run.v3' =
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3;
const sourceRunSchemaV4: 'holoscript.headless-experiment-source-run.v4' =
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V4;
const sourceRunBoundaryV4World: 'source-reexecuted-static-object-declarations-no-lifecycle-v1' =
  HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4.world;
const sourceRunBoundaryV4Schedule: 'source-reexecuted-rust-wasm-uaal-v1' =
  HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4.schedule;
const sourceRunBoundaryV4Behavior: 'source-reexecuted-engine-owned-deterministic-action-subset-v1' =
  HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4.behavior;
const observerProjectionSchema: 'holoscript.headless-observer-projection.v1' =
  HEADLESS_OBSERVER_PROJECTION_SCHEMA;
const observerProofSchema: 'holoscript.headless-observer-noninterference.v2' =
  HEADLESS_OBSERVER_PROOF_SCHEMA;
const observerMode: 'single-execution-post-seal-v1' = SINGLE_EXECUTION_POST_SEAL_OBSERVER;
const observerIsolation: 'separate-node-process-serialized-post-seal-v1' =
  POST_SEAL_OBSERVER_PROCESS;
const sourceRunReceiptV4Schema: 'holoscript.headless-experiment-source-run.v4' =
  verifiedSourceRunReceiptV4.schema;
const sourceRunResultSchema: 'holoscript.headless-experiment-source-run.v4' =
  verifiedSourceRun.sourceRunReceipt.schema;
const projectionSchema: 'holoscript.headless-observer-projection.v1' =
  verifiedObserverProjection.schema;
const proofSchema: 'holoscript.headless-observer-noninterference.v2' = verifiedObserverProof.schema;
const proofMode: 'single-execution-post-seal-v1' = verifiedObserverProof.mode;
const proofIsolation: 'separate-node-process-serialized-post-seal-v1' =
  verifiedObserverProof.isolation;
const observer: (receiptInput: unknown) => Readonly<HeadlessObserverProjection> =
  observeHeadlessExperimentReceipt;
const sourceRunner: (options: {
  worldSource: string;
  planSource: string;
  behaviorSource: string;
  observer: 'off' | 'on';
}) => Promise<HeadlessExperimentSourceRun> = runHeadlessExperimentSources;
// @ts-expect-error Observer projections expose immutable public evidence.
verifiedObserverProjection.runId = 'mutate';
// @ts-expect-error Observer canonical fields are immutable public evidence.
verifiedObserverProjection.canonicalFields.canonicalSceneHash = 'mutate';
// @ts-expect-error Proof projections remain immutable through the proof surface.
verifiedObserverProof.observerProjection.terminalCommitment = 'mutate';
const worldProjectionSchema: 'holoscript.holo-world-projection-provenance.v2' =
  HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA;
const worldProjectionEngine: 'holoscript-core-parser-static-object-projection-v2' =
  DETERMINISTIC_HOLO_WORLD_PROJECTION;
const worldProjectionCoverage: 'static-object-declarations-no-lifecycle-v1' =
  HOLO_WORLD_PROJECTION_COVERAGE;
const physicsReceiptSchema: 'holoscript.holo-cpu-physics-execution-receipt.v1' =
  HOLO_CPU_PHYSICS_RECEIPT_SCHEMA;
const physicsEngine: '@holoscript/engine/physics:PhysicsWorldImpl-cpu-fixed-step-v1' =
  HOLO_CPU_PHYSICS_ENGINE;
const physicsEvidenceSchema: 'holoscript.cpu-physics-simulation-evidence.v1' =
  HOLO_CPU_PHYSICS_EVIDENCE_SCHEMA;
const physicsObserverSchema: 'holoscript.hololand-readonly-physics-observer.v1' =
  HOLOLAND_PHYSICS_OBSERVER_SCHEMA;
const physicsEngineDefaults: HoloCpuPhysicsEngineDefaultsSnapshot =
  verifiedPhysicsReceipt.simulation.engineDefaults;
const physicsBodyCount: number = verifiedPhysicsReceipt.result.bodyCount;
const physicsVerdictValid: boolean = physicsVerdict.valid;
const physicsVerdictErrors: readonly string[] = physicsVerdict.errors;
// @ts-expect-error Verified observer arrays are read-only public evidence.
verifiedPhysicsReceipt.observer.frames.pop();
// @ts-expect-error Verified transform tuples are read-only public evidence.
verifiedPhysicsReceipt.observer.frames[0].bodies[0].transform.position[0] = 1;
// @ts-expect-error The reused source-projection subtree is also deeply read-only.
verifiedPhysicsReceipt.sourceProjection.sourceHash = 'mutate';
// @ts-expect-error Verification errors are read-only public evidence.
physicsVerdict.errors.push('mutate');
// @ts-expect-error Verification verdicts are read-only public evidence.
physicsVerdict.valid = false;
const projectedObjectCount: number = verifiedWorldProvenance.result.objectCount;
const planSchema: 'holoscript.hs-plan-kernel-execution-provenance.v1' =
  HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA;
const instructionCount: 4 = verifiedPlanProvenance.bytecode.instructionCount;
const traceCount: 4 = verifiedPlanProvenance.vm.trace.executedInstructionCount;
const programCounters: readonly [0, 2, 3, 1] = verifiedPlanProvenance.vm.trace.programCounters;
const opcodes: readonly [50, 1, 51, 255] = verifiedPlanProvenance.vm.trace.opcodes;
const handlerOpcodes: readonly [] = verifiedPlanProvenance.vm.profile.registeredHandlerOpcodes;

void [
  sourceRunVerdict,
  devicePlan,
  devicePlanSchema,
  publicDeviceProfiles,
  deviceMaterialization,
  deviceMaterializationSchema,
  deviceReleaseIndexSchema,
  releaseIndexSigner,
  releaseIndexVerifier,
  planVerdict,
  worldVerdict,
  physicsReceipt,
  physicsVerdict,
  sourceRunSchema,
  sourceRunSchemaV3,
  sourceRunSchemaV4,
  sourceRunBoundaryV4World,
  sourceRunBoundaryV4Schedule,
  sourceRunBoundaryV4Behavior,
  observerProjectionSchema,
  observerProofSchema,
  observerMode,
  observerIsolation,
  sourceRunReceiptV4Schema,
  sourceRunResultSchema,
  projectionSchema,
  proofSchema,
  proofMode,
  proofIsolation,
  observer,
  sourceRunner,
  worldProjectionSchema,
  worldProjectionEngine,
  worldProjectionCoverage,
  physicsReceiptSchema,
  physicsEngine,
  physicsEvidenceSchema,
  physicsObserverSchema,
  physicsEngineDefaults,
  physicsBodyCount,
  physicsVerdictValid,
  physicsVerdictErrors,
  projectedObjectCount,
  planSchema,
  instructionCount,
  traceCount,
  programCounters,
  opcodes,
  handlerOpcodes,
];
