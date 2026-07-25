import {
  PHYSICS_DEFAULTS,
  PhysicsWorldImpl,
  type BodyType,
  type CollisionShape,
  type ICollisionEvent,
  type IQuaternion,
  type IRigidBodyState,
  type IVector3,
} from '@holoscript/engine/physics';
import {
  HEADLESS_EXPERIMENT_HASH_ALGORITHM,
  canonicalizeHeadlessValue,
  hashHeadlessValue,
} from '@holoscript/engine/runtime';
import {
  executeHoloWorldProjection,
  verifyHoloWorldProjectionProvenance,
  type HoloWorldProjectionProvenance,
} from './holo-headless-world-projection';

export const HOLO_CPU_PHYSICS_RECEIPT_SCHEMA =
  'holoscript.holo-cpu-physics-execution-receipt.v1' as const;
export const HOLO_CPU_PHYSICS_ENGINE =
  '@holoscript/engine/physics:PhysicsWorldImpl-cpu-fixed-step-v1' as const;
export const HOLOLAND_PHYSICS_OBSERVER_SCHEMA =
  'holoscript.hololand-readonly-physics-observer.v1' as const;
export const HOLO_CPU_PHYSICS_EVIDENCE_SCHEMA =
  'holoscript.cpu-physics-simulation-evidence.v1' as const;

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_RECEIPT_BYTES = 16 * 1024 * 1024;
const MAX_RECEIPT_NODES = 1_000_000;
const MAX_RECEIPT_DEPTH = 96;
const MAX_RUN_SEED_BYTES = 256;
const MAX_BODY_ID_BYTES = 256;
const MAX_RECEIPT_STRING_BYTES = 4 * 1024;
const MAX_RECEIPT_PROPERTY_KEY_BYTES = 256;
const MAX_RECEIPT_ARRAY_LENGTH = 100_000;
const MAX_CONTACT_EVENTS = 20_000;
const MAX_CONTACT_EVENTS_PER_FRAME = 4_096;
const MAX_CONTACT_POINTS_PER_EVENT = 16;
const MAX_FRAME_CANONICAL_BYTES = 12 * 1024 * 1024;

export const HOLO_CPU_PHYSICS_LIMITS = Object.freeze({
  maxBodies: 128,
  maxSteps: 600,
  maxBodyFrameObservations: 24_000,
  maxContactEvents: MAX_CONTACT_EVENTS,
  maxContactEventsPerFrame: MAX_CONTACT_EVENTS_PER_FRAME,
  maxContactPointsPerEvent: MAX_CONTACT_POINTS_PER_EVENT,
  maxBodyIdBytes: MAX_BODY_ID_BYTES,
  maxReceiptStringBytes: MAX_RECEIPT_STRING_BYTES,
  maxReceiptArrayLength: MAX_RECEIPT_ARRAY_LENGTH,
  maxFrameCanonicalBytes: MAX_FRAME_CANONICAL_BYTES,
  maxReceiptBytes: MAX_RECEIPT_BYTES,
} as const);

type PhysicsVector3 = readonly [number, number, number];
type PhysicsQuaternion = readonly [number, number, number, number];
type DeepReadonlyValue<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonlyValue<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonlyValue<T[Key]> }
      : T;

export interface HoloCpuPhysicsExecutionOptions {
  readonly runSeed: string;
  readonly steps: number;
}

export interface HoloCpuPhysicsVerificationOptions {
  readonly expectedSource: string;
  readonly expectedRunSeed: string;
  readonly expectedSteps: number;
}

export interface HoloCpuPhysicsVerificationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly observer?: HoloLandPhysicsObserverProjection;
}

export type HoloCpuPhysicsShape =
  | {
      readonly type: 'box';
      readonly halfExtents: PhysicsVector3;
    }
  | {
      readonly type: 'sphere';
      readonly radius: number;
    };

export interface HoloCpuPhysicsEngineDefaultsSnapshot {
  readonly gravity: PhysicsVector3;
  readonly fixedTimestep: number;
  readonly maxSubsteps: number;
  readonly sleepThreshold: number;
  readonly sleepTime: number;
  readonly defaultFriction: number;
  readonly defaultRestitution: number;
  readonly defaultLinearDamping: number;
  readonly defaultAngularDamping: number;
  readonly maxVelocity: number;
  readonly maxAngularVelocity: number;
  readonly contactBreakingThreshold: number;
  readonly solverIterations: number;
  readonly solverVelocityIterations: number;
}

export interface HoloCpuPhysicsBodyRegistration {
  readonly id: string;
  readonly motionType: BodyType;
  readonly motionTypeSource: 'explicit-static' | 'explicit-kinematic' | 'mass-fallback';
  readonly authoredMassKg: number | null;
  readonly effectiveMassKg: number;
  readonly shape: HoloCpuPhysicsShape;
  readonly material: {
    readonly friction: number;
    readonly restitution: number;
  };
  readonly filter: {
    readonly group: number;
    readonly mask: number;
  };
  readonly damping: {
    readonly linear: number;
    readonly angular: number;
  };
  readonly initialTransform: {
    readonly position: PhysicsVector3;
    readonly rotation: PhysicsQuaternion;
    readonly scale: PhysicsVector3;
  };
}

export interface HoloCpuPhysicsObservedBody {
  readonly id: string;
  readonly motionType: BodyType;
  readonly authoredMassKg: number | null;
  readonly effectiveMassKg: number;
  readonly transform: {
    readonly position: PhysicsVector3;
    readonly rotation: PhysicsQuaternion;
    readonly scale: PhysicsVector3;
  };
  readonly linearVelocity: PhysicsVector3;
  readonly angularVelocity: PhysicsVector3;
  readonly isSleeping: boolean;
  readonly isActive: boolean;
}

export interface HoloCpuPhysicsObservedContactPoint {
  readonly position: PhysicsVector3;
  readonly normal: PhysicsVector3;
  readonly penetration: number;
  readonly impulse: number;
}

export interface HoloCpuPhysicsObservedContact {
  readonly type: 'begin' | 'persist' | 'end';
  readonly bodyA: string;
  readonly bodyB: string;
  readonly contacts: readonly HoloCpuPhysicsObservedContactPoint[];
}

export interface HoloCpuPhysicsObserverFrame {
  readonly step: number;
  readonly simulatedTimeSeconds: number;
  readonly previousFrameHash: string;
  readonly bodies: readonly HoloCpuPhysicsObservedBody[];
  readonly contacts: readonly HoloCpuPhysicsObservedContact[];
  readonly transformStateHash: string;
  readonly contactStateHash: string;
  readonly sleepingStateHash: string;
  readonly frameHash: string;
}

export interface HoloLandPhysicsObserverProjection {
  readonly schema: typeof HOLOLAND_PHYSICS_OBSERVER_SCHEMA;
  readonly target: 'HoloLand';
  readonly authority: 'read-only-observer';
  readonly canonicalMutationAllowed: false;
  readonly units: {
    readonly length: 'meter';
    readonly time: 'second';
    readonly mass: 'kilogram';
    readonly rotation: 'quaternion-xyzw';
  };
  readonly genesisHash: string;
  readonly frames: readonly HoloCpuPhysicsObserverFrame[];
  readonly terminalFrameHash: string;
}

