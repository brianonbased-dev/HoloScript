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
  type HeadlessJsonObject,
} from '@holoscript/engine/runtime';
import {
  executeHsPlanKernel,
  RUST_WASM_UAAL_HS_PLAN_KERNEL,
  verifyHsPlanKernelExecutionProvenance,
  type HsPlanKernelExecutionProvenance,
} from './native-hs-plan-runner';

export const POST_SEAL_OBSERVER_PROCESS = 'separate-node-process-serialized-post-seal-v1' as const;
export const PURE_HOLO_WORLD_PROJECTION = 'holoscript-cli-pure-world-projection-v1' as const;
export const HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA =
  'holoscript.headless-experiment-source-run.v2' as const;
export const HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY = Object.freeze({
  world: 'source-hash-anchored-inner-ledger-not-reexecuted-v1',
  schedule: 'source-reexecuted-rust-wasm-uaal-v1',
  behavior: 'source-hash-anchored-inner-ledger-not-reexecuted-v1',
});

export interface HeadlessObserverEquivalenceProof {
  schema: 'holoscript.headless-observer-equivalence.v1';
  isolation: typeof POST_SEAL_OBSERVER_PROCESS;
  equivalent: boolean;
  canonicalPayloadEqual: boolean;
  sevenFieldsEqual: boolean;
  offCanonicalPayloadHash: string;
  onCanonicalPayloadHash: string;
  observerProjectionHash: string;
  observerProjection: HeadlessJsonObject;
}

