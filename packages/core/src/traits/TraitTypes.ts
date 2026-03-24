import type {
  VRTraitName,
  VRHand,
  ThrowVelocity,
  CollisionEvent,
  Vector3,
  HSPlusNode,
} from '../types/HoloScriptPlus';

export type {
  VRTraitName,
  VRHand,
  ThrowVelocity,
  CollisionEvent,
  Vector3,
  HSPlusNode,
};

// =============================================================================
// TRAIT HANDLER TYPES
// =============================================================================

export interface TraitHandler<TConfig = unknown> {
  name: VRTraitName;
  defaultConfig: TConfig;
  onAttach?: (node: HSPlusNode, config: TConfig, context: TraitContext) => void;
  onDetach?: (node: HSPlusNode, config: TConfig, context: TraitContext) => void;
  onUpdate?: (node: HSPlusNode, config: TConfig, context: TraitContext, delta: number) => void;
  onEvent?: (node: HSPlusNode, config: TConfig, context: TraitContext, event: TraitEvent) => void;
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
  executeAction?: (owner: unknown, actionName: string, params: Record<string, unknown>, blackboard?: Record<string, unknown>) => boolean | 'running';
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

export type TraitEvent =
  | { type: string; [key: string]: unknown }
  | {
      type: 'action:result';
      requestId: string;
      status?: 'success' | 'failure' | 'running';
      success?: boolean;
      output?: unknown;
      error?: string;
    }
  | { type: 'grab_start'; hand: VRHand }
  | { type: 'grab_end'; hand: VRHand; velocity: ThrowVelocity }
  | { type: 'hover_enter'; hand: VRHand }
  | { type: 'hover_exit'; hand: VRHand }
  | { type: 'point_enter'; hand: VRHand }
  | { type: 'point_exit'; hand: VRHand }
  | { type: 'collision'; data: CollisionEvent }
  | { type: 'trigger_enter'; other: HSPlusNode }
  | { type: 'trigger_exit'; other: HSPlusNode }
  | { type: 'click'; hand: VRHand }
  | { type: 'scale_start'; hands: { left: VRHand; right: VRHand } }
  | { type: 'scale_update'; scale: number }
  | { type: 'scale_end'; finalScale: number }
  | { type: 'rotate_start'; hand: VRHand }
  | { type: 'rotate_update'; rotation: Vector3 }
  | { type: 'rotate_end'; finalRotation: Vector3 }
  | { type: 'neural_link_execute'; data?: { prompt?: string } }
  | { type: 'neural_link_response'; data?: { text?: string; generationTime?: number } }
  | {
      type: 'xr_input_source_update';
      node: HSPlusNode;
      source: {
        handedness: 'left' | 'right' | 'none';
        targetRayMode: 'gaze' | 'tracked-pointer' | 'screen';
        profiles: string[];
        hasGamepad: boolean;
        hasHand: boolean;
      };
      pose: unknown | null;
      timestamp: number;
    }
  | {
      type: 'controller_data';
      node: HSPlusNode;
      hand: 'left' | 'right' | 'none';
      buttons: Record<
        string,
        {
          pressed: boolean;
          touched: boolean;
          value: number;
        }
      >;
      thumbstick: { x: number; y: number };
      touchpad?: { x: number; y: number };
      triggerValue: number;
      gripValue: number;
      timestamp: number;
    }
  | {
      type: 'hand_data';
      node: HSPlusNode;
      hand: 'left' | 'right' | 'none';
      joints: Record<
        string,
        {
          position: { x: number; y: number; z: number };
          rotation: { x: number; y: number; z: number; w: number };
          radius: number;
        }
      >;
      pinchStrength: number;
      gripStrength: number;
      timestamp: number;
    }
  | {
      type: 'eye_gaze_update';
      node: HSPlusNode;
      origin: { x: number; y: number; z: number };
      direction: { x: number; y: number; z: number };
      timestamp: number;
    };
