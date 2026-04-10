/**
 * IdleBehaviorSystem.ts
 *
 * Procedural idle facial/body signals for character rigs:
 * - Chest rise/fall breathing cycle
 * - Nostril flare coupled to inhale phase
 * - Eyelid blink cycle
 * - Micro-saccade gaze offsets
 *
 * This system is intentionally armature-binding dependent. If no usable
 * bindings are provided, output channels remain neutral.
 */

export interface IdleArmatureBindings {
  /** Bone name used for breathing chest expansion. */
  chestBone?: string;
  /** Blend-shape/morph key for left eye blink. */
  eyelidLeft?: string;
  /** Blend-shape/morph key for right eye blink. */
  eyelidRight?: string;
  /** Blend-shape/morph key for nostril flare. */
  nostrilFlare?: string;
}

export interface IdleBehaviorConfig {
  /** Breaths per minute. Default 12. */
  breathsPerMinute?: number;
  /** Peak chest expansion scale delta. Default 0.035. */
  chestAmplitude?: number;
  /** Peak nostril flare weight. Default 0.22. */
  nostrilAmplitude?: number;
  /** Blink interval range in seconds. Default [2.4, 5.2]. */
  blinkIntervalRangeSec?: [number, number];
  /** Blink close+open duration in seconds. Default 0.12. */
  blinkDurationSec?: number;
  /** Micro-saccade interval range in seconds. Default [0.7, 1.6]. */
  microSaccadeIntervalRangeSec?: [number, number];
  /** Micro-saccade angular amplitude in normalized gaze units. Default 0.03. */
  microSaccadeAmplitude?: number;
  /** Deterministic RNG injection for testing. Default Math.random. */
  random?: () => number;
}

export interface IdleBehaviorFrame {
  /** Absolute per-bone scale multipliers. */
  boneScale: Record<string, number>;
  /** Morph/blend-shape weights in [0, 1]. */
  morphWeights: Record<string, number>;
  /** Normalized micro-saccade gaze offset. */
  gazeOffset: { x: number; y: number };
  /** Normalized blink amount [0, 1]. */
  blink: number;
  /** Normalized breath phase signal [-1, 1]. */
  breath: number;
}

const DEFAULT_CONFIG: Required<Omit<IdleBehaviorConfig, 'random'>> = {
  breathsPerMinute: 12,
  chestAmplitude: 0.035,
  nostrilAmplitude: 0.22,
  blinkIntervalRangeSec: [2.4, 5.2],
  blinkDurationSec: 0.12,
  microSaccadeIntervalRangeSec: [0.7, 1.6],
  microSaccadeAmplitude: 0.03,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class IdleBehaviorSystem {
  private readonly bindings: IdleArmatureBindings;
  private readonly config: Required<Omit<IdleBehaviorConfig, 'random'>>;
  private readonly rnd: () => number;

  private elapsedSec = 0;
  private nextBlinkSec = 0;
  private blinkT = 0;

  private nextSaccadeSec = 0;
  private saccadeTarget = { x: 0, y: 0 };
  private gaze = { x: 0, y: 0 };

  constructor(bindings: IdleArmatureBindings, config: IdleBehaviorConfig = {}) {
    this.bindings = bindings;
    this.config = {
      breathsPerMinute: config.breathsPerMinute ?? DEFAULT_CONFIG.breathsPerMinute,
      chestAmplitude: config.chestAmplitude ?? DEFAULT_CONFIG.chestAmplitude,
      nostrilAmplitude: config.nostrilAmplitude ?? DEFAULT_CONFIG.nostrilAmplitude,
      blinkIntervalRangeSec: config.blinkIntervalRangeSec ?? DEFAULT_CONFIG.blinkIntervalRangeSec,
      blinkDurationSec: config.blinkDurationSec ?? DEFAULT_CONFIG.blinkDurationSec,
      microSaccadeIntervalRangeSec:
        config.microSaccadeIntervalRangeSec ?? DEFAULT_CONFIG.microSaccadeIntervalRangeSec,
      microSaccadeAmplitude: config.microSaccadeAmplitude ?? DEFAULT_CONFIG.microSaccadeAmplitude,
    };
    this.rnd = config.random ?? Math.random;

    this.scheduleNextBlink();
    this.scheduleNextSaccade();
  }

  /** Force an immediate blink cycle. Useful for deterministic tests and scripted beats. */
  public triggerBlink(): void {
    this.blinkT = this.config.blinkDurationSec;
  }

  public update(deltaSec: number): IdleBehaviorFrame {
    if (deltaSec <= 0) {
      return this.computeFrame();
    }

    this.elapsedSec += deltaSec;

    if (this.elapsedSec >= this.nextBlinkSec) {
      this.blinkT = this.config.blinkDurationSec;
      this.scheduleNextBlink();
    }

    if (this.blinkT > 0) {
      this.blinkT = Math.max(0, this.blinkT - deltaSec);
    }

    if (this.elapsedSec >= this.nextSaccadeSec) {
      const a = this.config.microSaccadeAmplitude;
      this.saccadeTarget = {
        x: lerp(-a, a, this.rnd()),
        y: lerp(-a, a, this.rnd()),
      };
      this.scheduleNextSaccade();
    }

    // Critically damped-ish settle toward target.
    const settle = clamp01(deltaSec * 18);
    this.gaze.x = lerp(this.gaze.x, this.saccadeTarget.x, settle);
    this.gaze.y = lerp(this.gaze.y, this.saccadeTarget.y, settle);

    return this.computeFrame();
  }

  private computeFrame(): IdleBehaviorFrame {
    const breathHz = this.config.breathsPerMinute / 60;
    const breath = Math.sin(this.elapsedSec * breathHz * Math.PI * 2);

    // Inhale-only nostril flare (positive breath half-wave).
    const inhale = Math.max(0, breath);
    const nostril = Math.pow(inhale, 1.65) * this.config.nostrilAmplitude;

    const blink = this.computeBlinkWeight();

    const boneScale: Record<string, number> = {};
    if (this.bindings.chestBone) {
      boneScale[this.bindings.chestBone] = 1 + breath * this.config.chestAmplitude;
    }

    const morphWeights: Record<string, number> = {};
    if (this.bindings.eyelidLeft) morphWeights[this.bindings.eyelidLeft] = blink;
    if (this.bindings.eyelidRight) morphWeights[this.bindings.eyelidRight] = blink;
    if (this.bindings.nostrilFlare) morphWeights[this.bindings.nostrilFlare] = nostril;

    return {
      boneScale,
      morphWeights,
      gazeOffset: { ...this.gaze },
      blink,
      breath,
    };
  }

  private computeBlinkWeight(): number {
    if (this.blinkT <= 0) return 0;

    const total = this.config.blinkDurationSec;
    const progress = 1 - this.blinkT / total;

    // Quick close then open triangle profile.
    if (progress <= 0.5) {
      return clamp01(progress / 0.5);
    }
    return clamp01((1 - progress) / 0.5);
  }

  private scheduleNextBlink(): void {
    const [minS, maxS] = this.config.blinkIntervalRangeSec;
    this.nextBlinkSec = this.elapsedSec + lerp(minS, maxS, this.rnd());
  }

  private scheduleNextSaccade(): void {
    const [minS, maxS] = this.config.microSaccadeIntervalRangeSec;
    this.nextSaccadeSec = this.elapsedSec + lerp(minS, maxS, this.rnd());
  }
}

export function createIdleBehaviorSystem(
  bindings: IdleArmatureBindings,
  config?: IdleBehaviorConfig
): IdleBehaviorSystem {
  return new IdleBehaviorSystem(bindings, config);
}
