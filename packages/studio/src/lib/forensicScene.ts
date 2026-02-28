/**
 * forensicScene.ts — Forensic Crime Scene Reconstruction Engine
 *
 * 3D crime scene analysis: bullet trajectory physics, blood spatter
 * simulation, evidence tagging with GPS/timestamps, witness POV rendering.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface Vector3 { x: number; y: number; z: number }

export type EvidenceType = 'physical' | 'biological' | 'digital' | 'trace' | 'documentary' | 'testimonial';
export type EvidenceSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface EvidenceMarker {
  id: string;
  label: string;
  type: EvidenceType;
  severity: EvidenceSeverity;
  position: Vector3;
  timestamp: number;        // When discovered
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
  caliber: string;          // e.g., '9mm', '.45ACP'
  velocity: number;         // m/s at impact
  angle: number;            // degrees from horizontal
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
  angleOfImpact: number;    // degrees
  directionality: number;   // degrees (0 = north)
  pointOfOrigin: Vector3;   // Calculated convergence point
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
  boundaryPolygon: Vector3[];   // Scene perimeter
  evidence: EvidenceMarker[];
  trajectories: BulletTrajectory[];
  spatters: BloodSpatterPattern[];
  witnesses: WitnessViewpoint[];
}

// ═══════════════════════════════════════════════════════════════════
// Bullet Trajectory Physics
// ═══════════════════════════════════════════════════════════════════

export function calculateTrajectoryLength(t: BulletTrajectory): number {
  const dx = t.exitPoint.x - t.entryPoint.x;
  const dy = t.exitPoint.y - t.entryPoint.y;
  const dz = t.exitPoint.z - t.entryPoint.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function trajectoryDirection(t: BulletTrajectory): Vector3 {
  const len = calculateTrajectoryLength(t);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: (t.exitPoint.x - t.entryPoint.x) / len,
    y: (t.exitPoint.y - t.entryPoint.y) / len,
    z: (t.exitPoint.z - t.entryPoint.z) / len,
  };
}

export function estimateShooterPosition(t: BulletTrajectory): Vector3 {
  const dir = trajectoryDirection(t);
  return {
    x: t.entryPoint.x - dir.x * t.distanceToShooter,
    y: t.entryPoint.y - dir.y * t.distanceToShooter,
    z: t.entryPoint.z - dir.z * t.distanceToShooter,
  };
}

export function trajectoryAngleFromHorizontal(t: BulletTrajectory): number {
  const dy = t.exitPoint.y - t.entryPoint.y;
  const dxz = Math.sqrt(
    (t.exitPoint.x - t.entryPoint.x) ** 2 +
    (t.exitPoint.z - t.entryPoint.z) ** 2
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

export function calculateAreaOfOrigin(
  spatters: BloodSpatterPattern[]
): Vector3 | null {
  if (spatters.length < 2) return null;
  // Triangulation: average the computed pointOfOrigin across all patterns
  const x = spatters.reduce((s, sp) => s + sp.pointOfOrigin.x, 0) / spatters.length;
  const y = spatters.reduce((s, sp) => s + sp.pointOfOrigin.y, 0) / spatters.length;
  const z = spatters.reduce((s, sp) => s + sp.pointOfOrigin.z, 0) / spatters.length;
  return { x, y, z };
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

export function addToChainOfCustody(
  marker: EvidenceMarker,
  handler: string
): EvidenceMarker {
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
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
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
    area += polygon[i].x * polygon[j].z;
    area -= polygon[j].x * polygon[i].z;
  }
  return Math.abs(area) / 2;
}
