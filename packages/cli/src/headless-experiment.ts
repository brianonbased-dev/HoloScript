import { spawnSync } from 'node:child_process';
import {
  ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
  HEADLESS_EXPERIMENT_HASH_ALGORITHM,
  HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
  buildHeadlessExperimentReceipt,
  canonicalizeHeadlessValue,
  createDeterministicHsplusActionRuntime,
  hashHeadlessValue,
  parseHeadlessExperimentPlan,
  verifyHeadlessExperimentReceipt,
  type HeadlessExperimentReceipt,
  type HeadlessExperimentScheduleEntry,
  type HeadlessExperimentVerificationResult,
} from '@holoscript/engine/runtime';
import {
  executeHsPlanKernel,
  RUST_WASM_UAAL_HS_PLAN_KERNEL,
  verifyHsPlanKernelExecutionProvenance,
  type HsPlanKernelExecutionProvenance,
} from './native-hs-plan-runner';
import {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  PURE_HOLO_WORLD_PROJECTION,
  executeHoloWorldProjection,
  verifyHoloWorldProjectionProvenance,
  type HoloWorldProjectionProvenance,
} from './holo-headless-world-projection';

export {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  HOLO_WORLD_PROJECTION_COVERAGE,
  HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
  PURE_HOLO_WORLD_PROJECTION,
  executeHoloWorldProjection,
  verifyHoloWorldProjectionProvenance,
  type HoloWorldProjectionExecution,
  type HoloWorldProjectionProvenance,
  type HoloWorldProjectionVerificationOptions,
} from './holo-headless-world-projection';

export const POST_SEAL_OBSERVER_PROCESS = 'separate-node-process-serialized-post-seal-v1' as const;
export const HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA =
  'holoscript.headless-experiment-source-run.v2' as const;
export const HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY = Object.freeze({
  world: 'source-hash-anchored-inner-ledger-not-reexecuted-v1',
  schedule: 'source-reexecuted-rust-wasm-uaal-v1',
  behavior: 'source-hash-anchored-inner-ledger-not-reexecuted-v1',
});
export const HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3 =
  'holoscript.headless-experiment-source-run.v3' as const;
export const HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V3 = Object.freeze({
  world: 'source-reexecuted-static-object-declarations-no-lifecycle-v1',
  schedule: 'source-reexecuted-rust-wasm-uaal-v1',
  behavior: 'source-hash-anchored-inner-ledger-not-reexecuted-v1',
});
export const HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V4 =
  'holoscript.headless-experiment-source-run.v4' as const;
export const HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4 = Object.freeze({
  world: 'source-reexecuted-static-object-declarations-no-lifecycle-v1',
  schedule: 'source-reexecuted-rust-wasm-uaal-v1',
  behavior: 'source-reexecuted-engine-owned-deterministic-action-subset-v1',
});
export const HEADLESS_OBSERVER_PROJECTION_SCHEMA =
  'holoscript.headless-observer-projection.v1' as const;
export const HEADLESS_OBSERVER_PROOF_SCHEMA =
  'holoscript.headless-observer-noninterference.v2' as const;
export const SINGLE_EXECUTION_POST_SEAL_OBSERVER = 'single-execution-post-seal-v1' as const;

export interface HeadlessObserverProjection {
  readonly schema: typeof HEADLESS_OBSERVER_PROJECTION_SCHEMA;
  readonly sourceReceiptSchema: typeof HEADLESS_EXPERIMENT_RECEIPT_SCHEMA;
  readonly runId: string;
  readonly canonicalFields: Readonly<{
    canonicalSceneHash: string;
    canonicalPoseHash: string;
    logicalClockHash: string;
    publicStateHash: string;
    executedScheduleHash: string;
    residentObservationHash: string;
    actionReceiptRoot: string;
  }>;
  readonly terminalCommitment: string;
}

export interface HeadlessObserverEquivalenceProof {
  readonly schema: typeof HEADLESS_OBSERVER_PROOF_SCHEMA;
  readonly mode: typeof SINGLE_EXECUTION_POST_SEAL_OBSERVER;
  readonly isolation: typeof POST_SEAL_OBSERVER_PROCESS;
  readonly observedSealedExecutionCount: 1;
  readonly observerIntroducedExperimentExecutionCount: 0;
  readonly observerExecutionCount: 1;
  readonly observedTerminalCommitment: string;
  readonly preObserverCanonicalPayloadHash: string;
  readonly postObserverCanonicalPayloadHash: string;
  readonly preObserverCanonicalFieldsHash: string;
  readonly postObserverCanonicalFieldsHash: string;
  readonly equivalent: boolean;
  readonly canonicalPayloadEqual: boolean;
  readonly sevenFieldsEqual: boolean;
  readonly observerProjectionHash: string;
  readonly observerProjection: Readonly<HeadlessObserverProjection>;
  readonly liveSchedulingNoninterferenceClaimed: false;
}

