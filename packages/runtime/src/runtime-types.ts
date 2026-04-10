/**
 * @holoscript/runtime — Shared type definitions
 *
 * Provides strict-typed alternatives to `as any` casts used throughout the
 * runtime package.  Every type here exists solely to remove an `as any` while
 * staying compatible with Three.js and browser APIs at runtime.
 */

import type * as THREE from 'three';
import type { TraitContext } from './traits/TraitSystem';

// ---------------------------------------------------------------------------
// THREE.Object3D custom-event dispatch
// ---------------------------------------------------------------------------
// Three.js types EventDispatcher to an explicit event-map, but the runtime
// implementation (`EventDispatcher.prototype.dispatchEvent`) accepts any
// `{ type: string, ... }` payload.  Rather than casting to `any` at every
// call-site we route through a narrowly-typed helper.

/** Any custom event payload we dispatch on an Object3D. */
export interface HoloCustomEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Dispatch a custom event on a THREE.Object3D without `as any`.
 *
 * Three.js's runtime accepts arbitrary `{type, ...}` objects; its *type
 * definitions* are stricter.  This helper bridges the gap through a single
 * `unknown` cast so call-sites stay clean.
 */
export function dispatchCustomEvent(object: THREE.Object3D, event: HoloCustomEvent): void {
  (object.dispatchEvent as (e: HoloCustomEvent) => void)(event);
}

// ---------------------------------------------------------------------------
// WebXR navigator.xr
// ---------------------------------------------------------------------------
// The WebXR API may or may not exist on `navigator`.  Rather than `(navigator
// as any).xr` we declare a narrow interface and use a type-guard.

export interface NavigatorXR {
  xr: {
    isSessionSupported(mode: string): Promise<boolean>;
    requestSession(mode: string, options?: Record<string, unknown>): Promise<XRSession>;
  };
}

/** Type-guard: does `navigator` expose the WebXR Device API? */
export function hasXR(nav: Navigator): nav is Navigator & NavigatorXR {
  return 'xr' in nav && nav.xr != null;
}

// ---------------------------------------------------------------------------
// WebGPU navigator.gpu
// ---------------------------------------------------------------------------

export interface NavigatorGPU {
  gpu: {
    requestAdapter(): Promise<unknown | null>;
  };
}

export function hasGPU(nav: Navigator): nav is Navigator & NavigatorGPU {
  return 'gpu' in nav && (nav as NavigatorGPU).gpu != null;
}

// ---------------------------------------------------------------------------
// window globals
// ---------------------------------------------------------------------------

/** Augmented window with `requestIdleCallback` (not universally typed). */
export interface WindowWithIdleCallback {
  requestIdleCallback(callback: () => void, options?: { timeout: number }): number;
  cancelIdleCallback(id: number): void;
}

export function hasIdleCallback(win: Window): win is Window & WindowWithIdleCallback {
  return typeof (win as unknown as WindowWithIdleCallback).requestIdleCallback === 'function';
}

/** Augmented window used by the UMD bootstrap. */
export interface WindowWithHoloScript {
  HoloScript: {
    createRuntime: unknown;
    version: string;
  };
}

