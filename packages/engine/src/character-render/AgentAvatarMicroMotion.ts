/**
 * Deterministic, absolute-time micro-motion for native characters.
 *
 * The sampler is deliberately pure data: agents can author one compact profile, evaluate any
 * frame without replaying prior frames, and pass the resulting channels to native renderers.
 * CharacterHost binds blink, gaze, and breath to real native geometry. Cloth phase remains an
 * explicit channel for render/world consumers rather than being relabelled as native cloth
 * simulation before that binding exists.
 */

import { HUMANOID_BONE_NAMES } from '../character/HumanoidSkeleton';

export type CharacterMicroMotionProfile = 'human-presence-v1';

export interface CharacterMicroMotionConfig {
  schemaVersion: 'holoscript.character-micro-motion-config.v1';
  profile: CharacterMicroMotionProfile;
  seed: string;
  blinkIntervalSeconds: number;
  blinkDurationSeconds: number;
  saccadeIntervalSeconds: number;
  saccadeSettleSeconds: number;
  saccadeYawRadians: number;
  saccadePitchRadians: number;
  breathRateHz: number;
  breathAmplitude: number;
  clothRate: number;
  configDigest: string;
}

export interface CharacterMicroMotionConfigInput {
  profile?: CharacterMicroMotionProfile;
  seed?: string;
  blinkIntervalSeconds?: number;
  blinkDurationSeconds?: number;
  saccadeIntervalSeconds?: number;
  saccadeSettleSeconds?: number;
  saccadeYawRadians?: number;
  saccadePitchRadians?: number;
  breathRateHz?: number;
  breathAmplitude?: number;
  clothRate?: number;
}

export interface CharacterMicroMotionSample {
  schemaVersion: 'holoscript.character-micro-motion-sample.v1';
  profile: CharacterMicroMotionProfile;
  seed: string;
  timeSeconds: number;
  absoluteTime: true;
  blink: {
    weight: number;
    active: boolean;
    cyclePhase01: number;
  };
  gaze: {
    yawRadians: number;
    pitchRadians: number;
    eventIndex: number;
    settle01: number;
    nativeTransformApplied: false;
  };
  breath: {
    scale: number;
    phase01: number;
    nativeTransformApplied: false;
  };
  cloth: {
    timeSeconds: number;
    phase01: number;
    nativeSimulationApplied: false;
  };
  sampleDigest: string;
}

export interface CharacterMicroMotionApplicationReceipt {
  schemaVersion: 'holoscript.character-micro-motion-application.v2';
  sampleDigest: string;
  blinkWeight: number;
  gazeYawRadians: number;
  gazePitchRadians: number;
  breathScale: number;
  nativeBlinkApplied: true;
  nativeGazeApplied: boolean;
  nativeBreathApplied: boolean;
  facialChangedVertexCount: number;
  gazeChangedVertexCount: number;
  breathChangedVertexCount: number;
  changedVertexCount: number;
  positionDigest: string;
  normalDigest: string;
}

export interface CharacterMicroMotionGeometry {
  eyeVertexRange: { vertexStart: number; vertexCount: number };
  jointIndices: Uint32Array;
  secondaryJointIndices?: Uint32Array;
  secondaryJointWeights?: Float32Array;
}

export interface NativeCharacterMicroMotionReceipt {
  schemaVersion: 'holoscript.native-character-micro-motion.v1';
  gazeYawRadians: number;
  gazePitchRadians: number;
  breathScale: number;
  nativeGazeApplied: boolean;
  nativeBreathApplied: boolean;
  gazeChangedVertexCount: number;
  breathChangedVertexCount: number;
  changedVertexCount: number;
  positionDigest: string;
  normalDigest: string;
}

export interface NativeCharacterMicroMotionResult {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  receipt: NativeCharacterMicroMotionReceipt;
}

const TAU = Math.PI * 2;
const SPINE1_INDEX = HUMANOID_BONE_NAMES.indexOf('spine1');
const SPINE2_INDEX = HUMANOID_BONE_NAMES.indexOf('spine2');

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function hashUnit(value: string): number {
  const digest = fnv1a32(value).slice('fnv1a32:'.length);
  return Number.parseInt(digest, 16) / 0xffffffff;
}

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function stableNumber(value: number): string {
  return value.toFixed(6);
}