export interface HeadlessExperimentSourceRun {
  execution: HeadlessExperimentReceipt;
  sourceRunReceipt: HeadlessExperimentSourceRunReceiptV4;
  engines: {
    world: typeof DETERMINISTIC_HOLO_WORLD_PROJECTION;
    schedule: typeof RUST_WASM_UAAL_HS_PLAN_KERNEL;
    behavior: typeof ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET;
  };
  claimBoundary: {
    holoWorldParsedAndProjected: true;
    holoWorldStaticObjectSubsetProjected: true;
    fullHoloWorldProjectionClaimed: false;
    physicsMetadataProjected: true;
    physicsEngineExecuted: false;
    hsPipelineExecuted: false;
    hsPlanEntrypointExecuted: true;
    rustWasmCompilerExecuted: true;
    uaalVmExecuted: true;
    hsPlanReturnParsedAsJson: true;
    fullHsLanguageExecutionClaimed: false;
    hsDynamicJavaScriptEvaluationUsed: false;
    hsplusActionEntrypointsExecuted: true;
    nativeRustPipelineExecutionClaimed: false;
    nativeMachineCodeExecutionClaimed: false;
    executionEngineIdentitySealedInReceipt: true;
    hsCompilerCrateVersionSealedInReceipt: true;
    uaalBytecodeHashSealedInReceipt: true;
    uaalVmExecutionProfileSealedInReceipt: true;
    hsReturnedPlanHashSealedInReceipt: true;
    worldSourceReexecutedDuringVerification: true;
    hsPlanSourceReexecutedDuringVerification: true;
    hsplusBehaviorSourceReexecutedDuringVerification: true;
    compilerArtifactAttested: false;
    sourceRunPublisherAuthenticated: false;
    nativeEngineHsplusExecutionClaimed: false;
    engineOwnedDeterministicHsplusActionSubsetExecuted: true;
    fullHsplusLanguageExecutionClaimed: false;
    hsplusDynamicJavaScriptEvaluationUsed: false;
    worldRuntimeLifecycleExecuted: false;
    providerCallsMade: 0;
    liveAuthorizationReplayProtectionClaimed: false;
    externalReplayRegistryAvailable: true;
    trustedAuthoredBehaviorOnly: true;
    vmSecurityBoundaryClaimed: false;
  };
  observerProof?: HeadlessObserverEquivalenceProof;
}

export interface HeadlessExperimentSourceRunReceipt {
  schema: typeof HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA;
  hashAlgorithm: typeof HEADLESS_EXPERIMENT_HASH_ALGORITHM;
  sourceBundleHash: string;
  verificationBoundary: typeof HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY;
  engines: {
    world: typeof PURE_HOLO_WORLD_PROJECTION;
    schedule: HsPlanKernelExecutionProvenance;
    behavior: typeof ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET;
  };
  innerLedger: {
    schema: typeof HEADLESS_EXPERIMENT_RECEIPT_SCHEMA;
    terminalCommitment: string;
    canonicalReceiptHash: string;
  };
  sourceRunCommitment: string;
}

export interface HeadlessExperimentSourceRunReceiptV3 {
  schema: typeof HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3;
  hashAlgorithm: typeof HEADLESS_EXPERIMENT_HASH_ALGORITHM;
  sourceBundleHash: string;
  verificationBoundary: typeof HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V3;
  engines: {
    world: HoloWorldProjectionProvenance;
    schedule: HsPlanKernelExecutionProvenance;
    behavior: typeof ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET;
  };
  innerLedger: {
    schema: typeof HEADLESS_EXPERIMENT_RECEIPT_SCHEMA;
    terminalCommitment: string;
    canonicalReceiptHash: string;
  };
  sourceRunCommitment: string;
}

