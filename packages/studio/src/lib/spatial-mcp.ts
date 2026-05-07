/**
 * Spatial MCP — VR-side helper.
 *
 * Builds a v0.1 `SpatialMCPContext` payload from already-snapshotted XR state.
 * Deliberately does NOT touch `navigator.xr` directly — callers pass in
 * snapshotted poses. This keeps the helper unit-testable in Node and lets
 * the call site decide how to read the XR session (R3F hooks, raw WebXR,
 * Quest native bridge, mocked test fixtures).
 *
 * Companion to `compile_to_spatial` MCP tool. Spec:
 * research/2026-05-07_spatial-mcp-spec.md (task_1778114195597_jira).
 */

import {
  SPATIAL_CONTEXT_VERSION,
  SPATIAL_FRAME,
  validateSpatialContext,
  type SpatialMCPContext,
  type SpatialControllerPose,
  type HandTransform,
  type SpatialMCPGazeRay,
  type HeadsetPose,
  type RoomGeometry,
  type SpatialQuat,
  type SpatialVec3,
  type SpatialValidationError,
} from '@holoscript/core';

export interface EmitSpatialContextInput {
  room?: RoomGeometry;
  gaze?: SpatialMCPGazeRay;
  hands?: { left?: HandTransform; right?: HandTransform };
  controllers?: { left?: SpatialControllerPose; right?: SpatialControllerPose };
  headset?: HeadsetPose;
  meta?: Record<string, string | number | boolean>;
}

export interface EmitSpatialContextResult {
  /** Payload ready to forward to a `compile_to_spatial` MCP call. */
  payload: SpatialMCPContext;
  /** True when the payload passed `validateSpatialContext`. */
  valid: boolean;
  /** Validation errors (empty when `valid` is true). */
  errors: SpatialValidationError[];
}

const ZERO_VEC: SpatialVec3 = [0, 0, 0];
const IDENTITY_QUAT: SpatialQuat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Normalize a 3-vector. If magnitude is below `eps`, returns the input
 * unchanged (caller is responsible for handling degenerate gaze rays —
 * `validateSpatialContext` will reject magnitude-zero directions).
 */
export function normalizeVec3(v: SpatialVec3, eps = 1e-6): SpatialVec3 {
  const [x, y, z] = v;
  const mag = Math.sqrt(x * x + y * y + z * z);
  if (mag < eps) return v;
  return [x / mag, y / mag, z / mag];
}

/**
 * Build a `SpatialMCPContext` payload, normalize the gaze direction, and run
 * the validator. Returns `{ payload, valid, errors }`. The payload is
 * always returned (even when invalid) so call sites can log + drop or
 * surface validation errors back to the user.
 */
export function emitSpatialContext(
  input: EmitSpatialContextInput
): EmitSpatialContextResult {
  // Normalize gaze direction so the strict unit-vector check in
  // validateSpatialContext doesn't reject sub-pixel float drift coming out
  // of the headset.
  const gaze: SpatialMCPGazeRay | undefined = input.gaze
    ? { ...input.gaze, direction: normalizeVec3(input.gaze.direction) }
    : undefined;

  const payload: SpatialMCPContext = {
    version: SPATIAL_CONTEXT_VERSION,
    frame: SPATIAL_FRAME,
    ...(input.room !== undefined ? { room: input.room } : {}),
    ...(gaze !== undefined ? { gaze } : {}),
    ...(input.hands !== undefined ? { hands: input.hands } : {}),
    ...(input.controllers !== undefined ? { controllers: input.controllers } : {}),
    ...(input.headset !== undefined ? { headset: input.headset } : {}),
    ...(input.meta !== undefined ? { meta: input.meta } : {}),
  };

  const v = validateSpatialContext(payload);
  return { payload, valid: v.ok, errors: v.errors };
}

/**
 * Build an empty (legal but information-free) `SpatialMCPContext`. Useful as
 * a fallback when the headset hasn't yet locked tracking — the agent still
 * gets a valid payload and can return a placement at world origin.
 */
export function emptySpatialContext(): SpatialMCPContext {
  return { version: SPATIAL_CONTEXT_VERSION, frame: SPATIAL_FRAME };
}

/** Re-export of the identity primitives so call sites have one source. */
export const SPATIAL_IDENTITY = Object.freeze({
  zeroVec: ZERO_VEC,
  identityQuat: IDENTITY_QUAT,
}) as Readonly<{ zeroVec: SpatialVec3; identityQuat: SpatialQuat }>;
