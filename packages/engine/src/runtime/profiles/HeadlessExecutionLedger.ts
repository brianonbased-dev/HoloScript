/**
 * Deterministic headless experiment receipts.
 *
 * This module is deliberately domain-neutral. A HoloScript `.hs` plan supplies
 * an ordered manifest and schedule, while an environment-specific executor
 * supplies observation/action results and state. The engine owns ordering,
 * logical time, public-state projection, hash chains, and verification.
 *
 * It does not evaluate source strings and it does not treat Node's VM as a
 * security boundary. Source evaluation belongs to the host adapter.
 */
import { sha256Bytes } from '../../simulation/sha256';

export const HEADLESS_EXPERIMENT_PLAN_SCHEMA = 'holoscript.headless-experiment-plan.v1' as const;
export const HEADLESS_EXPERIMENT_RECEIPT_SCHEMA = 'holoscript.headless-experiment-run.v1' as const;
export const HEADLESS_EXPERIMENT_HASH_ALGORITHM = 'sha256-strict-canonical-json-v1' as const;

export type HeadlessJsonPrimitive = null | boolean | number | string;
export type HeadlessJsonValue =
  | HeadlessJsonPrimitive
  | HeadlessJsonValue[]
  | { [key: string]: HeadlessJsonValue };
export type HeadlessJsonObject = { [key: string]: HeadlessJsonValue };

export interface HeadlessExperimentClockDeclaration {
  startTick: number;
  endTick: number;
  step: number;
}

interface HeadlessObservationSubjectBinding {
  argumentKey: string;
  observationKey: string;
  targetCardinality: 1;
}

export interface HeadlessExperimentManifest {
  kind: 'manifest';
  schema: typeof HEADLESS_EXPERIMENT_PLAN_SCHEMA;
  runId: string;
  seed: string;
  clock: HeadlessExperimentClockDeclaration;
  publicStateKeys: string[];
  expected: {
    scheduleCount: number;
    observationCount: number;
    actionCount: number;
    finalPublicState: HeadlessJsonObject;
  };
  authorization?: {
    required: boolean;
    startSequence: number;
  };
  observationPolicy?: {
    allowedRootKeys?: string[];
    forbiddenKeys?: string[];
    forbiddenValues?: HeadlessJsonValue[];
    subjectBinding?: HeadlessObservationSubjectBinding;
  };
}

export interface HeadlessActionAuthorization {
  nonce: string;
  sequence: number;
  turnOpportunityId: string;
  safetyReceiptId: string;
  decisionReceiptId: string;
}

export interface HeadlessExperimentScheduleEntry {
  kind: 'observation' | 'action';
  scheduleEntryId: string;
  order: number;
  tick: number;
  phase: string;
  entrypoint: string;
  args?: HeadlessJsonObject;
  targetIds?: string[];
  barrierId?: string | null;
  authorization?: HeadlessActionAuthorization;
  expect?: {
    allowed?: boolean;
    outcome?: string;
    stateChanged?: boolean;
  };
}

export interface ParsedHeadlessExperimentPlan {
  manifest: HeadlessExperimentManifest;
  schedule: HeadlessExperimentScheduleEntry[];
}

export interface HeadlessExperimentInvocationResult {
  value: HeadlessJsonValue;
  state: Record<string, unknown>;
  emittedEvents?: HeadlessJsonValue[];
}

export type HeadlessExperimentInvoker = (
  entry: HeadlessExperimentScheduleEntry
) => Promise<HeadlessExperimentInvocationResult> | HeadlessExperimentInvocationResult;

export interface HeadlessChainedEntry<TPayload extends HeadlessJsonValue = HeadlessJsonValue> {
  sequence: number;
  logicalTick: number;
  previousHash: string;
  payload: TPayload;
  entryHash: string;
}

export interface HeadlessExecutedSchedulePayload extends HeadlessJsonObject {
  scheduleEntryId: string;
  order: number;
  tick: number;
  phase: string;
  kind: 'observation' | 'action';
  entrypoint: string;
  source: HeadlessJsonObject;
  outcomeHashes: string[];
}

export interface HeadlessObservationPayload extends HeadlessJsonObject {
  scheduleEntryId: string;
  tick: number;
  entrypoint: string;
  targetIds: string[];
  publicStateHash: string;
  observation: HeadlessJsonValue;
}

export interface HeadlessRollbackReference extends HeadlessJsonObject {
  preStateSnapshotId: string;
  preStateHash: string;
  priorActionRoot: string;
}

export interface HeadlessActionPayload extends HeadlessJsonObject {
  scheduleEntryId: string;
  tick: number;
  entrypoint: string;
  args: HeadlessJsonObject;
  targetIds: string[];
  authorization: HeadlessJsonObject | null;
  allowed: boolean;
  outcome: string;
  result: HeadlessJsonObject;
  emittedEvents: HeadlessJsonValue[];
  preStateSnapshotId: string;
  postStateSnapshotId: string;
  prePublicStateHash: string;
  postPublicStateHash: string;
  stateChanged: boolean;
  rollbackReference: HeadlessRollbackReference;
}

export interface HeadlessPublicStatePayload extends HeadlessJsonObject {
  snapshotId: string;
  scheduleEntryId: string | null;
  publicState: HeadlessJsonObject;
  publicStateHash: string;
}

export interface HeadlessExperimentReceipt {
  schema: typeof HEADLESS_EXPERIMENT_RECEIPT_SCHEMA;
  hashAlgorithm: typeof HEADLESS_EXPERIMENT_HASH_ALGORITHM;
  runId: string;
  seed: string;
  sourceBundleHash: string;
  manifest: HeadlessExperimentManifest;
  logicalClock: {
    start_tick: number;
    end_tick: number;
    step: number;
    executed_ticks: number[];
  };
  scene: HeadlessJsonValue;
  posePhysics: HeadlessJsonValue;
  publicStateSnapshots: HeadlessChainedEntry<HeadlessPublicStatePayload>[];
  scheduleLedger: HeadlessChainedEntry<HeadlessExecutedSchedulePayload>[];
  observationLedger: HeadlessChainedEntry<HeadlessObservationPayload>[];
  actionLedger: HeadlessChainedEntry<HeadlessActionPayload>[];
  canonicalFields: {
    canonicalSceneHash: string;
    canonicalPoseHash: string;
    logicalClockHash: string;
    publicStateHash: string;
    executedScheduleHash: string;
    residentObservationHash: string;
    actionReceiptRoot: string;
  };
  terminal: {
    finalTick: number;
    finalPublicStateHash: string;
    expectedCounts: {
      schedule: number;
      observations: number;
      actions: number;
      publicStateSnapshots: number;
    };
    actualCounts: {
      schedule: number;
      observations: number;
      actions: number;
      publicStateSnapshots: number;
    };
    publicStateHistoryRoot: string;
    scheduleRoot: string;
    observationRoot: string;
    actionRoot: string;
    terminalCommitment: string;
  };
}

export interface HeadlessExperimentVerificationOptions {
  expectedSourceBundleHash?: string;
  expectedSchedule?: HeadlessExperimentScheduleEntry[];
  expectedTerminalCommitment?: string;
  /** Optional live-admission registry. Deterministic offline replays omit it. */
  replayRegistry?: HeadlessExperimentReplayRegistry;
}