export interface HoloCpuPhysicsExecutionReceipt {
  readonly schema: typeof HOLO_CPU_PHYSICS_RECEIPT_SCHEMA;
  readonly engine: typeof HOLO_CPU_PHYSICS_ENGINE;
  readonly hashAlgorithm: typeof HEADLESS_EXPERIMENT_HASH_ALGORITHM;
  readonly sourceProjection: DeepReadonlyValue<HoloWorldProjectionProvenance>;
  readonly simulation: {
    readonly fixedTimestepSeconds: number;
    readonly steps: number;
    readonly totalSimulatedTimeSeconds: number;
    readonly gravity: PhysicsVector3;
    readonly maxSubsteps: 1;
    readonly solverIterations: number;
    readonly allowSleep: true;
    readonly broadphase: 'aabb';
    readonly runSeed: string;
    readonly runSeedRole: 'receipt-domain-separation-only';
    readonly randomnessUsed: false;
    readonly engineDefaults: HoloCpuPhysicsEngineDefaultsSnapshot;
    readonly engineDefaultsHash: string;
  };
  readonly registration: {
    readonly strategy: 'binary-id-ascending-single-createBody-v1';
    readonly bodyCount: number;
    readonly bodies: readonly HoloCpuPhysicsBodyRegistration[];
    readonly registrationHash: string;
  };
  readonly observer: HoloLandPhysicsObserverProjection;
  readonly evidence: {
    readonly schema: typeof HOLO_CPU_PHYSICS_EVIDENCE_SCHEMA;
    readonly profile: 'simulation-contract-aligned-rigid-body-v1';
    readonly simulationContractClassExecuted: false;
    readonly deterministicScope: 'current-same-engine-runtime-cpu-javascript';
    readonly engineIdentityScope: 'api-profile-and-defaults-not-build-digest';
    readonly geometryMapping: {
      readonly authoredPosePhysicsHash: string;
      readonly registrationHash: string;
      readonly mapping: 'authored-physics-shape-world-transform-full-extents-v1';
      readonly nestedObjectTransformResolution: 'parent-scale-rotation-translation-v1';
      readonly transformOperations: {
        readonly authoredEulerConversions: number;
        readonly nestedObjectCompositions: number;
      };
    };
    readonly physicsPropertyCoverage: {
      readonly admitted: 'motion-mass-box-sphere-material-filter-damping-v1';
      readonly unsupportedAuthoredPropertiesRejected: true;
      readonly cylinderRejectedPendingEngineRepair: true;
    };
    readonly unitConventions: {
      readonly position: 'meter';
      readonly scale: 'meter-full-extents';
      readonly authoredEulerRotation: 'degree-xyz';
      readonly engineRotation: 'quaternion-xyzw';
      readonly mass: 'kilogram';
      readonly time: 'second';
    };
    readonly deterministicStepping: {
      readonly fixedTimestepSeconds: number;
      readonly frameHashChainTerminal: string;
    };
    readonly interactionProvenance: {
      readonly declaredExternalInteractions: 0;
      readonly declaredProviderCalls: 0;
      readonly instrumentationExecuted: false;
    };
    readonly exactReplay: {
      readonly verifier: 'verifyHoloCpuPhysicsReceipt';
      readonly expectedSourceRequired: true;
      readonly expectedRunSeedRequired: true;
      readonly expectedStepsRequired: true;
    };
  };
  readonly claimBoundary: {
    readonly sourceProjectionReexecutedBeforePhysics: true;
    readonly physicsWorldImplCpuExecuted: true;
    readonly fixedTimestepExecuted: true;
    readonly singleBodyRegistrationPath: true;
    readonly transformStateObserved: true;
    readonly contactStateObserved: true;
    readonly sleepingStateObserved: true;
    readonly authoredEulerDegreeConversionSupported: true;
    readonly nestedObjectTransformCompositionSupported: true;
    readonly authoredEulerDegreeConversionExecuted: boolean;
    readonly nestedObjectTransformCompositionExecuted: boolean;
    readonly unrepresentableTransformShearRejected: true;
    readonly collisionFiltersRegistered: true;
    readonly dampingRegistered: true;
    readonly unsupportedPhysicsPropertiesRejected: true;
    readonly engineDefaultsSnapshotted: true;
    readonly engineDefaultsStableDuringExecution: true;
    readonly canonicalExperimentMutated: false;
    readonly frictionMaterialRegistered: true;
    readonly frictionResponseClaimed: false;
    readonly cylinderCollisionClaimed: false;
    readonly simulationContractClassExecuted: false;
    readonly geometryIntegrityVerified: false;
    readonly unitValidationVerified: false;
    readonly interactionProvenanceVerified: false;
    readonly engineBuildDigestBound: false;
    readonly crossMachineBitwiseDeterminismClaimed: false;
    readonly nativeWebGpuPhysicsClaimed: false;
    readonly renderingExecuted: false;
    readonly realisticRenderingClaimed: false;
  };
  readonly result: {
    readonly bodyCount: number;
    readonly frameCount: number;
    readonly contactEventCount: number;
    readonly initialFrameHash: string;
    readonly terminalFrameHash: string;
    readonly trajectoryHash: string;
    readonly sleepingBodyIds: readonly string[];
  };
  readonly receiptCommitment: string;
}

function fail(message: string): never {
  throw new Error(`Holo CPU physics receipt: ${message}`);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function binaryCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) fail(`${label} must be a plain object`);
  return value;
}

function asOptionalRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  return asRecord(value, label);
}

function readOwnDataProperty(record: Record<string, unknown>, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
    fail(`${label}.${key} must be an enumerable data property`);
  }
  return descriptor.value;
}

function assertExactKeys(value: unknown, keys: readonly string[], label: string): void {
  const record = asRecord(value, label);
  const actual = Object.keys(record).sort(binaryCompare);
  const expected = [...keys].sort(binaryCompare);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} keys mismatch`);
  }
}

function normalizeFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function normalizeNonNegativeNumber(value: unknown, label: string): number {
  const normalized = normalizeFiniteNumber(value, label);
  if (normalized < 0) fail(`${label} must be non-negative`);
  return normalized;
}

function normalizeUnitInterval(value: unknown, label: string): number {
  const normalized = normalizeNonNegativeNumber(value, label);
  if (normalized > 1) fail(`${label} must be at most 1`);
  return normalized;
}

function normalizeSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(`${label} must be a safe integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function vectorComponentRecord(value: unknown, axes: readonly string[], label: string): number[] {
  if (Array.isArray(value)) {
    if (value.length !== axes.length) fail(`${label} must have ${axes.length} components`);
    return value.map((component, index) => normalizeFiniteNumber(component, `${label}[${index}]`));
  }
  const record = asRecord(value, label);
  assertExactKeys(record, axes, label);
  return axes.map((axis) => normalizeFiniteNumber(record[axis], `${label}.${axis}`));
}

function toVector3(value: unknown, fallback: PhysicsVector3, label: string): PhysicsVector3 {
  if (value === null || value === undefined) return [...fallback];
  const components = vectorComponentRecord(value, ['x', 'y', 'z'], label);
  return [components[0], components[1], components[2]];
}

function toScale(value: unknown, label: string): PhysicsVector3 {
  const scale = toVector3(value, [1, 1, 1], label);
  if (scale.some((component) => component <= 0)) {
    fail(`${label} components must be greater than zero`);
  }
  return scale;
}

function normalizeQuaternion(value: PhysicsQuaternion, label: string): PhysicsQuaternion {
  const length = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(length) || length === 0) fail(`${label} must have non-zero finite length`);
  return [
    normalizeFiniteNumber(value[0] / length, `${label}.x`),
    normalizeFiniteNumber(value[1] / length, `${label}.y`),
    normalizeFiniteNumber(value[2] / length, `${label}.z`),
    normalizeFiniteNumber(value[3] / length, `${label}.w`),
  ];
}

function eulerXyzDegreesToQuaternion(rotation: PhysicsVector3, label: string): PhysicsQuaternion {
  const degreesToHalfRadians = Math.PI / 360;
  const halfX = rotation[0] * degreesToHalfRadians;
  const halfY = rotation[1] * degreesToHalfRadians;
  const halfZ = rotation[2] * degreesToHalfRadians;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);
  return normalizeQuaternion(
    [
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz,
    ],
    label
  );
}

