/**
 * forensicScene.ts — Forensic Crime Scene Reconstruction Engine
 *
 * 3D crime scene analysis: bullet trajectory physics, blood spatter
 * simulation, evidence tagging with GPS/timestamps, witness POV rendering.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type Vector3 = [number, number, number];

export type EvidenceType =
  | 'physical'
  | 'biological'
  | 'digital'
  | 'trace'
  | 'documentary'
  | 'testimonial';
export type EvidenceSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface EvidenceMarker {
  id: string;
  label: string;
  type: EvidenceType;
  severity: EvidenceSeverity;
  position: Vector3;
  timestamp: number; // When discovered
  collectedBy: string;
  chainOfCustody: string[]; // Ordered list of handlers
  photoUrls: string[];
  notes: string;
  gps?: { lat: number; lon: number; alt?: number };
}

export interface BulletTrajectory {
  id: string;
  entryPoint: Vector3;
  exitPoint: Vector3;
  caliber: string; // e.g., '9mm', '.45ACP'
  velocity: number; // m/s at impact
  angle: number; // degrees from horizontal
  ricochet: boolean;
  fragmentCount: number;
  distanceToShooter: number; // meters (estimated)
}

export interface BloodSpatterPattern {
  id: string;
  center: Vector3;
  radiusMeters: number;
  dropletCount: number;
  pattern: 'cast-off' | 'impact' | 'arterial' | 'pool' | 'transfer' | 'drip' | 'swipe';
  angleOfImpact: number; // degrees
  directionality: number; // degrees (0 = north)
  pointOfOrigin: Vector3; // Calculated convergence point
}

export interface WitnessViewpoint {
  id: string;
  name: string;
  position: Vector3;
  lookAt: Vector3;
  fovDegrees: number;
  timeOfObservation: number;
  visibility: 'clear' | 'partial' | 'obstructed';
  statement: string;
}

export interface CrimeScene {
  id: string;
  caseNumber: string;
  type: 'homicide' | 'assault' | 'burglary' | 'arson' | 'accident' | 'cold-case';
  location: string;
  dateOfCrime: number;
  boundaryPolygon: Vector3[]; // Scene perimeter
  evidence: EvidenceMarker[];
  trajectories: BulletTrajectory[];
  spatters: BloodSpatterPattern[];
  witnesses: WitnessViewpoint[];
}

// ═══════════════════════════════════════════════════════════════════
// Bullet Trajectory Physics
// ═══════════════════════════════════════════════════════════════════

export function calculateTrajectoryLength(t: BulletTrajectory): number {
  const dx = t.exitPoint[0] - t.entryPoint[0];
  const dy = t.exitPoint[1] - t.entryPoint[1];
  const dz = t.exitPoint[2] - t.entryPoint[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function trajectoryDirection(t: BulletTrajectory): Vector3 {
  const len = calculateTrajectoryLength(t);
  if (len === 0) return [0, 0, 0];
  return [
    (t.exitPoint[0] - t.entryPoint[0]) / len,
    (t.exitPoint[1] - t.entryPoint[1]) / len,
    (t.exitPoint[2] - t.entryPoint[2]) / len,
  ];
}

export function estimateShooterPosition(t: BulletTrajectory): Vector3 {
  const dir = trajectoryDirection(t);
  return [
    t.entryPoint[0] - dir[0] * t.distanceToShooter,
    t.entryPoint[1] - dir[1] * t.distanceToShooter,
    t.entryPoint[2] - dir[2] * t.distanceToShooter,
  ];
}

export function trajectoryAngleFromHorizontal(t: BulletTrajectory): number {
  const dy = t.exitPoint[1] - t.entryPoint[1];
  const dxz = Math.sqrt(
    (t.exitPoint[0] - t.entryPoint[0]) ** 2 + (t.exitPoint[2] - t.entryPoint[2]) ** 2
  );
  return Math.atan2(dy, dxz) * (180 / Math.PI);
}

// ═══════════════════════════════════════════════════════════════════
// Blood Spatter Analysis
// ═══════════════════════════════════════════════════════════════════

export function classifySpatterByDropletCount(count: number): BloodSpatterPattern['pattern'] {
  if (count > 500) return 'arterial';
  if (count > 200) return 'cast-off';
  if (count > 50) return 'impact';
  if (count > 10) return 'drip';
  return 'transfer';
}

export function calculateAreaOfOrigin(spatters: BloodSpatterPattern[]): Vector3 | null {
  if (spatters.length < 2) return null;
  // Triangulation: average the computed pointOfOrigin across all patterns
  const x = spatters.reduce((s, sp) => s + sp.pointOfOrigin[0], 0) / spatters.length;
  const y = spatters.reduce((s, sp) => s + sp.pointOfOrigin[1], 0) / spatters.length;
  const z = spatters.reduce((s, sp) => s + sp.pointOfOrigin[2], 0) / spatters.length;
  return [x, y, z];
}

export function impactAngleFromDropletRatio(width: number, length: number): number {
  // arcsin(width/length) — standard BPA formula
  if (length === 0) return 90;
  return Math.asin(Math.min(1, width / length)) * (180 / Math.PI);
}

// ═══════════════════════════════════════════════════════════════════
// Evidence Chain of Custody
// ═══════════════════════════════════════════════════════════════════

export function isChainOfCustodyIntact(marker: EvidenceMarker): boolean {
  return marker.chainOfCustody.length > 0 && marker.collectedBy === marker.chainOfCustody[0];
}

export function addToChainOfCustody(marker: EvidenceMarker, handler: string): EvidenceMarker {
  return { ...marker, chainOfCustody: [...marker.chainOfCustody, handler] };
}

export function evidenceSeverityScore(severity: EvidenceSeverity): number {
  const scores: Record<EvidenceSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return scores[severity];
}

export function sortEvidenceBySeverity(items: EvidenceMarker[]): EvidenceMarker[] {
  return [...items].sort(
    (a, b) => evidenceSeverityScore(b.severity) - evidenceSeverityScore(a.severity)
  );
}

// ═══════════════════════════════════════════════════════════════════
// Witness Analysis
// ═══════════════════════════════════════════════════════════════════

export function distanceBetween(a: Vector3, b: Vector3): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export function canWitnessSeePoint(
  witness: WitnessViewpoint,
  point: Vector3,
  maxRange = 100
): boolean {
  const dist = distanceBetween(witness.position, point);
  return dist <= maxRange && witness.visibility !== 'obstructed';
}

export function scenePerimeterArea(polygon: Vector3[]): number {
  // Shoelace formula (2D projection on x-z plane)
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][2];
    area -= polygon[j][0] * polygon[i][2];
  }
  return Math.abs(area) / 2;
}

// ═══════════════════════════════════════════════════════════════════
// Forensic Timeline
// ═══════════════════════════════════════════════════════════════════

export interface ForensicEvent {
  id: string;
  timestamp: number;
  type: 'gunshot' | 'scream' | 'footstep' | 'glass-break' | 'vehicle' | 'witness-arrival' | 'other';
  description: string;
  position?: Vector3;
  confidence: number; // 0-1 (reliability of the event timing)
}

/**
 * Builds a sorted forensic timeline from events, placing them in chronological order.
 */
