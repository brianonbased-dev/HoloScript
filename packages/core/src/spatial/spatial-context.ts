/**
 * Spatial MCP - `SpatialMCPContext` + `SpatialMCPResponse` types.
 *
 * Canonical 3D-context payload that any MCP tool can declare as a first-class
 * param. v0.1 ships:
 *   - room geometry (PLY + AABB + floor),
 *   - gaze ray,
 *   - hand transforms (wrist + grip; per-finger out of scope),
 *   - controller poses (reuses `ControllerPose` from `@holoscript/core` traits),
 *   - headset pose,
 *   - free-form `meta`.
 *
 * Spec: research/2026-05-07_spatial-mcp-spec.md
 *
 * @version 0.1.0
 * @package @holoscript/core
 */

// =============================================================================
// VERSION + FRAME
// =============================================================================

/** Current schema version. Server rejects unknown majors. */
export const SPATIAL_CONTEXT_VERSION = '0.1' as const;
export type SpatialContextVersion = typeof SPATIAL_CONTEXT_VERSION;

/**
 * Reference frame. Named (not implicit) so v0.2 can introduce world-locked
 * frames without breaking v0.1. Default is right-handed, Y-up, meters,
 * tracking-space origin.
 */
export const SPATIAL_FRAME = 'tracking-space-y-up-meters' as const;
export type SpatialFrame = typeof SPATIAL_FRAME;

// =============================================================================
// CORE PRIMITIVES
//
// Spatial-namespaced primitive names (`SpatialVec3`, `SpatialQuat`,
// `SpatialAABB`) deliberately avoid the existing `Vec3` / `Quat` / `AABB`
// definitions scattered across `audio`, `composition`, `compiler`, `math`,
// `traits/*` etc. Re-exporting unscoped names from this module would create
// barrel-level collisions; namespacing keeps this module independent and
// safe to re-export from `barrel/index.ts`.
// =============================================================================

/** [x, y, z] in meters. */
export type SpatialVec3 = readonly [number, number, number];

/**
 * Quaternion in object form. Object form (not array) is deliberate:
 * F.041 / W.GOLD.514 - runtimes disagree on (w,x,y,z) vs (x,y,z,w) packing.
 * Naming the components prevents canonicalization rot at the type level.
 */
export interface SpatialQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Axis-aligned bounding box. */
export interface SpatialAABB {
  min: SpatialVec3;
  max: SpatialVec3;
}

// =============================================================================
// SPATIAL CONTEXT - v0.1
// =============================================================================

/**
 * Hand wrist transform + grip/pinch strength.
 * Per-finger joints (26 per hand) are deliberately out of scope v0.1.
 */
export interface HandTransform {
  position: SpatialVec3;
  rotation: SpatialQuat;
  /** 0..1 grip strength. Bridges Quest hand tracking without exposing all joints. */
  grip: number;
  /** 0..1 pinch strength (thumb-index distance, normalized). Optional. */
  pinch?: number;
}

/**
 * Controller pose - wire-compatible with `ControllerPose` from
 * `traits/ControllerInputTrait.ts:45`. Re-declared here (not imported) to keep
 * the spatial module independent of the trait subsystem; both shapes share
 * `position` + `rotation` + optional motion vectors.
 */
export interface SpatialControllerPose {
  position: SpatialVec3;
  rotation: SpatialQuat;
  /** Linear velocity in m/s. Optional. */
  velocity?: SpatialVec3;
  /** Angular velocity in rad/s. Optional. */
  angularVelocity?: SpatialVec3;
}

/**
 * Gaze ray in `tracking-space-y-up-meters`.
 * `direction` MUST be a unit vector (validator enforces |dir|~1).
 */
export interface SpatialMCPGazeRay {
  origin: SpatialVec3;
  direction: SpatialVec3;
  /** Distance to first hit, if the headset already raycast. Optional. */
  hitDistance?: number;
}

/** Headset pose. Useful for "where am I looking from" without recomputing. */
export interface HeadsetPose {
  position: SpatialVec3;
  rotation: SpatialQuat;
}

/**
 * Room geometry. Optional - agents that don't need geometry skip it.
 *
 * `pointCloudPly` is ASCII PLY (xyz/xyz+rgb) - same wire format
 * `holo_reconstruct_export` emits. A HoloMap session output is directly
 * usable as `room.pointCloudPly`.
 */
export interface RoomGeometry {
  pointCloudPly?: string;
  aabb?: SpatialAABB;
  /** Y coordinate of the floor plane, if known. */
  floorHeight?: number;
}

/**
 * Canonical Spatial MCP payload (v0.1).
 *
 * Every top-level field except `version` and `frame` is optional. Tools
 * compose: a tool that only needs gaze does not require the caller to send
 * hands.
 */