function toQuaternion(
  quaternionValue: unknown,
  rotationValue: unknown,
  label: string
): PhysicsQuaternion {
  if (quaternionValue !== null && quaternionValue !== undefined) {
    const components = vectorComponentRecord(
      quaternionValue,
      ['x', 'y', 'z', 'w'],
      `${label}.quaternion`
    );
    return normalizeQuaternion(
      [components[0], components[1], components[2], components[3]],
      `${label}.quaternion`
    );
  }
  if (rotationValue !== null && rotationValue !== undefined) {
    return eulerXyzDegreesToQuaternion(
      toVector3(rotationValue, [0, 0, 0], `${label}.rotation`),
      `${label}.rotation`
    );
  }
  return [0, 0, 0, 1];
}

function multiplyQuaternions(
  parent: PhysicsQuaternion,
  local: PhysicsQuaternion,
  label: string
): PhysicsQuaternion {
  const [px, py, pz, pw] = parent;
  const [lx, ly, lz, lw] = local;
  return normalizeQuaternion(
    [
      pw * lx + px * lw + py * lz - pz * ly,
      pw * ly - px * lz + py * lw + pz * lx,
      pw * lz + px * ly - py * lx + pz * lw,
      pw * lw - px * lx - py * ly - pz * lz,
    ],
    label
  );
}

function rotateVectorByQuaternion(
  vector: PhysicsVector3,
  rotation: PhysicsQuaternion,
  label: string
): PhysicsVector3 {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = rotation;
  const uv: PhysicsVector3 = [qy * z - qz * y, qz * x - qx * z, qx * y - qy * x];
  const uuv: PhysicsVector3 = [
    qy * uv[2] - qz * uv[1],
    qz * uv[0] - qx * uv[2],
    qx * uv[1] - qy * uv[0],
  ];
  return [
    normalizeFiniteNumber(x + 2 * (qw * uv[0] + uuv[0]), `${label}.x`),
    normalizeFiniteNumber(y + 2 * (qw * uv[1] + uuv[1]), `${label}.y`),
    normalizeFiniteNumber(z + 2 * (qw * uv[2] + uuv[2]), `${label}.z`),
  ];
}

interface ResolvedWorldTransform {
  readonly position: PhysicsVector3;
  readonly rotation: PhysicsQuaternion;
  readonly scale: PhysicsVector3;
}

interface TransformResolutionStats {
  authoredEulerConversions: number;
  nestedObjectCompositions: number;
}

function composeWorldTransform(
  parent: ResolvedWorldTransform,
  local: ResolvedWorldTransform,
  label: string
): ResolvedWorldTransform {
  const scaleSpread = Math.max(...parent.scale) - Math.min(...parent.scale);
  const localRotationMagnitude = Math.hypot(
    local.rotation[0],
    local.rotation[1],
    local.rotation[2]
  );
  if (scaleSpread > 1e-12 && localRotationMagnitude > 1e-12) {
    fail(
      `${label}.transform may introduce shear and is outside the admitted rigid-body TRS profile`
    );
  }
  const scaledLocalPosition: PhysicsVector3 = [
    local.position[0] * parent.scale[0],
    local.position[1] * parent.scale[1],
    local.position[2] * parent.scale[2],
  ];
  const rotatedLocalPosition = rotateVectorByQuaternion(
    scaledLocalPosition,
    parent.rotation,
    `${label}.position`
  );
  return {
    position: [
      normalizeFiniteNumber(parent.position[0] + rotatedLocalPosition[0], `${label}.position.x`),
      normalizeFiniteNumber(parent.position[1] + rotatedLocalPosition[1], `${label}.position.y`),
      normalizeFiniteNumber(parent.position[2] + rotatedLocalPosition[2], `${label}.position.z`),
    ],
    rotation: multiplyQuaternions(parent.rotation, local.rotation, `${label}.rotation`),
    scale: [
      normalizeFiniteNumber(parent.scale[0] * local.scale[0], `${label}.scale.x`),
      normalizeFiniteNumber(parent.scale[1] * local.scale[1], `${label}.scale.y`),
      normalizeFiniteNumber(parent.scale[2] * local.scale[2], `${label}.scale.z`),
    ],
  };
}

function shapeFromDeclaration(
  geometryValue: unknown,
  scale: PhysicsVector3,
  label: string
): HoloCpuPhysicsShape {
  if (typeof geometryValue !== 'string') {
    fail(`${label}.physics.geometry must name an admitted collision shape`);
  }
  const geometry = geometryValue.toLowerCase();
  if (geometry === 'box' || geometry === 'cube') {
    return {
      type: 'box',
      halfExtents: [scale[0] / 2, scale[1] / 2, scale[2] / 2],
    };
  }
  if (geometry === 'sphere') {
    return {
      type: 'sphere',
      radius: Math.max(scale[0], scale[1], scale[2]) / 2,
    };
  }
  if (geometry === 'cylinder') {
    fail(
      `${label}.physics.geometry "cylinder" requires an explicit box or sphere collision proxy until the engine cylinder broadphase is repaired`
    );
  }
  fail(`${label}.physics.geometry ${JSON.stringify(geometry)} is not admitted`);
}

function motionTypeFromDeclaration(
  staticValue: unknown,
  kinematicValue: unknown,
  massValue: unknown,
  label: string
): {
  motionType: BodyType;
  motionTypeSource: HoloCpuPhysicsBodyRegistration['motionTypeSource'];
  authoredMassKg: number | null;
  effectiveMassKg: number;
} {
  if (typeof staticValue !== 'boolean') fail(`${label}.physics.static must be boolean`);
  if (typeof kinematicValue !== 'boolean') fail(`${label}.physics.kinematic must be boolean`);
  if (staticValue && kinematicValue) {
    fail(`${label}.physics cannot be both explicitly static and kinematic`);
  }
  const authoredMass =
    massValue === null || massValue === undefined
      ? null
      : normalizeNonNegativeNumber(massValue, `${label}.physics.massKg`);
  if (staticValue) {
    return {
      motionType: 'static',
      motionTypeSource: 'explicit-static',
      authoredMassKg: authoredMass,
      effectiveMassKg: 0,
    };
  }
  if (kinematicValue) {
    return {
      motionType: 'kinematic',
      motionTypeSource: 'explicit-kinematic',
      authoredMassKg: authoredMass,
      effectiveMassKg: 0,
    };
  }
  if (authoredMass === 0) {
    return {
      motionType: 'static',
      motionTypeSource: 'mass-fallback',
      authoredMassKg: authoredMass,
      effectiveMassKg: 0,
    };
  }
  return {
    motionType: 'dynamic',
    motionTypeSource: 'mass-fallback',
    authoredMassKg: authoredMass,
    effectiveMassKg: authoredMass ?? 1,
  };
}

function materialFromDeclaration(
  physics: Record<string, unknown>,
  engineDefaults: HoloCpuPhysicsEngineDefaultsSnapshot,
  label: string
): { friction: number; restitution: number } {
  const friction =
    physics.friction === null || physics.friction === undefined
      ? engineDefaults.defaultFriction
      : normalizeNonNegativeNumber(physics.friction, `${label}.physics.friction`);
  const restitution =
    physics.restitution === null || physics.restitution === undefined
      ? engineDefaults.defaultRestitution
      : normalizeNonNegativeNumber(physics.restitution, `${label}.physics.restitution`);
  if (restitution > 1) fail(`${label}.physics.restitution must be at most 1`);
  return { friction, restitution };
}

