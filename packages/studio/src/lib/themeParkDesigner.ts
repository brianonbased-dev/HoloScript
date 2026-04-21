/**
 * themeParkDesigner.ts — Theme Park Ride & Experience Engine
 *
 * Ride physics (G-forces, velocity), queue simulation,
 * capacity planning, experience scoring, and park layout.
 */

export type Vec2 = [number, number];

export type RideType =
  | 'coaster'
  | 'flat'
  | 'dark-ride'
  | 'water'
  | 'drop-tower'
  | 'spinner'
  | 'simulator';
export type ThrillLevel = 'family' | 'moderate' | 'thrill' | 'extreme';
export type QueueStatus = 'open' | 'closed' | 'delayed' | 'full';

export interface RideProfile {
  id: string;
  name: string;
  type: RideType;
  thrillLevel: ThrillLevel;
  topSpeedKmh: number;
  heightM: number;
  maxGForce: number;
  durationSec: number;
  capacityPerHour: number;
  minHeightCm: number; // Rider requirement
  maxHeightCm?: number;
}

export interface RideSegment {
  id: string;
  name: string;
  velocityKmh: number;
  heightM: number;
  gForce: number;
  bankAngleDeg: number;
  durationSec: number;
}

export interface QueueState {
  rideId: string;
  currentWaitMin: number;
  queueLength: number;
  status: QueueStatus;
  virtualQueueEnabled: boolean;
  fastPassRatio: number; // 0-1 (portion reserved for fast pass)
}

export interface ParkSection {
  id: string;
  name: string;
  theme: string;
  rides: string[]; // Ride IDs
  restaurants: number;
  restrooms: number;
  capacity: number;
}

// ═══════════════════════════════════════════════════════════════════
// Ride Physics
// ═══════════════════════════════════════════════════════════════════

export function velocityFromDrop(heightM: number): number {
  // v = √(2gh), convert m/s to km/h
  return Math.sqrt(2 * 9.81 * heightM) * 3.6;
}

export function gForceInLoop(velocityKmh: number, radiusM: number): number {
  const vMs = velocityKmh / 3.6;
  return vMs ** 2 / (radiusM * 9.81) + 1; // +1 for gravity
}

export function gForceInBank(velocityKmh: number, radiusM: number, bankDeg: number): number {
  const vMs = velocityKmh / 3.6;
  const bankRad = (bankDeg * Math.PI) / 180;
  return vMs ** 2 / (radiusM * 9.81 * Math.cos(bankRad));
}

export function isSafeGForce(g: number): boolean {
  return g >= -1 && g <= 6; // Theme park safety limits
}

export function totalRideDuration(segments: RideSegment[]): number {
  return segments.reduce((sum, s) => sum + s.durationSec, 0);
}

export function peakGForce(segments: RideSegment[]): number {
  return Math.max(...segments.map((s) => s.gForce));
}

export function peakSpeed(segments: RideSegment[]): number {
  return Math.max(...segments.map((s) => s.velocityKmh));
}

// ═══════════════════════════════════════════════════════════════════
// Queue Management
// ═══════════════════════════════════════════════════════════════════

export function estimatedWaitMinutes(
  queueLength: number,
  capacityPerHour: number,
  fastPassRatio: number
): number {
  const effectiveCapacity = capacityPerHour * (1 - fastPassRatio);
  if (effectiveCapacity <= 0) return Infinity;
  return (queueLength / effectiveCapacity) * 60;
}

export function dailyThroughput(ride: RideProfile, operatingHours: number): number {
  return ride.capacityPerHour * operatingHours;
}

export function canRide(ride: RideProfile, guestHeightCm: number): boolean {
  if (guestHeightCm < ride.minHeightCm) return false;
  if (ride.maxHeightCm && guestHeightCm > ride.maxHeightCm) return false;
  return true;
}

export function parkCapacity(sections: ParkSection[]): number {
  return sections.reduce((sum, s) => sum + s.capacity, 0);
}

export function thrillScore(ride: RideProfile): number {
  // 0-100 composite score
  const speedFactor = Math.min(30, ride.topSpeedKmh / 5);
  const heightFactor = Math.min(30, ride.heightM / 3);
  const gFactor = Math.min(30, ride.maxGForce * 6);
  const durationFactor = Math.min(10, ride.durationSec / 30);
  return Math.round(speedFactor + heightFactor + gFactor + durationFactor);
}

// ═══════════════════════════════════════════════════════════════════
// Crowd Flow Simulation (Agent-Based)
// ═══════════════════════════════════════════════════════════════════

export interface CrowdAgent {
  id: string;
  position: Vec2;
  target: Vec2;
  speed: number;
}

/**
 * Simulate crowd flow: each agent moves toward its target, avoiding
 * other agents. Returns agent positions after `steps` iterations.
 */
export function crowdFlowSimulation(
  agents: CrowdAgent[],
  steps: number,
  dt: number,
  avoidanceRadius: number
): CrowdAgent[] {
  const result = agents.map((a) => ({
    ...a,
    position: [...a.position] as Vec2,
    target: [...a.target] as Vec2,
  }));

  for (let s = 0; s < steps; s++) {
    for (const agent of result) {
      // Direction to target
      let dx = agent.target[0] - agent.position[0];
      let dy = agent.target[1] - agent.position[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1) continue; // Arrived

      dx /= dist;
      dy /= dist;

      for (const other of result) {
        if (other.id === agent.id) continue;
        const ox = agent.position[0] - other.position[0];
        const oy = agent.position[1] - other.position[1];
        const od = Math.sqrt(ox * ox + oy * oy);
        if (od < avoidanceRadius && od > 0.01) {
          dx += (ox / od) * 0.5;
          dy += (oy / od) * 0.5;
        }
      }

      // Normalize and apply
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 0.01) {
        agent.position[0] += (dx / mag) * agent.speed * dt;
        agent.position[1] += (dy / mag) * agent.speed * dt;
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// VR Ride Overlay
// ═══════════════════════════════════════════════════════════════════

export interface VROverlay {
  rideId: string;
  type: 'particle' | 'hologram' | 'portal' | 'character';
  triggerGForce: number; // Activate above this G
  intensityScale: number;
}

/**
 * Compute VR overlay immersion score based on ride profile and overlay count.
 */
export function vrRideOverlayScore(ride: RideProfile, overlays: VROverlay[]): number {
  const activeOverlays = overlays.filter((o) => ride.maxGForce >= o.triggerGForce);
  const baseScore = activeOverlays.reduce((sum, o) => sum + o.intensityScale * 10, 0);
  const thrillMultiplier = 1 + thrillScore(ride) / 100;
  return Math.round(baseScore * thrillMultiplier);
}
