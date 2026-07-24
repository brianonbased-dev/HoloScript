import { spawnSync } from 'node:child_process';
import * as vm from 'node:vm';
import { HoloScriptPlusParser } from '@holoscript/core';
import {
  buildHeadlessExperimentReceipt,
  canonicalizeHeadlessValue,
  hashHeadlessValue,
  parseHeadlessExperimentPlan,
  verifyHeadlessExperimentReceipt,
  type HeadlessExperimentReceipt,
  type HeadlessExperimentScheduleEntry,
  type HeadlessJsonObject,
  type HeadlessJsonValue,
} from '@holoscript/engine/runtime';
import { executePipelineSource, NODE_PIPELINE_BRIDGE } from './pipeline-runner';

export const HSPLUS_VM_ACTION_SUBSET = 'holoscript-hsplus-vm-action-subset-v1' as const;
export const POST_SEAL_OBSERVER_PROCESS = 'separate-node-process-serialized-post-seal-v1' as const;
export const PURE_HOLO_WORLD_PROJECTION = 'holoscript-cli-pure-world-projection-v1' as const;

interface HsplusNodeLike {
  type?: unknown;
  properties?: unknown;
  directives?: unknown;
  children?: unknown;
  body?: unknown;
}

interface HsplusActionDefinition {
  name: string;
  params: string[];
  body: string;
}

interface BehaviorExecutor {
  initialState: Record<string, unknown>;
  invoke(entry: HeadlessExperimentScheduleEntry): {
    value: HeadlessJsonValue;
    state: Record<string, unknown>;
    emittedEvents: HeadlessJsonValue[];
  };
}

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
    schedule: typeof NODE_PIPELINE_BRIDGE;
    behavior: typeof HSPLUS_VM_ACTION_SUBSET;
  };
  claimBoundary: {
    holoWorldParsedAndProjected: true;
    hsPipelineExecuted: true;
    hsplusActionEntrypointsExecuted: true;
    nativeRustPipelineExecutionClaimed: false;
    nativeEngineHsplusExecutionClaimed: false;
    worldRuntimeLifecycleExecuted: false;
    providerCallsMade: 0;
    liveAuthorizationReplayProtectionClaimed: false;
    externalReplayRegistryAvailable: true;
    trustedAuthoredBehaviorOnly: true;
    vmSecurityBoundaryClaimed: false;
  };
  observerProof?: HeadlessObserverEquivalenceProof;
}

const FORBIDDEN_DETERMINISTIC_SOURCE =
  /\b(?:Date|crypto|performance|process|require|import|fetch|setTimeout|setInterval|setImmediate|queueMicrotask|eval|Function|globalThis|WebAssembly|Atomics|SharedArrayBuffer|Promise|async|await|Object|Reflect|Proxy|Symbol|prototype|__proto__)\b|Math\s*\.\s*random/;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function detachVmJson(value: unknown, label: string): HeadlessJsonValue {
  const active = new WeakSet<object>();
  const visit = (candidate: unknown, path: string): HeadlessJsonValue => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') {
      return candidate;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) {
        throw new Error(`${label} contains an unsupported number at ${path}`);
      }
      return candidate;
    }
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`${label} contains unsupported ${typeof candidate} at ${path}`);
    }
    if (active.has(candidate)) {
      throw new Error(`${label} contains a cycle at ${path}`);
    }
    active.add(candidate);
    let detached: HeadlessJsonValue;
    if (Array.isArray(candidate)) {
      const ownKeys = Reflect.ownKeys(candidate);
      if (
        ownKeys.some(
          (key) => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key))
        )
      ) {
        throw new Error(`${label} contains a symbol or custom array key at ${path}`);
      }
      const output: HeadlessJsonValue[] = [];
      for (let index = 0; index < candidate.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new Error(
            `${label} contains a sparse or accessor array entry at ${path}[${index}]`
          );
        }
        output.push(visit(descriptor.value, `${path}[${index}]`));
      }
      detached = output;
    } else {
      if (Object.prototype.toString.call(candidate) !== '[object Object]') {
        throw new Error(`${label} contains a non-plain VM object at ${path}`);
      }
      const ownKeys = Reflect.ownKeys(candidate);
      if (ownKeys.some((key) => typeof key !== 'string')) {
        throw new Error(`${label} contains a symbol key at ${path}`);
      }
      const output: HeadlessJsonObject = {};
      for (const key of ownKeys as string[]) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new Error(`${label} contains a non-enumerable or accessor key at ${path}.${key}`);
        }
        output[key] = visit(descriptor.value, `${path}.${key}`);
      }
      detached = output;
    }
    active.delete(candidate);
    return detached;
  };
  return visit(value, '$');
}

