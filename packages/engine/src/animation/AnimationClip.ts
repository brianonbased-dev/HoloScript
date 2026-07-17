/**
 * AnimationClip.ts
 *
 * Keyframe-based animation clip: multi-track keyframes,
 * interpolation modes, animation events, looping, and blending.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

export type ScalarInterpolationMode = 'step' | 'linear' | 'cubic';
export type QuaternionInterpolationMode = 'nlerp';
/** @deprecated Legacy label retained as a typed migration input. It sampled linearly. */
export type LegacyInterpolationMode = 'slerp';
export type InterpolationMode =
  | ScalarInterpolationMode
  | QuaternionInterpolationMode
  | LegacyInterpolationMode;

export type QuaternionValue = [number, number, number, number];
export type ClipSampleValue = number | QuaternionValue;

export interface ScalarClipKeyframe {
  time: number;
  value: number;
  inTangent?: number;
  outTangent?: number;
}

/** Legacy component-vector keyframe sampled through its track's component. */
export interface ComponentClipKeyframe {
  time: number;
  value: number[];
  inTangent?: number;
  outTangent?: number;
}

export interface QuaternionClipKeyframe {
  time: number;
  value: QuaternionValue;
}

export type ScalarTrackKeyframe = ScalarClipKeyframe | ComponentClipKeyframe;
export type ClipKeyframe = ScalarTrackKeyframe | QuaternionClipKeyframe;

interface ClipTrackBase {
  id: string;
  targetPath: string; // e.g. "root/spine/head"
  property: string; // e.g. "position", "rotation", "scale"
}

export interface ScalarClipTrack extends ClipTrackBase {
  component?: string; // e.g. "x", "y", "z" or null for full vector
  interpolation: ScalarInterpolationMode;
  keyframes: ScalarTrackKeyframe[];
}

export interface QuaternionClipTrack extends ClipTrackBase {
  property: 'rotation';
  component?: never;
  interpolation: QuaternionInterpolationMode;
  keyframes: QuaternionClipKeyframe[];
}

/**
 * @deprecated Component-valued `slerp` tracks never performed quaternion
 * interpolation. `AnimClip.addTrack()` accepts this shape so 6.1 callers can
 * migrate without a cast and stores it as an honest scalar `linear` track.
 */
export interface LegacySlerpClipTrack extends ClipTrackBase {
  component?: string;
  interpolation: LegacyInterpolationMode;
  keyframes: ScalarTrackKeyframe[];
}

export type ClipTrack = ScalarClipTrack | QuaternionClipTrack | LegacySlerpClipTrack;
type PreparedClipTrack = ScalarClipTrack | QuaternionClipTrack;

export interface ClipEvent {
  time: number;
  name: string;
  data: Record<string, unknown>;
}

const IDENTITY_QUATERNION: QuaternionValue = [0, 0, 0, 1];

function componentIndex(component: string): number {
  const named: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 };
  return named[component] ?? Number.parseInt(component, 10);
}

function cloneTrack(track: PreparedClipTrack): PreparedClipTrack {
  if (track.interpolation === 'nlerp') {
    return {
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({
        ...keyframe,
        value: [
          keyframe.value[0],
          keyframe.value[1],
          keyframe.value[2],
          keyframe.value[3],
        ] as QuaternionValue,
      })),
    };
  }

  return {
    ...track,
    keyframes: track.keyframes.map(
      (keyframe): ScalarTrackKeyframe =>
        Array.isArray(keyframe.value)
          ? { ...keyframe, value: [...keyframe.value] }
          : { ...keyframe, value: keyframe.value }
    ),
  };
}

function normalizeQuaternion(value: readonly number[], context: string): QuaternionValue {
  if (value.length !== 4) {
    throw new TypeError(`${context} must contain exactly four components`);
  }

  for (const component of value) {
    if (!Number.isFinite(component)) {
      throw new TypeError(`${context} must contain only finite numbers`);
    }
  }

  // Scale before squaring so finite subnormal and near-MAX_VALUE inputs do
  // not underflow or overflow while computing their norm.
  const maxComponent = Math.max(
    Math.abs(value[0]),
    Math.abs(value[1]),
    Math.abs(value[2]),
    Math.abs(value[3])
  );
  if (maxComponent === 0) {
    throw new RangeError(`${context} must not be the zero quaternion`);
  }

  const scaled: QuaternionValue = [
    value[0] / maxComponent,
    value[1] / maxComponent,
    value[2] / maxComponent,
    value[3] / maxComponent,
  ];
  const inverseNorm = 1 / Math.hypot(scaled[0], scaled[1], scaled[2], scaled[3]);
  return [
    scaled[0] * inverseNorm,
    scaled[1] * inverseNorm,
    scaled[2] * inverseNorm,
    scaled[3] * inverseNorm,
  ];
}