function snapshotPhysicsDefaults(): HoloCpuPhysicsEngineDefaultsSnapshot {
  const defaults = asRecord(PHYSICS_DEFAULTS, 'PhysicsWorldImpl defaults');
  const numberValue = (key: string) =>
    normalizeNonNegativeNumber(
      readOwnDataProperty(defaults, key, 'PhysicsWorldImpl defaults'),
      `PhysicsWorldImpl defaults.${key}`
    );
  const integerValue = (key: string) =>
    normalizeSafeInteger(
      readOwnDataProperty(defaults, key, 'PhysicsWorldImpl defaults'),
      1,
      Number.MAX_SAFE_INTEGER,
      `PhysicsWorldImpl defaults.${key}`
    );
  const snapshot: HoloCpuPhysicsEngineDefaultsSnapshot = {
    gravity: toVector3(
      readOwnDataProperty(defaults, 'gravity', 'PhysicsWorldImpl defaults'),
      [0, -9.81, 0],
      'PhysicsWorldImpl defaults.gravity'
    ),
    fixedTimestep: numberValue('fixedTimestep'),
    maxSubsteps: integerValue('maxSubsteps'),
    sleepThreshold: numberValue('sleepThreshold'),
    sleepTime: numberValue('sleepTime'),
    defaultFriction: numberValue('defaultFriction'),
    defaultRestitution: normalizeUnitInterval(
      readOwnDataProperty(defaults, 'defaultRestitution', 'PhysicsWorldImpl defaults'),
      'PhysicsWorldImpl defaults.defaultRestitution'
    ),
    defaultLinearDamping: normalizeUnitInterval(
      readOwnDataProperty(defaults, 'defaultLinearDamping', 'PhysicsWorldImpl defaults'),
      'PhysicsWorldImpl defaults.defaultLinearDamping'
    ),
    defaultAngularDamping: normalizeUnitInterval(
      readOwnDataProperty(defaults, 'defaultAngularDamping', 'PhysicsWorldImpl defaults'),
      'PhysicsWorldImpl defaults.defaultAngularDamping'
    ),
    maxVelocity: numberValue('maxVelocity'),
    maxAngularVelocity: numberValue('maxAngularVelocity'),
    contactBreakingThreshold: numberValue('contactBreakingThreshold'),
    solverIterations: integerValue('solverIterations'),
    solverVelocityIterations: integerValue('solverVelocityIterations'),
  };
  return snapshot;
}

function assertPhysicsDefaultsUnchanged(
  expected: HoloCpuPhysicsEngineDefaultsSnapshot,
  label: string
): void {
  if (
    canonicalizeHeadlessValue(snapshotPhysicsDefaults()) !== canonicalizeHeadlessValue(expected)
  ) {
    fail(`PhysicsWorldImpl defaults changed ${label}`);
  }
}

const ADMITTED_PHYSICS_CONFIG_KEYS = new Set([
  'angular_damping',
  'collidable',
  'collision_group',
  'collision_mask',
  'friction',
  'geometry',
  'kinematic',
  'linear_damping',
  'mass',
  'mass_kg',
  'massKg',
  'restitution',
  'shape',
  'static',
]);

const REJECTED_PHYSICS_PROPERTY_KEYS = ['gravity', 'sleep_threshold'] as const;

function optionalOwnDataProperty(
  record: Record<string, unknown>,
  key: string,
  label: string
): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return readOwnDataProperty(record, key, label);
}

function firstDeclaredValue(
  candidates: readonly {
    readonly record: Record<string, unknown>;
    readonly keys: readonly string[];
    readonly label: string;
  }[]
): unknown {
  for (const candidate of candidates) {
    for (const key of candidate.keys) {
      const value = optionalOwnDataProperty(candidate.record, key, candidate.label);
      if (value !== undefined && value !== null) return value;
    }
  }
  return undefined;
}

function assertPhysicsConfigCoverage(
  config: Record<string, unknown>,
  properties: Record<string, unknown>,
  label: string
): void {
  for (const key of Object.keys(config)) {
    if (!ADMITTED_PHYSICS_CONFIG_KEYS.has(key)) {
      fail(`${label}.physics property ${JSON.stringify(key)} is not supported by this executor`);
    }
  }
  for (const key of REJECTED_PHYSICS_PROPERTY_KEYS) {
    if (
      optionalOwnDataProperty(config, key, `${label}.physics`) !== undefined ||
      optionalOwnDataProperty(properties, key, `${label}.properties`) !== undefined
    ) {
      fail(`${label}.physics property ${JSON.stringify(key)} is not supported by this executor`);
    }
  }
}

function explicitBooleanDeclaration(
  config: Record<string, unknown>,
  properties: Record<string, unknown>,
  key: string,
  label: string
): boolean {
  const value = firstDeclaredValue([
    { record: config, keys: [key], label: `${label}.physics` },
    { record: properties, keys: [key], label: `${label}.properties` },
  ]);
  if (value === undefined) return false;
  if (typeof value !== 'boolean') fail(`${label}.${key} must be boolean`);
  return value;
}

function filterFromDeclaration(
  config: Record<string, unknown>,
  properties: Record<string, unknown>,
  label: string
): HoloCpuPhysicsBodyRegistration['filter'] {
  const groupValue = firstDeclaredValue([
    { record: config, keys: ['collision_group'], label: `${label}.physics` },
    { record: properties, keys: ['collision_group'], label: `${label}.properties` },
  ]);
  const maskValue = firstDeclaredValue([
    { record: config, keys: ['collision_mask'], label: `${label}.physics` },
    { record: properties, keys: ['collision_mask'], label: `${label}.properties` },
  ]);
  return {
    group:
      groupValue === undefined
        ? 1
        : normalizeSafeInteger(groupValue, 0, 0xffffffff, `${label}.collision_group`),
    mask:
      maskValue === undefined
        ? 0xffff
        : normalizeSafeInteger(maskValue, -1, 0xffffffff, `${label}.collision_mask`),
  };
}

function dampingFromDeclaration(
  config: Record<string, unknown>,
  properties: Record<string, unknown>,
  engineDefaults: HoloCpuPhysicsEngineDefaultsSnapshot,
  label: string
): HoloCpuPhysicsBodyRegistration['damping'] {
  const linearValue = firstDeclaredValue([
    { record: config, keys: ['linear_damping'], label: `${label}.physics` },
    { record: properties, keys: ['linear_damping'], label: `${label}.properties` },
  ]);
  const angularValue = firstDeclaredValue([
    { record: config, keys: ['angular_damping'], label: `${label}.physics` },
    { record: properties, keys: ['angular_damping'], label: `${label}.properties` },
  ]);
  return {
    linear:
      linearValue === undefined
        ? engineDefaults.defaultLinearDamping
        : normalizeUnitInterval(linearValue, `${label}.linear_damping`),
    angular:
      angularValue === undefined
        ? engineDefaults.defaultAngularDamping
        : normalizeUnitInterval(angularValue, `${label}.angular_damping`),
  };
}