function walkHsplus(node: unknown): HsplusNodeLike[] {
  if (!isRecord(node)) return [];
  const current = node as HsplusNodeLike;
  const children = Array.isArray(current.children) ? current.children : [];
  return [current, ...children.flatMap((child) => walkHsplus(child))];
}

function mergeState(
  target: Record<string, unknown>,
  candidate: unknown,
  sourceLabel: string
): void {
  if (!isRecord(candidate)) return;
  for (const [key, value] of Object.entries(candidate)) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      throw new Error(`Duplicate HoloScript+ state key "${key}" in ${sourceLabel}`);
    }
    target[key] = strictClone(value, `HoloScript+ state ${key}`);
  }
}

function extractState(nodes: HsplusNodeLike[]): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const node of nodes) {
    const directives = Array.isArray(node.directives) ? node.directives : [];
    for (const directive of directives) {
      if (isRecord(directive) && directive.type === 'state') {
        mergeState(state, directive.body, '@state');
      }
    }
    if (node.type === 'state') {
      mergeState(state, node.properties, 'state block');
      if (isRecord(node.body) && !Array.isArray(node.body.actions)) {
        mergeState(state, node.body, 'state block body');
      }
    }
  }
  if (Object.keys(state).length === 0) {
    throw new Error('HoloScript+ behavior must declare deterministic state');
  }
  return state;
}

function extractActions(nodes: HsplusNodeLike[]): Map<string, HsplusActionDefinition> {
  const actions = new Map<string, HsplusActionDefinition>();
  for (const node of nodes) {
    if (node.type !== 'logic' || !isRecord(node.body) || !Array.isArray(node.body.actions)) {
      continue;
    }
    for (const [index, candidate] of node.body.actions.entries()) {
      if (!isRecord(candidate)) {
        throw new Error(`HoloScript+ logic action ${index} is malformed`);
      }
      const name = candidate.name;
      const params = candidate.params;
      const body = candidate.body;
      if (
        typeof name !== 'string' ||
        !IDENTIFIER.test(name) ||
        !Array.isArray(params) ||
        !params.every((param) => typeof param === 'string' && IDENTIFIER.test(param)) ||
        typeof body !== 'string' ||
        body.trim().length === 0
      ) {
        throw new Error(`HoloScript+ logic action ${index} has an unsupported signature`);
      }
      if (new Set(params).size !== params.length) {
        throw new Error(`HoloScript+ action "${name}" contains duplicate parameters`);
      }
      if (FORBIDDEN_DETERMINISTIC_SOURCE.test(body)) {
        throw new Error(
          `HoloScript+ action "${name}" uses a forbidden nondeterministic or host capability`
        );
      }
      if (actions.has(name)) {
        throw new Error(`Duplicate HoloScript+ action "${name}"`);
      }
      actions.set(name, { name, params: [...params], body });
    }
  }
  if (actions.size === 0) {
    throw new Error(
      'HoloScript+ behavior must declare at least one logic { action name(params) { ... } } entrypoint'
    );
  }
  return actions;
}

function safeMath(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(Math)) {
    if (key === 'random') continue;
    result[key] = (Math as unknown as Record<string, unknown>)[key];
  }
  return Object.freeze(result);
}