/** Augmented window used by dynamic script imports. */
export interface WindowWithModuleExports {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// _traits stash on Object3D
// ---------------------------------------------------------------------------

export interface TraitEntry {
  name: string;
  context: TraitContext;
}

/** An Object3D that may carry runtime trait metadata. */
export interface ObjectWithTraits {
  _traits?: TraitEntry[];
}

/** Read the `_traits` array from an Object3D (may be undefined). */
export function getObjectTraits(obj: THREE.Object3D): TraitEntry[] | undefined {
  return (obj as unknown as ObjectWithTraits)._traits;
}

/** Ensure the `_traits` array exists on an Object3D and push an entry. */
export function pushObjectTrait(obj: THREE.Object3D, entry: TraitEntry): void {
  const extended = obj as unknown as ObjectWithTraits;
  if (!extended._traits) {
    extended._traits = [];
  }
  extended._traits.push(entry);
}

// ---------------------------------------------------------------------------
// Extended model metadata (attached to Object3D via userData-style stash)
// ---------------------------------------------------------------------------

export interface ProceduralSkeletonData {
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  bones: THREE.Bone[];
  originalRotations: THREE.Quaternion[];
  phase: number;
  animationType: string;
}

export interface PatrolData {
  waypoints: THREE.Vector3[];
  currentIndex: number;
  speed: number;
}

export interface SkeletonInfo {
  type: string;
  boneCount: number;
  boneNames: string[];
  autoDetected: boolean;
}

/**
 * Extended properties we attach directly onto a THREE.Object3D (not via
 * `.userData`) for animation / patrol / skeleton bookkeeping.
 */
export interface ModelExtensions {
  _mixer?: THREE.AnimationMixer;
  _skeletonInfo?: SkeletonInfo;
  _proceduralSkeleton?: ProceduralSkeletonData;
  _isProceduralSkeletonAnimated?: boolean;
  _breathePhase?: number;
  _baseScale?: THREE.Vector3;
  _isProceduralAnimated?: boolean;
  _patrol?: PatrolData;
}

/** Narrow an Object3D to include our extension fields. */
export function asModelExt(obj: THREE.Object3D): ModelExtensions {
  return obj as unknown as ModelExtensions;
}

// ---------------------------------------------------------------------------
// AST node shapes (used when accessing `.template`, `.traits`, `.state` on
// loosely-typed parse results)
// ---------------------------------------------------------------------------

export interface ASTNodeWithTemplate {
  template?: string;
  traits?: unknown[];
  state?: Record<string, unknown>;
}

/** Access template/traits/state from a parsed AST node. */
export function asASTNode(obj: unknown): ASTNodeWithTemplate {
  return obj as ASTNodeWithTemplate;
}

// ---------------------------------------------------------------------------
// State-ref and handler-call shapes
// ---------------------------------------------------------------------------

export interface StateRef {
  __stateRef: string;
}

export function isStateRef(value: unknown): value is StateRef {
  return typeof value === 'object' && value !== null && '__stateRef' in value;
}

export interface HandlerCall {
  __call: { name: string; args: unknown[] };
}

export function isHandlerCall(value: unknown): value is HandlerCall {
  return typeof value === 'object' && value !== null && '__call' in value;
}

// ---------------------------------------------------------------------------
// XR Hand joint data (WebXR Hand Input not in standard TS lib)
// ---------------------------------------------------------------------------

export interface XRJointSpace {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface XRHandWithJoints {
  joints: Record<string, XRJointSpace | undefined>;
}

// ---------------------------------------------------------------------------
// Gamepad haptics (WebXR extensions not in standard TS lib)
// ---------------------------------------------------------------------------

// @ts-expect-error - TS2430 structural type mismatch
export interface GamepadWithVibration extends Gamepad {
  vibrationActuator?: {
    playEffect(
      type: string,
      params: {
        duration: number;
        strongMagnitude: number;
        weakMagnitude: number;
      }
    ): void;
  };
}

export interface HapticActuatorWithPulse {
  pulse(intensity: number, duration: number): void;
}

// ---------------------------------------------------------------------------
// THREE material prop bag (used when constructing materials dynamically)
// ---------------------------------------------------------------------------

export type DynamicMaterialProps = THREE.MeshStandardMaterialParameters &
  THREE.MeshPhysicalMaterialParameters;

// ---------------------------------------------------------------------------
// CANNON ↔ THREE position/quaternion bridge
// ---------------------------------------------------------------------------

/** A Vec3-like object with x, y, z (e.g. CANNON.Vec3). */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** A Quaternion-like object (e.g. CANNON.Quaternion). */
export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ---------------------------------------------------------------------------
// THREE.Object3D indexed property access
// ---------------------------------------------------------------------------

type AxisKey = 'x' | 'y' | 'z';

/** Safely read `obj.position[axis]` or `obj.rotation[axis]`. */
export function getVec3Component(vec: THREE.Vector3 | THREE.Euler, axis: string): number {
  return vec[axis as AxisKey] ?? 0;
}

// ---------------------------------------------------------------------------
// Directive model name helper
// ---------------------------------------------------------------------------

/** Read `.name` from a directive's model field safely. */
export function getModelName(model: THREE.Object3D): string {
  return model.name || 'unknown';
}