function digestFloat32(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function rotateYawPitch(
  x: number,
  y: number,
  z: number,
  yawRadians: number,
  pitchRadians: number
): [number, number, number] {
  const yawCos = Math.cos(yawRadians);
  const yawSin = Math.sin(yawRadians);
  const yawX = yawCos * x + yawSin * z;
  const yawZ = -yawSin * x + yawCos * z;
  const pitchCos = Math.cos(pitchRadians);
  const pitchSin = Math.sin(pitchRadians);
  return [yawX, pitchCos * y - pitchSin * yawZ, pitchSin * y + pitchCos * yawZ];
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z);
  return length > 1e-12 ? [x / length, y / length, z / length] : [0, 0, 1];
}

function isChestJoint(jointIndex: number): boolean {
  return jointIndex === SPINE1_INDEX || jointIndex === SPINE2_INDEX;
}

/**
 * Apply gaze and upper-chest breathing to a fresh copy of already-morphed native geometry.
 *
 * The two eye halves are rotated about their own bind-space bounds, which moves the layered
 * iris, pupil, cornea, and sclera as one globe without shifting the eyelid shell. Breathing is
 * limited to vertices primarily or secondarily influenced by spine1/spine2, so the cranial and
 * ocular ranges remain untouched. Every call is absolute and therefore drift-free.
 */
export function applyNativeCharacterMicroMotion(
  basePositions: Float32Array,
  baseNormals: Float32Array,
  geometry: CharacterMicroMotionGeometry,
  sample: CharacterMicroMotionSample
): NativeCharacterMicroMotionResult {
  if (basePositions.length !== baseNormals.length || basePositions.length % 3 !== 0) {
    throw new Error('native character micro-motion requires aligned XYZ positions and normals');
  }
  const vertexCount = basePositions.length / 3;
  if (geometry.jointIndices.length !== vertexCount) {
    throw new Error('native character micro-motion requires one primary joint per vertex');
  }
  const positions = new Float32Array(basePositions);
  const normals = new Float32Array(baseNormals);
  let gazeChangedVertexCount = 0;
  let breathChangedVertexCount = 0;

  const eyeStart = clamp(Math.floor(geometry.eyeVertexRange.vertexStart), 0, vertexCount);
  const eyeCount = clamp(
    Math.floor(geometry.eyeVertexRange.vertexCount),
    0,
    vertexCount - eyeStart
  );
  const perEyeCount = Math.floor(eyeCount / 2);
  const nativeGazeApplied = eyeCount >= 2 && perEyeCount > 0;
  if (
    nativeGazeApplied &&
    (Math.abs(sample.gaze.yawRadians) > 1e-8 || Math.abs(sample.gaze.pitchRadians) > 1e-8)
  ) {
    for (let eye = 0; eye < 2; eye++) {
      const start = eyeStart + eye * perEyeCount;
      const count = eye === 0 ? perEyeCount : eyeCount - perEyeCount;
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let index = 0; index < count; index++) {
        const offset = (start + index) * 3;
        minX = Math.min(minX, basePositions[offset]);
        minY = Math.min(minY, basePositions[offset + 1]);
        minZ = Math.min(minZ, basePositions[offset + 2]);
        maxX = Math.max(maxX, basePositions[offset]);
        maxY = Math.max(maxY, basePositions[offset + 1]);
        maxZ = Math.max(maxZ, basePositions[offset + 2]);
      }
      const centerX = (minX + maxX) * 0.5;
      const centerY = (minY + maxY) * 0.5;
      const centerZ = (minZ + maxZ) * 0.5;
      for (let index = 0; index < count; index++) {
        const offset = (start + index) * 3;
        const [x, y, z] = rotateYawPitch(
          basePositions[offset] - centerX,
          basePositions[offset + 1] - centerY,
          basePositions[offset + 2] - centerZ,
          sample.gaze.yawRadians,
          sample.gaze.pitchRadians
        );
        const nextX = centerX + x;
        const nextY = centerY + y;
        const nextZ = centerZ + z;
        if (
          positions[offset] !== nextX ||
          positions[offset + 1] !== nextY ||
          positions[offset + 2] !== nextZ
        ) {
          gazeChangedVertexCount++;
        }
        positions[offset] = nextX;
        positions[offset + 1] = nextY;
        positions[offset + 2] = nextZ;
        const [normalX, normalY, normalZ] = rotateYawPitch(
          baseNormals[offset],
          baseNormals[offset + 1],
          baseNormals[offset + 2],
          sample.gaze.yawRadians,
          sample.gaze.pitchRadians
        );
        [normals[offset], normals[offset + 1], normals[offset + 2]] = normalize(
          normalX,
          normalY,
          normalZ
        );
      }
    }
  }

  const chestVertices: Array<{ vertex: number; influence: number }> = [];
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const primaryIsChest = isChestJoint(geometry.jointIndices[vertex]);
    const secondaryIsChest =
      geometry.secondaryJointIndices && isChestJoint(geometry.secondaryJointIndices[vertex]);
    const secondaryWeight =
      secondaryIsChest && geometry.secondaryJointWeights
        ? clamp(geometry.secondaryJointWeights[vertex] ?? 0, 0, 1)
        : 0;
    const influence = primaryIsChest ? 1 : secondaryWeight;
    if (influence > 0) chestVertices.push({ vertex, influence });
  }
  const nativeBreathApplied = chestVertices.length > 0;
  const breathDelta = sample.breath.scale - 1;
  if (nativeBreathApplied && Math.abs(breathDelta) > 1e-8) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const { vertex } of chestVertices) {
      const offset = vertex * 3;
      minX = Math.min(minX, basePositions[offset]);
      minY = Math.min(minY, basePositions[offset + 1]);
      minZ = Math.min(minZ, basePositions[offset + 2]);
      maxX = Math.max(maxX, basePositions[offset]);
      maxY = Math.max(maxY, basePositions[offset + 1]);
      maxZ = Math.max(maxZ, basePositions[offset + 2]);
    }
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const height = Math.max(maxY - minY, 1e-6);
    for (const { vertex, influence: jointInfluence } of chestVertices) {
      const offset = vertex * 3;
      const height01 = clamp((basePositions[offset + 1] - minY) / height, 0, 1);
      const influence = jointInfluence * (0.35 + height01 * 0.65);
      const widthScale = 1 + breathDelta * influence;
      const depthScale = 1 + breathDelta * influence * 0.82;
      const nextX = centerX + (positions[offset] - centerX) * widthScale;
      const nextY = positions[offset + 1] + breathDelta * influence * 0.006;
      const nextZ = centerZ + (positions[offset + 2] - centerZ) * depthScale;
      if (
        positions[offset] !== nextX ||
        positions[offset + 1] !== nextY ||
        positions[offset + 2] !== nextZ
      ) {
        breathChangedVertexCount++;
      }
      positions[offset] = nextX;
      positions[offset + 1] = nextY;
      positions[offset + 2] = nextZ;
      [normals[offset], normals[offset + 1], normals[offset + 2]] = normalize(
        normals[offset] / widthScale,
        normals[offset + 1],
        normals[offset + 2] / depthScale
      );
    }
  }

  return {
    positions,
    normals,
    receipt: {
      schemaVersion: 'holoscript.native-character-micro-motion.v1',
      gazeYawRadians: sample.gaze.yawRadians,
      gazePitchRadians: sample.gaze.pitchRadians,
      breathScale: sample.breath.scale,
      nativeGazeApplied,
      nativeBreathApplied,
      gazeChangedVertexCount,
      breathChangedVertexCount,
      changedVertexCount: gazeChangedVertexCount + breathChangedVertexCount,
      positionDigest: digestFloat32(positions),
      normalDigest: digestFloat32(normals),
    },
  };
}

