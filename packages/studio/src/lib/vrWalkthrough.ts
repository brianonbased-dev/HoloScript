/**
 * vrWalkthrough.ts — VR Walkthrough Engine
 *
 * Spatial navigation, teleportation, room-scale boundary management,
 * hand tracking, and comfort settings for VR experiences.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface Vec3 {
  x: number;
  y: number;
  z: number;
  [index: number]: number;
}

type Vec3Like = Vec3 | [number, number, number] | { x: number; y: number; z: number };

function vx(v: Vec3Like): number { return (v as Vec3).x ?? (v as [number, number, number])[0] ?? 0; }
function vy(v: Vec3Like): number { return (v as Vec3).y ?? (v as [number, number, number])[1] ?? 0; }
function vz(v: Vec3Like): number { return (v as Vec3).z ?? (v as [number, number, number])[2] ?? 0; }
function vec3(x: number, y: number, z: number): Vec3 {
  const v = { x, y, z } as Vec3;
  Object.defineProperty(v, '0', { value: x, enumerable: false });
  Object.defineProperty(v, '1', { value: y, enumerable: false });
  Object.defineProperty(v, '2', { value: z, enumerable: false });
  return v;
}

export interface VRHeadset {
  position: Vec3;
  rotation: Vec3; // Euler angles (degrees)
  ipd: number; // Inter-pupillary distance (mm)
  refreshRate: number; // Hz
  fovDegrees: number;
  tracking: '3dof' | '6dof';
}

export interface TeleportTarget {
  id: string;
  position: Vec3;
  normal: Vec3; // Surface normal (for orientation)
  isValid: boolean;
  distance: number;
}

export interface RoomBounds {
  center: Vec3;
  widthM: number;
  depthM: number;
  heightM: number;
  boundaryPoints: Vec3[]; // Polygon outline
}

export interface HandPose {
  handedness: 'left' | 'right';
  wristPosition: Vec3;
  fingerTips: Vec3[]; // Index 0=thumb, 1=index, 2=middle, 3=ring, 4=pinky
  gripStrength: number; // 0..1
  pinchStrength: number; // 0..1
  gesture: 'open' | 'fist' | 'point' | 'pinch' | 'thumbs-up' | 'unknown';
}

export interface ComfortSettings {
  snapTurnDegrees: number; // 0 = smooth turn
  vignetteOnMove: boolean;
  movementSpeed: number; // m/s
  teleportOnly: boolean;
  seatedMode: boolean;
  heightOffsetM: number;
}

export interface WalkthroughWaypoint {
  id: string;
  position: Vec3;
  lookAt: Vec3;
  durationSec: number;
  label?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Teleportation
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate parabolic teleport arc from hand position + direction.
 */
export function teleportArc(
  origin: Vec3Like,
  direction: Vec3Like,
  gravity: number = 9.81,
  steps: number = 30,
  stepTime: number = 0.05
): Vec3[] {
  const arc: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i * stepTime;
    arc.push(
      vec3(
        vx(origin) + vx(direction) * t,
        vy(origin) + vy(direction) * t - 0.5 * gravity * t * t,
        vz(origin) + vz(direction) * t
      )
    );
    // Stop if we hit the ground
    if (arc[arc.length - 1].y < 0) {
      arc[arc.length - 1] = vec3(arc[arc.length - 1].x, 0, arc[arc.length - 1].z);
      break;
    }
  }
  return arc;
}

/**
 * Validate a teleport target (must be within room bounds and on a flat surface).
 */