export interface HeadlessExperimentSourceRunReceiptV4 {
  schema: typeof HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V4;
  hashAlgorithm: typeof HEADLESS_EXPERIMENT_HASH_ALGORITHM;
  sourceBundleHash: string;
  verificationBoundary: typeof HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4;
  engines: {
    world: HoloWorldProjectionProvenance;
    schedule: HsPlanKernelExecutionProvenance;
    behavior: typeof ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET;
  };
  innerLedger: {
    schema: typeof HEADLESS_EXPERIMENT_RECEIPT_SCHEMA;
    terminalCommitment: string;
    canonicalReceiptHash: string;
  };
  sourceRunCommitment: string;
}

export type AnyHeadlessExperimentSourceRunReceipt =
  | HeadlessExperimentSourceRunReceipt
  | HeadlessExperimentSourceRunReceiptV3
  | HeadlessExperimentSourceRunReceiptV4;

export interface HeadlessExperimentSourceRunSources {
  worldSource: string;
  planSource: string;
  behaviorSource: string;
}

function strictClone<T>(value: T, label: string): T {
  try {
    return JSON.parse(canonicalizeHeadlessValue(value)) as T;
  } catch (error) {
    throw new Error(
      `${label} is not deterministic JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function deepFreezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreezeJson(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (canonicalizeHeadlessValue(actual) !== canonicalizeHeadlessValue(required)) {
    throw new Error(`${label} fields do not match the sealed contract`);
  }
}

function assertClosedKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(`${label} is missing required field ${key}`);
    }
  }
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} fields do not match the sealed contract`);
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function assertAuthorizationShape(value: unknown, label: string): void {
  assertExactKeys(
    value,
    ['nonce', 'sequence', 'turnOpportunityId', 'safetyReceiptId', 'decisionReceiptId'],
    label
  );
}

function assertScheduleSourceShape(value: unknown, label: string): void {
  assertClosedKeys(
    value,
    ['kind', 'scheduleEntryId', 'order', 'tick', 'phase', 'entrypoint'],
    ['args', 'targetIds', 'barrierId', 'authorization', 'expect'],
    label
  );
  if (value.authorization !== undefined) {
    assertAuthorizationShape(value.authorization, `${label}.authorization`);
  }
  if (value.expect !== undefined) {
    assertClosedKeys(value.expect, [], ['allowed', 'outcome', 'stateChanged'], `${label}.expect`);
  }
}

function assertChainedEntryShape(value: unknown, label: string): Record<string, unknown> {
  assertExactKeys(
    value,
    ['sequence', 'logicalTick', 'previousHash', 'payload', 'entryHash'],
    label
  );
  return value;
}

function assertNestedExecutionContract(value: Record<string, unknown>): void {
  assertClosedKeys(
    value.manifest,
    ['kind', 'schema', 'runId', 'seed', 'clock', 'publicStateKeys', 'expected'],
    ['authorization', 'observationPolicy'],
    'inner execution manifest'
  );
  const manifest = value.manifest;
  assertExactKeys(manifest.clock, ['startTick', 'endTick', 'step'], 'manifest clock');
  assertExactKeys(
    manifest.expected,
    ['scheduleCount', 'observationCount', 'actionCount', 'finalPublicState'],
    'manifest expected counts'
  );
  if (manifest.authorization !== undefined) {
    assertExactKeys(
      manifest.authorization,
      ['required', 'startSequence'],
      'manifest authorization'
    );
  }
  if (manifest.observationPolicy !== undefined) {
    assertClosedKeys(
      manifest.observationPolicy,
      [],
      ['allowedRootKeys', 'forbiddenKeys', 'forbiddenValues', 'subjectBinding'],
      'manifest observation policy'
    );
    if (manifest.observationPolicy.subjectBinding !== undefined) {
      assertExactKeys(
        manifest.observationPolicy.subjectBinding,
        ['argumentKey', 'observationKey', 'targetCardinality'],
        'manifest observation subject binding'
      );
    }
  }

  assertExactKeys(
    value.logicalClock,
    ['start_tick', 'end_tick', 'step', 'executed_ticks'],
    'inner execution logical clock'
  );
  assertExactKeys(
    value.canonicalFields,
    [
      'canonicalSceneHash',
      'canonicalPoseHash',
      'logicalClockHash',
      'publicStateHash',
      'executedScheduleHash',
      'residentObservationHash',
      'actionReceiptRoot',
    ],
    'inner execution canonical fields'
  );
  assertExactKeys(
    value.terminal,
    [
      'finalTick',
      'finalPublicStateHash',
      'expectedCounts',
      'actualCounts',
      'publicStateHistoryRoot',
      'scheduleRoot',
      'observationRoot',
      'actionRoot',
      'terminalCommitment',
    ],
    'inner execution terminal'
  );
  const terminal = value.terminal;
  assertExactKeys(
    terminal.expectedCounts,
    ['schedule', 'observations', 'actions', 'publicStateSnapshots'],
    'terminal expected counts'
  );
  assertExactKeys(
    terminal.actualCounts,
    ['schedule', 'observations', 'actions', 'publicStateSnapshots'],
    'terminal actual counts'
  );

  assertArray(value.publicStateSnapshots, 'public-state ledger');
  value.publicStateSnapshots.forEach((entry, index) => {
    const chained = assertChainedEntryShape(entry, `public-state ledger entry ${index}`);
    assertExactKeys(
      chained.payload,
      ['snapshotId', 'scheduleEntryId', 'publicState', 'publicStateHash'],
      `public-state ledger payload ${index}`
    );
  });

  assertArray(value.scheduleLedger, 'schedule ledger');
  value.scheduleLedger.forEach((entry, index) => {
    const chained = assertChainedEntryShape(entry, `schedule ledger entry ${index}`);
    assertExactKeys(
      chained.payload,
      [
        'scheduleEntryId',
        'order',
        'tick',
        'phase',
        'kind',
        'entrypoint',
        'source',
        'outcomeHashes',
      ],
      `schedule ledger payload ${index}`
    );
    assertScheduleSourceShape(
      (chained.payload as Record<string, unknown>).source,
      `schedule ledger source ${index}`
    );
  });

  assertArray(value.observationLedger, 'observation ledger');
  value.observationLedger.forEach((entry, index) => {
    const chained = assertChainedEntryShape(entry, `observation ledger entry ${index}`);
    assertExactKeys(
      chained.payload,
      ['scheduleEntryId', 'tick', 'entrypoint', 'targetIds', 'publicStateHash', 'observation'],
      `observation ledger payload ${index}`
    );
  });

  assertArray(value.actionLedger, 'action ledger');
  value.actionLedger.forEach((entry, index) => {
    const chained = assertChainedEntryShape(entry, `action ledger entry ${index}`);
    assertExactKeys(
      chained.payload,
      [
        'scheduleEntryId',
        'tick',
        'entrypoint',
        'args',
        'targetIds',
        'authorization',
        'allowed',
        'outcome',
        'result',
        'emittedEvents',
        'preStateSnapshotId',
        'postStateSnapshotId',
        'prePublicStateHash',
        'postPublicStateHash',
        'stateChanged',
        'rollbackReference',
      ],
      `action ledger payload ${index}`
    );
    const payload = chained.payload as Record<string, unknown>;
    if (payload.authorization !== null) {
      assertAuthorizationShape(payload.authorization, `action authorization ${index}`);
    }
    assertExactKeys(
      payload.rollbackReference,
      ['preStateSnapshotId', 'preStateHash', 'priorActionRoot'],
      `action rollback reference ${index}`
    );
  });
}

function assertExecutionReceiptContract(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  assertExactKeys(
    value,
    [
      'schema',
      'hashAlgorithm',
      'runId',
      'seed',
      'sourceBundleHash',
      'manifest',
      'logicalClock',
      'scene',
      'posePhysics',
      'publicStateSnapshots',
      'scheduleLedger',
      'observationLedger',
      'actionLedger',
      'canonicalFields',
      'terminal',
    ],
    label
  );
  assertNestedExecutionContract(value);
}

function sourceRunPreimage(
  receipt: AnyHeadlessExperimentSourceRunReceipt
):
  | Omit<HeadlessExperimentSourceRunReceipt, 'sourceRunCommitment'>
  | Omit<HeadlessExperimentSourceRunReceiptV3, 'sourceRunCommitment'>
  | Omit<HeadlessExperimentSourceRunReceiptV4, 'sourceRunCommitment'> {
  const { sourceRunCommitment: _sourceRunCommitment, ...preimage } = receipt;
  return preimage;
}

function buildSourceRunReceipt(options: {
  sourceBundleHash: string;
  execution: HeadlessExperimentReceipt;
  planProvenance: HsPlanKernelExecutionProvenance;
  worldProvenance: HoloWorldProjectionProvenance;
}): HeadlessExperimentSourceRunReceiptV4 {
  const preimage: Omit<HeadlessExperimentSourceRunReceiptV4, 'sourceRunCommitment'> = {
    schema: HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V4,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    sourceBundleHash: options.sourceBundleHash,
    verificationBoundary: HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4,
    engines: {
      world: options.worldProvenance,
      schedule: options.planProvenance,
      behavior: ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
    },
    innerLedger: {
      schema: options.execution.schema,
      terminalCommitment: options.execution.terminal.terminalCommitment,
      canonicalReceiptHash: hashHeadlessValue(options.execution),
    },
  };
  return strictClone(
    {
      ...preimage,
      sourceRunCommitment: hashHeadlessValue(preimage),
    },
    'headless source-run receipt'
  );
}

/**
 * Verify additive source-run v2, v3, or v4 seals against untrusted serialized claims.
 *
 * V2 retains its published asymmetric boundary: `.hs` is re-executed while
 * `.holo` and `.hsplus` are hash-anchored. V3 additionally reparses the
 * single-source `.holo` world through the fixed structural projector and
 * compares the complete scene and pose/physics projections. V4 additionally
 * re-executes the bounded engine-owned `.hsplus` action subset and requires the
 * complete inner receipt to be byte-identical. No version claims `.holo`
 * lifecycle execution, full `.hsplus` execution, publisher identity, or exact
 * compiler-artifact attestation.
 */
export async function verifyHeadlessExperimentSourceRunReceipt(
  receiptInput: unknown,
  executionInput: unknown,
  sources: HeadlessExperimentSourceRunSources
): Promise<HeadlessExperimentVerificationResult> {
  try {
    const receiptSnapshot = strictClone(receiptInput, 'source-run receipt input');
    const executionSnapshot = strictClone(executionInput, 'inner execution receipt input');
    const sourceSnapshot = strictClone(sources, 'source-run sources');
    assertExactKeys(
      sourceSnapshot,
      ['worldSource', 'planSource', 'behaviorSource'],
      'source-run sources'
    );
    if (
      typeof sourceSnapshot.worldSource !== 'string' ||
      typeof sourceSnapshot.planSource !== 'string' ||
      typeof sourceSnapshot.behaviorSource !== 'string'
    ) {
      throw new Error('source-run sources must be strings');
    }
    assertExactKeys(
      receiptSnapshot,
      [
        'schema',
        'hashAlgorithm',
        'sourceBundleHash',
        'verificationBoundary',
        'engines',
        'innerLedger',
        'sourceRunCommitment',
      ],
      'source-run receipt'
    );
    const schema = receiptSnapshot.schema;
    if (
      schema !== HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA &&
      schema !== HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3 &&
      schema !== HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V4
    ) {
      throw new Error('source-run receipt identity mismatch');
    }
    const receipt = receiptSnapshot as unknown as AnyHeadlessExperimentSourceRunReceipt;
    const isV3 = receipt.schema === HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3;
    const isV4 = receipt.schema === HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V4;
    const hasWorldProvenance = isV3 || isV4;
    assertExecutionReceiptContract(executionSnapshot, 'inner execution receipt');
    const execution = executionSnapshot as unknown as HeadlessExperimentReceipt;
    assertExactKeys(
      receipt.verificationBoundary,
      ['world', 'schedule', 'behavior'],
      'source-run verification boundary'
    );
    assertExactKeys(receipt.engines, ['world', 'schedule', 'behavior'], 'source-run engines');
    assertExactKeys(
      receipt.innerLedger,
      ['schema', 'terminalCommitment', 'canonicalReceiptHash'],
      'source-run inner ledger'
    );
    if (receipt.hashAlgorithm !== HEADLESS_EXPERIMENT_HASH_ALGORITHM) {
      throw new Error('source-run receipt identity mismatch');
    }
    const expectedVerificationBoundary = isV4
      ? HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V4
      : isV3
        ? HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V3
        : HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY;
    if (
      canonicalizeHeadlessValue(receipt.verificationBoundary) !==
      canonicalizeHeadlessValue(expectedVerificationBoundary)
    ) {
      throw new Error('source-run verification boundary mismatch');
    }
    if (
      receipt.engines.behavior !== ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET ||
      receipt.engines.schedule.engine !== RUST_WASM_UAAL_HS_PLAN_KERNEL
    ) {
      throw new Error('source-run engine identity mismatch');
    }
    if (!hasWorldProvenance && receipt.engines.world !== PURE_HOLO_WORLD_PROJECTION) {
      throw new Error('source-run engine identity mismatch');
    }
    if (
      hasWorldProvenance &&
      receipt.engines.world.engine !== DETERMINISTIC_HOLO_WORLD_PROJECTION
    ) {
      throw new Error('source-run engine identity mismatch');
    }
    const expectedSourceBundleHash = hashHeadlessValue({
      world: sourceSnapshot.worldSource,
      plan: sourceSnapshot.planSource,
      behavior: sourceSnapshot.behaviorSource,
    });
    if (
      receipt.sourceBundleHash !== expectedSourceBundleHash ||
      execution.sourceBundleHash !== expectedSourceBundleHash
    ) {
      throw new Error('source-run source bundle anchor mismatch');
    }
    if (
      receipt.innerLedger.schema !== HEADLESS_EXPERIMENT_RECEIPT_SCHEMA ||
      receipt.innerLedger.terminalCommitment !== execution.terminal.terminalCommitment ||
      receipt.innerLedger.canonicalReceiptHash !== hashHeadlessValue(execution)
    ) {
      throw new Error('source-run inner ledger anchor mismatch');
    }
    if (receipt.sourceRunCommitment !== hashHeadlessValue(sourceRunPreimage(receipt))) {
      throw new Error('source-run commitment mismatch');
    }

    const schedule = execution.scheduleLedger.map(
      (entry) => entry.payload.source
    ) as unknown as HeadlessExperimentScheduleEntry[];
    const innerVerification = verifyHeadlessExperimentReceipt(execution, {
      expectedSourceBundleHash,
      expectedSchedule: schedule,
      expectedTerminalCommitment: receipt.innerLedger.terminalCommitment,
    });
    if (!innerVerification.valid) {
      throw new Error(`inner execution receipt failed: ${innerVerification.errors.join('; ')}`);
    }
    if (hasWorldProvenance) {
      const worldVerification = verifyHoloWorldProjectionProvenance(receipt.engines.world, {
        expectedSource: sourceSnapshot.worldSource,
        expectedScene: execution.scene,
        expectedPosePhysics: execution.posePhysics,
      });
      if (!worldVerification.valid) {
        throw new Error(`world provenance failed: ${worldVerification.errors.join('; ')}`);
      }
    }
    const expectedRecords = [execution.manifest, ...schedule];
    const planVerification = await verifyHsPlanKernelExecutionProvenance(receipt.engines.schedule, {
      expectedSource: sourceSnapshot.planSource,
      expectedRecords,
    });
    if (!planVerification.valid) {
      throw new Error(`plan provenance failed: ${planVerification.errors.join('; ')}`);
    }
    if (isV4) {
      const replayWorld = executeHoloWorldProjection(sourceSnapshot.worldSource);
      const replayPlanKernel = await executeHsPlanKernel(sourceSnapshot.planSource);
      const replayPlan = parseHeadlessExperimentPlan(replayPlanKernel.data);
      const replayBehavior = createDeterministicHsplusActionRuntime(sourceSnapshot.behaviorSource);
      const replayExecution = await buildHeadlessExperimentReceipt({
        sourceBundleHash: expectedSourceBundleHash,
        scene: replayWorld.scene,
        posePhysics: replayWorld.posePhysics,
        plan: replayPlan,
        initialState: replayBehavior.initialState,
        invoke: (entry) => replayBehavior.invoke(entry),
      });
      if (canonicalizeHeadlessValue(replayExecution) !== canonicalizeHeadlessValue(execution)) {
        throw new Error(
          'behavior source reexecution differs from the sealed inner execution receipt'
        );
      }
    }
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

const OBSERVER_PROCESS_SOURCE = String.raw`
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const receipt = JSON.parse(input);
  const required = [
    "canonicalSceneHash",
    "canonicalPoseHash",
    "logicalClockHash",
    "publicStateHash",
    "executedScheduleHash",
    "residentObservationHash",
    "actionReceiptRoot"
  ];
  if (!receipt || receipt.schema !== "holoscript.headless-experiment-run.v1") {
    throw new Error("observer received an unsupported sealed receipt");
  }
  if (required.some((key) => typeof receipt.canonicalFields?.[key] !== "string")) {
    throw new Error("observer received incomplete canonical fields");
  }
  const projection = {
    schema: "holoscript.headless-observer-projection.v1",
    sourceReceiptSchema: receipt.schema,
    runId: receipt.runId,
    canonicalFields: Object.fromEntries(required.map((key) => [key, receipt.canonicalFields[key]])),
    terminalCommitment: receipt.terminal.terminalCommitment
  };
  process.stdout.write(JSON.stringify(projection));
});
`;

function assertObserverProjection(
  projection: unknown,
  receipt: HeadlessExperimentReceipt
): asserts projection is HeadlessObserverProjection {
  assertExactKeys(
    projection,
    ['schema', 'sourceReceiptSchema', 'runId', 'canonicalFields', 'terminalCommitment'],
    'observer projection'
  );
  assertExactKeys(
    projection.canonicalFields,
    [
      'canonicalSceneHash',
      'canonicalPoseHash',
      'logicalClockHash',
      'publicStateHash',
      'executedScheduleHash',
      'residentObservationHash',
      'actionReceiptRoot',
    ],
    'observer projection canonical fields'
  );
  if (
    projection.schema !== HEADLESS_OBSERVER_PROJECTION_SCHEMA ||
    projection.sourceReceiptSchema !== HEADLESS_EXPERIMENT_RECEIPT_SCHEMA ||
    projection.runId !== receipt.runId ||
    projection.terminalCommitment !== receipt.terminal.terminalCommitment ||
    canonicalizeHeadlessValue(projection.canonicalFields) !==
      canonicalizeHeadlessValue(receipt.canonicalFields)
  ) {
    throw new Error('observer projection does not match the sealed receipt');
  }
}

export function observeHeadlessExperimentReceipt(
  receiptInput: unknown
): Readonly<HeadlessObserverProjection> {
  const receiptSnapshot = strictClone(receiptInput, 'observer receipt input');
  assertExecutionReceiptContract(receiptSnapshot, 'observer receipt');
  const receipt = receiptSnapshot as unknown as HeadlessExperimentReceipt;
  const verification = verifyHeadlessExperimentReceipt(receipt);
  if (!verification.valid) {
    throw new Error(`Observer rejected invalid receipt: ${verification.errors.join('; ')}`);
  }
  const serialized = canonicalizeHeadlessValue(receipt);
  const child = spawnSync(process.execPath, ['--eval', OBSERVER_PROCESS_SOURCE], {
    input: serialized,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024 * 16,
    windowsHide: true,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Observer process failed: ${child.stderr.trim() || `exit ${child.status}`}`);
  }
  const projection = strictClone(JSON.parse(child.stdout), 'observer projection');
  assertObserverProjection(projection, receipt);
  return deepFreezeJson(projection);
}

function observerProof(receipt: HeadlessExperimentReceipt): HeadlessObserverEquivalenceProof {
  const preObserverPayload = canonicalizeHeadlessValue(receipt);
  const preObserverCanonicalFields = canonicalizeHeadlessValue(receipt.canonicalFields);
  const projection = observeHeadlessExperimentReceipt(receipt);
  const postObserverPayload = canonicalizeHeadlessValue(receipt);
  const postObserverCanonicalFields = canonicalizeHeadlessValue(receipt.canonicalFields);
  const canonicalPayloadEqual = preObserverPayload === postObserverPayload;
  const sevenFieldsEqual = preObserverCanonicalFields === postObserverCanonicalFields;
  const proof: HeadlessObserverEquivalenceProof = {
    schema: HEADLESS_OBSERVER_PROOF_SCHEMA,
    mode: SINGLE_EXECUTION_POST_SEAL_OBSERVER,
    isolation: POST_SEAL_OBSERVER_PROCESS,
    observedSealedExecutionCount: 1,
    observerIntroducedExperimentExecutionCount: 0,
    observerExecutionCount: 1,
    observedTerminalCommitment: receipt.terminal.terminalCommitment,
    preObserverCanonicalPayloadHash: hashHeadlessValue(receipt),
    postObserverCanonicalPayloadHash: hashHeadlessValue(receipt),
    preObserverCanonicalFieldsHash: hashHeadlessValue(receipt.canonicalFields),
    postObserverCanonicalFieldsHash: hashHeadlessValue(receipt.canonicalFields),
    equivalent: canonicalPayloadEqual && sevenFieldsEqual,
    canonicalPayloadEqual,
    sevenFieldsEqual,
    observerProjectionHash: hashHeadlessValue(projection),
    observerProjection: projection,
    liveSchedulingNoninterferenceClaimed: false,
  };
  if (!canonicalPayloadEqual || !sevenFieldsEqual) {
    throw new Error('Observer changed the sealed headless execution receipt');
  }
  return deepFreezeJson(proof);
}

export async function runHeadlessExperimentSources(options: {
  worldSource: string;
  planSource: string;
  behaviorSource: string;
  observer: 'off' | 'on';
}): Promise<HeadlessExperimentSourceRun> {
  const sourceBundleHash = hashHeadlessValue({
    world: options.worldSource,
    plan: options.planSource,
    behavior: options.behaviorSource,
  });

  const execute = async (): Promise<{
    execution: HeadlessExperimentReceipt;
    sourceRunReceipt: HeadlessExperimentSourceRunReceiptV4;
  }> => {
    const planKernel = await executeHsPlanKernel(options.planSource);
    const plan = parseHeadlessExperimentPlan(planKernel.data);
    const world = executeHoloWorldProjection(options.worldSource);
    const behavior = createDeterministicHsplusActionRuntime(options.behaviorSource);
    const receipt = deepFreezeJson(
      await buildHeadlessExperimentReceipt({
        sourceBundleHash,
        scene: strictClone(world.scene, 'headless scene receipt'),
        posePhysics: strictClone(world.posePhysics, 'headless pose/physics receipt'),
        plan,
        initialState: behavior.initialState,
        invoke: (entry) => behavior.invoke(entry),
      })
    );
    const verification = verifyHeadlessExperimentReceipt(receipt, {
      expectedSourceBundleHash: sourceBundleHash,
      expectedSchedule: plan.schedule,
    });
    if (!verification.valid) {
      throw new Error(
        `Headless experiment self-verification failed: ${verification.errors.join('; ')}`
      );
    }
    const sourceRunReceipt = buildSourceRunReceipt({
      sourceBundleHash,
      execution: receipt,
      planProvenance: planKernel.provenance,
      worldProvenance: world.provenance,
    });
    const sourceRunVerification = await verifyHeadlessExperimentSourceRunReceipt(
      sourceRunReceipt,
      receipt,
      {
        worldSource: options.worldSource,
        planSource: options.planSource,
        behaviorSource: options.behaviorSource,
      }
    );
    if (!sourceRunVerification.valid) {
      throw new Error(
        `Headless source-run self-verification failed: ${sourceRunVerification.errors.join('; ')}`
      );
    }
    return { execution: receipt, sourceRunReceipt };
  };

  const run = await execute();
  let proof: HeadlessObserverEquivalenceProof | undefined;
  if (options.observer === 'on') {
    proof = observerProof(run.execution);
  }

  return {
    execution: run.execution,
    sourceRunReceipt: run.sourceRunReceipt,
    engines: {
      world: DETERMINISTIC_HOLO_WORLD_PROJECTION,
      schedule: RUST_WASM_UAAL_HS_PLAN_KERNEL,
      behavior: ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
    },
    claimBoundary: {
      holoWorldParsedAndProjected: true,
      holoWorldStaticObjectSubsetProjected: true,
      fullHoloWorldProjectionClaimed: false,
      physicsMetadataProjected: true,
      physicsEngineExecuted: false,
      hsPipelineExecuted: false,
      hsPlanEntrypointExecuted: true,
      rustWasmCompilerExecuted: true,
      uaalVmExecuted: true,
      hsPlanReturnParsedAsJson: true,
      fullHsLanguageExecutionClaimed: false,
      hsDynamicJavaScriptEvaluationUsed: false,
      hsplusActionEntrypointsExecuted: true,
      nativeRustPipelineExecutionClaimed: false,
      nativeMachineCodeExecutionClaimed: false,
      executionEngineIdentitySealedInReceipt: true,
      hsCompilerCrateVersionSealedInReceipt: true,
      uaalBytecodeHashSealedInReceipt: true,
      uaalVmExecutionProfileSealedInReceipt: true,
      hsReturnedPlanHashSealedInReceipt: true,
      worldSourceReexecutedDuringVerification: true,
      hsPlanSourceReexecutedDuringVerification: true,
      hsplusBehaviorSourceReexecutedDuringVerification: true,
      compilerArtifactAttested: false,
      sourceRunPublisherAuthenticated: false,
      nativeEngineHsplusExecutionClaimed: false,
      engineOwnedDeterministicHsplusActionSubsetExecuted: true,
      fullHsplusLanguageExecutionClaimed: false,
      hsplusDynamicJavaScriptEvaluationUsed: false,
      worldRuntimeLifecycleExecuted: false,
      providerCallsMade: 0,
      liveAuthorizationReplayProtectionClaimed: false,
      externalReplayRegistryAvailable: true,
      trustedAuthoredBehaviorOnly: true,
      vmSecurityBoundaryClaimed: false,
    },
    ...(proof === undefined ? {} : { observerProof: proof }),
  };
}
