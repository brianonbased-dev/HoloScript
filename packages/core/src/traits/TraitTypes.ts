import type {
  VRTraitName,
  VRHand,
  ThrowVelocity,
  CollisionEvent,
  Vector3,
  HSPlusNode,
} from '../types/HoloScriptPlus';

export type { VRTraitName, VRHand, ThrowVelocity, CollisionEvent, Vector3, HSPlusNode };

// =============================================================================
// TRAIT HANDLER TYPES
// =============================================================================

export interface TraitHandler<TConfig = unknown> {
  name: VRTraitName;
  defaultConfig?: TConfig;
  onAttach?: (node: HSPlusNode, config: TConfig, context: TraitContext) => void;
  onDetach?: (node: HSPlusNode, config: TConfig, context: TraitContext) => void;
  onUpdate?: (node: HSPlusNode, config: TConfig, context: TraitContext, delta: number) => void;
  onEvent?: (node: HSPlusNode, config: TConfig, context: TraitContext, event: TraitEvent) => void;
  /** Compiler adapters, validators, and metadata â€” typed as unknown for extensibility */
  [key: string]: unknown;
}

export interface HostExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface HostExecResult {
  code: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
}

export interface HostNetworkRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  credentials?: 'omit' | 'same-origin' | 'include';
}

export interface HostNetworkResponse {
  status: number;
  ok: boolean;
  headers?: Record<string, string>;
  body?: unknown;
  text?: string;
  json?: unknown;
}

export interface HostFileSystemCapabilities {
  readFile: (path: string) => Promise<string> | string;
  writeFile: (path: string, content: string) => Promise<void> | void;
  deleteFile: (path: string) => Promise<void> | void;
  exists?: (path: string) => Promise<boolean> | boolean;
}

export interface HostProcessCapabilities {
  exec: (
    command: string,
    args?: string[],
    options?: HostExecOptions
  ) => Promise<HostExecResult> | HostExecResult;
  kill?: (pid: number, signal?: string) => Promise<void> | void;
}

export interface HostNetworkCapabilities {
  fetch: (
    url: string,
    options?: HostNetworkRequestOptions
  ) => Promise<HostNetworkResponse> | HostNetworkResponse;
}

/** Decoded media frame returned by HostMediaCapabilities.decodeFrames(). */
export interface HostMediaFrame {
  /** RGBA pixel buffer, row-major, 4 bytes per pixel. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Frame display duration in milliseconds. */
  delayMs: number;
}

/** GIF / video frame decoding capability. */
export interface HostMediaCapabilities {
  decodeFrames: (
    source: string | ArrayBuffer,
    options?: { maxFrames?: number; type?: 'gif' | 'video' }
  ) => Promise<HostMediaFrame[]>;
}

/** Depth map result from ML inference. */
export interface HostDepthMap {
  /** Normalised depth values in [0, 1], row-major, one value per pixel. */
  data: Float32Array;
  width: number;
  height: number;
  /** Inference backend actually used. */
  backend: 'webgpu' | 'wasm' | 'cpu';
  inferenceMs: number;
}

/** ML depth estimation capability. */
export interface HostDepthInferenceCapabilities {
  estimateDepth: (
    source: string | ArrayBuffer,
    options?: { width?: number; height?: number; modelId?: string }
  ) => Promise<HostDepthMap>;
  readonly webgpuAvailable: boolean;
}

/** WebGPU compute kernel result. */
export interface HostGpuComputeResult {
  outputs: Record<string, ArrayBuffer>;
  dispatchMs: number;
}

/** WebGPU compute dispatch capability. */
export interface HostGpuComputeCapabilities {
  dispatch: (
    shader: string,
    inputs: Record<string, ArrayBuffer>,
    workgroups: [number, number?, number?]
  ) => Promise<HostGpuComputeResult>;
  readonly available: boolean;
}

export interface HostCapabilities {
  fileSystem?: HostFileSystemCapabilities;
  process?: HostProcessCapabilities;
  network?: HostNetworkCapabilities;
  /** Media decoding capability — GIF/video frame extraction. */
  media?: HostMediaCapabilities;
  /** ML depth inference capability. */
  depthInference?: HostDepthInferenceCapabilities;
  /** GPU compute capability. */
  gpuCompute?: HostGpuComputeCapabilities;
}

