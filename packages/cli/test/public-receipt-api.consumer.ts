import {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3,
  HOLO_WORLD_PROJECTION_COVERAGE,
  HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
  HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA,
  executeHoloWorldProjection,
  verifyHeadlessExperimentSourceRunReceipt,
  verifyHoloWorldProjectionProvenance,
  verifyHsPlanKernelExecutionProvenance,
  type HeadlessExperimentSourceRunSources,
  type HoloWorldProjectionProvenance,
  type HsPlanKernelExecutionProvenance,
} from '../dist/index.js';

declare const untrustedSourceRunReceipt: unknown;
declare const untrustedInnerExecutionReceipt: unknown;
declare const untrustedPlanProvenance: unknown;
declare const untrustedWorldProvenance: unknown;
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
  sourceRunSchema,
  sourceRunSchemaV3,
  worldProjectionSchema,
  worldProjectionEngine,
  worldProjectionCoverage,
  projectedObjectCount,
  planSchema,
  instructionCount,
  traceCount,
  programCounters,
  opcodes,
  handlerOpcodes,
];