function normalizedLerpQuaternion(
  from: readonly number[],
  to: readonly number[],
  weight: number,
  context: string
): QuaternionValue {
  const a = normalizeQuaternion(from, `${context} start`);
  let b = normalizeQuaternion(to, `${context} end`);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

  // q and -q encode the same orientation. Flip the second endpoint when
  // necessary so normalized lerp follows the shorter orientation arc.
  if (dot < 0) {
    b = [-b[0], -b[1], -b[2], -b[3]];
  }

  return normalizeQuaternion(
    [
      a[0] + (b[0] - a[0]) * weight,
      a[1] + (b[1] - a[1]) * weight,
      a[2] + (b[2] - a[2]) * weight,
      a[3] + (b[3] - a[3]) * weight,
    ],
    `${context} result`
  );
}

function prepareTrack(track: ClipTrack): PreparedClipTrack {
  if (track.interpolation === 'slerp') {
    // Runtime migration for clips produced by the old component-track API.
    // The old implementation performed scalar lerp despite its label, so store
    // the behavior under its honest name. Tuple rotations must use `nlerp`.
    return prepareTrack({ ...track, interpolation: 'linear' });
  }
  const interpolation = (track as { interpolation: string }).interpolation;
  if (!['step', 'linear', 'cubic', 'nlerp'].includes(interpolation)) {
    throw new TypeError(`Track "${track.id}" uses unsupported interpolation "${interpolation}"`);
  }

  let previousTime = Number.NEGATIVE_INFINITY;
  for (const keyframe of track.keyframes) {
    if (!Number.isFinite(keyframe.time)) {
      throw new TypeError(`Track "${track.id}" keyframe time must be finite`);
    }
    if (keyframe.time < previousTime) {
      throw new RangeError(`Track "${track.id}" keyframes must be sorted by time`);
    }
    previousTime = keyframe.time;
  }

  if (track.interpolation === 'nlerp') {
    const runtimeShape = track as { id: string; property: string; component?: unknown };
    if (runtimeShape.property !== 'rotation' || runtimeShape.component !== undefined) {
      throw new TypeError(
        `Quaternion track "${runtimeShape.id}" must target rotation without a component`
      );
    }

    return {
      ...track,
      keyframes: track.keyframes.map((keyframe, index) => {
        if (!Array.isArray(keyframe.value)) {
          throw new TypeError(`Quaternion track "${track.id}" keyframe ${index} must be a tuple`);
        }
        return {
          ...keyframe,
          value: normalizeQuaternion(
            keyframe.value,
            `Quaternion track "${track.id}" keyframe ${index}`
          ),
        };
      }),
    };
  }

  for (let index = 0; index < track.keyframes.length; index++) {
    const keyframe = track.keyframes[index];
    if (Array.isArray(keyframe.value)) {
      if (!track.component) {
        throw new TypeError(
          `Scalar component-vector track "${track.id}" requires an explicit component`
        );
      }
      const selectedIndex = componentIndex(track.component);
      if (
        !Number.isInteger(selectedIndex) ||
        selectedIndex < 0 ||
        selectedIndex >= keyframe.value.length
      ) {
        throw new RangeError(
          `Scalar component-vector track "${track.id}" keyframe ${index} does not contain component "${track.component}"`
        );
      }
      if (!keyframe.value.every(Number.isFinite)) {
        throw new TypeError(
          `Scalar component-vector track "${track.id}" keyframe ${index} must contain finite numbers`
        );
      }
    } else if (typeof keyframe.value !== 'number' || !Number.isFinite(keyframe.value)) {
      throw new TypeError(`Scalar track "${track.id}" keyframe ${index} must be a finite number`);
    }
    if (keyframe.inTangent !== undefined && !Number.isFinite(keyframe.inTangent)) {
      throw new TypeError(`Scalar track "${track.id}" keyframe ${index} has invalid inTangent`);
    }
    if (keyframe.outTangent !== undefined && !Number.isFinite(keyframe.outTangent)) {
      throw new TypeError(`Scalar track "${track.id}" keyframe ${index} has invalid outTangent`);
    }
  }

  return cloneTrack(track);
}