function buildRegistrationManifest(
  sceneReceipt: unknown,
  posePhysics: unknown,
  engineDefaults: HoloCpuPhysicsEngineDefaultsSnapshot
): {
  readonly bodies: HoloCpuPhysicsBodyRegistration[];
  readonly transformOperations: Readonly<TransformResolutionStats>;
} {
  const scene = asRecord(sceneReceipt, 'scene projection');
  const pose = asRecord(posePhysics, 'pose/physics projection');
  if (!Array.isArray(scene.objects)) fail('scene projection objects must be an array');
  if (!Array.isArray(pose.bodies)) fail('pose/physics projection bodies must be an array');
  if (scene.objects.length !== pose.bodies.length) {
    fail('scene and pose/physics projection object counts differ');
  }

  const sceneBodies = new Map<string, Record<string, unknown>>();
  const poseBodies = new Map<string, Record<string, unknown>>();
  for (const sceneValue of scene.objects) {
    const body = asRecord(sceneValue, 'scene object');
    const id = body.id;
    if (typeof id !== 'string' || id.length === 0) fail('scene object id must be non-empty');
    if (byteLength(id) > MAX_BODY_ID_BYTES) {
      fail(`scene object id exceeds ${MAX_BODY_ID_BYTES} bytes`);
    }
    if (id.includes('|')) fail(`physics body id ${JSON.stringify(id)} contains reserved "|"`);
    if (sceneBodies.has(id)) fail(`duplicate scene object id ${id}`);
    sceneBodies.set(id, body);
  }
  for (const poseValue of pose.bodies) {
    const body = asRecord(poseValue, 'pose/physics body');
    const id = body.id;
    if (typeof id !== 'string' || !sceneBodies.has(id)) {
      fail('pose/physics body must match a scene object id');
    }
    if (poseBodies.has(id)) fail(`duplicate pose/physics body id ${id}`);
    poseBodies.set(id, body);
  }

  const resolvedTransforms = new Map<string, ResolvedWorldTransform>();
  const resolvingTransforms = new Set<string>();
  const transformOperations: TransformResolutionStats = {
    authoredEulerConversions: 0,
    nestedObjectCompositions: 0,
  };
  const resolveTransform = (id: string): ResolvedWorldTransform => {
    const cached = resolvedTransforms.get(id);
    if (cached) return cached;
    if (resolvingTransforms.has(id)) fail(`object transform hierarchy contains a cycle at ${id}`);
    const body = poseBodies.get(id);
    if (!body) fail(`pose/physics body ${id} is missing`);
    resolvingTransforms.add(id);
    const transform = asRecord(body.transform, `${id}.transform`);
    if (
      (transform.quaternion === null || transform.quaternion === undefined) &&
      transform.rotation !== null &&
      transform.rotation !== undefined
    ) {
      transformOperations.authoredEulerConversions += 1;
    }
    const local: ResolvedWorldTransform = {
      position: toVector3(transform.position, [0, 0, 0], `${id}.transform.position`),
      scale: toScale(transform.scale, `${id}.transform.scale`),
      rotation: toQuaternion(transform.quaternion, transform.rotation, `${id}.transform`),
    };
    const parentId = body.parentId;
    let resolved = local;
    if (parentId !== null && parentId !== undefined) {
      if (typeof parentId !== 'string' || !poseBodies.has(parentId)) {
        fail(`${id}.parentId must reference another projected object`);
      }
      transformOperations.nestedObjectCompositions += 1;
      resolved = composeWorldTransform(resolveTransform(parentId), local, id);
    }
    resolvingTransforms.delete(id);
    resolvedTransforms.set(id, resolved);
    return resolved;
  };

  const registrations: HoloCpuPhysicsBodyRegistration[] = [];
  for (const [id, body] of poseBodies) {
    const physics = asRecord(body.physics, `${id}.physics`);
    if (physics.collidable !== true) continue;
    const sceneBody = sceneBodies.get(id)!;
    const properties = asRecord(sceneBody.properties, `${id}.properties`);
    const traitConfigs = asRecord(sceneBody.traitConfigs, `${id}.traitConfigs`);
    const propertyPhysics = asOptionalRecord(properties.physics, `${id}.properties.physics`);
    const traitPhysics = asOptionalRecord(traitConfigs.physics, `${id}.traitConfigs.physics`);
    const physicsConfig = { ...propertyPhysics, ...traitPhysics };
    assertPhysicsConfigCoverage(physicsConfig, properties, id);
    const traits = sceneBody.traits;
    if (!Array.isArray(traits) || traits.some((trait) => typeof trait !== 'string')) {
      fail(`${id}.traits must be a string array`);
    }
    const explicitStatic =
      traits.includes('static') ||
      explicitBooleanDeclaration(physicsConfig, properties, 'static', id);
    const explicitKinematic =
      traits.includes('kinematic') ||
      explicitBooleanDeclaration(physicsConfig, properties, 'kinematic', id);
    const motion = motionTypeFromDeclaration(explicitStatic, explicitKinematic, physics.massKg, id);
    const worldTransform = resolveTransform(id);
    registrations.push({
      id,
      motionType: motion.motionType,
      motionTypeSource: motion.motionTypeSource,
      authoredMassKg: motion.authoredMassKg,
      effectiveMassKg: motion.effectiveMassKg,
      shape: shapeFromDeclaration(physics.geometry, worldTransform.scale, id),
      material: materialFromDeclaration(physics, engineDefaults, id),
      filter: filterFromDeclaration(physicsConfig, properties, id),
      damping: dampingFromDeclaration(physicsConfig, properties, engineDefaults, id),
      initialTransform: worldTransform,
    });
  }

  registrations.sort((left, right) => binaryCompare(left.id, right.id));
  if (registrations.length === 0) fail('no collidable physics bodies were admitted');
  if (registrations.length > HOLO_CPU_PHYSICS_LIMITS.maxBodies) {
    fail(`body count exceeds ${HOLO_CPU_PHYSICS_LIMITS.maxBodies}`);
  }
  return {
    bodies: registrations,
    transformOperations: Object.freeze({ ...transformOperations }),
  };
}

function engineShape(registration: HoloCpuPhysicsBodyRegistration): CollisionShape {
  if (registration.shape.type === 'box') {
    return {
      type: 'box',
      halfExtents: [...registration.shape.halfExtents],
    };
  }
  if (registration.shape.type === 'sphere') {
    return {
      type: 'sphere',
      radius: registration.shape.radius,
    };
  }
  fail(`unsupported collision shape for ${registration.id}`);
}

function normalizeStateVector(value: IVector3, label: string): PhysicsVector3 {
  return [
    normalizeFiniteNumber(value[0], `${label}[0]`),
    normalizeFiniteNumber(value[1], `${label}[1]`),
    normalizeFiniteNumber(value[2], `${label}[2]`),
  ];
}

function normalizeStateQuaternion(value: IQuaternion, label: string): PhysicsQuaternion {
  return [
    normalizeFiniteNumber(value[0], `${label}[0]`),
    normalizeFiniteNumber(value[1], `${label}[1]`),
    normalizeFiniteNumber(value[2], `${label}[2]`),
    normalizeFiniteNumber(value[3], `${label}[3]`),
  ];
}

function observedBody(
  state: IRigidBodyState,
  registration: HoloCpuPhysicsBodyRegistration
): HoloCpuPhysicsObservedBody {
  if (state.id !== registration.id) fail(`body state id mismatch for ${registration.id}`);
  if (typeof state.isSleeping !== 'boolean' || typeof state.isActive !== 'boolean') {
    fail(`body state flags are invalid for ${registration.id}`);
  }
  return {
    id: registration.id,
    motionType: registration.motionType,
    authoredMassKg: registration.authoredMassKg,
    effectiveMassKg: registration.effectiveMassKg,
    transform: {
      position: normalizeStateVector(state.position, `${registration.id}.position`),
      rotation: normalizeStateQuaternion(state.rotation, `${registration.id}.rotation`),
      scale: [...registration.initialTransform.scale],
    },
    linearVelocity: normalizeStateVector(state.linearVelocity, `${registration.id}.linearVelocity`),
    angularVelocity: normalizeStateVector(
      state.angularVelocity,
      `${registration.id}.angularVelocity`
    ),
    isSleeping: state.isSleeping,
    isActive: state.isActive,
  };
}

