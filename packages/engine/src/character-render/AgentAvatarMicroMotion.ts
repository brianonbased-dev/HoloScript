/**
 * Deterministic, absolute-time micro-motion for native characters.
 *
 * The sampler is deliberately pure data: agents can author one compact profile, evaluate any
 * frame without replaying prior frames, and pass the resulting channels to native renderers.
 * Blink is currently bound to real procedural-head deformation by CharacterHost. Gaze, breath,
 * and cloth phase remain explicit channels for render/world consumers rather than being relabelled
 * as native eye, skeleton, or cloth transforms before those bindings exist.
 */

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
  schemaVersion: 'holoscript.character-micro-motion-application.v1';
  sampleDigest: string;
  blinkWeight: number;
  nativeBlinkApplied: true;
  changedVertexCount: number;
  positionDigest: string;
}

const TAU = Math.PI * 2;

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
