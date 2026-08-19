/**
 * Synthetic Headset — a machine-worn XR device.
 *
 * The problem this exists for: proving an XR build required a human to put on a
 * Meta Quest and walk through every step by hand. That made the headset the
 * bottleneck on every change, and it meant the only people who could verify a
 * build were the people who owned one and had twenty minutes.
 *
 * This is a headset an agent wears instead. It plugs into the same socket a real
 * device plugs into — `navigator.xr` — and presents the standard WebXR surface,
 * so the application, the OpenXR HAL, and every trait beneath them run their
 * REAL code path. Nothing is stubbed above this line.
 *
 * It differs from `createSimulatedSession()` in `OpenXRHALTrait`, which exists so
 * haptic traits do not crash when there is no hardware: that session's
 * `requestAnimationFrame` returns 0 and never calls back, its reference space
 * resolves null, and it has no input sources. It cannot be driven, and a build
 * that is completely broken passes through it unchanged. This device can be
 * driven — head, hands, buttons, gaze — and records what happened.
 *
 * What a witness receipt from this device DOES prove:
 *   - the app entered an XR session against a real device profile
 *   - it received head, hand and controller poses in the shape hardware sends
 *   - it received the button and gaze input the agent performed
 *   - the outcomes the human asked for did or did not occur
 *
 * What it does NOT prove, and must never be read as proving:
 *   - that pixels rendered correctly (there is no GPU here)
 *   - frame timing, thermals, or comfort on real silicon
 *   - anything about a specific physical unit
 *
 * Those still need a human in a headset. Everything else no longer does.
 *
 * Determinism: the device clock is `frameIndex * frameIntervalMs`. There is no
 * `Date.now()` and no randomness anywhere in this file, so two runs of the same
 * script produce identical receipts, and a receipt can be diffed against an
 * earlier one to show exactly what changed.
 */

import { SYNTHETIC_ONLY, describeCapability, type HeadsetTier } from './capability';

// =============================================================================
// GEOMETRY
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len === 0) return vec3(0, 0, -1);
  return vec3(v.x / len, v.y / len, v.z / len);
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

/**
 * Rotation that points -Z (the WebXR forward axis) down `direction`, with no roll.
 * Derived from yaw/pitch so that gaze maths downstream stays well-conditioned.
 */
function lookRotation(direction: Vec3): Quat {
  const d = normalize(direction);
  const yaw = Math.atan2(-d.x, -d.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));

  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);

  return {
    x: cy * sp,
    y: sy * cp,
    z: -sy * sp,
    w: cy * cp,
  };
}

/** Forward vector of a rotation: the -Z axis rotated by q, as WebXR defines forward. */
function forwardOf(q: Quat): Vec3 {
  const { x, y, z, w } = q;
  return vec3(-2 * (x * z + w * y), -2 * (y * z - w * x), 2 * (x * x + y * y) - 1);
}

function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Rotate a vector by a quaternion: v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v). */
function rotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return vec3(
    v.x + q.w * tx + (q.y * tz - q.z * ty),
    v.y + q.w * ty + (q.z * tx - q.x * tz),
    v.z + q.w * tz + (q.x * ty - q.y * tx)
  );
}

/**
 * Column-major 4x4 for a rigid transform, the layout WebGL and
 * `XRRigidTransform.matrix` both use — translation at indices 12, 13, 14.
 */
function matrixOf(p: Vec3, q: Quat): Float32Array {
  const x2 = q.x + q.x;
  const y2 = q.y + q.y;
  const z2 = q.z + q.z;
  const xx = q.x * x2;
  const xy = q.x * y2;
  const xz = q.x * z2;
  const yy = q.y * y2;
  const yz = q.y * z2;
  const zz = q.z * z2;
  const wx = q.w * x2;
  const wy = q.w * y2;
  const wz = q.w * z2;

  const m = new Float32Array(16);
  m[0] = 1 - (yy + zz);
  m[1] = xy + wz;
  m[2] = xz - wy;
  m[4] = xy - wz;
  m[5] = 1 - (xx + zz);
  m[6] = yz + wx;
  m[8] = xz + wy;
  m[9] = yz - wx;
  m[10] = 1 - (xx + yy);
  m[12] = p.x;
  m[13] = p.y;
  m[14] = p.z;
  m[15] = 1;
  return m;
}

/** The inverse of a rigid transform: conjugate rotation, and -(R^T · p). */
function invertRigid(p: Vec3, q: Quat): { position: Vec3; orientation: Quat } {
  const orientation = conjugate(q);
  const rotated = rotate(orientation, p);
  return { position: vec3(-rotated.x, -rotated.y, -rotated.z), orientation };
}

