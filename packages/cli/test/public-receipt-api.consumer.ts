import {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3,
  HOLO_WORLD_PROJECTION_COVERAGE,
  HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
  HOLOLAND_PHYSICS_OBSERVER_SCHEMA,
  HOLO_CPU_PHYSICS_ENGINE,
  HOLO_CPU_PHYSICS_EVIDENCE_SCHEMA,
  HOLO_CPU_PHYSICS_RECEIPT_SCHEMA,
  HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA,
  executeHoloCpuPhysicsReceipt,
  executeHoloWorldProjection,
  verifyHeadlessExperimentSourceRunReceipt,
  verifyHoloCpuPhysicsReceipt,
  verifyHoloWorldProjectionProvenance,
  verifyHsPlanKernelExecutionProvenance,
  type HoloCpuPhysicsEngineDefaultsSnapshot,
  type HoloCpuPhysicsExecutionReceipt,
  type HeadlessExperimentSourceRunSources,
  type HoloWorldProjectionProvenance,
  type HsPlanKernelExecutionProvenance,
} from '../dist/index.js';

declare const untrustedSourceRunReceipt: unknown;
declare const untrustedInnerExecutionReceipt: unknown;
declare const untrustedPlanProvenance: unknown;
declare const untrustedWorldProvenance: unknown;
declare const untrustedPhysicsReceipt: unknown;
declare const verifiedPhysicsReceipt: HoloCpuPhysicsExecutionReceipt;
declare const verifiedPlanProvenance: HsPlanKernelExecutionProvenance;
declare const verifiedWorldProvenance: HoloWorldProjectionProvenance;

const sources: HeadlessExperimentSourceRunSources = {
  worldSource: 'composition "Canary" {}',
  planSource: 'export function main(): string { return "[]" }',
  behaviorSource: 'state Canary {}',
};

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
const instructionCount: 5 = verifiedPlanProvenance.bytecode.instructionCount;
const traceCount: 4 = verifiedPlanProvenance.vm.trace.executedInstructionCount;
const programCounters: readonly [0, 2, 3, 1] = verifiedPlanProvenance.vm.trace.programCounters;
const opcodes: readonly [50, 1, 51, 255] = verifiedPlanProvenance.vm.trace.opcodes;
const handlerOpcodes: readonly [] = verifiedPlanProvenance.vm.profile.registeredHandlerOpcodes;

void [
  sourceRunVerdict,
  planVerdict,
  worldVerdict,
  physicsReceipt,
  physicsVerdict,
  sourceRunSchema,
  sourceRunSchemaV3,
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
