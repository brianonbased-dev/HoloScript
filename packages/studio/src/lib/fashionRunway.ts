/**
 * fashionRunway.ts — Fashion Runway Choreography Engine
 *
 * Model walk path planning, music-synced camera cuts, garment physics,
 * lighting cue integration, and show timing management.
 */

export interface Vec2 { x: number; y: number }

export type WalkStyle = 'standard' | 'editorial' | 'casual' | 'dramatic' | 'avant-garde';
export type GarmentType = 'dress' | 'suit' | 'gown' | 'streetwear' | 'couture' | 'swimwear' | 'outerwear';
export type CameraAngle = 'front' | 'side' | 'overhead' | 'close-up' | 'detail' | 'audience';
export type FabricPhysics = 'rigid' | 'flowing' | 'structured' | 'sheer' | 'heavy';

export interface ModelProfile {
  id: string;
  name: string;
  walkStyle: WalkStyle;
  walkSpeedMPS: number;     // meters per second
  heightCm: number;
  outfitIds: string[];
}

export interface RunwayPath {
  id: string;
  waypoints: Vec2[];
  pausePoints: Vec2[];       // Pose stops
  pauseDurationSec: number;
  totalLengthM: number;
}

export interface Outfit {
  id: string;
  designerName: string;
  garmentType: GarmentType;
  fabricPhysics: FabricPhysics;
  trainLengthM: number;      // Trailing fabric length
  color: string;
  description: string;
}

export interface CameraCut {
  id: string;
  angle: CameraAngle;
  startTimeSec: number;
  durationSec: number;
  targetModelId: string;
  zoom: number;              // 1.0 = wide, 3.0 = close
  transition: 'cut' | 'dissolve' | 'pan' | 'whip';
}

export interface ShowSegment {
  id: string;
  name: string;
  models: string[];
  musicTrack: string;
  bpm: number;
  durationSec: number;
  lightingCue: string;
}

// ═══════════════════════════════════════════════════════════════════
// Path & Timing
// ═══════════════════════════════════════════════════════════════════

export function pathLength(waypoints: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

export function walkDuration(path: RunwayPath, model: ModelProfile): number {
  const walkTime = path.totalLengthM / model.walkSpeedMPS;
  const pauseTime = path.pausePoints.length * path.pauseDurationSec;
  return walkTime + pauseTime;
}

export function modelPositionAtTime(
  path: RunwayPath,
  model: ModelProfile,
  elapsedSec: number
): Vec2 {
  const distanceTraveled = elapsedSec * model.walkSpeedMPS;
  let accumulated = 0;
  for (let i = 1; i < path.waypoints.length; i++) {
    const dx = path.waypoints[i].x - path.waypoints[i - 1].x;
    const dy = path.waypoints[i].y - path.waypoints[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (accumulated + segLen >= distanceTraveled) {
      const frac = (distanceTraveled - accumulated) / segLen;
      return {
        x: path.waypoints[i - 1].x + dx * frac,
        y: path.waypoints[i - 1].y + dy * frac,
      };
    }
    accumulated += segLen;
  }
  return path.waypoints[path.waypoints.length - 1]; // End of path
}

// ═══════════════════════════════════════════════════════════════════
// Camera & Editing
// ═══════════════════════════════════════════════════════════════════

export function cameraSequenceDuration(cuts: CameraCut[]): number {
  if (cuts.length === 0) return 0;
  const last = cuts.reduce((max, c) => c.startTimeSec + c.durationSec > max ? c.startTimeSec + c.durationSec : max, 0);
  return last;
}

export function activeCameraAtTime(cuts: CameraCut[], timeSec: number): CameraCut | null {
  return cuts.find(c => timeSec >= c.startTimeSec && timeSec < c.startTimeSec + c.durationSec) ?? null;
}

export function cutCountByAngle(cuts: CameraCut[]): Record<CameraAngle, number> {
  const counts: Record<CameraAngle, number> = { front: 0, side: 0, overhead: 0, 'close-up': 0, detail: 0, audience: 0 };
  for (const c of cuts) counts[c.angle]++;
  return counts;
}

// ═══════════════════════════════════════════════════════════════════
// Garment Physics
// ═══════════════════════════════════════════════════════════════════

export function fabricSwayFactor(physics: FabricPhysics): number {
  const factors: Record<FabricPhysics, number> = { rigid: 0.05, structured: 0.15, heavy: 0.2, flowing: 0.8, sheer: 0.9 };
  return factors[physics];
}

export function trainDragAdjustment(trainLengthM: number, walkSpeed: number): number {
  // Longer trains + faster walks = more drag
  return Math.min(0.3, trainLengthM * 0.05 * walkSpeed);
}

export function showTotalDuration(segments: ShowSegment[]): number {
  return segments.reduce((sum, s) => sum + s.durationSec, 0);
}