export function deriveCharacterMicroMotionConfig(
  input: CharacterMicroMotionConfigInput = {}
): CharacterMicroMotionConfig {
  const seed = input.seed?.trim() || 'character';
  const profile = input.profile ?? 'human-presence-v1';
  const blinkIntervalSeconds = clamp(finite(input.blinkIntervalSeconds, 4.2), 1.5, 12);
  const blinkDurationSeconds = clamp(
    finite(input.blinkDurationSeconds, 0.18),
    0.08,
    Math.min(0.45, blinkIntervalSeconds * 0.25)
  );
  const saccadeIntervalSeconds = clamp(finite(input.saccadeIntervalSeconds, 1.45), 0.4, 6);
  const saccadeSettleSeconds = clamp(
    finite(input.saccadeSettleSeconds, 0.08),
    0.02,
    Math.min(0.25, saccadeIntervalSeconds * 0.5)
  );
  const saccadeYawRadians = clamp(finite(input.saccadeYawRadians, 0.045), 0, 0.14);
  const saccadePitchRadians = clamp(finite(input.saccadePitchRadians, 0.025), 0, 0.09);
  const breathRateHz = clamp(finite(input.breathRateHz, 0.22), 0.08, 0.6);
  const breathAmplitude = clamp(finite(input.breathAmplitude, 0.012), 0, 0.04);
  const clothRate = clamp(finite(input.clothRate, 1), 0, 3);
  const digestInput = [
    profile,
    seed,
    blinkIntervalSeconds,
    blinkDurationSeconds,
    saccadeIntervalSeconds,
    saccadeSettleSeconds,
    saccadeYawRadians,
    saccadePitchRadians,
    breathRateHz,
    breathAmplitude,
    clothRate,
  ]
    .map((value) => (typeof value === 'number' ? stableNumber(value) : value))
    .join('|');

  return {
    schemaVersion: 'holoscript.character-micro-motion-config.v1',
    profile,
    seed,
    blinkIntervalSeconds,
    blinkDurationSeconds,
    saccadeIntervalSeconds,
    saccadeSettleSeconds,
    saccadeYawRadians,
    saccadePitchRadians,
    breathRateHz,
    breathAmplitude,
    clothRate,
    configDigest: fnv1a32(digestInput),
  };
}