export interface HeadlessExperimentReplayRegistry {
  terminalCommitments: Set<string>;
  authorizationIds: Set<string>;
}

export interface HeadlessExperimentVerificationResult {
  valid: boolean;
  errors: string[];
}

type LedgerKind = 'public-state' | 'schedule' | 'observation' | 'action';

function fail(message: string): never {
  throw new Error(`Headless experiment contract: ${message}`);
}

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Strict canonical JSON. Object keys are sorted, array order is preserved, and
 * values that JSON would silently coerce/drop are rejected.
 */
export function canonicalizeHeadlessValue(value: unknown): string {
  const active = new WeakSet<object>();

  const visit = (candidate: unknown, path: string): string => {
    if (candidate === null) return 'null';
    if (typeof candidate === 'string' || typeof candidate === 'boolean') {
      return JSON.stringify(candidate);
    }
    if (typeof candidate === 'number') {
      assertContract(Number.isFinite(candidate), `${path} contains a non-finite number`);
      assertContract(!Object.is(candidate, -0), `${path} contains negative zero`);
      return JSON.stringify(candidate);
    }
    assertContract(
      typeof candidate === 'object',
      `${path} contains unsupported ${typeof candidate}`
    );
    assertContract(!active.has(candidate), `${path} contains a cycle`);
    active.add(candidate);

    let result: string;
    if (Array.isArray(candidate)) {
      const ownKeys = Reflect.ownKeys(candidate);
      assertContract(
        ownKeys.every(
          (key) => typeof key === 'string' && (key === 'length' || /^(0|[1-9]\d*)$/.test(key))
        ),
        `${path} contains a symbol or custom array key`
      );
      const items: string[] = [];
      for (let index = 0; index < candidate.length; index++) {
        assertContract(
          Object.prototype.hasOwnProperty.call(candidate, index),
          `${path} contains a sparse array hole at ${index}`
        );
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        assertContract(
          descriptor?.enumerable === true && 'value' in descriptor,
          `${path}[${index}] must be an enumerable data property`
        );
        items.push(visit(descriptor.value, `${path}[${index}]`));
      }
      result = `[${items.join(',')}]`;
    } else {
      assertContract(isPlainObject(candidate), `${path} contains a non-plain object`);
      const ownKeys = Reflect.ownKeys(candidate);
      assertContract(
        ownKeys.every((key) => typeof key === 'string'),
        `${path} contains a symbol key`
      );
      const parts = (ownKeys as string[]).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        assertContract(
          descriptor?.enumerable === true && 'value' in descriptor,
          `${path}.${key} must be an enumerable data property`
        );
        const child = descriptor.value;
        assertContract(child !== undefined, `${path}.${key} is undefined`);
        return `${JSON.stringify(key)}:${visit(child, `${path}.${key}`)}`;
      });
      result = `{${parts.join(',')}}`;
    }

    active.delete(candidate);
    return result;
  };

  return visit(value, '$');
}

export function cloneHeadlessValue<T extends HeadlessJsonValue>(value: T): T {
  return JSON.parse(canonicalizeHeadlessValue(value)) as T;
}

export function hashHeadlessValue(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalizeHeadlessValue(value)));
}