// =============================================================================
// ANIMATION CLIP
// =============================================================================

export class AnimClip {
  readonly id: string;
  readonly name: string;
  private tracks: PreparedClipTrack[] = [];
  private events: ClipEvent[] = [];
  private _duration = 0;
  private loop = false;
  private speed = 1;
  private wrapMode: 'once' | 'loop' | 'ping-pong' | 'clamp' = 'once';

  constructor(id: string, name: string, duration: number) {
    this.id = id;
    this.name = name;
    this._duration = duration;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setLoop(loop: boolean): void {
    this.loop = loop;
    this.wrapMode = loop ? 'loop' : 'once';
  }
  isLooping(): boolean {
    return this.loop;
  }
  setSpeed(speed: number): void {
    this.speed = Math.max(0.01, speed);
  }
  getSpeed(): number {
    return this.speed;
  }
  setWrapMode(mode: typeof this.wrapMode): void {
    this.wrapMode = mode;
  }
  getWrapMode(): string {
    return this.wrapMode;
  }
  getDuration(): number {
    return this._duration;
  }

  // ---------------------------------------------------------------------------
  // Tracks
  // ---------------------------------------------------------------------------

  addTrack(track: ClipTrack): void {
    const preparedTrack = prepareTrack(track);
    this.tracks.push(preparedTrack);
    // Update duration from keyframes
    for (const kf of preparedTrack.keyframes) {
      if (kf.time > this._duration) this._duration = kf.time;
    }
  }

  getTrack(id: string): ClipTrack | undefined {
    const track = this.tracks.find((candidate) => candidate.id === id);
    return track ? cloneTrack(track) : undefined;
  }
  getTracks(): ClipTrack[] {
    return this.tracks.map(cloneTrack);
  }
  getTrackCount(): number {
    return this.tracks.length;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  addEvent(time: number, name: string, data: Record<string, unknown> = {}): void {
    this.events.push({ time, name, data });
    this.events.sort((a, b) => a.time - b.time);
  }

  getEventsInRange(fromTime: number, toTime: number): ClipEvent[] {
    return this.events.filter((e) => e.time >= fromTime && e.time < toTime);
  }

  getEvents(): ClipEvent[] {
    return [...this.events];
  }

  // ---------------------------------------------------------------------------
  // Sampling
  // ---------------------------------------------------------------------------

  /**
   * Backward-compatible scalar/component sampling view.
   *
   * Quaternion tracks are exposed through the four component keys used by the
   * pre-nlerp API, keeping the established `Map<string, number>` boundary.
   * Quaternion-aware code should call `sampleValues()` for tuple values.
   */
  sample(time: number): Map<string, number> {
    const values = this.sampleValues(time);
    const result = new Map<string, number>();

    for (const track of this.tracks) {
      const key = track.component
        ? `${track.targetPath}.${track.property}.${track.component}`
        : `${track.targetPath}.${track.property}`;
      const value = values.get(key);
      if (Array.isArray(value)) {
        for (const [index, component] of ['x', 'y', 'z', 'w'].entries()) {
          result.set(`${key}.${component}`, value[index]);
        }
      } else if (typeof value === 'number') {
        result.set(key, value);
      }
    }

    return result;
  }

  /** Sample scalar tracks and tuple-valued quaternion tracks without flattening. */
  sampleValues(time: number): Map<string, ClipSampleValue> {
    const wrapped = this.wrapTime(time);
    const result = new Map<string, ClipSampleValue>();

    for (const track of this.tracks) {
      const value = this.sampleTrack(track, wrapped);
      const key = track.component
        ? `${track.targetPath}.${track.property}.${track.component}`
        : `${track.targetPath}.${track.property}`;
      result.set(key, value);
    }

    return result;
  }

  private segmentIndex(keyframes: readonly { time: number }[], time: number): number {
    let index = 0;
    for (; index < keyframes.length - 1; index++) {
      if (time < keyframes[index + 1].time) break;
    }
    return Math.min(index, keyframes.length - 2);
  }

  private sampleTrack(track: PreparedClipTrack, time: number): ClipSampleValue {
    if (track.interpolation === 'nlerp') {
      return this.sampleQuaternionTrack(track, time);
    }
    return this.sampleScalarTrack(track, time);
  }

  private sampleScalarTrack(track: ScalarClipTrack, time: number): number {
    const kfs = track.keyframes;
    if (kfs.length === 0) return 0;
    const valueAt = (index: number): number => {
      const value = kfs[index].value;
      return Array.isArray(value) ? value[componentIndex(track.component!)] : value;
    };
    if (kfs.length === 1) return valueAt(0);
    if (track.interpolation === 'step' && time >= kfs[kfs.length - 1].time) {
      return valueAt(kfs.length - 1);
    }

    // Find surrounding keyframes
    const i = this.segmentIndex(kfs, time);

    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    const dt = k1.time - k0.time;
    const t = dt > 0 ? (time - k0.time) / dt : 0;

    const v0 = valueAt(i);
    const v1 = valueAt(i + 1);

    switch (track.interpolation) {
      case 'step':
        return v0;
      case 'linear':
        return v0 + (v1 - v0) * t;
      case 'cubic': {
        // Hermite
        const m0 = k0.outTangent ?? 0;
        const m1 = k1.inTangent ?? 0;
        const t2 = t * t,
          t3 = t2 * t;
        return (
          (2 * t3 - 3 * t2 + 1) * v0 +
          (t3 - 2 * t2 + t) * m0 * dt +
          (-2 * t3 + 3 * t2) * v1 +
          (t3 - t2) * m1 * dt
        );
      }
    }
  }

  private sampleQuaternionTrack(track: QuaternionClipTrack, time: number): QuaternionValue {
    const kfs = track.keyframes;
    if (kfs.length === 0) return [...IDENTITY_QUATERNION];
    if (kfs.length === 1) {
      return normalizeQuaternion(kfs[0].value, `Track "${track.id}" sample`);
    }

    const i = this.segmentIndex(kfs, time);
    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    const dt = k1.time - k0.time;
    const weight = dt > 0 ? (time - k0.time) / dt : 0;
    return normalizedLerpQuaternion(k0.value, k1.value, weight, `Track "${track.id}" sample`);
  }

  private wrapTime(time: number): number {
    if (this._duration <= 0) return 0;
    const t = time * this.speed;

    switch (this.wrapMode) {
      case 'once':
        return Math.min(t, this._duration);
      case 'clamp':
        return Math.max(0, Math.min(t, this._duration));
      case 'loop':
        return ((t % this._duration) + this._duration) % this._duration;
      case 'ping-pong': {
        const cycle = t / this._duration;
        const phase = cycle % 2;
        return phase < 1 ? phase * this._duration : (2 - phase) * this._duration;
      }
      default:
        return t;
    }
  }

  // ---------------------------------------------------------------------------
  // Blending
  // ---------------------------------------------------------------------------

  static blend(
    a: ReadonlyMap<string, number>,
    b: ReadonlyMap<string, number>,
    weight: number
  ): Map<string, number>;
  static blend(
    a: ReadonlyMap<string, ClipSampleValue>,
    b: ReadonlyMap<string, ClipSampleValue>,
    weight: number
  ): Map<string, ClipSampleValue>;
  static blend(
    a: ReadonlyMap<string, ClipSampleValue>,
    b: ReadonlyMap<string, ClipSampleValue>,
    weight: number
  ): Map<string, ClipSampleValue> {
    if (!Number.isFinite(weight)) {
      throw new TypeError('Blend weight must be finite');
    }

    const result = new Map<string, ClipSampleValue>();
    const allKeys = new Set([...a.keys(), ...b.keys()]);

    for (const key of allKeys) {
      const va = a.get(key);
      const vb = b.get(key);
      const hasQuaternion = Array.isArray(va) || Array.isArray(vb);

      if (hasQuaternion) {
        if ((va !== undefined && !Array.isArray(va)) || (vb !== undefined && !Array.isArray(vb))) {
          throw new TypeError(`Cannot blend scalar and quaternion values for "${key}"`);
        }
        result.set(
          key,
          normalizedLerpQuaternion(
            va ?? IDENTITY_QUATERNION,
            vb ?? IDENTITY_QUATERNION,
            weight,
            `Blend "${key}"`
          )
        );
        continue;
      }

      const scalarA = va ?? 0;
      const scalarB = vb ?? 0;
      if (typeof scalarA !== 'number' || typeof scalarB !== 'number') {
        throw new TypeError(`Cannot blend invalid scalar values for "${key}"`);
      }
      result.set(key, scalarA * (1 - weight) + scalarB * weight);
    }

    return result;
  }
}