function observedContact(event: ICollisionEvent): HoloCpuPhysicsObservedContact {
  if (
    (event.type !== 'begin' && event.type !== 'persist' && event.type !== 'end') ||
    typeof event.bodyA !== 'string' ||
    typeof event.bodyB !== 'string' ||
    !Array.isArray(event.contacts)
  ) {
    fail('PhysicsWorldImpl returned an invalid contact event');
  }
  if (event.contacts.length > MAX_CONTACT_POINTS_PER_EVENT) {
    fail(`contact point count exceeds ${MAX_CONTACT_POINTS_PER_EVENT}`);
  }
  const contacts = event.contacts.map((contact, index) => ({
    position: normalizeStateVector(
      contact.position,
      `${event.bodyA}|${event.bodyB}.contacts[${index}].position`
    ),
    normal: normalizeStateVector(
      contact.normal,
      `${event.bodyA}|${event.bodyB}.contacts[${index}].normal`
    ),
    penetration: normalizeFiniteNumber(
      contact.penetration,
      `${event.bodyA}|${event.bodyB}.contacts[${index}].penetration`
    ),
    impulse: normalizeFiniteNumber(
      contact.impulse,
      `${event.bodyA}|${event.bodyB}.contacts[${index}].impulse`
    ),
  }));
  contacts.sort((left, right) =>
    binaryCompare(canonicalizeHeadlessValue(left), canonicalizeHeadlessValue(right))
  );
  return {
    type: event.type,
    bodyA: event.bodyA,
    bodyB: event.bodyB,
    contacts,
  };
}

function captureFrame(
  world: PhysicsWorldImpl,
  registrations: readonly HoloCpuPhysicsBodyRegistration[],
  contactEvents: readonly ICollisionEvent[],
  step: number,
  previousFrameHash: string
): HoloCpuPhysicsObserverFrame {
  const states = new Map(world.getAllBodies().map((state) => [state.id, state]));
  const bodies = registrations.map((registration) => {
    const state = states.get(registration.id);
    if (!state) fail(`PhysicsWorldImpl omitted body ${registration.id}`);
    return observedBody(state, registration);
  });
  if (states.size !== registrations.length) {
    fail('PhysicsWorldImpl body count differs from the registration manifest');
  }

  // getContacts() exposes the engine's mutable event buffer. Clone and
  // canonicalize it before the next step clears or replaces that buffer.
  const contacts = contactEvents.map(observedContact);
  contacts.sort((left, right) =>
    binaryCompare(canonicalizeHeadlessValue(left), canonicalizeHeadlessValue(right))
  );
  const framePreimage = {
    step,
    simulatedTimeSeconds: normalizeFiniteNumber(
      step * FIXED_TIMESTEP_SECONDS,
      `frame ${step} simulated time`
    ),
    previousFrameHash,
    bodies,
    contacts,
    transformStateHash: hashHeadlessValue(
      bodies.map((body) => ({
        id: body.id,
        transform: body.transform,
        linearVelocity: body.linearVelocity,
        angularVelocity: body.angularVelocity,
      }))
    ),
    contactStateHash: hashHeadlessValue(contacts),
    sleepingStateHash: hashHeadlessValue(
      bodies.map((body) => ({
        id: body.id,
        isSleeping: body.isSleeping,
        isActive: body.isActive,
      }))
    ),
  };
  return {
    ...framePreimage,
    frameHash: hashHeadlessValue(framePreimage),
  };
}

function receiptPreimage(
  receipt: HoloCpuPhysicsExecutionReceipt
): Omit<HoloCpuPhysicsExecutionReceipt, 'receiptCommitment'> {
  const { receiptCommitment: _receiptCommitment, ...preimage } = receipt;
  return preimage;
}

function assertSha256(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertExecutionOptionValues(runSeed: unknown, steps: unknown): asserts steps is number {
  if (typeof runSeed !== 'string') {
    fail('runSeed must be a string');
  }
  if (byteLength(runSeed) > MAX_RUN_SEED_BYTES) {
    fail(`runSeed exceeds ${MAX_RUN_SEED_BYTES} bytes`);
  }
  if (
    !Number.isSafeInteger(steps) ||
    (steps as number) < 1 ||
    (steps as number) > HOLO_CPU_PHYSICS_LIMITS.maxSteps
  ) {
    fail(`steps must be a safe integer from 1 to ${HOLO_CPU_PHYSICS_LIMITS.maxSteps}`);
  }
}

function snapshotExecutionOptions(options: unknown): HoloCpuPhysicsExecutionOptions {
  assertExactKeys(options, ['runSeed', 'steps'], 'execution options');
  const record = asRecord(options, 'execution options');
  const runSeed = readOwnDataProperty(record, 'runSeed', 'execution options');
  const steps = readOwnDataProperty(record, 'steps', 'execution options');
  assertExecutionOptionValues(runSeed, steps);
  return Object.freeze({ runSeed: runSeed as string, steps });
}

function snapshotVerificationOptions(options: unknown): HoloCpuPhysicsVerificationOptions {
  assertExactKeys(
    options,
    ['expectedSource', 'expectedRunSeed', 'expectedSteps'],
    'verification options'
  );
  const record = asRecord(options, 'verification options');
  const expectedSource = readOwnDataProperty(record, 'expectedSource', 'verification options');
  const expectedRunSeed = readOwnDataProperty(record, 'expectedRunSeed', 'verification options');
  const expectedSteps = readOwnDataProperty(record, 'expectedSteps', 'verification options');
  if (typeof expectedSource !== 'string') fail('expectedSource must be a string');
  assertExecutionOptionValues(expectedRunSeed, expectedSteps);
  return Object.freeze({
    expectedSource,
    expectedRunSeed: expectedRunSeed as string,
    expectedSteps,
  });
}

function assertBoundedStrictReceipt(value: unknown): string {
  const stack: Array<{ value: unknown; depth: number; path: string }> = [
    { value, depth: 0, path: '$' },
  ];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let canonicalByteBudget = 0;
  const accountCanonicalBytes = (count: number) => {
    canonicalByteBudget += count;
    if (canonicalByteBudget > MAX_RECEIPT_BYTES) {
      fail(`receipt exceeds ${MAX_RECEIPT_BYTES} pre-canonical bytes`);
    }
  };

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > MAX_RECEIPT_NODES) fail(`receipt exceeds ${MAX_RECEIPT_NODES} value nodes`);
    if (current.depth > MAX_RECEIPT_DEPTH) {
      fail(`receipt exceeds depth ${MAX_RECEIPT_DEPTH}`);
    }
    const candidate = current.value;
    if (candidate === null) {
      accountCanonicalBytes(4);
      continue;
    }
    if (typeof candidate === 'string') {
      if (byteLength(candidate) > MAX_RECEIPT_STRING_BYTES) {
        fail(`${current.path} exceeds ${MAX_RECEIPT_STRING_BYTES} string bytes`);
      }
      accountCanonicalBytes(byteLength(JSON.stringify(candidate)));
      continue;
    }
    if (typeof candidate === 'boolean') {
      accountCanonicalBytes(candidate ? 4 : 5);
      continue;
    }
    if (typeof candidate === 'number') {
      normalizeFiniteNumber(candidate, current.path);
      if (Object.is(candidate, -0)) fail(`${current.path} contains negative zero`);
      accountCanonicalBytes(byteLength(JSON.stringify(candidate)));
      continue;
    }
    if (!candidate || typeof candidate !== 'object') {
      fail(`${current.path} contains unsupported ${typeof candidate}`);
    }
    if (seen.has(candidate)) fail(`${current.path} contains a cycle`);
    seen.add(candidate);
    if (!Array.isArray(candidate) && !isPlainRecord(candidate)) {
      fail(`${current.path} contains a non-plain object`);
    }

    const ownKeys = Reflect.ownKeys(candidate);
    if (nodes + stack.length + ownKeys.length > MAX_RECEIPT_NODES) {
      fail(`receipt exceeds ${MAX_RECEIPT_NODES} value nodes`);
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > MAX_RECEIPT_ARRAY_LENGTH) {
        fail(`${current.path} array length exceeds ${MAX_RECEIPT_ARRAY_LENGTH}`);
      }
      const indexKeys = ownKeys.filter((key) => key !== 'length');
      if (
        indexKeys.length !== candidate.length ||
        indexKeys.some((key) => typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key))
      ) {
        fail(`${current.path} must be a dense standard array`);
      }
      accountCanonicalBytes(2 + Math.max(0, candidate.length - 1));
      for (let index = 0; index < candidate.length; index += 1) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          fail(`${current.path}[${index}] must be an enumerable data property`);
        }
        if (descriptor.value === undefined) fail(`${current.path}[${index}] is undefined`);
        stack.push({
          value: descriptor.value,
          depth: current.depth + 1,
          path: `${current.path}[${index}]`,
        });
      }
      continue;
    }

    accountCanonicalBytes(2 + Math.max(0, ownKeys.length - 1));
    for (const key of ownKeys) {
      if (typeof key !== 'string') fail(`${current.path} contains a symbol key`);
      if (byteLength(key) > MAX_RECEIPT_PROPERTY_KEY_BYTES) {
        fail(
          `${current.path} contains a property key over ${MAX_RECEIPT_PROPERTY_KEY_BYTES} bytes`
        );
      }
      accountCanonicalBytes(byteLength(JSON.stringify(key)) + 1);
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        fail(`${current.path}.${key} must be an enumerable data property`);
      }
      if (descriptor.value === undefined) fail(`${current.path}.${key} is undefined`);
      stack.push({
        value: descriptor.value,
        depth: current.depth + 1,
        path: `${current.path}.${key}`,
      });
    }
  }

  const canonical = canonicalizeHeadlessValue(value);
  if (byteLength(canonical) > MAX_RECEIPT_BYTES) {
    fail(`receipt exceeds ${MAX_RECEIPT_BYTES} bytes`);
  }
  return canonical;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