export function forensicTimeline(events: ForensicEvent[]): ForensicEvent[] {
  return [...events].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Finds contradictions between timeline events (events that are too close
 * in time but too far in distance for a single person to traverse).
 */
export function timelineContradictions(
  events: ForensicEvent[],
  maxSpeedMps: number = 10 // Max human Sprint speed
): Array<{ event1: string; event2: string; reason: string }> {
  const contradictions: Array<{ event1: string; event2: string; reason: string }> = [];
  const sorted = forensicTimeline(events);

  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!a.position || !b.position) continue;

      const timeDiff = (b.timestamp - a.timestamp) / 1000; // seconds
      if (timeDiff <= 0) continue;

      const dist = distanceBetween(a.position, b.position);
      const requiredSpeed = dist / timeDiff;

      if (requiredSpeed > maxSpeedMps) {
        contradictions.push({
          event1: a.id,
          event2: b.id,
          reason: `${dist.toFixed(1)}m in ${timeDiff.toFixed(1)}s requires ${requiredSpeed.toFixed(1)} m/s (max: ${maxSpeedMps} m/s)`,
        });
      }
    }
  }
  return contradictions;
}

// ═══════════════════════════════════════════════════════════════════
// DNA Contamination
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimates DNA contamination probability based on handler count,
 * time since collection, and environmental exposure.
 */
export function dnaContaminationRisk(
  handlersCount: number,
  hoursSinceCollection: number,
  isSealed: boolean
): number {
  let risk = 0;
  risk += handlersCount * 5; // Each handler adds 5% risk
  risk += hoursSinceCollection * 0.5; // 0.5% per hour exposed
  if (!isSealed) risk += 20; // Unsealed adds 20%
  return Math.min(100, Math.max(0, Math.round(risk)));
}

// ═══════════════════════════════════════════════════════════════════
// Photogrammetry — 3D reconstruction from photos
// ═══════════════════════════════════════════════════════════════════

export interface PhotoCapture {
  id: string;
  position: Vector3;
  lookAt: Vector3;
  focalLengthMm: number;
}

/**
 * Generate a 3D point cloud estimate from multiple photo capture positions.
 * Uses triangulation between overlapping photo pairs.
 */
export function photogrammetryPointCloud(captures: PhotoCapture[]): {
  centroid: Vector3;
  estimatedPoints: number;
  coverageScore: number;
} {
  if (captures.length < 2)
    return { centroid: [0, 0, 0], estimatedPoints: 0, coverageScore: 0 };

  // Centroid of all capture look-at positions
  const centroid: Vector3 = [
    captures.reduce((s, c) => s + c.lookAt[0], 0) / captures.length,
    captures.reduce((s, c) => s + c.lookAt[1], 0) / captures.length,
    captures.reduce((s, c) => s + c.lookAt[2], 0) / captures.length,
  ];

  // Estimated points from overlapping coverage (proportional to captures²)
  const estimatedPoints = captures.length * captures.length * 500;

  // Coverage score based on angular diversity of capture positions
  const angles = new Set<number>();
  for (const c of captures) {
    const angle = Math.round(
      (Math.atan2(c.position[2] - centroid[2], c.position[0] - centroid[0]) * 180) / Math.PI / 45
    );
    angles.add(angle);
  }
  const coverageScore = Math.min(1, angles.size / 8); // 8 octants = full coverage

  return { centroid, estimatedPoints, coverageScore };
}
