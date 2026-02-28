/**
 * accessibilityAuditor.ts — Accessibility Audit Engine
 *
 * ADA/WCAG-inspired spatial compliance: wheelchair traversal, doorway clearance,
 * ramp grade validation, elevator reach analysis, and audit report generation.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface Vec3 { x: number; y: number; z: number }

export type ComplianceLevel = 'pass' | 'warning' | 'fail';
export type MobilityDevice = 'manual-wheelchair' | 'power-wheelchair' | 'scooter' | 'walker' | 'crutches' | 'cane';

export interface Doorway {
  id: string;
  name: string;
  position: Vec3;
  widthCm: number;
  heightCm: number;
  thresholdCm: number;       // Threshold height
  hasAutoOpener: boolean;
  handleType: 'lever' | 'knob' | 'push' | 'pull' | 'automatic';
  forceNewtons: number;       // Force to open (max 22N ADA)
}

export interface Ramp {
  id: string;
  name: string;
  startPos: Vec3;
  endPos: Vec3;
  lengthMeters: number;
  riseMeters: number;
  widthCm: number;
  hasHandrails: boolean;
  hasLandings: boolean;
  surfaceType: 'concrete' | 'asphalt' | 'wood' | 'metal' | 'rubber';
}

export interface Elevator {
  id: string;
  position: Vec3;
  cabWidthCm: number;
  cabDepthCm: number;
  doorWidthCm: number;
  floorsServed: number[];
  hasBraille: boolean;
  hasAudioAnnounce: boolean;
  controlHeightCm: number;    // Height of highest button
}

export interface Restroom {
  id: string;
  position: Vec3;
  isAccessible: boolean;
  stallWidthCm: number;
  stallDepthCm: number;
  hasGrabBars: boolean;
  turningRadiusCm: number;
  sinkHeightCm: number;
}

export interface ParkingSpot {
  id: string;
  position: Vec3;
  isAccessible: boolean;
  widthCm: number;
  hasAccessAisle: boolean;
  aisleWidthCm: number;
  distanceToEntranceMeters: number;
  hasSignage: boolean;
}

export interface AuditFinding {
  id: string;
  elementId: string;
  elementType: 'doorway' | 'ramp' | 'elevator' | 'restroom' | 'parking' | 'path';
  compliance: ComplianceLevel;
  standard: string;           // e.g., 'ADA 404.2.3', 'WCAG 2.1'
  description: string;
  recommendation?: string;
}

export interface AuditReport {
  buildingName: string;
  auditDate: string;
  findings: AuditFinding[];
  overallScore: number;       // 0-100
  passCount: number;
  warningCount: number;
  failCount: number;
}

// ═══════════════════════════════════════════════════════════════════
// ADA Standards Constants
// ═══════════════════════════════════════════════════════════════════

export const ADA = {
  MIN_DOOR_WIDTH_CM: 81.3,          // 32 inches
  MAX_THRESHOLD_CM: 1.3,            // 0.5 inches
  MAX_DOOR_FORCE_N: 22,             // 5 lbf
  MAX_RAMP_SLOPE: 8.33,             // 1:12 = 8.33%
  MIN_RAMP_WIDTH_CM: 91.4,          // 36 inches
  MAX_RAMP_RUN_M: 9.14,             // 30 feet
  MIN_LANDING_LENGTH_CM: 152.4,     // 60 inches
  MIN_ELEVATOR_WIDTH_CM: 170.2,     // 67 inches
  MIN_ELEVATOR_DEPTH_CM: 137.2,     // 54 inches
  MIN_ELEVATOR_DOOR_CM: 91.4,       // 36 inches
  MAX_CONTROL_HEIGHT_CM: 137.2,     // 54 inches
  MIN_TURNING_RADIUS_CM: 152.4,     // 60 inches (5 feet)
  MIN_ACCESSIBLE_PARKING_WIDTH_CM: 243.8,  // 96 inches
  MIN_ACCESS_AISLE_WIDTH_CM: 152.4, // 60 inches
  MAX_PARKING_DISTANCE_M: 61,       // 200 feet
} as const;

// ═══════════════════════════════════════════════════════════════════
// Doorway Assessment
// ═══════════════════════════════════════════════════════════════════

export function checkDoorway(door: Doorway): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (door.widthCm < ADA.MIN_DOOR_WIDTH_CM) {
    findings.push({
      id: `door-width-${door.id}`, elementId: door.id, elementType: 'doorway',
      compliance: 'fail', standard: 'ADA 404.2.3',
      description: `Door width ${door.widthCm}cm < ${ADA.MIN_DOOR_WIDTH_CM}cm minimum`,
      recommendation: `Widen doorway to at least ${ADA.MIN_DOOR_WIDTH_CM}cm`,
    });
  }

  if (door.thresholdCm > ADA.MAX_THRESHOLD_CM) {
    findings.push({
      id: `door-threshold-${door.id}`, elementId: door.id, elementType: 'doorway',
      compliance: 'fail', standard: 'ADA 404.2.5',
      description: `Threshold ${door.thresholdCm}cm > ${ADA.MAX_THRESHOLD_CM}cm maximum`,
      recommendation: 'Reduce or remove threshold',
    });
  }

  if (door.handleType === 'knob') {
    findings.push({
      id: `door-handle-${door.id}`, elementId: door.id, elementType: 'doorway',
      compliance: 'fail', standard: 'ADA 404.2.7',
      description: 'Round knob handles not operable with one hand',
      recommendation: 'Replace with lever handle',
    });
  }

  if (door.forceNewtons > ADA.MAX_DOOR_FORCE_N && !door.hasAutoOpener) {
    findings.push({
      id: `door-force-${door.id}`, elementId: door.id, elementType: 'doorway',
      compliance: 'warning', standard: 'ADA 404.2.9',
      description: `Opening force ${door.forceNewtons}N > ${ADA.MAX_DOOR_FORCE_N}N maximum`,
      recommendation: 'Install automatic door opener',
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// Ramp Assessment
// ═══════════════════════════════════════════════════════════════════

export function rampSlopePercent(ramp: Ramp): number {
  if (ramp.lengthMeters === 0) return 0;
  return (ramp.riseMeters / ramp.lengthMeters) * 100;
}

export function rampSlopeRatio(ramp: Ramp): string {
  if (ramp.riseMeters === 0) return 'flat';
  const ratio = Math.round(ramp.lengthMeters / ramp.riseMeters);
  return `1:${ratio}`;
}

export function checkRamp(ramp: Ramp): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const slope = rampSlopePercent(ramp);

  if (slope > ADA.MAX_RAMP_SLOPE) {
    findings.push({
      id: `ramp-slope-${ramp.id}`, elementId: ramp.id, elementType: 'ramp',
      compliance: 'fail', standard: 'ADA 405.2',
      description: `Slope ${slope.toFixed(1)}% > ${ADA.MAX_RAMP_SLOPE}% maximum (1:12)`,
      recommendation: `Extend ramp to reduce slope below ${ADA.MAX_RAMP_SLOPE}%`,
    });
  }

  if (ramp.widthCm < ADA.MIN_RAMP_WIDTH_CM) {
    findings.push({
      id: `ramp-width-${ramp.id}`, elementId: ramp.id, elementType: 'ramp',
      compliance: 'fail', standard: 'ADA 405.5',
      description: `Ramp width ${ramp.widthCm}cm < ${ADA.MIN_RAMP_WIDTH_CM}cm minimum`,
    });
  }

  if (!ramp.hasHandrails && ramp.riseMeters > 0.15) {
    findings.push({
      id: `ramp-handrails-${ramp.id}`, elementId: ramp.id, elementType: 'ramp',
      compliance: 'fail', standard: 'ADA 405.8',
      description: 'Handrails required for ramps with >15cm rise',
      recommendation: 'Install handrails on both sides',
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// Elevator Assessment
// ═══════════════════════════════════════════════════════════════════

export function checkElevator(elevator: Elevator): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (elevator.doorWidthCm < ADA.MIN_ELEVATOR_DOOR_CM) {
    findings.push({
      id: `elev-door-${elevator.id}`, elementId: elevator.id, elementType: 'elevator',
      compliance: 'fail', standard: 'ADA 407.3.6',
      description: `Elevator door ${elevator.doorWidthCm}cm < ${ADA.MIN_ELEVATOR_DOOR_CM}cm`,
    });
  }

  if (elevator.controlHeightCm > ADA.MAX_CONTROL_HEIGHT_CM) {
    findings.push({
      id: `elev-controls-${elevator.id}`, elementId: elevator.id, elementType: 'elevator',
      compliance: 'fail', standard: 'ADA 407.4.6',
      description: `Controls at ${elevator.controlHeightCm}cm > ${ADA.MAX_CONTROL_HEIGHT_CM}cm reach`,
      recommendation: 'Lower control panel or add side panel',
    });
  }

  if (!elevator.hasBraille) {
    findings.push({
      id: `elev-braille-${elevator.id}`, elementId: elevator.id, elementType: 'elevator',
      compliance: 'fail', standard: 'ADA 407.4.7',
      description: 'Elevator buttons must have Braille markings',
    });
  }

  if (!elevator.hasAudioAnnounce) {
    findings.push({
      id: `elev-audio-${elevator.id}`, elementId: elevator.id, elementType: 'elevator',
      compliance: 'warning', standard: 'ADA 407.4.8',
      description: 'Audio floor announcements recommended',
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// Audit Report Generation
// ═══════════════════════════════════════════════════════════════════

export function generateAuditReport(
  buildingName: string,
  findings: AuditFinding[]
): AuditReport {
  const passCount = findings.filter(f => f.compliance === 'pass').length;
  const warningCount = findings.filter(f => f.compliance === 'warning').length;
  const failCount = findings.filter(f => f.compliance === 'fail').length;
  const total = findings.length || 1;
  const overallScore = Math.round(((passCount + warningCount * 0.5) / total) * 100);

  return {
    buildingName,
    auditDate: new Date().toISOString().split('T')[0],
    findings,
    overallScore,
    passCount,
    warningCount,
    failCount,
  };
}

export function wheelchairTurningRadius(deviceWidth: number): number {
  // Standard turning radius = device width * π / 2
  return deviceWidth * Math.PI / 2;
}

export function isPathWideEnough(pathWidthCm: number, device: MobilityDevice): boolean {
  const deviceWidths: Record<MobilityDevice, number> = {
    'manual-wheelchair': 63.5,   // 25 inches
    'power-wheelchair': 68.6,    // 27 inches
    'scooter': 63.5,
    'walker': 61.0,
    'crutches': 91.4,            // Need wider clearance
    'cane': 45.7,
  };
  return pathWidthCm >= deviceWidths[device] + 15; // 15cm clearance buffer
}