export function executeHoloCpuPhysicsReceipt(
  source: string,
  options: HoloCpuPhysicsExecutionOptions
): HoloCpuPhysicsExecutionReceipt {
  const executionOptions = snapshotExecutionOptions(options);
  const engineDefaults = snapshotPhysicsDefaults();
  const worldProjection = executeHoloWorldProjection(source);
  const projectionVerdict = verifyHoloWorldProjectionProvenance(worldProjection.provenance, {
    expectedSource: source,
    expectedScene: worldProjection.scene,
    expectedPosePhysics: worldProjection.posePhysics,
  });
  if (!projectionVerdict.valid) {
    fail(`source projection verification failed: ${projectionVerdict.errors.join('; ')}`);
  }
  const projectionBeforePhysics = canonicalizeHeadlessValue(worldProjection);
  const registrationBuild = buildRegistrationManifest(
    worldProjection.scene,
    worldProjection.posePhysics,
    engineDefaults
  );
  const registrations = registrationBuild.bodies;
  if (
    (executionOptions.steps + 1) * registrations.length >
    HOLO_CPU_PHYSICS_LIMITS.maxBodyFrameObservations
  ) {
    fail(`body-frame observations exceed ${HOLO_CPU_PHYSICS_LIMITS.maxBodyFrameObservations}`);
  }

  const registrationPreimage = {
    strategy: 'binary-id-ascending-single-createBody-v1' as const,
    bodyCount: registrations.length,
    bodies: registrations,
  };
  const registration = {
    ...registrationPreimage,
    registrationHash: hashHeadlessValue(registrationPreimage),
  };
  const simulation = {
    fixedTimestepSeconds: FIXED_TIMESTEP_SECONDS,
    steps: executionOptions.steps,
    totalSimulatedTimeSeconds: normalizeFiniteNumber(
      executionOptions.steps * FIXED_TIMESTEP_SECONDS,
      'total simulated time'
    ),
    gravity: [...engineDefaults.gravity] as PhysicsVector3,
    maxSubsteps: 1 as const,
    solverIterations: engineDefaults.solverIterations,
    allowSleep: true as const,
    broadphase: 'aabb' as const,
    runSeed: executionOptions.runSeed,
    runSeedRole: 'receipt-domain-separation-only' as const,
    randomnessUsed: false as const,
    engineDefaults,
    engineDefaultsHash: hashHeadlessValue(engineDefaults),
  };
  const genesisHash = hashHeadlessValue({
    schema: 'holoscript.holo-cpu-physics-frame-genesis.v1',
    sourceProjectionCommitment: worldProjection.provenance.provenanceCommitment,
    registrationHash: registration.registrationHash,
    simulation,
  });
  const world = new PhysicsWorldImpl({
    gravity: [...simulation.gravity],
    fixedTimestep: simulation.fixedTimestepSeconds,
    maxSubsteps: simulation.maxSubsteps,
    solverIterations: simulation.solverIterations,
    allowSleep: simulation.allowSleep,
    broadphase: simulation.broadphase,
  });

  const frames: HoloCpuPhysicsObserverFrame[] = [];
  let contactEventCount = 0;
  let frameCanonicalBytes = 0;
  const appendFrame = (step: number, previousFrameHash: string): HoloCpuPhysicsObserverFrame => {
    const contactEvents = world.getContacts();
    if (contactEvents.length > MAX_CONTACT_EVENTS_PER_FRAME) {
      fail(`contact events in frame ${step} exceed ${MAX_CONTACT_EVENTS_PER_FRAME}`);
    }
    if (contactEventCount + contactEvents.length > MAX_CONTACT_EVENTS) {
      fail(`contact events exceed ${MAX_CONTACT_EVENTS}`);
    }
    const frame = captureFrame(world, registrations, contactEvents, step, previousFrameHash);
    const encodedFrameBytes = byteLength(canonicalizeHeadlessValue(frame));
    if (frameCanonicalBytes + encodedFrameBytes > MAX_FRAME_CANONICAL_BYTES) {
      fail(`frame data exceeds ${MAX_FRAME_CANONICAL_BYTES} canonical bytes`);
    }
    frameCanonicalBytes += encodedFrameBytes;
    contactEventCount += contactEvents.length;
    frames.push(frame);
    return frame;
  };
  try {
    for (const body of registrations) {
      assertPhysicsDefaultsUnchanged(engineDefaults, `before registering ${body.id}`);
      world.createBody({
        id: body.id,
        type: body.motionType,
        mass: body.effectiveMassKg,
        shape: engineShape(body),
        transform: {
          position: [...body.initialTransform.position],
          rotation: [...body.initialTransform.rotation],
          scale: [...body.initialTransform.scale],
        },
        material: { ...body.material },
        filter: { ...body.filter },
        linearDamping: body.damping.linear,
        angularDamping: body.damping.angular,
      });
    }
    assertPhysicsDefaultsUnchanged(engineDefaults, 'after body registration');

    appendFrame(0, genesisHash);
    for (let step = 1; step <= executionOptions.steps; step += 1) {
      assertPhysicsDefaultsUnchanged(engineDefaults, `before step ${step}`);
      world.step(FIXED_TIMESTEP_SECONDS);
      assertPhysicsDefaultsUnchanged(engineDefaults, `after step ${step}`);
      appendFrame(step, frames[frames.length - 1].frameHash);
    }
  } finally {
    world.dispose();
  }
  assertPhysicsDefaultsUnchanged(engineDefaults, 'during execution');

  if (canonicalizeHeadlessValue(worldProjection) !== projectionBeforePhysics) {
    fail('physics observer mutated the verified source projection');
  }
  const terminalFrame = frames[frames.length - 1];
  const observer: HoloLandPhysicsObserverProjection = {
    schema: HOLOLAND_PHYSICS_OBSERVER_SCHEMA,
    target: 'HoloLand',
    authority: 'read-only-observer',
    canonicalMutationAllowed: false,
    units: {
      length: 'meter',
      time: 'second',
      mass: 'kilogram',
      rotation: 'quaternion-xyzw',
    },
    genesisHash,
    frames,
    terminalFrameHash: terminalFrame.frameHash,
  };
  const trajectoryHash = hashHeadlessValue(frames);
  const sleepingBodyIds = terminalFrame.bodies
    .filter((body) => body.isSleeping)
    .map((body) => body.id)
    .sort(binaryCompare);
  const preimage: Omit<HoloCpuPhysicsExecutionReceipt, 'receiptCommitment'> = {
    schema: HOLO_CPU_PHYSICS_RECEIPT_SCHEMA,
    engine: HOLO_CPU_PHYSICS_ENGINE,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    sourceProjection: worldProjection.provenance,
    simulation,
    registration,
    observer,
    evidence: {
      schema: HOLO_CPU_PHYSICS_EVIDENCE_SCHEMA,
      profile: 'simulation-contract-aligned-rigid-body-v1',
      simulationContractClassExecuted: false,
      deterministicScope: 'current-same-engine-runtime-cpu-javascript',
      engineIdentityScope: 'api-profile-and-defaults-not-build-digest',
      geometryMapping: {
        authoredPosePhysicsHash: worldProjection.provenance.result.posePhysicsHash,
        registrationHash: registration.registrationHash,
        mapping: 'authored-physics-shape-world-transform-full-extents-v1',
        nestedObjectTransformResolution: 'parent-scale-rotation-translation-v1',
        transformOperations: registrationBuild.transformOperations,
      },
      physicsPropertyCoverage: {
        admitted: 'motion-mass-box-sphere-material-filter-damping-v1',
        unsupportedAuthoredPropertiesRejected: true,
        cylinderRejectedPendingEngineRepair: true,
      },
      unitConventions: {
        position: 'meter',
        scale: 'meter-full-extents',
        authoredEulerRotation: 'degree-xyz',
        engineRotation: 'quaternion-xyzw',
        mass: 'kilogram',
        time: 'second',
      },
      deterministicStepping: {
        fixedTimestepSeconds: FIXED_TIMESTEP_SECONDS,
        frameHashChainTerminal: terminalFrame.frameHash,
      },
      interactionProvenance: {
        declaredExternalInteractions: 0,
        declaredProviderCalls: 0,
        instrumentationExecuted: false,
      },
      exactReplay: {
        verifier: 'verifyHoloCpuPhysicsReceipt',
        expectedSourceRequired: true,
        expectedRunSeedRequired: true,
        expectedStepsRequired: true,
      },
    },
    claimBoundary: {
      sourceProjectionReexecutedBeforePhysics: true,
      physicsWorldImplCpuExecuted: true,
      fixedTimestepExecuted: true,
      singleBodyRegistrationPath: true,
      transformStateObserved: true,
      contactStateObserved: true,
      sleepingStateObserved: true,
      authoredEulerDegreeConversionSupported: true,
      nestedObjectTransformCompositionSupported: true,
      authoredEulerDegreeConversionExecuted:
        registrationBuild.transformOperations.authoredEulerConversions > 0,
      nestedObjectTransformCompositionExecuted:
        registrationBuild.transformOperations.nestedObjectCompositions > 0,
      unrepresentableTransformShearRejected: true,
      collisionFiltersRegistered: true,
      dampingRegistered: true,
      unsupportedPhysicsPropertiesRejected: true,
      engineDefaultsSnapshotted: true,
      engineDefaultsStableDuringExecution: true,
      canonicalExperimentMutated: false,
      frictionMaterialRegistered: true,
      frictionResponseClaimed: false,
      cylinderCollisionClaimed: false,
      simulationContractClassExecuted: false,
      geometryIntegrityVerified: false,
      unitValidationVerified: false,
      interactionProvenanceVerified: false,
      engineBuildDigestBound: false,
      crossMachineBitwiseDeterminismClaimed: false,
      nativeWebGpuPhysicsClaimed: false,
      renderingExecuted: false,
      realisticRenderingClaimed: false,
    },
    result: {
      bodyCount: registrations.length,
      frameCount: frames.length,
      contactEventCount,
      initialFrameHash: frames[0].frameHash,
      terminalFrameHash: terminalFrame.frameHash,
      trajectoryHash,
      sleepingBodyIds,
    },
  };
  const receipt: HoloCpuPhysicsExecutionReceipt = {
    ...preimage,
    receiptCommitment: hashHeadlessValue(preimage),
  };
  assertBoundedStrictReceipt(receipt);
  return deepFreeze(receipt);
}