function eventTarget(seed: string, channel: string, eventIndex: number, amplitude: number): number {
  return (hashUnit(`${seed}:${channel}:${eventIndex}`) * 2 - 1) * amplitude;
}

export function sampleCharacterMicroMotion(
  config: CharacterMicroMotionConfig,
  timeSeconds: number
): CharacterMicroMotionSample {
  if (!Number.isFinite(timeSeconds)) {
    throw new Error('character micro-motion timeSeconds must be finite');
  }
  const time = Math.max(0, timeSeconds);
  const blinkOffset = hashUnit(`${config.seed}:blink-phase`) * config.blinkIntervalSeconds;
  const blinkWithin = positiveMod(time + blinkOffset, config.blinkIntervalSeconds);
  const blinkActive = blinkWithin < config.blinkDurationSeconds;
  const blinkProgress = blinkActive ? blinkWithin / config.blinkDurationSeconds : 0;
  const blinkWeight = blinkActive ? Math.sin(Math.PI * blinkProgress) ** 2 : 0;

  const saccadeOffset = hashUnit(`${config.seed}:gaze-phase`) * config.saccadeIntervalSeconds;
  const saccadeClock = time + saccadeOffset;
  const eventIndex = Math.floor(saccadeClock / config.saccadeIntervalSeconds);
  const eventLocal = positiveMod(saccadeClock, config.saccadeIntervalSeconds);
  const settleLinear = clamp(eventLocal / config.saccadeSettleSeconds, 0, 1);
  const settle01 = settleLinear * settleLinear * (3 - 2 * settleLinear);
  const previousYaw = eventTarget(
    config.seed,
    'gaze-yaw',
    eventIndex - 1,
    config.saccadeYawRadians
  );
  const previousPitch = eventTarget(
    config.seed,
    'gaze-pitch',
    eventIndex - 1,
    config.saccadePitchRadians
  );
  const targetYaw = eventTarget(config.seed, 'gaze-yaw', eventIndex, config.saccadeYawRadians);
  const targetPitch = eventTarget(
    config.seed,
    'gaze-pitch',
    eventIndex,
    config.saccadePitchRadians
  );
  const yawRadians = previousYaw + (targetYaw - previousYaw) * settle01;
  const pitchRadians = previousPitch + (targetPitch - previousPitch) * settle01;

  const breathOffset = hashUnit(`${config.seed}:breath-phase`);
  const breathPhase01 = positiveMod(time * config.breathRateHz + breathOffset, 1);
  const breathScale = 1 + Math.sin(breathPhase01 * TAU) * config.breathAmplitude;

  const clothOffset = hashUnit(`${config.seed}:cloth-phase`) * 10;
  const clothTimeSeconds = time * config.clothRate + clothOffset;
  const clothPhase01 = positiveMod(clothTimeSeconds, 1);

  const digestInput = [
    config.configDigest,
    stableNumber(time),
    stableNumber(blinkWeight),
    eventIndex,
    stableNumber(yawRadians),
    stableNumber(pitchRadians),
    stableNumber(breathScale),
    stableNumber(clothTimeSeconds),
  ].join('|');

  return {
    schemaVersion: 'holoscript.character-micro-motion-sample.v1',
    profile: config.profile,
    seed: config.seed,
    timeSeconds: time,
    absoluteTime: true,
    blink: {
      weight: blinkWeight,
      active: blinkActive,
      cyclePhase01: blinkWithin / config.blinkIntervalSeconds,
    },
    gaze: {
      yawRadians,
      pitchRadians,
      eventIndex,
      settle01,
      nativeTransformApplied: false,
    },
    breath: {
      scale: breathScale,
      phase01: breathPhase01,
      nativeTransformApplied: false,
    },
    cloth: {
      timeSeconds: clothTimeSeconds,
      phase01: clothPhase01,
      nativeSimulationApplied: false,
    },
    sampleDigest: fnv1a32(digestInput),
  };
}
