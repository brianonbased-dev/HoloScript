import { spawnSync } from 'node:child_process';
import {
  ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
  buildHeadlessExperimentReceipt,
  canonicalizeHeadlessValue,
  createDeterministicHsplusActionRuntime,
  hashHeadlessValue,
  parseHeadlessExperimentPlan,
  verifyHeadlessExperimentReceipt,
  type HeadlessExperimentReceipt,
  type HeadlessJsonObject,
} from '@holoscript/engine/runtime';
import { executeHsPlanKernel, RUST_WASM_UAAL_HS_PLAN_KERNEL } from './native-hs-plan-runner';

export const POST_SEAL_OBSERVER_PROCESS = 'separate-node-process-serialized-post-seal-v1' as const;
export const PURE_HOLO_WORLD_PROJECTION = 'holoscript-cli-pure-world-projection-v1' as const;

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
    executionEngineIdentitySealedInReceipt: false;
    uaalBytecodeHashSealedInReceipt: false;
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

function strictClone<T>(value: T, label: string): T {
  try {
    return JSON.parse(canonicalizeHeadlessValue(value)) as T;
  } catch (error) {
    throw new Error(
      `${label} is not deterministic JSON: ${error instanceof Error ? error.message : String(error)}`
    );
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
  const sourceBundleHash = hashHeadlessValue({
    world: options.worldSource,
    plan: options.planSource,
    behavior: options.behaviorSource,
  });

  const execute = async (): Promise<HeadlessExperimentReceipt> => {
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
    return receipt;
  };

  const offReceipt = await execute();
  const proof = options.observer === 'on' ? observerProof(offReceipt, await execute()) : undefined;

  return {
    execution: offReceipt,
    engines: {
      world: options.worldProjectionEngine,
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
      executionEngineIdentitySealedInReceipt: false,
      uaalBytecodeHashSealedInReceipt: false,
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