export function verifyHoloCpuPhysicsReceipt(
  input: unknown,
  options: HoloCpuPhysicsVerificationOptions
): HoloCpuPhysicsVerificationResult {
  try {
    const verificationOptions = snapshotVerificationOptions(options);
    const canonicalInput = assertBoundedStrictReceipt(input);
    const inertInput = JSON.parse(canonicalInput) as unknown;
    assertExactKeys(
      inertInput,
      [
        'schema',
        'engine',
        'hashAlgorithm',
        'sourceProjection',
        'simulation',
        'registration',
        'observer',
        'evidence',
        'claimBoundary',
        'result',
        'receiptCommitment',
      ],
      'receipt'
    );
    const receipt = inertInput as HoloCpuPhysicsExecutionReceipt;
    if (
      receipt.schema !== HOLO_CPU_PHYSICS_RECEIPT_SCHEMA ||
      receipt.engine !== HOLO_CPU_PHYSICS_ENGINE ||
      receipt.hashAlgorithm !== HEADLESS_EXPERIMENT_HASH_ALGORITHM
    ) {
      fail('receipt identity mismatch');
    }
    assertSha256(receipt.receiptCommitment, 'receiptCommitment');
    if (receipt.receiptCommitment !== hashHeadlessValue(receiptPreimage(receipt))) {
      fail('receipt commitment mismatch');
    }
    assertExactKeys(
      receipt.simulation,
      [
        'fixedTimestepSeconds',
        'steps',
        'totalSimulatedTimeSeconds',
        'gravity',
        'maxSubsteps',
        'solverIterations',
        'allowSleep',
        'broadphase',
        'runSeed',
        'runSeedRole',
        'randomnessUsed',
        'engineDefaults',
        'engineDefaultsHash',
      ],
      'simulation'
    );
    if (
      receipt.simulation.fixedTimestepSeconds !== FIXED_TIMESTEP_SECONDS ||
      receipt.simulation.steps !== verificationOptions.expectedSteps ||
      receipt.simulation.runSeed !== verificationOptions.expectedRunSeed
    ) {
      fail('simulation source-back requirements mismatch');
    }
    assertExecutionOptionValues(receipt.simulation.runSeed, receipt.simulation.steps);
    if (
      receipt.simulation.engineDefaultsHash !== hashHeadlessValue(receipt.simulation.engineDefaults)
    ) {
      fail('engine defaults hash mismatch');
    }
    const projection = executeHoloWorldProjection(verificationOptions.expectedSource);
    const projectionVerdict = verifyHoloWorldProjectionProvenance(receipt.sourceProjection, {
      expectedSource: verificationOptions.expectedSource,
      expectedScene: projection.scene,
      expectedPosePhysics: projection.posePhysics,
    });
    if (!projectionVerdict.valid) {
      fail(`source projection verification failed: ${projectionVerdict.errors.join('; ')}`);
    }
    const observed = executeHoloCpuPhysicsReceipt(verificationOptions.expectedSource, {
      runSeed: verificationOptions.expectedRunSeed,
      steps: verificationOptions.expectedSteps,
    });
    if (canonicalizeHeadlessValue(observed) !== canonicalInput) {
      fail('source-backed CPU physics replay differs from the sealed receipt');
    }
    return deepFreeze({
      valid: true,
      errors: [],
      observer: observed.observer,
    });
  } catch (error) {
    return deepFreeze({
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    });
  }
}