function createBehaviorExecutor(source: string): BehaviorExecutor {
  const parsed = new HoloScriptPlusParser().parse(source);
  if (parsed.errors.length > 0 || !parsed.ast?.root) {
    throw new Error(
      `HoloScript+ behavior parse failed: ${parsed.errors.map((error) => error.message).join('; ')}`
    );
  }

  const nodes = walkHsplus(parsed.ast.root);
  let state = extractState(nodes);
  const initialState = strictClone(state, 'initial HoloScript+ state');
  const actions = extractActions(nodes);
  const math = safeMath();

  return {
    initialState,
    invoke(entry) {
      const action = actions.get(entry.entrypoint);
      if (!action) {
        throw new Error(`Unknown HoloScript+ action entrypoint "${entry.entrypoint}"`);
      }
      const args = strictClone(entry.args ?? {}, `${entry.scheduleEntryId} args`);
      const argKeys = Object.keys(args).sort();
      const paramKeys = [...action.params].sort();
      if (canonicalizeHeadlessValue(argKeys) !== canonicalizeHeadlessValue(paramKeys)) {
        throw new Error(
          `HoloScript+ action "${action.name}" requires exactly: ${action.params.join(', ')}`
        );
      }

      const invocationState = strictClone(state, `${action.name} pre-state`);
      const emittedEvents: HeadlessJsonValue[] = [];
      const sandbox = Object.assign(Object.create(null) as Record<string, unknown>, {
        state: invocationState,
        __args: action.params.map((param) => args[param]),
        getState: () => strictClone(invocationState, `${action.name} getState()`),
        setState: (updates: unknown) => {
          if (
            !updates ||
            typeof updates !== 'object' ||
            Array.isArray(updates) ||
            Object.prototype.toString.call(updates) !== '[object Object]'
          ) {
            throw new Error(`${action.name} setState() requires an object`);
          }
          Object.assign(
            invocationState,
            detachVmJson(updates, `${action.name} setState()`) as HeadlessJsonObject
          );
        },
        emit: (event: unknown, payload?: unknown) => {
          if (typeof event !== 'string' || event.length === 0) {
            throw new Error(`${action.name} emit() requires a string event name`);
          }
          emittedEvents.push(
            strictClone<HeadlessJsonValue>(
              {
                event,
                payload:
                  payload === undefined
                    ? null
                    : detachVmJson(payload, `${action.name} emitted payload`),
              } as HeadlessJsonValue,
              `${action.name} emitted event`
            )
          );
        },
        Math: math,
      });
      const context = vm.createContext(sandbox, {
        name: `holoscript:${action.name}`,
        codeGeneration: { strings: false, wasm: false },
      });
      const script = new vm.Script(
        `"use strict";\n(function(${action.params.join(',')}) {\n${action.body}\n})(...__args)`,
        {
          filename: `${action.name}.hsplus`,
        }
      );
      const value = script.runInContext(context, { timeout: 50 });
      if (value && typeof value === 'object' && typeof value.then === 'function') {
        throw new Error(`HoloScript+ action "${action.name}" returned an unsupported Promise`);
      }
      state = detachVmJson(invocationState, `${action.name} post-state`) as HeadlessJsonObject;
      return {
        value: detachVmJson(value, `${action.name} result`),
        state: strictClone(state, `${action.name} state receipt`),
        emittedEvents,
      };
    },
  };
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
  planModuleName?: string;
}): Promise<HeadlessExperimentSourceRun> {
  const sourceBundleHash = hashHeadlessValue({
    world: options.worldSource,
    plan: options.planSource,
    behavior: options.behaviorSource,
  });

  const execute = async (): Promise<HeadlessExperimentReceipt> => {
    const pipeline = await executePipelineSource(options.planSource, {
      mode: 'deterministic-plan',
      moduleName: options.planModuleName ?? 'headless-plan.hs',
    });
    const plan = parseHeadlessExperimentPlan(pipeline.data);
    const world = await options.captureWorld();
    const behavior = createBehaviorExecutor(options.behaviorSource);
    const receipt = await buildHeadlessExperimentReceipt({
      sourceBundleHash,
      scene: strictClone(world.scene, 'headless scene receipt'),
      posePhysics: strictClone(world.posePhysics, 'headless pose/physics receipt'),
      plan,
      initialState: behavior.initialState,
      invoke: behavior.invoke,
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
      schedule: NODE_PIPELINE_BRIDGE,
      behavior: HSPLUS_VM_ACTION_SUBSET,
    },
    claimBoundary: {
      holoWorldParsedAndProjected: true,
      hsPipelineExecuted: true,
      hsplusActionEntrypointsExecuted: true,
      nativeRustPipelineExecutionClaimed: false,
      nativeEngineHsplusExecutionClaimed: false,
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