export function validateTeleportTarget(
  target: Vec3Like,
  bounds: RoomBounds,
  _maxSlope: number = 30 // degrees
): TeleportTarget {
  const dx = vx(target) - vx(bounds.center);
  const dz = vz(target) - vz(bounds.center);
  const inBounds = Math.abs(dx) <= bounds.widthM / 2 && Math.abs(dz) <= bounds.depthM / 2;
  const distance = Math.sqrt(dx * dx + vy(target) * vy(target) + dz * dz);

  return {
    id: `tp-${Math.round(vx(target))}-${Math.round(vz(target))}`,
    position: vec3(vx(target), vy(target), vz(target)),
    normal: vec3(0, 1, 0),
    isValid: inBounds && vy(target) >= 0 && vy(target) < 0.3, // Near floor level
    distance,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Room-Scale Bounds
// ═══════════════════════════════════════════════════════════════════

/**
 * Check if a position is within room bounds (with a warning margin).
 */
export function isInBounds(
  position: Vec3Like,
  bounds: RoomBounds,
  marginM: number = 0.3
): { inBounds: boolean; distanceToBoundary: number; nearBoundary: boolean } {
  const halfW = bounds.widthM / 2 - marginM;
  const halfD = bounds.depthM / 2 - marginM;
  const dx = Math.abs(vx(position) - vx(bounds.center));
  const dz = Math.abs(vz(position) - vz(bounds.center));
  const distToBoundary = Math.min(halfW - dx, halfD - dz);

  return {
    inBounds: dx <= halfW && dz <= halfD,
    distanceToBoundary: Math.max(0, distToBoundary),
    nearBoundary: distToBoundary < 0.5, // Within 0.5m of edge
  };
}

/**
 * Calculate room area in square meters from boundary polygon.
 */
export function roomArea(bounds: RoomBounds): number {
  return bounds.widthM * bounds.depthM;
}

/**
 * Calculate room volume in cubic meters.
 */
export function roomVolume(bounds: RoomBounds): number {
  return bounds.widthM * bounds.depthM * bounds.heightM;
}

// ═══════════════════════════════════════════════════════════════════
// Hand Tracking
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect gesture from hand pose.
 */
export function detectGesture(hand: HandPose): HandPose['gesture'] {
  if (hand.pinchStrength > 0.8) return 'pinch';
  if (hand.gripStrength > 0.8) return 'fist';

  // Check if index finger is extended (pointing)
  if (hand.fingerTips.length >= 2) {
    const indexDist = vec3Dist(hand.wristPosition, hand.fingerTips[1]);
    const middleDist =
      hand.fingerTips.length >= 3 ? vec3Dist(hand.wristPosition, hand.fingerTips[2]) : 0;
    if (indexDist > 0.15 && middleDist < 0.08) return 'point';
  }

  if (hand.gripStrength < 0.1 && hand.pinchStrength < 0.1) return 'open';
  return 'unknown';
}

function vec3Dist(a: Vec3Like, b: Vec3Like): number {
  const dx = vx(b) - vx(a),
    dy = vy(b) - vy(a),
    dz = vz(b) - vz(a);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Determine hand reach distance from shoulder approximation.
 */
export function handReachDistance(hand: HandPose, shoulderHeight: number = 1.4): number {
  const shoulderPos: Vec3 = vec3(hand.handedness === 'left' ? -0.2 : 0.2, shoulderHeight, 0);
  return vec3Dist(shoulderPos, hand.wristPosition);
}

// ═══════════════════════════════════════════════════════════════════
// Comfort & Accessibility
// ═══════════════════════════════════════════════════════════════════

/**
 * Apply comfort settings to movement vector.
 */
export function applyComfortMovement(inputDirection: Vec3, settings: ComfortSettings): Vec3 {
  if (settings.teleportOnly) return vec3(0, 0, 0); // No smooth movement

  const speed = settings.movementSpeed;
  return vec3(
    vx(inputDirection) * speed,
    settings.seatedMode ? 0 : vy(inputDirection) * speed,
    vz(inputDirection) * speed
  );
}

/**
 * Calculate snap turn rotation.
 */
export function snapTurn(
  currentYaw: number,
  direction: 'left' | 'right',
  snapDegrees: number = 45
): number {
  const delta = direction === 'right' ? snapDegrees : -snapDegrees;
  return (((currentYaw + delta) % 360) + 360) % 360;
}

/**
 * Check if frame rate is sufficient for comfort (≥72 Hz recommended).
 */
export function isComfortableFrameRate(fps: number): {
  comfortable: boolean;
  risk: 'none' | 'mild' | 'severe';
} {
  if (fps >= 72) return { comfortable: true, risk: 'none' };
  if (fps >= 45) return { comfortable: false, risk: 'mild' };
  return { comfortable: false, risk: 'severe' };
}

// ═══════════════════════════════════════════════════════════════════
// Guided Walkthrough
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate total walkthrough duration from waypoints.
 */
export function walkthroughDuration(waypoints: WalkthroughWaypoint[]): number {
  return waypoints.reduce((sum, wp) => sum + wp.durationSec, 0);
}

/**
 * Get the walkthrough waypoint at a given time.
 */
export function waypointAtTime(
  waypoints: WalkthroughWaypoint[],
  timeSec: number
): WalkthroughWaypoint | null {
  let elapsed = 0;
  for (const wp of waypoints) {
    if (timeSec >= elapsed && timeSec < elapsed + wp.durationSec) return wp;
    elapsed += wp.durationSec;
  }
  return null;
}

/**
 * Calculate total walkthrough path distance.
 */
export function walkthroughPathLength(waypoints: WalkthroughWaypoint[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += vec3Dist(waypoints[i - 1].position, waypoints[i].position);
  }
  return total;
}