export interface HeadlessExperimentSourceRun {
  execution: HeadlessExperimentReceipt;
  sourceRunReceipt: HeadlessExperimentSourceRunReceipt;
  engines: {
    world: typeof PURE_HOLO_WORLD_PROJECTION;
    schedule: typeof RUST_WASM_UAAL_HS_PLAN_KERNEL;
    behavior: typeof ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET;
  };
  claimBoundary: {
    holoWorldParsedAndProjected: true;
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
    worldSourceReexecutedDuringVerification: false;
    hsPlanSourceReexecutedDuringVerification: true;
    hsplusBehaviorSourceReexecutedDuringVerification: false;
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

function sourceRunPreimage(
  receipt: HeadlessExperimentSourceRunReceipt
): Omit<HeadlessExperimentSourceRunReceipt, 'sourceRunCommitment'> {
  return {
    schema: receipt.schema,
    hashAlgorithm: receipt.hashAlgorithm,
    sourceBundleHash: receipt.sourceBundleHash,
    verificationBoundary: receipt.verificationBoundary,
    engines: receipt.engines,
    innerLedger: receipt.innerLedger,
  };
}

function buildSourceRunReceipt(options: {
  sourceBundleHash: string;
  execution: HeadlessExperimentReceipt;
  planProvenance: HsPlanKernelExecutionProvenance;
}): HeadlessExperimentSourceRunReceipt {
  const preimage: Omit<HeadlessExperimentSourceRunReceipt, 'sourceRunCommitment'> = {
    schema: HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    sourceBundleHash: options.sourceBundleHash,
    verificationBoundary: HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY,
    engines: {
      world: PURE_HOLO_WORLD_PROJECTION,
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
 * Verify the additive source-run v2 seal against untrusted serialized claims.
 *
 * Verification is deliberately asymmetric and records that boundary in the
 * committed receipt: the `.hs` schedule source is parsed, compiled, and
 * re-executed, while `.holo` world and `.hsplus` behavior sources are
 * hash-anchored to a self-consistent inner v1 ledger but are not re-executed.
 * SHA-256 proves integrity/reproducibility within that boundary, not publisher
 * identity or exact WASM-binary attestation.
 */
export async function verifyHeadlessExperimentSourceRunReceipt(
  receiptInput: unknown,
  executionInput: unknown,
  sources: HeadlessExperimentSourceRunSources
): Promise<HeadlessExperimentVerificationResult> {
  try {
    canonicalizeHeadlessValue(receiptInput);
    assertExactKeys(
      receiptInput,
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
    const receipt = receiptInput as unknown as HeadlessExperimentSourceRunReceipt;
    assertExactKeys(
      executionInput,
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
      'inner execution receipt'
    );
    const execution = executionInput as unknown as HeadlessExperimentReceipt;
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
    if (
      receipt.schema !== HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA ||
      receipt.hashAlgorithm !== HEADLESS_EXPERIMENT_HASH_ALGORITHM
    ) {
      throw new Error('source-run receipt identity mismatch');
    }
    if (
      canonicalizeHeadlessValue(receipt.verificationBoundary) !==
      canonicalizeHeadlessValue(HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY)
    ) {
      throw new Error('source-run verification boundary mismatch');
    }
    if (
      receipt.engines.world !== PURE_HOLO_WORLD_PROJECTION ||
      receipt.engines.behavior !== ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET ||
      receipt.engines.schedule.engine !== RUST_WASM_UAAL_HS_PLAN_KERNEL
    ) {
      throw new Error('source-run engine identity mismatch');
    }
    const expectedSourceBundleHash = hashHeadlessValue({
      world: sources.worldSource,
      plan: sources.planSource,
      behavior: sources.behaviorSource,
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
    const expectedRecords = [execution.manifest, ...schedule];
    const planVerification = await verifyHsPlanKernelExecutionProvenance(receipt.engines.schedule, {
      expectedSource: sources.planSource,
      expectedRecords,
    });
    if (!planVerification.valid) {
      throw new Error(`plan provenance failed: ${planVerification.errors.join('; ')}`);
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

function consumeInIsolatedObserver(receipt: HeadlessExperimentReceipt): HeadlessJsonObject {
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
  return strictClone(JSON.parse(child.stdout), 'observer projection') as HeadlessJsonObject;
}

function observerProof(
  offReceipt: HeadlessExperimentReceipt,
  onReceipt: HeadlessExperimentReceipt
): HeadlessObserverEquivalenceProof {
  const offPayload = canonicalizeHeadlessValue(offReceipt);
  const onPayload = canonicalizeHeadlessValue(onReceipt);
  const canonicalPayloadEqual = offPayload === onPayload;
  const sevenFieldsEqual =
    canonicalizeHeadlessValue(offReceipt.canonicalFields) ===
    canonicalizeHeadlessValue(onReceipt.canonicalFields);
  const projection = consumeInIsolatedObserver(onReceipt);
  const proof: HeadlessObserverEquivalenceProof = {
    schema: 'holoscript.headless-observer-equivalence.v1',
    isolation: POST_SEAL_OBSERVER_PROCESS,
    equivalent: canonicalPayloadEqual && sevenFieldsEqual,
    canonicalPayloadEqual,
    sevenFieldsEqual,
    offCanonicalPayloadHash: hashHeadlessValue(offReceipt),
    onCanonicalPayloadHash: hashHeadlessValue(onReceipt),
    observerProjectionHash: hashHeadlessValue(projection),
    observerProjection: projection,
  };
  if (!proof.equivalent) {
    throw new Error('Observer off/on executions are not canonically equivalent');
  }
  return proof;
}

export async function runHeadlessExperimentSources(options: {
  worldSource: string;
  planSource: string;
  behaviorSource: string;
  captureWorld: () =>
    | Promise<{ scene: unknown; posePhysics: unknown }>
    | { scene: unknown; posePhysics: unknown };
  worldProjectionEngine: typeof PURE_HOLO_WORLD_PROJECTION;
  observer: 'off' | 'on';
}): Promise<HeadlessExperimentSourceRun> {
  if (options.worldProjectionEngine !== PURE_HOLO_WORLD_PROJECTION) {
    throw new Error('Headless experiment requires the pure Holo world projection');
  }
  const sourceBundleHash = hashHeadlessValue({
    world: options.worldSource,
    plan: options.planSource,
    behavior: options.behaviorSource,
  });

  const execute = async (): Promise<{
    execution: HeadlessExperimentReceipt;
    sourceRunReceipt: HeadlessExperimentSourceRunReceipt;
  }> => {
    const planKernel = await executeHsPlanKernel(options.planSource);
    const plan = parseHeadlessExperimentPlan(planKernel.data);
    const world = await options.captureWorld();
    const behavior = createDeterministicHsplusActionRuntime(options.behaviorSource);
    const receipt = await buildHeadlessExperimentReceipt({
      sourceBundleHash,
      scene: strictClone(world.scene, 'headless scene receipt'),
      posePhysics: strictClone(world.posePhysics, 'headless pose/physics receipt'),
      plan,
      initialState: behavior.initialState,
      invoke: (entry) => behavior.invoke(entry),
    });
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

  const offRun = await execute();
  let proof: HeadlessObserverEquivalenceProof | undefined;
  if (options.observer === 'on') {
    const onRun = await execute();
    if (
      canonicalizeHeadlessValue(offRun.sourceRunReceipt) !==
      canonicalizeHeadlessValue(onRun.sourceRunReceipt)
    ) {
      throw new Error('Observer off/on source-run receipts are not canonically equivalent');
    }
    proof = observerProof(offRun.execution, onRun.execution);
  }

  return {
    execution: offRun.execution,
    sourceRunReceipt: offRun.sourceRunReceipt,
    engines: {
      world: PURE_HOLO_WORLD_PROJECTION,
      schedule: RUST_WASM_UAAL_HS_PLAN_KERNEL,
      behavior: ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
    },
    claimBoundary: {
      holoWorldParsedAndProjected: true,
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
      worldSourceReexecutedDuringVerification: false,
      hsPlanSourceReexecutedDuringVerification: true,
      hsplusBehaviorSourceReexecutedDuringVerification: false,
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