/** Standard right-handed perspective projection, clip space -1..1. */
function projectionOf(fovYDegrees: number, aspect: number, near = 0.1, far = 1000): Float32Array {
  const f = 1 / Math.tan((fovYDegrees * Math.PI) / 360);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

// =============================================================================
// DEVICE CATALOG
// =============================================================================

export type HeadsetModel =
  | 'meta_quest_3'
  | 'meta_quest_pro'
  | 'apple_vision_pro'
  | 'valve_index'
  | 'pico_4';

export interface DeviceDescriptor {
  /** Human-facing device name, as a person would say it out loud. */
  readonly name: string;
  /**
   * The input-source profile strings this device actually reports over WebXR.
   *
   * These are transcribed from real hardware, NOT chosen to satisfy our own
   * detection code. If our detector cannot recognise a device from these
   * strings, that is a defect in the detector and this device must surface it
   * rather than paper over it — a headset that reports friendlier strings than
   * the real one proves nothing about the real one.
   */
  readonly inputProfiles: readonly string[];
  readonly refreshRates: readonly number[];
  readonly environmentBlendMode: 'opaque' | 'alpha-blend' | 'additive';
  readonly features: readonly string[];
  readonly hasHands: boolean;
  readonly hasEyes: boolean;
  /** Eye height in metres when standing, used as the default head height. */
  readonly eyeHeight: number;
  /** Per-eye render target, in pixels. */
  readonly eyeResolution: { readonly width: number; readonly height: number };
  /** Vertical field of view in degrees, for the projection matrix. */
  readonly fovY: number;
  /** Interpupillary distance in metres. */
  readonly ipd: number;
}

export const DEVICE_CATALOG: Readonly<Record<HeadsetModel, DeviceDescriptor>> = Object.freeze({
  meta_quest_3: {
    name: 'Meta Quest 3',
    inputProfiles: [
      'meta-quest-touch-plus',
      'oculus-touch-v3',
      'oculus-touch',
      'generic-trigger-squeeze-thumbstick',
    ],
    refreshRates: [72, 80, 90, 120],
    environmentBlendMode: 'opaque',
    features: [
      'local-floor',
      'bounded-floor',
      'hand-tracking',
      'plane-detection',
      'mesh-detection',
    ],
    hasHands: true,
    hasEyes: false,
    eyeHeight: 1.6,
    eyeResolution: { width: 2064, height: 2208 },
    fovY: 96,
    ipd: 0.063,
  },
  meta_quest_pro: {
    name: 'Meta Quest Pro',
    inputProfiles: ['meta-quest-touch-pro', 'oculus-touch-v3', 'oculus-touch'],
    refreshRates: [72, 90],
    environmentBlendMode: 'opaque',
    features: ['local-floor', 'bounded-floor', 'hand-tracking', 'eye-tracking'],
    hasHands: true,
    hasEyes: true,
    eyeHeight: 1.6,
    eyeResolution: { width: 1800, height: 1920 },
    fovY: 96,
    ipd: 0.063,
  },
  apple_vision_pro: {
    name: 'Apple Vision Pro',
    inputProfiles: ['generic-hand-select', 'generic-hand'],
    refreshRates: [90, 96],
    environmentBlendMode: 'alpha-blend',
    features: ['local-floor', 'hand-tracking'],
    hasHands: true,
    hasEyes: true,
    eyeHeight: 1.62,
    eyeResolution: { width: 3660, height: 3200 },
    fovY: 100,
    ipd: 0.064,
  },
  valve_index: {
    name: 'Valve Index',
    inputProfiles: ['valve-index', 'generic-trigger-squeeze-touchpad-thumbstick'],
    refreshRates: [80, 90, 120, 144],
    environmentBlendMode: 'opaque',
    features: ['local-floor', 'bounded-floor'],
    hasHands: false,
    hasEyes: false,
    eyeHeight: 1.65,
    eyeResolution: { width: 1440, height: 1600 },
    fovY: 104,
    ipd: 0.065,
  },
  pico_4: {
    name: 'PICO 4',
    inputProfiles: ['pico-4', 'generic-trigger-squeeze-thumbstick'],
    refreshRates: [72, 90],
    environmentBlendMode: 'opaque',
    features: ['local-floor', 'bounded-floor', 'hand-tracking'],
    hasHands: true,
    hasEyes: false,
    eyeHeight: 1.6,
    eyeResolution: { width: 2160, height: 2160 },
    fovY: 98,
    ipd: 0.063,
  },
});

// =============================================================================
// WEBXR SURFACE
// =============================================================================

export type Handedness = 'left' | 'right';

/** Buttons in the order the WebXR gamepad mapping reports them for XR controllers. */
export const BUTTON_ORDER = ['trigger', 'grip', 'touchpad', 'thumbstick', 'a', 'b'] as const;
export type ButtonName = (typeof BUTTON_ORDER)[number];

/**
 * A read-only point, matching what WebXR hands an application.
 *
 * This is deliberately NOT a numeric tuple. `XRRigidTransform.position` is a
 * `DOMPointReadOnly` on every real device, and code that reads `t[0]` from it
 * silently gets `undefined` on hardware while passing against a hand-written
 * mock that used an array. Emitting the honest shape is the whole point of this
 * device, so consumers meet the same object a headset gives them.
 */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ReadonlyPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

function point(v: Vec3): ReadonlyPoint {
  return Object.freeze({ x: v.x, y: v.y, z: v.z, w: 1 });
}

function quatPoint(q: Quat): ReadonlyPoint {
  return Object.freeze({ x: q.x, y: q.y, z: q.z, w: q.w });
}

export interface SyntheticTransform {
  readonly position: ReadonlyPoint;
  readonly orientation: ReadonlyPoint;
  /**
   * Column-major 4x4, as `XRRigidTransform.matrix`. Real apps read this far
   * more often than the position — Bravura takes a controller's world Y
   * straight out of `matrix[13]`, so a transform without one is not usable by
   * an actual WebXR application, only by a test that was written around its
   * absence.
   */
  readonly matrix: Float32Array;
  /** The inverse transform, as `XRRigidTransform.inverse` — this is the view matrix. */
  readonly inverse: {
    readonly position: ReadonlyPoint;
    readonly orientation: ReadonlyPoint;
    readonly matrix: Float32Array;
  };
}

function transformOf(position: Vec3, orientation: Quat): SyntheticTransform {
  const inv = invertRigid(position, orientation);
  return Object.freeze({
    position: point(position),
    orientation: quatPoint(orientation),
    matrix: matrixOf(position, orientation),
    inverse: Object.freeze({
      position: point(inv.position),
      orientation: quatPoint(inv.orientation),
      matrix: matrixOf(inv.position, inv.orientation),
    }),
  });
}

export interface SyntheticPose {
  readonly transform: SyntheticTransform;
  readonly radius?: number;
  readonly emulatedPosition: boolean;
}

function poseOf(position: Vec3, orientation: Quat, radius?: number): SyntheticPose {
  return Object.freeze({
    transform: transformOf(position, orientation),
    radius,
    emulatedPosition: false,
  });
}

/** Opaque space handle. Identity is what matters; the device resolves it to a pose. */
export interface SyntheticSpace {
  readonly kind: 'viewer' | 'grip' | 'target-ray' | 'joint' | 'reference';
  readonly hand?: Handedness;
  readonly joint?: string;
  readonly type?: string;
}

export interface SyntheticGamepad {
  readonly mapping: 'xr-standard';
  readonly buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
  readonly axes: number[];
  readonly hapticActuators: Array<{
    pulse(intensity: number, duration: number): Promise<boolean>;
  }>;
}

export interface SyntheticInputSource {
  readonly handedness: Handedness;
  readonly targetRayMode: 'tracked-pointer' | 'gaze' | 'screen';
  readonly profiles: readonly string[];
  readonly gamepad: SyntheticGamepad;
  readonly gripSpace: SyntheticSpace;
  readonly targetRaySpace: SyntheticSpace;
  readonly hand: Map<string, SyntheticSpace> | null;
}

/** The 25 WebXR hand joints, in spec order. */
export const HAND_JOINTS = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

// =============================================================================
// WEARER STATE
// =============================================================================

interface HandState {
  position: Vec3;
  orientation: Quat;
  buttons: Record<ButtonName, { pressed: boolean; touched: boolean; value: number }>;
  axes: number[];
  /** Haptic pulses the application asked this hand to feel, in order. */
  hapticsFelt: Array<{ frame: number; intensity: number; durationMs: number }>;
}

function freshHand(position: Vec3): HandState {
  return {
    position,
    orientation: { ...IDENTITY_QUAT },
    buttons: {
      trigger: { pressed: false, touched: false, value: 0 },
      grip: { pressed: false, touched: false, value: 0 },
      touchpad: { pressed: false, touched: false, value: 0 },
      thumbstick: { pressed: false, touched: false, value: 0 },
      a: { pressed: false, touched: false, value: 0 },
      b: { pressed: false, touched: false, value: 0 },
    },
    axes: [0, 0, 0, 0],
    hapticsFelt: [],
  };
}

// =============================================================================
// WITNESS RECEIPT
// =============================================================================

export interface WitnessAction {
  readonly frame: number;
  readonly atMs: number;
  /**
   * What the wearer did, in the words a person would use — "walked 2.5 m
   * forward", not "walked to (0.00, 0.00, -2.50)". Coordinates are machine
   * detail and live in `at`; a reader who does not write code should never have
   * to decode a tuple to find out what happened.
   */
  readonly did: string;
  /** Exact world position involved, for machines and for diffing receipts. */
  readonly at?: Vec3;
}

export interface WitnessExpectation {
  /** What the human asked for, in their own words. */
  readonly asked: string;
  readonly met: boolean;
  /** Why it was not met — only present when `met` is false. */
  readonly because?: string;
}

export interface WitnessReceipt {
  readonly schema: 'holoscript-machine-headset-witness-v1';
  readonly device: string;
  readonly deviceReportedAs: string | null;
  readonly framesWorn: number;
  readonly wallClockMsSimulated: number;
  readonly sessionEntered: boolean;
  readonly sessionMode: string | null;
  readonly actions: readonly WitnessAction[];
  readonly expectations: readonly WitnessExpectation[];
  readonly hapticsFelt: number;
  readonly verdict: 'pass' | 'fail' | 'inconclusive';
  /**
   * What stood behind this run. Always `synthetic` here, and not overridable —
   * see the note on `witness()`. A receipt from real hardware carries a higher
   * tier because a different driver produced it, never because this one was
   * asked nicely.
   */
  readonly ranOn: HeadsetTier;
  /** One plain sentence naming which kind of "proven" this is. */
  readonly provenance: string;
  /**
   * The whole receipt in plain language, for someone who does not read code.
   * If this paragraph is not enough to tell whether the build worked, the
   * receipt is unfinished.
   */
  readonly plainLanguage: string;
  /** Claims this receipt explicitly does not make. */
  readonly doesNotProve: readonly string[];
}

interface Expectation {
  asked: string;
  satisfied: () => boolean;
  because: string;
}

// =============================================================================
// THE HEADSET
// =============================================================================

export interface SyntheticHeadsetOptions {
  /** Which device to present as. Defaults to Meta Quest 3. */
  model?: HeadsetModel;
  /** Refresh rate; must be one the chosen device supports. Defaults to its highest. */
  refreshRate?: number;
  /** Where the wearer is standing when they put it on. Defaults to the origin. */
  standingAt?: Vec3;
  /** Report hands as tracked rather than controllers. Requires a device with hands. */
  handTracking?: boolean;
  /**
   * Floor-to-eyes height of the wearer, in metres. Defaults to the device's
   * nominal height — which is nobody's actual height. Set it when the test is
   * about a real person: Bravura measured its founder at 1.41 m seated.
   */
  eyeHeight?: number;
}

/**
 * A headset an agent wears.
 *
 * ```ts
 * const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
 * const uninstall = headset.install();
 *
 * headset.expect('the info panel opens when I pull the trigger', () =>
 *   appEvents.includes('panel_open')
 * );
 *
 * headset.walkTo({ x: 0, y: 0, z: -2 });
 * headset.lookAt({ x: 0, y: 1.5, z: -3 });
 * headset.point('right', { x: 0, y: 1.5, z: -3 });
 * headset.click('right', 'trigger');
 *
 * const receipt = headset.witness();
 * uninstall();
 * ```
 */
export class SyntheticHeadset {
  private readonly descriptor: DeviceDescriptor;
  private readonly model: HeadsetModel;
  private readonly frameIntervalMs: number;
  private readonly handTracking: boolean;

  private head: { position: Vec3; orientation: Quat };
  private readonly hands: Record<Handedness, HandState>;
  private gaze: { origin: Vec3; direction: Vec3 } | null = null;

  private frameIndex = 0;
  private sessionActive = false;
  private sessionMode: string | null = null;
  private grantedFeatures: string[] = [];
  private targetFrameRate: number;

  private rafQueue: Array<(time: number, frame: unknown) => void> = [];
  private rafHandle = 1;
  private readonly listeners = new Map<string, Array<(ev: unknown) => void>>();

  private defaultLayer: { getViewport: (view: { eye?: string }) => Viewport };
  private renderState: { baseLayer: unknown; layers: unknown[] };

  /**
   * Frames remaining before each hand's tracking comes back. Quest drops joints
   * exactly during fast motion, which is when a conducting app is reading them —
   * field report 1 (Bravura, 2026-08-13) traced a real defect to a lost wrist
   * feeding its stale frozen height. A device that can never lose a hand cannot
   * catch that class of bug.
   */
  private readonly trackingLostFrames: Record<Handedness, number> = { left: 0, right: 0 };
  private handsVisible: boolean;
  /** Floor-to-eyes height of the wearer. Mutable: bodies differ. */
  private eyeHeight: number;

  private readonly actions: WitnessAction[] = [];
  private readonly expectations: Expectation[] = [];

  private previousXr: unknown;
  private previousXrPresent = false;
  private installTarget: Record<string, unknown> | null = null;

  private readonly inputSources: SyntheticInputSource[];

  constructor(options: SyntheticHeadsetOptions = {}) {
    this.model = options.model ?? 'meta_quest_3';
    this.descriptor = DEVICE_CATALOG[this.model];

    if (!this.descriptor) {
      throw new Error(
        `Unknown headset model "${this.model}". Known models: ${Object.keys(DEVICE_CATALOG).join(', ')}`
      );
    }

    const rate =
      options.refreshRate ?? this.descriptor.refreshRates[this.descriptor.refreshRates.length - 1];
    if (!this.descriptor.refreshRates.includes(rate)) {
      throw new Error(
        `${this.descriptor.name} does not run at ${rate}Hz. It supports: ` +
          `${this.descriptor.refreshRates.join(', ')}Hz. A headset that accepts a refresh rate ` +
          `the real device refuses would prove the wrong thing.`
      );
    }
    this.targetFrameRate = rate;
    this.frameIntervalMs = 1000 / rate;

    this.handTracking = options.handTracking ?? false;
    if (this.handTracking && !this.descriptor.hasHands) {
      throw new Error(`${this.descriptor.name} has no hand tracking; it cannot report hands.`);
    }

    this.eyeHeight = options.eyeHeight ?? this.descriptor.eyeHeight;
    const stand = options.standingAt ?? vec3(0, 0, 0);
    this.head = {
      position: vec3(stand.x, stand.y + this.eyeHeight, stand.z),
      orientation: { ...IDENTITY_QUAT },
    };
    this.hands = {
      left: freshHand(vec3(stand.x - 0.2, stand.y + 1.1, stand.z - 0.3)),
      right: freshHand(vec3(stand.x + 0.2, stand.y + 1.1, stand.z - 0.3)),
    };

    this.handsVisible = this.handTracking;
    this.defaultLayer = {
      getViewport: (view: { eye?: string }) => {
        const { width, height } = this.descriptor.eyeResolution;
        return { x: view?.eye === 'right' ? width : 0, y: 0, width, height };
      },
    };
    this.renderState = { baseLayer: this.defaultLayer, layers: [] };

    this.inputSources = (['left', 'right'] as Handedness[]).map((hand) =>
      this.buildInputSource(hand)
    );
  }

  private eyeViewport(): Viewport {
    const { width, height } = this.descriptor.eyeResolution;
    return { x: 0, y: 0, width, height };
  }

  // ---------------------------------------------------------------------------
  // Installation — plugging into the socket a real headset uses
  // ---------------------------------------------------------------------------

  /**
   * Present this device at `navigator.xr`, exactly where a real headset appears.
   * Returns the function that unplugs it; always call it, even on failure.
   */
  install(target?: Record<string, unknown>): () => void {
    const host =
      target ??
      ((globalThis as Record<string, unknown>).navigator as Record<string, unknown> | undefined) ??
      this.createNavigatorShim();

    this.installTarget = host;
    this.previousXrPresent = 'xr' in host;
    this.previousXr = host.xr;
    host.xr = this.xrSystem();

    this.record('put the headset on');
    return () => this.uninstall();
  }

  private createNavigatorShim(): Record<string, unknown> {
    const shim: Record<string, unknown> = {};
    (globalThis as Record<string, unknown>).navigator = shim;
    return shim;
  }

  /** Unplug the device and restore whatever was at `navigator.xr` before. */
  uninstall(): void {
    const host = this.installTarget;
    if (!host) return;

    if (this.previousXrPresent) {
      host.xr = this.previousXr;
    } else {
      delete host.xr;
    }
    this.installTarget = null;
    this.record('took the headset off');
  }

  // ---------------------------------------------------------------------------
  // The WebXR surface the application sees
  // ---------------------------------------------------------------------------

  private xrSystem() {
    return {
      isSessionSupported: (mode: string): Promise<boolean> =>
        Promise.resolve(mode === 'immersive-vr' || mode === 'inline' || this.supportsAr(mode)),

      requestSession: (
        mode: string,
        init?: { optionalFeatures?: string[]; requiredFeatures?: string[] }
      ) => {
        const required = init?.requiredFeatures ?? [];
        const unsupported = required.filter((f) => !this.descriptor.features.includes(f));
        if (unsupported.length > 0) {
          return Promise.reject(
            new Error(
              `${this.descriptor.name} cannot provide required feature(s): ${unsupported.join(', ')}`
            )
          );
        }

        const optional = init?.optionalFeatures ?? [];
        this.grantedFeatures = optional.filter((f) => this.descriptor.features.includes(f));
        this.sessionActive = true;
        this.sessionMode = mode;
        // `sessionMode` keeps the exact WebXR mode for machines; the story a
        // person reads says what that mode means to someone wearing it.
        this.record(
          mode === 'immersive-ar'
            ? 'started up with the room still visible'
            : mode === 'inline'
              ? 'started up in a window rather than the headset'
              : 'started up inside the headset'
        );
        return Promise.resolve(this.xrSession());
      },
    };
  }

  private supportsAr(mode: string): boolean {
    return mode === 'immersive-ar' && this.descriptor.environmentBlendMode !== 'opaque';
  }

  private xrSession() {
    const self = this;
    return {
      get inputSources() {
        return self.sessionActive ? self.inputSources : [];
      },
      visibilityState: 'visible',
      environmentBlendMode: this.descriptor.environmentBlendMode,
      get enabledFeatures() {
        return [...self.grantedFeatures];
      },
      // Real apps call `updateRenderState({ baseLayer: new XRWebGLLayer(...) })`
      // and then read viewports back off `renderState.baseLayer` every frame.
      // A session without this is not drivable by an actual WebXR app.
      get renderState() {
        return self.renderState;
      },
      updateRenderState: (next: { baseLayer?: unknown }): void => {
        if (next?.baseLayer !== undefined) {
          self.renderState = { ...self.renderState, baseLayer: next.baseLayer ?? self.defaultLayer };
        }
      },
      depthUsage: undefined,
      domOverlayState: undefined,
      requestHitTestSource: undefined,
      requestLightProbe: undefined,

      requestReferenceSpace: (type: string): Promise<SyntheticSpace> => {
        // A real device rejects spaces it cannot provide; the HAL walks a
        // fallback chain against exactly this rejection.
        if (type === 'viewer' || type === 'local' || this.descriptor.features.includes(type)) {
          return Promise.resolve({ kind: 'reference', type });
        }
        return Promise.reject(
          new Error(`${this.descriptor.name} cannot provide "${type}" reference space`)
        );
      },

      requestAnimationFrame: (cb: (time: number, frame: unknown) => void): number => {
        this.rafQueue.push(cb);
        return this.rafHandle++;
      },

      cancelAnimationFrame: (): void => {
        this.rafQueue = [];
      },

      updateTargetFrameRate: (rate: number): Promise<void> => {
        if (!this.descriptor.refreshRates.includes(rate)) {
          return Promise.reject(new Error(`${this.descriptor.name} does not support ${rate}Hz`));
        }
        this.targetFrameRate = rate;
        return Promise.resolve();
      },

      addEventListener: (event: string, handler: (ev: unknown) => void): void => {
        const list = this.listeners.get(event) ?? [];
        list.push(handler);
        this.listeners.set(event, list);
      },

      removeEventListener: (event: string, handler: (ev: unknown) => void): void => {
        const list = this.listeners.get(event) ?? [];
        this.listeners.set(
          event,
          list.filter((h) => h !== handler)
        );
      },

      end: (): Promise<void> => {
        this.sessionActive = false;
        this.rafQueue = [];
        this.emit('end', {});
        this.record('ended the session');
        return Promise.resolve();
      },
    };
  }

  private xrFrame() {
    return {
      session: undefined,
      predictedDisplayTime: this.nowMs(),

      getPose: (space: SyntheticSpace, _reference: unknown): SyntheticPose | null =>
        this.resolveSpace(space),

      getJointPose: (joint: SyntheticSpace, _reference: unknown): SyntheticPose | null =>
        this.resolveSpace(joint),

      getViewerPose: (_reference: unknown) => {
        if (!this.sessionActive) return null;
        const { width, height } = this.eyeViewport();
        const projection = projectionOf(this.descriptor.fovY, width / height);

        return {
          transform: transformOf(this.head.position, this.head.orientation),
          emulatedPosition: false,
          views: (['left', 'right'] as const).map((eye) => {
            // Half the interpupillary distance, offset along the head's own
            // right axis so the eyes stay level when the wearer turns.
            const right = rotate(this.head.orientation, vec3(1, 0, 0));
            const sign = eye === 'left' ? -1 : 1;
            const offset = (this.descriptor.ipd / 2) * sign;
            const position = vec3(
              this.head.position.x + right.x * offset,
              this.head.position.y + right.y * offset,
              this.head.position.z + right.z * offset
            );
            return {
              eye,
              projectionMatrix: projection,
              transform: transformOf(position, this.head.orientation),
            };
          }),
        };
      },
    };
  }

  private resolveSpace(space: SyntheticSpace | undefined): SyntheticPose | null {
    if (!space || !this.sessionActive) return null;

    // A hand whose tracking has dropped returns null, exactly as hardware does.
    // Returning its last known pose instead is the bug this models: the app
    // reads stillness while the real hand is moving.
    const side = space.hand ?? 'right';
    if (space.kind !== 'viewer' && space.kind !== 'reference' && this.trackingLostFrames[side] > 0) {
      return null;
    }

    switch (space.kind) {
      case 'viewer':
        return poseOf(this.head.position, this.head.orientation);
      case 'grip':
      case 'target-ray': {
        const hand = this.hands[space.hand ?? 'right'];
        return poseOf(hand.position, hand.orientation);
      }
      case 'joint': {
        const hand = this.hands[space.hand ?? 'right'];
        // Joints fan out from the wrist along the pointing direction. Positions
        // are plausible rather than anatomical; what matters downstream is that
        // every joint reports a distinct, finite, correctly shaped pose.
        const index = HAND_JOINTS.indexOf(space.joint as (typeof HAND_JOINTS)[number]);
        const spread = index < 0 ? 0 : index * 0.006;
        const forward = forwardOf(hand.orientation);
        return poseOf(
          vec3(
            hand.position.x + forward.x * spread,
            hand.position.y + forward.y * spread,
            hand.position.z + forward.z * spread
          ),
          hand.orientation,
          0.008
        );
      }
      case 'reference':
        return poseOf(vec3(0, 0, 0), IDENTITY_QUAT);
      default:
        return null;
    }
  }

  private buildInputSource(hand: Handedness): SyntheticInputSource {
    const self = this;
    const state = this.hands[hand];
    const jointSpaces = new Map<string, SyntheticSpace>(
      HAND_JOINTS.map((joint) => [joint, { kind: 'joint' as const, hand, joint }])
    );

    const gamepad: SyntheticGamepad = {
      mapping: 'xr-standard',
      get buttons() {
        return BUTTON_ORDER.map((name) => ({ ...state.buttons[name] }));
      },
      get axes() {
        return [...state.axes];
      },
      hapticActuators: [
        {
          pulse: (intensity: number, duration: number): Promise<boolean> => {
            state.hapticsFelt.push({
              frame: self.frameIndex,
              intensity,
              durationMs: duration,
            });
            return Promise.resolve(true);
          },
        },
      ],
    };

    return {
      handedness: hand,
      targetRayMode: 'tracked-pointer',
      profiles: this.descriptor.inputProfiles,
      gamepad,
      gripSpace: { kind: 'grip', hand },
      targetRaySpace: { kind: 'target-ray', hand },
      // Dynamic: a wearer can put the controllers down mid-session and the app
      // must cope. Apps branch on `input.hand` being null, so this has to be
      // able to change while a session is live.
      get hand() {
        return self.handsVisible ? jointSpaces : null;
      },
    };
  }

  private emit(event: string, payload: unknown): void {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(payload);
    }
  }

  // ---------------------------------------------------------------------------
  // Wearing it — what the agent does
  // ---------------------------------------------------------------------------

  /** Advance the device clock and deliver the frames the application asked for. */
  step(frames = 1): this {
    for (let i = 0; i < frames; i++) {
      this.frameIndex++;
      const due = this.rafQueue;
      this.rafQueue = [];
      const frame = this.xrFrame();
      for (const cb of due) {
        cb(this.nowMs(), frame);
      }
      // Decrement AFTER the frame is delivered, so `loseTracking(n)` means the
      // next n delivered frames see no hand. Decrementing first made the last
      // requested frame arrive already recovered — an off-by-one that would
      // have quietly weakened every dropout test built on it.
      for (const side of ['left', 'right'] as Handedness[]) {
        if (this.trackingLostFrames[side] > 0) this.trackingLostFrames[side]--;
      }
    }
    return this;
  }

  /**
   * Drop tracking on one hand for a number of frames — every pose for it
   * returns null, as hardware does when a hand leaves the cameras' view or
   * moves too fast to track.
   *
   * This is a negative control, not a convenience. Bravura's field report 1
   * found that a wrist lost mid-stroke kept feeding its last frozen height, so
   * the room heard stillness while the conductor's hand was moving. No desk
   * driver can produce that; this can.
   */
  loseTracking(hand: Handedness, frames = 10): this {
    this.trackingLostFrames[hand] = frames;
    this.record(`lost tracking of the ${hand} hand`);
    return this;
  }

  /** Bring a hand back before its drop would have expired. */
  restoreTracking(hand: Handedness): this {
    this.trackingLostFrames[hand] = 0;
    this.record(`picked the ${hand} hand back up`);
    return this;
  }

  /** Whether the device is currently reporting a pose for this hand. */
  isTracking(hand: Handedness): boolean {
    return this.trackingLostFrames[hand] === 0;
  }

  /**
   * Set how tall the wearer is, in metres from floor to eyes.
   *
   * Bodies differ and the difference is load-bearing: Bravura's field report 2
   * measured the founder's head at 1.41 m seated against a room built for
   * ~1.6 m, and a fixed height is wrong for every body but the author's.
   */
  setEyeHeight(metres: number): this {
    if (!(metres > 0.5) || !(metres < 2.5)) {
      throw new Error(`Eye height ${metres} m is not a height a person has.`);
    }
    const floorY = this.head.position.y - this.eyeHeight;
    this.eyeHeight = metres;
    this.head.position = vec3(this.head.position.x, floorY + metres, this.head.position.z);
    this.record(`stood at ${metres.toFixed(2)} m tall`);
    return this;
  }

  /** Put the controllers down — the app now sees tracked hands. */
  useHands(): this {
    if (!this.descriptor.hasHands) {
      throw new Error(`${this.descriptor.name} has no hand tracking.`);
    }
    this.handsVisible = true;
    this.record('put the controllers down and used bare hands');
    return this;
  }

  /** Pick the controllers up — the app now sees controllers and no hands. */
  useControllers(): this {
    this.handsVisible = false;
    this.record('picked the controllers up');
    return this;
  }

  /**
   * Conduct: bounce a hand up and down at a tempo, delivering a frame at every
   * step, with the bottom of each bounce landing on the beat.
   *
   * An app that reads motion over time — a beat detector, a gesture recogniser,
   * a gaze dwell timer — cannot be tested by moving a hand from A to B. It needs
   * a hand that is actually moving the way a person moves it. This is the
   * smallest motion primitive that makes such an app testable at all.
   *
   * @returns the device times, in ms, at which the hand reached each beat.
   */
  conduct(options: {
    hand?: Handedness;
    /** Beats per minute. */
    bpm: number;
    /** How many beats to conduct. */
    beats: number;
    /** Peak-to-trough stroke size in metres. Beginners conduct big — 0.16 m is real. */
    amplitude?: number;
    /** Height of the bottom of the stroke, relative to the floor. */
    floorY?: number;
  }): number[] {
    const hand = options.hand ?? 'right';
    const amplitude = options.amplitude ?? 0.16;
    const state = this.hands[hand];
    const beatTimes: number[] = [];

    if (!(options.bpm > 0) || !Number.isFinite(options.bpm)) {
      throw new Error(`${options.bpm} BPM is not a tempo.`);
    }

    const beatMs = 60_000 / options.bpm;
    const framesPerBeat = Math.max(2, Math.round(beatMs / this.frameIntervalMs));
    const bottomY =
      options.floorY ?? this.head.position.y - this.eyeHeight + Math.max(0.6, this.eyeHeight - 0.7);

    for (let beat = 0; beat < options.beats; beat++) {
      for (let f = 0; f < framesPerBeat; f++) {
        // A cosine bounce: 0 at the bottom of the stroke, 1 at the top. The
        // beat is the BOTTOM, which is where a conductor's hand marks time.
        const phase = f / framesPerBeat;
        const height = (1 - Math.cos(2 * Math.PI * phase)) / 2;
        state.position = vec3(state.position.x, bottomY + height * amplitude, state.position.z);
        this.step(1);
      }
      // Land on the bottom of the stroke: this frame is the beat.
      state.position = vec3(state.position.x, bottomY, state.position.z);
      this.step(1);
      beatTimes.push(this.nowMs());
    }

    this.record(`conducted ${options.beats} beats at ${Math.round(options.bpm)} BPM`);
    return beatTimes;
  }

  /** Stand somewhere. The head rises to eye height above the floor position. */
  standAt(floorPosition: Vec3): this {
    this.head.position = vec3(
      floorPosition.x,
      floorPosition.y + this.eyeHeight,
      floorPosition.z
    );
    this.record('took up a position in the room', floorPosition);
    return this;
  }

  /**
   * Walk to a floor position over `frames`, delivering a frame at each step —
   * so the application sees continuous motion, not a teleport.
   */
  walkTo(floorPosition: Vec3, frames = 30): this {
    const from = this.head.position;
    const to = vec3(floorPosition.x, floorPosition.y + this.eyeHeight, floorPosition.z);
    const handOffsetL = subtract(this.hands.left.position, from);
    const handOffsetR = subtract(this.hands.right.position, from);

    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      this.head.position = lerp(from, to, t);
      this.hands.left.position = vec3(
        this.head.position.x + handOffsetL.x,
        this.head.position.y + handOffsetL.y,
        this.head.position.z + handOffsetL.z
      );
      this.hands.right.position = vec3(
        this.head.position.x + handOffsetR.x,
        this.head.position.y + handOffsetR.y,
        this.head.position.z + handOffsetR.z
      );
      this.step(1);
    }
    this.record(describeWalk(from, to), floorPosition);
    return this;
  }

  /** Turn the head to face a point in the world. */
  lookAt(target: Vec3): this {
    const from = this.head.position;
    this.head.orientation = lookRotation(subtract(target, this.head.position));
    this.gaze = {
      origin: { ...this.head.position },
      direction: forwardOf(this.head.orientation),
    };
    this.record(describeLook(from, target), target);
    return this;
  }

  /** Point a hand at a point in the world, without moving it. */
  point(hand: Handedness, target: Vec3): this {
    const state = this.hands[hand];
    state.orientation = lookRotation(subtract(target, state.position));
    this.record(`pointed with their ${hand} hand`, target);
    return this;
  }

  /** Move a hand to a point in the world and face it that way. */
  reach(hand: Handedness, target: Vec3, frames = 10): this {
    const state = this.hands[hand];
    const from = { ...state.position };
    state.orientation = lookRotation(subtract(target, from));
    for (let i = 1; i <= frames; i++) {
      state.position = lerp(from, target, i / frames);
      this.step(1);
    }
    this.record(`reached out with the ${hand} hand`, target);
    return this;
  }

  /** Press and hold a button. */
  press(hand: Handedness, button: ButtonName, value = 1): this {
    const b = this.hands[hand].buttons[button];
    b.pressed = value > 0.5;
    b.touched = true;
    b.value = value;
    this.record(describeButton(button, hand, 'press'));
    return this;
  }

  /** Release a button. */
  release(hand: Handedness, button: ButtonName): this {
    const b = this.hands[hand].buttons[button];
    b.pressed = false;
    b.touched = false;
    b.value = 0;
    this.record(describeButton(button, hand, 'release'));
    return this;
  }

  /** Press, hold for `frames`, then release — the whole gesture a person makes. */
  click(hand: Handedness, button: ButtonName, frames = 3): this {
    this.press(hand, button);
    this.step(frames);
    this.release(hand, button);
    this.step(1);
    return this;
  }

  /** Push a thumbstick. `x` and `y` run -1..1. */
  thumbstick(hand: Handedness, x: number, y: number): this {
    const state = this.hands[hand];
    state.axes = [0, 0, clamp(x), clamp(y)];
    this.record(`pushed the ${hand} thumbstick ${describeStick(clamp(x), clamp(y))}`);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Reading back — what the wearer experienced
  // ---------------------------------------------------------------------------

  /** Where the wearer's eyes are right now. */
  headPose(): { position: Vec3; orientation: Quat } {
    return { position: { ...this.head.position }, orientation: { ...this.head.orientation } };
  }

  /** The gaze ray, if the wearer has looked at anything. */
  gazeRay(): { origin: Vec3; direction: Vec3 } | null {
    return this.gaze
      ? { origin: { ...this.gaze.origin }, direction: { ...this.gaze.direction } }
      : null;
  }

  /** Every haptic pulse the application asked the wearer to feel. */
  hapticsFelt(hand?: Handedness): Array<{ frame: number; intensity: number; durationMs: number }> {
    if (hand) return [...this.hands[hand].hapticsFelt];
    return [...this.hands.left.hapticsFelt, ...this.hands.right.hapticsFelt];
  }

  /** Whether the application actually entered a session. */
  inSession(): boolean {
    return this.sessionActive;
  }

  /** The refresh rate the application settled on. */
  frameRate(): number {
    return this.targetFrameRate;
  }

  /** The deterministic device clock, in milliseconds since the headset went on. */
  nowMs(): number {
    return this.frameIndex * this.frameIntervalMs;
  }

  // ---------------------------------------------------------------------------
  // What the human asked for
  // ---------------------------------------------------------------------------

  /**
   * Record something the human asked the build to do, in their own words, and
   * how the machine will know whether it happened.
   *
   * These are the sentences that appear in the receipt, so write them the way
   * the person who asked would say them out loud — not the way the code works.
   */
  expect(asked: string, satisfied: () => boolean, because = 'it did not happen'): this {
    this.expectations.push({ asked, satisfied, because });
    return this;
  }

  private record(did: string, at?: Vec3): void {
    this.actions.push({ frame: this.frameIndex, atMs: this.nowMs(), did, at });
  }

  /**
   * Everything the machine saw while wearing the headset, ending in a verdict
   * and a paragraph a non-developer can act on.
   *
   * There is deliberately **no** parameter for raising the tier. This device is
   * synthetic; that is a fact about the run, not a setting. Elevation comes from
   * a driver that actually reached hardware, so a receipt claiming real silicon
   * can never be produced by asking this one for it — which is the only
   * guarantee that makes the elevated claims worth anything.
   */
  witness(): WitnessReceipt {
    const checked: WitnessExpectation[] = this.expectations.map((e) => {
      let met = false;
      let because: string | undefined;
      try {
        met = e.satisfied() === true;
      } catch (error) {
        met = false;
        because = `the check itself broke: ${String(error)}`;
      }
      return met
        ? { asked: e.asked, met: true }
        : { asked: e.asked, met: false, because: because ?? e.because };
    });

    const failed = checked.filter((e) => !e.met);
    const verdict: WitnessReceipt['verdict'] =
      checked.length === 0 ? 'inconclusive' : failed.length === 0 ? 'pass' : 'fail';

    const haptics = this.hands.left.hapticsFelt.length + this.hands.right.hapticsFelt.length;

    return Object.freeze({
      schema: 'holoscript-machine-headset-witness-v1' as const,
      device: this.descriptor.name,
      deviceReportedAs: this.descriptor.inputProfiles[0] ?? null,
      framesWorn: this.frameIndex,
      wallClockMsSimulated: this.nowMs(),
      sessionEntered: this.sessionMode !== null,
      sessionMode: this.sessionMode,
      actions: Object.freeze([...this.actions]),
      expectations: Object.freeze(checked),
      hapticsFelt: haptics,
      verdict,
      ranOn: SYNTHETIC_ONLY.tier,
      provenance: describeCapability(SYNTHETIC_ONLY),
      plainLanguage: this.plainLanguage(verdict, checked, failed),
      // Derived from the capability ladder, never written here. When a run
      // reaches real hardware this list shrinks — because the hardware earned
      // it, not because a caller shortened the sentence.
      doesNotProve: SYNTHETIC_ONLY.doesNotProve,
    });
  }

  private plainLanguage(
    verdict: WitnessReceipt['verdict'],
    checked: WitnessExpectation[],
    failed: WitnessExpectation[]
  ): string {
    const seconds = (this.nowMs() / 1000).toFixed(1);
    const worn = `A machine put on a ${this.descriptor.name} and used the build for ${seconds} seconds.`;

    if (!this.sessionMode) {
      return (
        `${worn} The build never started a headset session at all, so there was nothing to try. ` +
        `Nobody needs to put on a real headset to confirm this — it would not have started for them either.`
      );
    }

    if (verdict === 'inconclusive') {
      return (
        `${worn} It went through the steps, but nobody said what was supposed to happen, ` +
        `so there is nothing to pass or fail. Say what you asked the build to do and run it again.`
      );
    }

    const steps = this.actions
      .filter((a) => !a.did.startsWith('put the headset') && !a.did.startsWith('took the headset'))
      .map((a) => a.did);
    const story = steps.length > 0 ? ` It ${joinList(steps)}.` : '';

    if (verdict === 'pass') {
      return (
        `${worn}${story} Everything you asked for happened: ${joinList(checked.map((e) => e.asked))}. ` +
        `You can go straight to trying it yourself — the steps in between are already proven.`
      );
    }

    const misses = failed.map((e) => `you asked that ${e.asked}, but ${e.because}`);
    return (
      `${worn}${story} ${failed.length} of ${checked.length} things you asked for did not happen: ` +
      `${joinList(misses)}. This build is not ready to try on. Nothing was fixed automatically.`
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** Metres, rounded the way a person says a distance out loud. */
function metres(value: number): string {
  return `${value.toFixed(1)} m`;
}

/** "walked 2.5 m forward and 1.0 m to the right" — never a coordinate tuple. */
function describeWalk(from: Vec3, to: Vec3): string {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const parts: string[] = [];

  // -Z is forward in WebXR, so a decreasing z is a step towards what you face.
  if (Math.abs(dz) >= 0.05) parts.push(`${metres(Math.abs(dz))} ${dz < 0 ? 'forward' : 'back'}`);
  if (Math.abs(dx) >= 0.05) {
    parts.push(`${metres(Math.abs(dx))} to the ${dx > 0 ? 'right' : 'left'}`);
  }

  return parts.length === 0 ? 'stayed where they were' : `walked ${joinList(parts)}`;
}

/** "looked ahead and up" / "looked to the left" — direction, not destination. */
function describeLook(from: Vec3, target: Vec3): string {
  const d = subtract(target, from);
  const horizontal = Math.sqrt(d.x * d.x + d.z * d.z);

  const depth = d.z <= 0 ? 'ahead' : 'behind them';
  const side = Math.abs(d.x) < 0.15 ? '' : d.x > 0 ? ' and to the right' : ' and to the left';
  const pitch =
    horizontal < 0.01
      ? ''
      : d.y > horizontal * 0.2
        ? ' and up'
        : d.y < -horizontal * 0.2
          ? ' and down'
          : '';

  return `looked ${depth}${side}${pitch}`;
}

/** The words people actually use for XR controller buttons. */
function describeButton(button: ButtonName, hand: Handedness, action: 'press' | 'release'): string {
  const verb =
    button === 'trigger'
      ? action === 'press'
        ? 'pulled'
        : 'let go of'
      : button === 'grip'
        ? action === 'press'
          ? 'squeezed'
          : 'let go of'
        : action === 'press'
          ? 'pressed'
          : 'released';

  const what =
    button === 'trigger'
      ? 'the trigger'
      : button === 'grip'
        ? 'the grip'
        : button === 'thumbstick'
          ? 'the thumbstick'
          : button === 'touchpad'
            ? 'the touchpad'
            : `the ${button.toUpperCase()} button`;

  return `${verb} ${what} in their ${hand} hand`;
}

function describeStick(x: number, y: number): string {
  const parts: string[] = [];
  if (Math.abs(y) >= 0.2) parts.push(y > 0 ? 'forward' : 'back');
  if (Math.abs(x) >= 0.2) parts.push(x > 0 ? 'right' : 'left');
  return parts.length === 0 ? 'back to centre' : joinList(parts);
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