export interface SpatialMCPContext {
  version: SpatialContextVersion;
  frame: SpatialFrame;
  room?: RoomGeometry;
  gaze?: SpatialMCPGazeRay;
  hands?: { left?: HandTransform; right?: HandTransform };
  controllers?: { left?: SpatialControllerPose; right?: SpatialControllerPose };
  headset?: HeadsetPose;
  meta?: Record<string, string | number | boolean>;
}

// =============================================================================
// SPATIAL RESPONSE - v0.1
// =============================================================================

/** Spawn / move / highlight / remove ops the headset can apply imperatively. */
export type ScenePatchOp =
  | { op: 'spawn'; id: string; position: SpatialVec3; trait?: string }
  | { op: 'move'; id: string; position: SpatialVec3 }
  | { op: 'highlight'; id: string; color?: string }
  | { op: 'remove'; id: string };

/**
 * Dual-channel response: `text` always present (chat-only clients still work);
 * `holo` / `scenePatch` opt-in (spatial clients get something to render).
 */
export interface SpatialMCPResponse {
  text: string;
  holo?: string;
  scenePatch?: ScenePatchOp[];
  frame: SpatialFrame;
  version: SpatialContextVersion;
}

// =============================================================================
// VALIDATION
// =============================================================================

export interface SpatialValidationError {
  path: string;
  message: string;
}

export interface SpatialValidationResult {
  ok: boolean;
  errors: SpatialValidationError[];
}

const FINITE = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isVec3 = (v: unknown): v is SpatialVec3 =>
  Array.isArray(v) && v.length === 3 && v.every(FINITE);

const isQuat = (v: unknown): v is SpatialQuat => {
  if (!v || typeof v !== 'object') return false;
  const q = v as Record<string, unknown>;
  return FINITE(q.x) && FINITE(q.y) && FINITE(q.z) && FINITE(q.w);
};

/**
 * Validate a `SpatialMCPContext` payload. Returns a list of errors; an empty
 * list means the payload is acceptable. The validator is deliberately strict
 * about:
 *   - schema version (must equal `SPATIAL_CONTEXT_VERSION`),
 *   - frame (must equal `SPATIAL_FRAME`),
 *   - finiteness (no NaN/Infinity in any number),
 *   - gaze direction unit-length (tolerance 1e-3),
 *   - hand grip/pinch in [0,1].
 */