function toJsonValue(value: unknown, label: string): HeadlessJsonValue {
  try {
    return JSON.parse(canonicalizeHeadlessValue(value)) as HeadlessJsonValue;
  } catch (error) {
    fail(`${label} is not strict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toJsonObject(value: unknown, label: string): HeadlessJsonObject {
  const json = toJsonValue(value, label);
  assertContract(isPlainObject(json), `${label} must be an object`);
  return json as HeadlessJsonObject;
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  assertContract(typeof value === 'string' && value.length > 0, `${label}.${key} must be a string`);
  return value;
}

function requiredSafeInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  assertContract(Number.isSafeInteger(value), `${label}.${key} must be a safe integer`);
  return value as number;
}

function stringArray(value: unknown, label: string): string[] {
  assertContract(Array.isArray(value), `${label} must be an array`);
  const result = value.map((item, index) => {
    assertContract(
      typeof item === 'string' && item.length > 0,
      `${label}[${index}] must be a string`
    );
    return item;
  });
  assertContract(new Set(result).size === result.length, `${label} contains duplicates`);
  return result;
}

function parseObservationSubjectBinding(
  value: unknown,
  label: string
): HeadlessObservationSubjectBinding {
  const parsed = toJsonObject(value, label);
  assertContract(
    canonicalizeHeadlessValue(Object.keys(parsed).sort()) ===
      canonicalizeHeadlessValue(['argumentKey', 'observationKey', 'targetCardinality'].sort()),
    `${label} fields must be exactly argumentKey, observationKey, and targetCardinality`
  );
  const targetCardinality = requiredSafeInteger(parsed, 'targetCardinality', label);
  assertContract(targetCardinality === 1, `${label}.targetCardinality must be 1`);
  return {
    argumentKey: requiredString(parsed, 'argumentKey', label),
    observationKey: requiredString(parsed, 'observationKey', label),
    targetCardinality: 1,
  };
}

function parseAuthorization(value: unknown, label: string): HeadlessActionAuthorization {
  assertContract(isPlainObject(value), `${label} must be an object`);
  return {
    nonce: requiredString(value, 'nonce', label),
    sequence: requiredSafeInteger(value, 'sequence', label),
    turnOpportunityId: requiredString(value, 'turnOpportunityId', label),
    safetyReceiptId: requiredString(value, 'safetyReceiptId', label),
    decisionReceiptId: requiredString(value, 'decisionReceiptId', label),
  };
}

function parseScheduleEntry(value: unknown, index: number): HeadlessExperimentScheduleEntry {
  const label = `schedule[${index}]`;
  assertContract(isPlainObject(value), `${label} must be an object`);
  assertContract(
    value.kind === 'observation' || value.kind === 'action',
    `${label}.kind must be observation or action`
  );
  const args = value.args === undefined ? undefined : toJsonObject(value.args, `${label}.args`);
  const targetIds =
    value.targetIds === undefined ? undefined : stringArray(value.targetIds, `${label}.targetIds`);
  let expect: HeadlessExperimentScheduleEntry['expect'];
  if (value.expect !== undefined) {
    assertContract(isPlainObject(value.expect), `${label}.expect must be an object`);
    if (value.expect.allowed !== undefined) {
      assertContract(typeof value.expect.allowed === 'boolean', `${label}.expect.allowed invalid`);
    }
    if (value.expect.outcome !== undefined) {
      assertContract(typeof value.expect.outcome === 'string', `${label}.expect.outcome invalid`);
    }
    if (value.expect.stateChanged !== undefined) {
      assertContract(
        typeof value.expect.stateChanged === 'boolean',
        `${label}.expect.stateChanged invalid`
      );
    }
    expect = {
      ...(value.expect.allowed === undefined ? {} : { allowed: value.expect.allowed }),
      ...(value.expect.outcome === undefined ? {} : { outcome: value.expect.outcome }),
      ...(value.expect.stateChanged === undefined
        ? {}
        : { stateChanged: value.expect.stateChanged }),
    };
  }

  return {
    kind: value.kind,
    scheduleEntryId: requiredString(value, 'scheduleEntryId', label),
    order: requiredSafeInteger(value, 'order', label),
    tick: requiredSafeInteger(value, 'tick', label),
    phase: requiredString(value, 'phase', label),
    entrypoint: requiredString(value, 'entrypoint', label),
    ...(args === undefined ? {} : { args }),
    ...(targetIds === undefined ? {} : { targetIds }),
    ...(value.barrierId === undefined
      ? {}
      : {
          barrierId: value.barrierId === null ? null : requiredString(value, 'barrierId', label),
        }),
    ...(value.authorization === undefined
      ? {}
      : { authorization: parseAuthorization(value.authorization, `${label}.authorization`) }),
    ...(expect === undefined ? {} : { expect }),
  };
}

function parseManifest(value: unknown): HeadlessExperimentManifest {
  const label = 'manifest';
  assertContract(isPlainObject(value), `${label} must be an object`);
  assertContract(value.kind === 'manifest', `${label}.kind must be manifest`);
  assertContract(
    value.schema === HEADLESS_EXPERIMENT_PLAN_SCHEMA,
    `${label}.schema must be ${HEADLESS_EXPERIMENT_PLAN_SCHEMA}`
  );
  assertContract(isPlainObject(value.clock), `${label}.clock must be an object`);
  assertContract(isPlainObject(value.expected), `${label}.expected must be an object`);

  const clock = {
    startTick: requiredSafeInteger(value.clock, 'startTick', `${label}.clock`),
    endTick: requiredSafeInteger(value.clock, 'endTick', `${label}.clock`),
    step: requiredSafeInteger(value.clock, 'step', `${label}.clock`),
  };
  assertContract(clock.step > 0, `${label}.clock.step must be positive`);
  assertContract(clock.endTick >= clock.startTick, `${label}.clock range is reversed`);
  assertContract(
    (clock.endTick - clock.startTick) % clock.step === 0,
    `${label}.clock.endTick must be reachable by exact step increments`
  );
  assertContract(
    Math.floor((clock.endTick - clock.startTick) / clock.step) + 1 <= 100_000,
    `${label}.clock exceeds 100000 ticks`
  );

  const expected = {
    scheduleCount: requiredSafeInteger(value.expected, 'scheduleCount', `${label}.expected`),
    observationCount: requiredSafeInteger(value.expected, 'observationCount', `${label}.expected`),
    actionCount: requiredSafeInteger(value.expected, 'actionCount', `${label}.expected`),
    finalPublicState: toJsonObject(
      value.expected.finalPublicState,
      `${label}.expected.finalPublicState`
    ),
  };
  assertContract(
    expected.scheduleCount >= 0 && expected.observationCount >= 0 && expected.actionCount >= 0,
    `${label}.expected counts must be non-negative`
  );

  let authorization: HeadlessExperimentManifest['authorization'];
  if (value.authorization !== undefined) {
    assertContract(isPlainObject(value.authorization), `${label}.authorization must be an object`);
    assertContract(
      typeof value.authorization.required === 'boolean',
      `${label}.authorization.required must be boolean`
    );
    authorization = {
      required: value.authorization.required,
      startSequence: requiredSafeInteger(
        value.authorization,
        'startSequence',
        `${label}.authorization`
      ),
    };
  }

  let observationPolicy: HeadlessExperimentManifest['observationPolicy'];
  if (value.observationPolicy !== undefined) {
    assertContract(
      isPlainObject(value.observationPolicy),
      `${label}.observationPolicy must be an object`
    );
    let forbiddenValues: HeadlessJsonValue[] | undefined;
    let subjectBinding: HeadlessObservationSubjectBinding | undefined;
    if (value.observationPolicy.forbiddenValues !== undefined) {
      const parsedForbiddenValues = toJsonValue(
        value.observationPolicy.forbiddenValues,
        `${label}.observationPolicy.forbiddenValues`
      );
      assertContract(
        Array.isArray(parsedForbiddenValues),
        `${label}.observationPolicy.forbiddenValues must be an array`
      );
      forbiddenValues = parsedForbiddenValues.map((item) => cloneHeadlessValue(item));
    }
    if (value.observationPolicy.subjectBinding !== undefined) {
      subjectBinding = parseObservationSubjectBinding(
        value.observationPolicy.subjectBinding,
        `${label}.observationPolicy.subjectBinding`
      );
    }
    observationPolicy = {
      ...(value.observationPolicy.allowedRootKeys === undefined
        ? {}
        : {
            allowedRootKeys: stringArray(
              value.observationPolicy.allowedRootKeys,
              `${label}.observationPolicy.allowedRootKeys`
            ),
          }),
      ...(value.observationPolicy.forbiddenKeys === undefined
        ? {}
        : {
            forbiddenKeys: stringArray(
              value.observationPolicy.forbiddenKeys,
              `${label}.observationPolicy.forbiddenKeys`
            ),
          }),
      ...(forbiddenValues === undefined ? {} : { forbiddenValues }),
      ...(subjectBinding === undefined ? {} : { subjectBinding }),
    };
  }

  return {
    kind: 'manifest',
    schema: HEADLESS_EXPERIMENT_PLAN_SCHEMA,
    runId: requiredString(value, 'runId', label),
    seed: requiredString(value, 'seed', label),
    clock,
    publicStateKeys: stringArray(value.publicStateKeys, `${label}.publicStateKeys`),
    expected,
    ...(authorization === undefined ? {} : { authorization }),
    ...(observationPolicy === undefined ? {} : { observationPolicy }),
  };
}

export function parseHeadlessExperimentPlan(records: unknown): ParsedHeadlessExperimentPlan {
  assertContract(Array.isArray(records), 'pipeline result must be an array');
  assertContract(records.length > 0, 'pipeline result is empty');
  const manifestIndexes = records
    .map((record, index) => (isPlainObject(record) && record.kind === 'manifest' ? index : -1))
    .filter((index) => index >= 0);
  assertContract(manifestIndexes.length === 1, 'plan must contain exactly one manifest');
  assertContract(manifestIndexes[0] === 0, 'manifest must be the first pipeline record');

  const manifest = parseManifest(records[0]);
  const schedule = records.slice(1).map((record, index) => parseScheduleEntry(record, index));
  validatePlan(manifest, schedule);
  return { manifest, schedule };
}

function expectedTicks(clock: HeadlessExperimentClockDeclaration): number[] {
  const result: number[] = [];
  for (let tick = clock.startTick; tick <= clock.endTick; tick += clock.step) {
    result.push(tick);
  }
  return result;
}

function validatePlan(
  manifest: HeadlessExperimentManifest,
  schedule: HeadlessExperimentScheduleEntry[]
): void {
  const subjectBinding =
    manifest.observationPolicy?.subjectBinding === undefined
      ? undefined
      : parseObservationSubjectBinding(
          manifest.observationPolicy.subjectBinding,
          'manifest.observationPolicy.subjectBinding'
        );
  assertContract(
    schedule.length === manifest.expected.scheduleCount,
    `expected ${manifest.expected.scheduleCount} schedule entries, received ${schedule.length}`
  );
  const observationCount = schedule.filter((entry) => entry.kind === 'observation').length;
  const actionCount = schedule.filter((entry) => entry.kind === 'action').length;
  assertContract(
    observationCount === manifest.expected.observationCount,
    `expected ${manifest.expected.observationCount} observations, received ${observationCount}`
  );
  assertContract(
    actionCount === manifest.expected.actionCount,
    `expected ${manifest.expected.actionCount} actions, received ${actionCount}`
  );

  const scheduleIds = new Set<string>();
  const seenTicks: number[] = [];
  const tickSet = new Set<number>();
  const validTicks = new Set(expectedTicks(manifest.clock));
  let priorTick = Number.NEGATIVE_INFINITY;
  const uniqueAuthorization = {
    nonce: new Set<string>(),
    turnOpportunityId: new Set<string>(),
    safetyReceiptId: new Set<string>(),
    decisionReceiptId: new Set<string>(),
  };
  let actionIndex = 0;

  schedule.forEach((entry, index) => {
    assertContract(
      entry.order === index,
      `schedule order ${entry.order} must equal index ${index}`
    );
    assertContract(
      !scheduleIds.has(entry.scheduleEntryId),
      `duplicate scheduleEntryId ${entry.scheduleEntryId}`
    );
    scheduleIds.add(entry.scheduleEntryId);
    assertContract(validTicks.has(entry.tick), `schedule tick ${entry.tick} is outside the clock`);
    assertContract(entry.tick >= priorTick, 'schedule ticks must be monotonic');
    priorTick = entry.tick;
    if (!tickSet.has(entry.tick)) {
      tickSet.add(entry.tick);
      seenTicks.push(entry.tick);
    }

    if (entry.kind === 'observation') {
      validateObservationSubjectSchedule(entry, subjectBinding, entry.scheduleEntryId);
      assertContract(
        entry.authorization === undefined,
        'observation entries cannot carry authorization'
      );
      return;
    }

    const required = manifest.authorization?.required ?? false;
    assertContract(
      !required || entry.authorization !== undefined,
      `${entry.scheduleEntryId} lacks authorization`
    );
    if (entry.authorization) {
      const expectedSequence = (manifest.authorization?.startSequence ?? 0) + actionIndex;
      assertContract(
        entry.authorization.sequence === expectedSequence,
        `${entry.scheduleEntryId} authorization sequence must be ${expectedSequence}`
      );
      for (const field of Object.keys(uniqueAuthorization) as Array<
        keyof typeof uniqueAuthorization
      >) {
        const value = entry.authorization[field];
        assertContract(
          !uniqueAuthorization[field].has(String(value)),
          `duplicate authorization ${field}`
        );
        uniqueAuthorization[field].add(String(value));
      }
    }
    actionIndex++;
  });

  assertContract(
    canonicalizeHeadlessValue(seenTicks) ===
      canonicalizeHeadlessValue(expectedTicks(manifest.clock)),
    'schedule does not cover the declared logical clock exactly'
  );
  assertContract(
    canonicalizeHeadlessValue(
      projectPublicState(manifest.expected.finalPublicState, manifest.publicStateKeys)
    ) === canonicalizeHeadlessValue(manifest.expected.finalPublicState),
    'expected final public state must contain exactly publicStateKeys'
  );
}

function validateObservationSubjectSchedule(
  entry: HeadlessExperimentScheduleEntry,
  binding: HeadlessObservationSubjectBinding | undefined,
  label: string
): string | undefined {
  if (!binding) return undefined;
  const targetIds = entry.targetIds ?? [];
  assertContract(
    targetIds.length === binding.targetCardinality,
    `${label} subject binding requires exactly ${binding.targetCardinality} target`
  );
  const targetId = targetIds[0];
  const args = entry.args ?? {};
  assertContract(
    Object.prototype.hasOwnProperty.call(args, binding.argumentKey),
    `${label} subject binding argument ${binding.argumentKey} is missing`
  );
  assertContract(
    args[binding.argumentKey] === targetId,
    `${label} subject binding argument ${binding.argumentKey} must equal sole target ${targetId}`
  );
  return targetId;
}

function projectPublicState(
  state: Record<string, unknown>,
  keys: readonly string[]
): HeadlessJsonObject {
  const projection: HeadlessJsonObject = {};
  for (const key of keys) {
    assertContract(
      Object.prototype.hasOwnProperty.call(state, key),
      `public state is missing ${key}`
    );
    projection[key] = toJsonValue(state[key], `public state ${key}`);
  }
  return projection;
}

function normalizedKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function enforceObservationPolicy(
  observation: HeadlessJsonValue,
  policy: HeadlessExperimentManifest['observationPolicy'],
  options: { checkAllowedRootKeys?: boolean; exactRootKeys?: boolean; label?: string } = {}
): void {
  if (!policy) return;
  const label = options.label ?? 'observation';
  assertContract(isPlainObject(observation), `${label} must be an object`);

  if (policy.allowedRootKeys && (options.checkAllowedRootKeys ?? true)) {
    const allowed = policy.allowedRootKeys.map(normalizedKey).sort();
    const actual = Object.keys(observation).map(normalizedKey).sort();
    if (options.exactRootKeys ?? true) {
      assertContract(
        canonicalizeHeadlessValue(actual) === canonicalizeHeadlessValue(allowed),
        `${label} root keys must exactly match the declared policy`
      );
    } else {
      const allowedSet = new Set(allowed);
      for (const key of actual) {
        assertContract(allowedSet.has(key), `${label} root key ${key} is not allowed`);
      }
    }
  }

  const forbiddenKeys = new Set((policy.forbiddenKeys ?? []).map(normalizedKey));
  const forbiddenValues = new Set<string>();
  for (const value of policy.forbiddenValues ?? []) {
    forbiddenValues.add(canonicalizeHeadlessValue(value));
    forbiddenValues.add(canonicalizeHeadlessValue(hashHeadlessValue(value)));
  }
  const visit = (value: HeadlessJsonValue, path: string): void => {
    assertContract(
      !forbiddenValues.has(canonicalizeHeadlessValue(value)),
      `${label} contains a forbidden value or digest at ${path}`
    );
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        assertContract(
          !forbiddenKeys.has(normalizedKey(key)),
          `${label} contains forbidden key ${key}`
        );
        visit(child as HeadlessJsonValue, `${path}.${key}`);
      }
    }
  };
  visit(observation, '$');
}

function enforceObservationSubjectBinding(
  observation: HeadlessJsonValue,
  entry: HeadlessExperimentScheduleEntry,
  binding: HeadlessObservationSubjectBinding | undefined,
  label: string
): void {
  if (!binding) return;
  const targetId = validateObservationSubjectSchedule(entry, binding, label);
  assertContract(isPlainObject(observation), `${label} must be an object`);
  assertContract(
    Object.prototype.hasOwnProperty.call(observation, binding.observationKey),
    `${label} subject field ${binding.observationKey} is missing`
  );
  assertContract(
    observation[binding.observationKey] === targetId,
    `${label} subject field ${binding.observationKey} must equal sole target ${targetId}`
  );
}

function ledgerGenesis(
  kind: LedgerKind,
  manifest: HeadlessExperimentManifest,
  sourceBundleHash: string,
  expectedCount: number
): string {
  return hashHeadlessValue({
    schema: HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    ledgerKind: kind,
    runId: manifest.runId,
    seed: manifest.seed,
    sourceBundleHash,
    expectedCount,
  });
}

function appendLedger<TPayload extends HeadlessJsonValue>(
  entries: HeadlessChainedEntry<TPayload>[],
  kind: LedgerKind,
  logicalTick: number,
  payload: TPayload,
  previousHash: string,
  manifest: HeadlessExperimentManifest,
  sourceBundleHash: string
): string {
  const sequence = entries.length;
  const entryHash = hashHeadlessValue({
    schema: HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    ledgerKind: kind,
    runId: manifest.runId,
    seed: manifest.seed,
    sourceBundleHash,
    sequence,
    logicalTick,
    previousHash,
    payload,
  });
  entries.push({ sequence, logicalTick, previousHash, payload, entryHash });
  return entryHash;
}

function actionDecision(value: HeadlessJsonValue): {
  result: HeadlessJsonObject;
  allowed: boolean;
  outcome: string;
} {
  assertContract(isPlainObject(value), 'action result must be an object');
  assertContract(typeof value.allowed === 'boolean', 'action result.allowed must be boolean');
  assertContract(
    typeof value.outcome === 'string' && value.outcome.length > 0,
    'action result.outcome must be a string'
  );
  return {
    result: value as HeadlessJsonObject,
    allowed: value.allowed,
    outcome: value.outcome,
  };
}

function sourceEntryObject(entry: HeadlessExperimentScheduleEntry): HeadlessJsonObject {
  return toJsonObject(entry, `schedule source ${entry.scheduleEntryId}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export async function buildHeadlessExperimentReceipt(options: {
  sourceBundleHash: string;
  scene: unknown;
  posePhysics: unknown;
  plan: ParsedHeadlessExperimentPlan;
  initialState: Record<string, unknown>;
  invoke: HeadlessExperimentInvoker;
}): Promise<HeadlessExperimentReceipt> {
  assertContract(
    /^[a-f0-9]{64}$/.test(options.sourceBundleHash),
    'sourceBundleHash must be SHA-256'
  );
  validatePlan(options.plan.manifest, options.plan.schedule);
  const manifest = cloneHeadlessValue(
    options.plan.manifest as unknown as HeadlessJsonObject
  ) as unknown as HeadlessExperimentManifest;
  const schedule = options.plan.schedule.map((entry) =>
    cloneHeadlessValue(entry as unknown as HeadlessJsonObject)
  ) as unknown as HeadlessExperimentScheduleEntry[];
  const scene = toJsonValue(options.scene, 'scene');
  const posePhysics = toJsonValue(options.posePhysics, 'posePhysics');

  const publicStateSnapshots: HeadlessChainedEntry<HeadlessPublicStatePayload>[] = [];
  const scheduleLedger: HeadlessChainedEntry<HeadlessExecutedSchedulePayload>[] = [];
  const observationLedger: HeadlessChainedEntry<HeadlessObservationPayload>[] = [];
  const actionLedger: HeadlessChainedEntry<HeadlessActionPayload>[] = [];

  let publicStateRoot = ledgerGenesis(
    'public-state',
    manifest,
    options.sourceBundleHash,
    schedule.length + 1
  );
  let scheduleRoot = ledgerGenesis(
    'schedule',
    manifest,
    options.sourceBundleHash,
    manifest.expected.scheduleCount
  );
  let observationRoot = ledgerGenesis(
    'observation',
    manifest,
    options.sourceBundleHash,
    manifest.expected.observationCount
  );
  let actionRoot = ledgerGenesis(
    'action',
    manifest,
    options.sourceBundleHash,
    manifest.expected.actionCount
  );

  let executorState = toJsonObject(options.initialState, 'initial executor state');
  let publicState = projectPublicState(executorState, manifest.publicStateKeys);
  const initialHash = hashHeadlessValue(publicState);
  publicStateRoot = appendLedger(
    publicStateSnapshots,
    'public-state',
    manifest.clock.startTick,
    {
      snapshotId: 'state-0',
      scheduleEntryId: null,
      publicState,
      publicStateHash: initialHash,
    },
    publicStateRoot,
    manifest,
    options.sourceBundleHash
  );

  for (const entry of schedule) {
    const preState = publicState;
    const preExecutorState = executorState;
    const preStateHash = hashHeadlessValue(preState);
    const preStateSnapshotId = `state-${publicStateSnapshots.length - 1}`;
    const invocation = await options.invoke(entry);
    const value = toJsonValue(invocation.value, `${entry.scheduleEntryId} result`);
    const emittedEvents = (invocation.emittedEvents ?? []).map((event, index) =>
      toJsonValue(event, `${entry.scheduleEntryId}.emittedEvents[${index}]`)
    );
    const postExecutorState = toJsonObject(
      invocation.state,
      `${entry.scheduleEntryId} executor state`
    );
    const postState = projectPublicState(postExecutorState, manifest.publicStateKeys);
    const postStateHash = hashHeadlessValue(postState);
    const stateChanged =
      canonicalizeHeadlessValue(preState) !== canonicalizeHeadlessValue(postState);
    const postStateSnapshotId = `state-${publicStateSnapshots.length}`;
    const outcomeHashes: string[] = [];

    if (entry.kind === 'observation') {
      assertContract(!stateChanged, `${entry.scheduleEntryId} observation mutated public state`);
      assertContract(
        canonicalizeHeadlessValue(preExecutorState) ===
          canonicalizeHeadlessValue(postExecutorState),
        `${entry.scheduleEntryId} observation mutated executor state`
      );
      assertContract(
        emittedEvents.length === 0,
        `${entry.scheduleEntryId} observation emitted host-visible events`
      );
      enforceObservationPolicy(value, manifest.observationPolicy);
      enforceObservationSubjectBinding(
        value,
        entry,
        manifest.observationPolicy?.subjectBinding,
        `${entry.scheduleEntryId} observation`
      );
      const payload: HeadlessObservationPayload = {
        scheduleEntryId: entry.scheduleEntryId,
        tick: entry.tick,
        entrypoint: entry.entrypoint,
        targetIds: entry.targetIds ?? [],
        publicStateHash: preStateHash,
        observation: value,
      };
      observationRoot = appendLedger(
        observationLedger,
        'observation',
        entry.tick,
        payload,
        observationRoot,
        manifest,
        options.sourceBundleHash
      );
      outcomeHashes.push(observationRoot);
    } else {
      const decision = actionDecision(value);
      enforceObservationPolicy(decision.result, manifest.observationPolicy, {
        checkAllowedRootKeys: false,
        label: `${entry.scheduleEntryId} action result`,
      });
      for (const [eventIndex, event] of emittedEvents.entries()) {
        enforceObservationPolicy(event, manifest.observationPolicy, {
          checkAllowedRootKeys: false,
          label: `${entry.scheduleEntryId} emitted event ${eventIndex}`,
        });
      }
      assertContract(
        decision.allowed || !stateChanged,
        `${entry.scheduleEntryId} denied action mutated public state`
      );
      assertContract(
        decision.allowed ||
          canonicalizeHeadlessValue(preExecutorState) ===
            canonicalizeHeadlessValue(postExecutorState),
        `${entry.scheduleEntryId} denied action mutated executor state`
      );
      assertContract(
        decision.allowed || emittedEvents.length === 0,
        `${entry.scheduleEntryId} denied action emitted host-visible events`
      );
      if (entry.expect?.allowed !== undefined) {
        assertContract(
          decision.allowed === entry.expect.allowed,
          `${entry.scheduleEntryId} allowed result does not match plan`
        );
      }
      if (entry.expect?.outcome !== undefined) {
        assertContract(
          decision.outcome === entry.expect.outcome,
          `${entry.scheduleEntryId} outcome does not match plan`
        );
      }
      if (entry.expect?.stateChanged !== undefined) {
        assertContract(
          stateChanged === entry.expect.stateChanged,
          `${entry.scheduleEntryId} state change does not match plan`
        );
      }

      const rollbackReference: HeadlessRollbackReference = {
        preStateSnapshotId,
        preStateHash,
        priorActionRoot: actionRoot,
      };
      const payload: HeadlessActionPayload = {
        scheduleEntryId: entry.scheduleEntryId,
        tick: entry.tick,
        entrypoint: entry.entrypoint,
        args: entry.args ?? {},
        targetIds: entry.targetIds ?? [],
        authorization: entry.authorization
          ? toJsonObject(entry.authorization, `${entry.scheduleEntryId}.authorization`)
          : null,
        allowed: decision.allowed,
        outcome: decision.outcome,
        result: decision.result,
        emittedEvents,
        preStateSnapshotId,
        postStateSnapshotId,
        prePublicStateHash: preStateHash,
        postPublicStateHash: postStateHash,
        stateChanged,
        rollbackReference,
      };
      actionRoot = appendLedger(
        actionLedger,
        'action',
        entry.tick,
        payload,
        actionRoot,
        manifest,
        options.sourceBundleHash
      );
      outcomeHashes.push(actionRoot);
    }

    publicState = postState;
    executorState = postExecutorState;
    publicStateRoot = appendLedger(
      publicStateSnapshots,
      'public-state',
      entry.tick,
      {
        snapshotId: postStateSnapshotId,
        scheduleEntryId: entry.scheduleEntryId,
        publicState,
        publicStateHash: postStateHash,
      },
      publicStateRoot,
      manifest,
      options.sourceBundleHash
    );

    const schedulePayload: HeadlessExecutedSchedulePayload = {
      scheduleEntryId: entry.scheduleEntryId,
      order: entry.order,
      tick: entry.tick,
      phase: entry.phase,
      kind: entry.kind,
      entrypoint: entry.entrypoint,
      source: sourceEntryObject(entry),
      outcomeHashes,
    };
    scheduleRoot = appendLedger(
      scheduleLedger,
      'schedule',
      entry.tick,
      schedulePayload,
      scheduleRoot,
      manifest,
      options.sourceBundleHash
    );
  }

  assertContract(
    canonicalizeHeadlessValue(publicState) ===
      canonicalizeHeadlessValue(manifest.expected.finalPublicState),
    'final public state does not match the plan manifest'
  );

  const logicalClock = {
    start_tick: manifest.clock.startTick,
    end_tick: manifest.clock.endTick,
    step: manifest.clock.step,
    executed_ticks: expectedTicks(manifest.clock),
  };
  const finalPublicStateHash = hashHeadlessValue(publicState);
  const canonicalFields = {
    canonicalSceneHash: hashHeadlessValue(scene),
    canonicalPoseHash: hashHeadlessValue(posePhysics),
    logicalClockHash: hashHeadlessValue(logicalClock),
    publicStateHash: finalPublicStateHash,
    executedScheduleHash: hashHeadlessValue(scheduleLedger.map((entry) => entry.payload)),
    residentObservationHash: hashHeadlessValue(observationLedger.map((entry) => entry.payload)),
    actionReceiptRoot: actionRoot,
  };
  const expectedCounts = {
    schedule: manifest.expected.scheduleCount,
    observations: manifest.expected.observationCount,
    actions: manifest.expected.actionCount,
    publicStateSnapshots: manifest.expected.scheduleCount + 1,
  };
  const actualCounts = {
    schedule: scheduleLedger.length,
    observations: observationLedger.length,
    actions: actionLedger.length,
    publicStateSnapshots: publicStateSnapshots.length,
  };
  const terminalPreimage = {
    schema: HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    runId: manifest.runId,
    seed: manifest.seed,
    sourceBundleHash: options.sourceBundleHash,
    manifestHash: hashHeadlessValue(manifest),
    finalTick: manifest.clock.endTick,
    finalPublicStateHash,
    expectedCounts,
    actualCounts,
    publicStateHistoryRoot: publicStateRoot,
    scheduleRoot,
    observationRoot,
    actionRoot,
    canonicalFields,
  };
  const terminal = {
    finalTick: manifest.clock.endTick,
    finalPublicStateHash,
    expectedCounts,
    actualCounts,
    publicStateHistoryRoot: publicStateRoot,
    scheduleRoot,
    observationRoot,
    actionRoot,
    terminalCommitment: hashHeadlessValue(terminalPreimage),
  };

  return deepFreeze({
    schema: HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    runId: manifest.runId,
    seed: manifest.seed,
    sourceBundleHash: options.sourceBundleHash,
    manifest,
    logicalClock,
    scene,
    posePhysics,
    publicStateSnapshots,
    scheduleLedger,
    observationLedger,
    actionLedger,
    canonicalFields,
    terminal,
  });
}

function verifyLedger<TPayload extends HeadlessJsonValue>(
  receipt: HeadlessExperimentReceipt,
  entries: HeadlessChainedEntry<TPayload>[],
  kind: LedgerKind,
  expectedCount: number
): string {
  assertContract(entries.length === expectedCount, `${kind} ledger count mismatch`);
  let previousHash = ledgerGenesis(kind, receipt.manifest, receipt.sourceBundleHash, expectedCount);
  entries.forEach((entry, index) => {
    assertContract(entry.sequence === index, `${kind} ledger sequence gap at ${index}`);
    assertContract(entry.previousHash === previousHash, `${kind} ledger previous hash mismatch`);
    const expectedHash = hashHeadlessValue({
      schema: HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
      hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
      ledgerKind: kind,
      runId: receipt.runId,
      seed: receipt.seed,
      sourceBundleHash: receipt.sourceBundleHash,
      sequence: entry.sequence,
      logicalTick: entry.logicalTick,
      previousHash: entry.previousHash,
      payload: entry.payload,
    });
    assertContract(
      entry.entryHash === expectedHash,
      `${kind} ledger entry hash mismatch at ${index}`
    );
    previousHash = entry.entryHash;
  });
  return previousHash;
}

export function verifyHeadlessExperimentReceipt(
  receipt: HeadlessExperimentReceipt,
  options: HeadlessExperimentVerificationOptions = {}
): HeadlessExperimentVerificationResult {
  try {
    canonicalizeHeadlessValue(receipt);
    assertContract(
      receipt.schema === HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
      'receipt schema mismatch'
    );
    assertContract(
      receipt.hashAlgorithm === HEADLESS_EXPERIMENT_HASH_ALGORITHM,
      'receipt hash algorithm mismatch'
    );
    assertContract(/^[a-f0-9]{64}$/.test(receipt.sourceBundleHash), 'invalid source bundle hash');
    assertContract(receipt.runId === receipt.manifest.runId, 'runId does not match manifest');
    assertContract(receipt.seed === receipt.manifest.seed, 'seed does not match manifest');
    if (options.expectedSourceBundleHash !== undefined) {
      assertContract(
        receipt.sourceBundleHash === options.expectedSourceBundleHash,
        'source bundle anchor mismatch'
      );
    }

    validatePlan(
      receipt.manifest,
      receipt.scheduleLedger.map(
        (entry) => entry.payload.source
      ) as unknown as HeadlessExperimentScheduleEntry[]
    );
    const schedule = receipt.scheduleLedger.map((entry, index) =>
      parseScheduleEntry(entry.payload.source, index)
    );
    if (options.expectedSchedule !== undefined) {
      assertContract(
        canonicalizeHeadlessValue(schedule) === canonicalizeHeadlessValue(options.expectedSchedule),
        'schedule differs from the external source anchor'
      );
    }

    const publicStateRoot = verifyLedger(
      receipt,
      receipt.publicStateSnapshots,
      'public-state',
      receipt.manifest.expected.scheduleCount + 1
    );
    const scheduleRoot = verifyLedger(
      receipt,
      receipt.scheduleLedger,
      'schedule',
      receipt.manifest.expected.scheduleCount
    );
    const observationRoot = verifyLedger(
      receipt,
      receipt.observationLedger,
      'observation',
      receipt.manifest.expected.observationCount
    );
    const actionRoot = verifyLedger(
      receipt,
      receipt.actionLedger,
      'action',
      receipt.manifest.expected.actionCount
    );

    assertContract(
      canonicalizeHeadlessValue(receipt.logicalClock.executed_ticks) ===
        canonicalizeHeadlessValue(expectedTicks(receipt.manifest.clock)),
      'logical clock coverage mismatch'
    );
    assertContract(
      receipt.logicalClock.start_tick === receipt.manifest.clock.startTick &&
        receipt.logicalClock.end_tick === receipt.manifest.clock.endTick &&
        receipt.logicalClock.step === receipt.manifest.clock.step,
      'logical clock declaration mismatch'
    );

    receipt.publicStateSnapshots.forEach((entry, index) => {
      const expectedScheduleEntry = index === 0 ? undefined : schedule[index - 1];
      assertContract(
        entry.payload.snapshotId === `state-${index}`,
        `public-state snapshot id mismatch at ${index}`
      );
      assertContract(
        entry.payload.scheduleEntryId === (expectedScheduleEntry?.scheduleEntryId ?? null),
        `public-state schedule reference mismatch at ${index}`
      );
      assertContract(
        entry.logicalTick === (expectedScheduleEntry?.tick ?? receipt.manifest.clock.startTick),
        `public-state logical tick mismatch at ${index}`
      );
      assertContract(
        entry.payload.publicStateHash === hashHeadlessValue(entry.payload.publicState),
        `public-state payload hash mismatch at ${index}`
      );
      assertContract(
        canonicalizeHeadlessValue(
          projectPublicState(entry.payload.publicState, receipt.manifest.publicStateKeys)
        ) === canonicalizeHeadlessValue(entry.payload.publicState),
        `public-state projection keys mismatch at ${index}`
      );
    });

    const observationsBySchedule = new Map(
      receipt.observationLedger.map((entry) => [entry.payload.scheduleEntryId, entry.payload])
    );
    const actionsBySchedule = new Map(
      receipt.actionLedger.map((entry) => [entry.payload.scheduleEntryId, entry.payload])
    );
    assertContract(
      observationsBySchedule.size === receipt.observationLedger.length,
      'duplicate observation schedule reference'
    );
    assertContract(
      actionsBySchedule.size === receipt.actionLedger.length,
      'duplicate action schedule reference'
    );

    receipt.scheduleLedger.forEach((entry, index) => {
      const source = schedule[index];
      assertContract(entry.logicalTick === source.tick, 'schedule ledger tick mismatch');
      const expectedOutcome =
        source.kind === 'observation'
          ? observationsBySchedule.get(source.scheduleEntryId)
          : actionsBySchedule.get(source.scheduleEntryId);
      assertContract(expectedOutcome !== undefined, `${source.scheduleEntryId} has no outcome`);
      const outcomeEntry =
        source.kind === 'observation'
          ? receipt.observationLedger.find(
              (candidate) => candidate.payload.scheduleEntryId === source.scheduleEntryId
            )
          : receipt.actionLedger.find(
              (candidate) => candidate.payload.scheduleEntryId === source.scheduleEntryId
            );
      assertContract(
        outcomeEntry !== undefined &&
          canonicalizeHeadlessValue(entry.payload.outcomeHashes) ===
            canonicalizeHeadlessValue([outcomeEntry.entryHash]),
        `${source.scheduleEntryId} outcome hash mismatch`
      );
      assertContract(
        canonicalizeHeadlessValue(entry.payload) ===
          canonicalizeHeadlessValue({
            scheduleEntryId: source.scheduleEntryId,
            order: source.order,
            tick: source.tick,
            phase: source.phase,
            kind: source.kind,
            entrypoint: source.entrypoint,
            source: sourceEntryObject(source),
            outcomeHashes: [outcomeEntry.entryHash],
          }),
        `${source.scheduleEntryId} executed schedule payload mismatch`
      );
    });

    receipt.observationLedger.forEach((entry) => {
      enforceObservationPolicy(entry.payload.observation, receipt.manifest.observationPolicy);
      const scheduleIndex = schedule.findIndex(
        (candidate) => candidate.scheduleEntryId === entry.payload.scheduleEntryId
      );
      const source = schedule[scheduleIndex];
      assertContract(
        source?.kind === 'observation',
        'observation points to non-observation schedule'
      );
      enforceObservationSubjectBinding(
        entry.payload.observation,
        source,
        receipt.manifest.observationPolicy?.subjectBinding,
        `${entry.payload.scheduleEntryId} observation`
      );
      const preSnapshot = receipt.publicStateSnapshots[scheduleIndex];
      const postSnapshot = receipt.publicStateSnapshots[scheduleIndex + 1];
      assertContract(
        entry.logicalTick === source.tick &&
          entry.payload.tick === source.tick &&
          entry.payload.entrypoint === source.entrypoint,
        'observation execution metadata mismatch'
      );
      assertContract(
        canonicalizeHeadlessValue(entry.payload.targetIds) ===
          canonicalizeHeadlessValue(source.targetIds ?? []),
        'observation targets differ from schedule'
      );
      assertContract(
        entry.payload.publicStateHash === preSnapshot.payload.publicStateHash,
        'observation public-state hash mismatch'
      );
      assertContract(
        canonicalizeHeadlessValue(preSnapshot.payload.publicState) ===
          canonicalizeHeadlessValue(postSnapshot.payload.publicState),
        'observation changed public state'
      );
    });

    const authorizationSets = {
      nonce: new Set<string>(),
      turnOpportunityId: new Set<string>(),
      safetyReceiptId: new Set<string>(),
      decisionReceiptId: new Set<string>(),
    };
    const replayAuthorizationIds: string[] = [];
    receipt.actionLedger.forEach((entry, actionIndex) => {
      const payload = entry.payload;
      const scheduleIndex = schedule.findIndex(
        (candidate) => candidate.scheduleEntryId === payload.scheduleEntryId
      );
      const source = schedule[scheduleIndex];
      assertContract(source?.kind === 'action', 'action points to non-action schedule');
      const preSnapshot = receipt.publicStateSnapshots[scheduleIndex];
      const postSnapshot = receipt.publicStateSnapshots[scheduleIndex + 1];
      assertContract(
        entry.logicalTick === source.tick &&
          payload.tick === source.tick &&
          payload.entrypoint === source.entrypoint,
        'action execution metadata mismatch'
      );
      assertContract(
        canonicalizeHeadlessValue(payload.args) === canonicalizeHeadlessValue(source.args ?? {}) &&
          canonicalizeHeadlessValue(payload.targetIds) ===
            canonicalizeHeadlessValue(source.targetIds ?? []),
        'action inputs differ from schedule'
      );
      assertContract(
        payload.preStateSnapshotId === `state-${scheduleIndex}` &&
          payload.postStateSnapshotId === `state-${scheduleIndex + 1}`,
        'action snapshot sequence mismatch'
      );
      assertContract(
        payload.prePublicStateHash === preSnapshot.payload.publicStateHash &&
          payload.postPublicStateHash === postSnapshot.payload.publicStateHash,
        'action state hash does not match snapshot'
      );
      assertContract(
        payload.result.allowed === payload.allowed && payload.result.outcome === payload.outcome,
        'action decision fields differ from result'
      );
      enforceObservationPolicy(payload.result, receipt.manifest.observationPolicy, {
        checkAllowedRootKeys: false,
        label: `${payload.scheduleEntryId} action result`,
      });
      payload.emittedEvents.forEach((event, eventIndex) =>
        enforceObservationPolicy(event, receipt.manifest.observationPolicy, {
          checkAllowedRootKeys: false,
          label: `${payload.scheduleEntryId} emitted event ${eventIndex}`,
        })
      );
      if (source.expect?.allowed !== undefined) {
        assertContract(
          payload.allowed === source.expect.allowed,
          'action allowed result differs from plan'
        );
      }
      if (source.expect?.outcome !== undefined) {
        assertContract(
          payload.outcome === source.expect.outcome,
          'action outcome differs from plan'
        );
      }
      const priorActionRoot =
        actionIndex === 0
          ? ledgerGenesis(
              'action',
              receipt.manifest,
              receipt.sourceBundleHash,
              receipt.manifest.expected.actionCount
            )
          : receipt.actionLedger[actionIndex - 1].entryHash;
      assertContract(
        canonicalizeHeadlessValue(payload.rollbackReference) ===
          canonicalizeHeadlessValue({
            preStateSnapshotId: payload.preStateSnapshotId,
            preStateHash: payload.prePublicStateHash,
            priorActionRoot,
          }),
        'action rollback reference mismatch'
      );
      assertContract(
        payload.allowed || !payload.stateChanged,
        'denied action changed public state'
      );
      assertContract(
        payload.allowed || payload.emittedEvents.length === 0,
        'denied action emitted host-visible events'
      );
      assertContract(
        payload.stateChanged ===
          (canonicalizeHeadlessValue(preSnapshot.payload.publicState) !==
            canonicalizeHeadlessValue(postSnapshot.payload.publicState)),
        'action stateChanged flag mismatch'
      );
      if (source.expect?.stateChanged !== undefined) {
        assertContract(
          payload.stateChanged === source.expect.stateChanged,
          'action state change differs from plan'
        );
      }
      if (source.authorization) {
        const authorization = parseAuthorization(payload.authorization, 'action authorization');
        assertContract(
          canonicalizeHeadlessValue(authorization) ===
            canonicalizeHeadlessValue(source.authorization),
          'action authorization differs from schedule'
        );
        for (const field of Object.keys(authorizationSets) as Array<
          keyof typeof authorizationSets
        >) {
          const value = String(authorization[field]);
          assertContract(
            !authorizationSets[field].has(value),
            `duplicate action authorization ${field}`
          );
          authorizationSets[field].add(value);
          replayAuthorizationIds.push(`${field}:${value}`);
        }
      } else {
        assertContract(payload.authorization === null, 'unexpected action authorization');
      }
    });

    const finalSnapshot = receipt.publicStateSnapshots.at(-1);
    assertContract(finalSnapshot !== undefined, 'missing final public state');
    assertContract(
      canonicalizeHeadlessValue(finalSnapshot.payload.publicState) ===
        canonicalizeHeadlessValue(receipt.manifest.expected.finalPublicState),
      'final public state differs from manifest'
    );
    const finalPublicStateHash = hashHeadlessValue(finalSnapshot.payload.publicState);
    const canonicalFields = {
      canonicalSceneHash: hashHeadlessValue(receipt.scene),
      canonicalPoseHash: hashHeadlessValue(receipt.posePhysics),
      logicalClockHash: hashHeadlessValue(receipt.logicalClock),
      publicStateHash: finalPublicStateHash,
      executedScheduleHash: hashHeadlessValue(receipt.scheduleLedger.map((entry) => entry.payload)),
      residentObservationHash: hashHeadlessValue(
        receipt.observationLedger.map((entry) => entry.payload)
      ),
      actionReceiptRoot: actionRoot,
    };
    assertContract(
      canonicalizeHeadlessValue(receipt.canonicalFields) ===
        canonicalizeHeadlessValue(canonicalFields),
      'canonical fields mismatch'
    );

    const expectedCounts = {
      schedule: receipt.manifest.expected.scheduleCount,
      observations: receipt.manifest.expected.observationCount,
      actions: receipt.manifest.expected.actionCount,
      publicStateSnapshots: receipt.manifest.expected.scheduleCount + 1,
    };
    const actualCounts = {
      schedule: receipt.scheduleLedger.length,
      observations: receipt.observationLedger.length,
      actions: receipt.actionLedger.length,
      publicStateSnapshots: receipt.publicStateSnapshots.length,
    };
    const terminalPreimage = {
      schema: HEADLESS_EXPERIMENT_RECEIPT_SCHEMA,
      hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
      runId: receipt.runId,
      seed: receipt.seed,
      sourceBundleHash: receipt.sourceBundleHash,
      manifestHash: hashHeadlessValue(receipt.manifest),
      finalTick: receipt.manifest.clock.endTick,
      finalPublicStateHash,
      expectedCounts,
      actualCounts,
      publicStateHistoryRoot: publicStateRoot,
      scheduleRoot,
      observationRoot,
      actionRoot,
      canonicalFields,
    };
    const terminalCommitment = hashHeadlessValue(terminalPreimage);
    assertContract(
      canonicalizeHeadlessValue(receipt.terminal) ===
        canonicalizeHeadlessValue({
          finalTick: receipt.manifest.clock.endTick,
          finalPublicStateHash,
          expectedCounts,
          actualCounts,
          publicStateHistoryRoot: publicStateRoot,
          scheduleRoot,
          observationRoot,
          actionRoot,
          terminalCommitment,
        }),
      'terminal commitment mismatch'
    );
    if (options.expectedTerminalCommitment !== undefined) {
      assertContract(
        terminalCommitment === options.expectedTerminalCommitment,
        'terminal commitment differs from external anchor'
      );
    }
    if (options.replayRegistry) {
      assertContract(
        !options.replayRegistry.terminalCommitments.has(terminalCommitment),
        'duplicate full receipt replay'
      );
      for (const authorizationId of replayAuthorizationIds) {
        assertContract(
          !options.replayRegistry.authorizationIds.has(authorizationId),
          `cross-run authorization replay: ${authorizationId}`
        );
      }
      options.replayRegistry.terminalCommitments.add(terminalCommitment);
      replayAuthorizationIds.forEach((authorizationId) =>
        options.replayRegistry!.authorizationIds.add(authorizationId)
      );
    }
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