export interface TraitContext {
  vr: VRContext;
  physics: PhysicsContext;
  audio: AudioContext;
  haptics: HapticsContext;
  accessibility?: AccessibilityContext;
  camera?: {
    position: Vector3;
    rotation?: Vector3;
    fov?: number;
  };
  player?: {
    position: Vector3;
    rotation?: Vector3;
  };
  emit: (event: string, payload?: unknown) => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
  getScaleMultiplier: () => number;
  setScaleContext: (magnitude: string) => void;
  /** Optional action dispatcher for BehaviorTreeTrait â€” maps action names to external handlers.
   *  The blackboard parameter is the BT's shared state, allowing handlers to update conditions. */
  executeAction?: (
    owner: HSPlusNode,
    actionName: string,
    params: Record<string, unknown>,
    blackboard?: Record<string, unknown>
  ) => boolean | 'running';
  /** Optional host capability adapter to execute sensitive operations through policy-aware providers. */
  hostCapabilities?: HostCapabilities;
}

export interface AccessibilityContext {
  announce: (text: string) => void;
  setScreenReaderFocus: (nodeId: string) => void;
  setAltText: (nodeId: string, text: string) => void;
  setHighContrast: (enabled: boolean) => void;
}

export interface VRContext {
  hands: {
    left: VRHand | null;
    right: VRHand | null;
  };
  headset: {
    position: Vector3;
    rotation: Vector3;
  };
  getPointerRay: (hand: 'left' | 'right') => { origin: Vector3; direction: Vector3 } | null;
  getDominantHand: () => VRHand | null;
}

export interface PhysicsContext {
  applyVelocity: (node: HSPlusNode, velocity: Vector3) => void;
  applyAngularVelocity: (node: HSPlusNode, angularVelocity: Vector3) => void;
  setKinematic: (node: HSPlusNode, kinematic: boolean) => void;
  raycast: (origin: Vector3, direction: Vector3, maxDistance: number) => RaycastHit | null;
  getBodyPosition: (nodeId: string) => Vector3 | null;
  getBodyVelocity: (nodeId: string) => Vector3 | null;
}

export interface AudioContext {
  playSound: (
    source: string,
    options?: { position?: Vector3; volume?: number; spatial?: boolean }
  ) => void;
  updateSpatialSource?: (
    nodeId: string,
    options: { hrtfProfile?: string; occlusion?: number; reverbWet?: number }
  ) => void;
  registerAmbisonicSource?: (nodeId: string, order: number) => void;
  setAudioPortal?: (portalId: string, targetZone: string, openingSize: number) => void;
  updateAudioMaterial?: (nodeId: string, absorption: number, reflection: number) => void;
}

export interface HapticsContext {
  pulse: (hand: 'left' | 'right', intensity: number, duration?: number) => void;
  rumble: (hand: 'left' | 'right', intensity: number) => void;
}

export interface RaycastHit {
  node: HSPlusNode;
  point: Vector3;
  normal: Vector3;
  distance: number;
}

export interface TraitEvent {
  /** Event type identifier (e.g., 'grab_start', 'collision', 'trait_attached') */
  type: string;
  /** Source node that emitted the event */
  node?: HSPlusNode;
  /** Trait configuration at time of event */
  config?: unknown;
  /** Event-specific payload data */
  payload?: Record<string, unknown>;
  /** Arbitrary additional fields */
  [key: string]: unknown;
}

export type TraitEventPayload<T = unknown> = Record<string, unknown> & T;

/**
 * Extract a loosely-typed payload from a TraitEvent.
 * Returns `event.payload` if present, otherwise the event itself.
 * The result is typed as `Record<string, any>` to allow property access
 * without explicit casts at every call site (pragmatic trade-off).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractPayload(event: TraitEvent): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (event.payload ?? event) as Record<string, any>;
}

/**
 * Common interface for trait instance delegates stored on `node.__*_instance`.
 * All methods are optional â€” callers must guard with `typeof instance.X === 'function'`.
 */
export interface TraitInstanceDelegate {
  onDetach?: (node: HSPlusNode, ctx: TraitContext) => void;
  onEvent?: (event: TraitEvent) => void;
  onUpdate?: (node: HSPlusNode, ctx: TraitContext, dt: number) => void;
  emit?: (event: TraitEvent) => void;
  dispose?: () => void;
  cleanup?: () => void;
  [key: string]: unknown;
}