export function validateSpatialContext(input: unknown): SpatialValidationResult {
  const errors: SpatialValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message });

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: [{ path: '$', message: 'must be an object' }] };
  }
  const ctx = input as Record<string, unknown>;

  if (ctx.version !== SPATIAL_CONTEXT_VERSION) {
    push('version', `must equal "${SPATIAL_CONTEXT_VERSION}" (got ${JSON.stringify(ctx.version)})`);
  }
  if (ctx.frame !== SPATIAL_FRAME) {
    push('frame', `must equal "${SPATIAL_FRAME}" (got ${JSON.stringify(ctx.frame)})`);
  }

  // gaze
  if (ctx.gaze !== undefined) {
    const g = ctx.gaze as Record<string, unknown> | null;
    if (!g || typeof g !== 'object') {
      push('gaze', 'must be an object when present');
    } else {
      if (!isVec3(g.origin)) push('gaze.origin', 'must be [x,y,z] of finite numbers');
      if (!isVec3(g.direction)) {
        push('gaze.direction', 'must be [x,y,z] of finite numbers');
      } else {
        const [dx, dy, dz] = g.direction;
        const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (Math.abs(mag - 1) > 1e-3) {
          push('gaze.direction', `must be a unit vector (|dir|=${mag.toFixed(4)})`);
        }
      }
      if (g.hitDistance !== undefined && !FINITE(g.hitDistance)) {
        push('gaze.hitDistance', 'must be a finite number when present');
      }
    }
  }

  // headset
  if (ctx.headset !== undefined) {
    const h = ctx.headset as Record<string, unknown> | null;
    if (!h || typeof h !== 'object') {
      push('headset', 'must be an object when present');
    } else {
      if (!isVec3(h.position)) push('headset.position', 'must be [x,y,z] of finite numbers');
      if (!isQuat(h.rotation)) push('headset.rotation', 'must be {x,y,z,w} of finite numbers');
    }
  }

  // hands
  if (ctx.hands !== undefined) {
    const hands = ctx.hands as Record<string, unknown> | null;
    if (!hands || typeof hands !== 'object') {
      push('hands', 'must be an object when present');
    } else {
      for (const side of ['left', 'right'] as const) {
        const hand = hands[side];
        if (hand === undefined) continue;
        if (!hand || typeof hand !== 'object') {
          push(`hands.${side}`, 'must be an object when present');
          continue;
        }
        const h = hand as Record<string, unknown>;
        if (!isVec3(h.position)) push(`hands.${side}.position`, 'must be [x,y,z]');
        if (!isQuat(h.rotation)) push(`hands.${side}.rotation`, 'must be {x,y,z,w}');
        if (!FINITE(h.grip) || (h.grip as number) < 0 || (h.grip as number) > 1) {
          push(`hands.${side}.grip`, 'must be a finite number in [0,1]');
        }
        if (h.pinch !== undefined) {
          if (!FINITE(h.pinch) || (h.pinch as number) < 0 || (h.pinch as number) > 1) {
            push(`hands.${side}.pinch`, 'must be a finite number in [0,1] when present');
          }
        }
      }
    }
  }

  // controllers
  if (ctx.controllers !== undefined) {
    const ctls = ctx.controllers as Record<string, unknown> | null;
    if (!ctls || typeof ctls !== 'object') {
      push('controllers', 'must be an object when present');
    } else {
      for (const side of ['left', 'right'] as const) {
        const ctl = ctls[side];
        if (ctl === undefined) continue;
        if (!ctl || typeof ctl !== 'object') {
          push(`controllers.${side}`, 'must be an object when present');
          continue;
        }
        const c = ctl as Record<string, unknown>;
        if (!isVec3(c.position)) push(`controllers.${side}.position`, 'must be [x,y,z]');
        if (!isQuat(c.rotation)) push(`controllers.${side}.rotation`, 'must be {x,y,z,w}');
        if (c.velocity !== undefined && !isVec3(c.velocity)) {
          push(`controllers.${side}.velocity`, 'must be [x,y,z] when present');
        }
        if (c.angularVelocity !== undefined && !isVec3(c.angularVelocity)) {
          push(`controllers.${side}.angularVelocity`, 'must be [x,y,z] when present');
        }
      }
    }
  }

  // room
  if (ctx.room !== undefined) {
    const room = ctx.room as Record<string, unknown> | null;
    if (!room || typeof room !== 'object') {
      push('room', 'must be an object when present');
    } else {
      if (room.pointCloudPly !== undefined && typeof room.pointCloudPly !== 'string') {
        push('room.pointCloudPly', 'must be a string when present');
      }
      if (room.aabb !== undefined) {
        const aabb = room.aabb as Record<string, unknown>;
        if (!isVec3(aabb.min)) push('room.aabb.min', 'must be [x,y,z]');
        if (!isVec3(aabb.max)) push('room.aabb.max', 'must be [x,y,z]');
      }
      if (room.floorHeight !== undefined && !FINITE(room.floorHeight)) {
        push('room.floorHeight', 'must be a finite number when present');
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// =============================================================================
// PLACEMENT HELPERS
// =============================================================================

/**
 * Pick a placement point from a `SpatialMCPContext`, in priority order:
 *   1. gaze hit (origin + direction * hitDistance), if both present;
 *   2. dominant-hand grip pose (right hand preferred, else left);
 *   3. controller pose (right preferred, else left);
 *   4. AABB center;
 *   5. headset position;
 *   6. world origin [0, 0, 0].
 *
 * Returns the chosen [x,y,z] plus a label naming the source for diagnostics.
 */
export interface PlacementChoice {
  position: SpatialVec3;
  source:
    | 'gaze-hit'
    | 'gaze-ray'
    | 'hand-right'
    | 'hand-left'
    | 'controller-right'
    | 'controller-left'
    | 'aabb-center'
    | 'headset'
    | 'origin';
}

export function pickPlacement(ctx: SpatialMCPContext): PlacementChoice {
  // 1 & 1b. gaze
  if (ctx.gaze) {
    const { origin, direction, hitDistance } = ctx.gaze;
    if (FINITE(hitDistance)) {
      return {
        position: [
          origin[0] + direction[0] * hitDistance,
          origin[1] + direction[1] * hitDistance,
          origin[2] + direction[2] * hitDistance,
        ],
        source: 'gaze-hit',
      };
    }
    // Fallback: 1m along the gaze ray.
    return {
      position: [
        origin[0] + direction[0],
        origin[1] + direction[1],
        origin[2] + direction[2],
      ],
      source: 'gaze-ray',
    };
  }

  // 2. dominant-hand
  if (ctx.hands?.right) return { position: ctx.hands.right.position, source: 'hand-right' };
  if (ctx.hands?.left) return { position: ctx.hands.left.position, source: 'hand-left' };

  // 3. controller
  if (ctx.controllers?.right) {
    return { position: ctx.controllers.right.position, source: 'controller-right' };
  }
  if (ctx.controllers?.left) {
    return { position: ctx.controllers.left.position, source: 'controller-left' };
  }

  // 4. AABB center
  if (ctx.room?.aabb) {
    const { min, max } = ctx.room.aabb;
    return {
      position: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      source: 'aabb-center',
    };
  }

  // 5. headset
  if (ctx.headset) return { position: ctx.headset.position, source: 'headset' };

  // 6. origin
  return { position: [0, 0, 0], source: 'origin' };
}
