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
  /** Compiler adapters, validators, and metadata — typed as unknown for extensibility */
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

export interface HostCapabilities {
  fileSystem?: HostFileSystemCapabilities;
  process?: HostProcessCapabilities;
  network?: HostNetworkCapabilities;
}

export interface TraitContext {
  vr: VRContext;
  physics: PhysicsContext;
  audio: AudioContext;
  haptics: HapticsContext;
  accessibility?: AccessibilityContext;
  camera?: {
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    fov?: number;
  };
  player?: {
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
  };
  emit: (event: string, payload?: unknown) => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
  getScaleMultiplier: () => number;
  setScaleContext: (magnitude: string) => void;
  /** Optional action dispatcher for BehaviorTreeTrait — maps action names to external handlers.
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
