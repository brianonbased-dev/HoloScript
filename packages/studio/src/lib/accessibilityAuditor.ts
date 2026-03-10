/**
 * accessibilityAuditor.ts — Accessibility Audit Engine
 *
 * ADA/WCAG-inspired spatial compliance: wheelchair traversal, doorway clearance,
 * ramp grade validation, elevator reach analysis, and audit report generation.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type ComplianceLevel = 'pass' | 'warning' | 'fail';
export type WCAGLevel = 'A' | 'AA' | 'AAA';
export type MobilityDevice =
  | 'manual-wheelchair'
  | 'power-wheelchair'
  | 'scooter'
  | 'walker'
  | 'crutches'
  | 'cane';

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function luminance(r: number, g: number, b: number) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function contrastRatio(fg: string, bg: string): number {
  const c1 = hexToRgb(fg);
  const c2 = hexToRgb(bg);
  const l1 = luminance(c1.r, c1.g, c1.b);
  const l2 = luminance(c2.r, c2.g, c2.b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function rampCompliant(slope: number): boolean {
  return slope <= 1 / 12;
}

export function doorWidthCompliant(widthCm: number): boolean {
  return widthCm >= 81.3;
}

export interface Doorway {
  id: string;
  name: string;
  position: Vec3;
  widthCm: number;
  heightCm: number;
  thresholdCm: number; // Threshold height
  hasAutoOpener: boolean;
  handleType: 'lever' | 'knob' | 'push' | 'pull' | 'automatic';
  forceNewtons: number; // Force to open (max 22N ADA)
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
  controlHeightCm: number; // Height of highest button
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
  standard: string; // e.g., 'ADA 404.2.3', 'WCAG 2.1'
  description: string;
  recommendation?: string;
}

export interface AuditReport {
  buildingName: string;
  auditDate: string;
  findings: AuditFinding[];
  overallScore: number; // 0-100
  passCount: number;
  warningCount: number;
  failCount: number;
}

// ═══════════════════════════════════════════════════════════════════
// ADA Standards Constants
// ═══════════════════════════════════════════════════════════════════

export const ADA = {
  MIN_DOOR_WIDTH_CM: 81.3, // 32 inches
  MAX_THRESHOLD_CM: 1.3, // 0.5 inches
  MAX_DOOR_FORCE_N: 22, // 5 lbf
  MAX_RAMP_SLOPE: 8.33, // 1:12 = 8.33%
  MIN_RAMP_WIDTH_CM: 91.4, // 36 inches
  MAX_RAMP_RUN_M: 9.14, // 30 feet
  MIN_LANDING_LENGTH_CM: 152.4, // 60 inches
  MIN_ELEVATOR_WIDTH_CM: 170.2, // 67 inches
  MIN_ELEVATOR_DEPTH_CM: 137.2, // 54 inches
  MIN_ELEVATOR_DOOR_CM: 91.4, // 36 inches
  MAX_CONTROL_HEIGHT_CM: 137.2, // 54 inches
  MIN_TURNING_RADIUS_CM: 152.4, // 60 inches (5 feet)
  MIN_ACCESSIBLE_PARKING_WIDTH_CM: 243.8, // 96 inches
  MIN_ACCESS_AISLE_WIDTH_CM: 152.4, // 60 inches
  MAX_PARKING_DISTANCE_M: 61, // 200 feet
} as const;

// ═══════════════════════════════════════════════════════════════════
// Doorway Assessment
// ═══════════════════════════════════════════════════════════════════

export function checkDoorway(door: Doorway): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (door.widthCm < ADA.MIN_DOOR_WIDTH_CM) {
    findings.push({
      id: `door-width-${door.id}`,
      elementId: door.id,
      elementType: 'doorway',
      compliance: 'fail',
      standard: 'ADA 404.2.3',
      description: `Door width ${door.widthCm}cm < ${ADA.MIN_DOOR_WIDTH_CM}cm minimum`,
      recommendation: `Widen doorway to at least ${ADA.MIN_DOOR_WIDTH_CM}cm`,
    });
  }

  if (door.thresholdCm > ADA.MAX_THRESHOLD_CM) {
    findings.push({
      id: `door-threshold-${door.id}`,
      elementId: door.id,
      elementType: 'doorway',
      compliance: 'fail',
      standard: 'ADA 404.2.5',
      description: `Threshold ${door.thresholdCm}cm > ${ADA.MAX_THRESHOLD_CM}cm maximum`,
      recommendation: 'Reduce or remove threshold',
    });
  }

  if (door.handleType === 'knob') {
    findings.push({
      id: `door-handle-${door.id}`,
      elementId: door.id,
      elementType: 'doorway',
      compliance: 'fail',
      standard: 'ADA 404.2.7',
      description: 'Round knob handles not operable with one hand',
      recommendation: 'Replace with lever handle',
    });
  }

  if (door.forceNewtons > ADA.MAX_DOOR_FORCE_N && !door.hasAutoOpener) {
    findings.push({
      id: `door-force-${door.id}`,
      elementId: door.id,
      elementType: 'doorway',
      compliance: 'warning',
      standard: 'ADA 404.2.9',
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
      id: `ramp-slope-${ramp.id}`,
      elementId: ramp.id,
      elementType: 'ramp',
      compliance: 'fail',
      standard: 'ADA 405.2',
      description: `Slope ${slope.toFixed(1)}% > ${ADA.MAX_RAMP_SLOPE}% maximum (1:12)`,
      recommendation: `Extend ramp to reduce slope below ${ADA.MAX_RAMP_SLOPE}%`,
    });
  }

  if (ramp.widthCm < ADA.MIN_RAMP_WIDTH_CM) {
    findings.push({
      id: `ramp-width-${ramp.id}`,
      elementId: ramp.id,
      elementType: 'ramp',
      compliance: 'fail',
      standard: 'ADA 405.5',
      description: `Ramp width ${ramp.widthCm}cm < ${ADA.MIN_RAMP_WIDTH_CM}cm minimum`,
    });
  }

  if (!ramp.hasHandrails && ramp.riseMeters > 0.15) {
    findings.push({
      id: `ramp-handrails-${ramp.id}`,
      elementId: ramp.id,
      elementType: 'ramp',
      compliance: 'fail',
      standard: 'ADA 405.8',
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
      id: `elev-door-${elevator.id}`,
      elementId: elevator.id,
      elementType: 'elevator',
      compliance: 'fail',
      standard: 'ADA 407.3.6',
      description: `Elevator door ${elevator.doorWidthCm}cm < ${ADA.MIN_ELEVATOR_DOOR_CM}cm`,
    });
  }

  if (elevator.controlHeightCm > ADA.MAX_CONTROL_HEIGHT_CM) {
    findings.push({
      id: `elev-controls-${elevator.id}`,
      elementId: elevator.id,
      elementType: 'elevator',
      compliance: 'fail',
      standard: 'ADA 407.4.6',
      description: `Controls at ${elevator.controlHeightCm}cm > ${ADA.MAX_CONTROL_HEIGHT_CM}cm reach`,
      recommendation: 'Lower control panel or add side panel',
    });
  }

  if (!elevator.hasBraille) {
    findings.push({
      id: `elev-braille-${elevator.id}`,
      elementId: elevator.id,
      elementType: 'elevator',
      compliance: 'fail',
      standard: 'ADA 407.4.7',
      description: 'Elevator buttons must have Braille markings',
    });
  }

  if (!elevator.hasAudioAnnounce) {
    findings.push({
      id: `elev-audio-${elevator.id}`,
      elementId: elevator.id,
      elementType: 'elevator',
      compliance: 'warning',
      standard: 'ADA 407.4.8',
      description: 'Audio floor announcements recommended',
    });
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// Audit Report Generation
// ═══════════════════════════════════════════════════════════════════

export function generateAuditReport(buildingName: string, findings: AuditFinding[]): AuditReport {
  const passCount = findings.filter((f) => f.compliance === 'pass').length;
  const warningCount = findings.filter((f) => f.compliance === 'warning').length;
  const failCount = findings.filter((f) => f.compliance === 'fail').length;
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
  return (deviceWidth * Math.PI) / 2;
}

export function isPathWideEnough(pathWidthCm: number, device: MobilityDevice): boolean {
  const deviceWidths: Record<MobilityDevice, number> = {
    'manual-wheelchair': 63.5, // 25 inches
    'power-wheelchair': 68.6, // 27 inches
    scooter: 63.5,
    walker: 61.0,
    crutches: 91.4, // Need wider clearance
    cane: 45.7,
  };
  return pathWidthCm >= deviceWidths[device] + 15; // 15cm clearance buffer
}

// ═══════════════════════════════════════════════════════════════════
// WCAG Color Contrast
// ═══════════════════════════════════════════════════════════════════

/**
 * Parses a hex color to sRGB components (0-1 range).
 */
function hexToSRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

/**
 * Calculates relative luminance per WCAG 2.1.
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Calculates WCAG 2.1 contrast ratio between two hex colors.
 * Returns ratio (1:1 to 21:1) and compliance levels.
 * AA requires 4.5:1 for normal text, 3:1 for large text.
 * AAA requires 7:1 for normal text, 4.5:1 for large text.
 */
export function wcagContrastRatio(
  fgHex: string,
  bgHex: string
): { ratio: number; aa: boolean; aaa: boolean; aaLargeText: boolean; aaaLargeText: boolean } {
  const [r1, g1, b1] = hexToSRGB(fgHex);
  const [r2, g2, b2] = hexToSRGB(bgHex);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5,
    aaa: ratio >= 7,
    aaLargeText: ratio >= 3,
    aaaLargeText: ratio >= 4.5,
  };
}

// ═══════════════════════════════════════════════════════════════════
// VR Wheelchair Perspective
// ═══════════════════════════════════════════════════════════════════

export interface WheelchairCamera {
  position: Vec3;
  eyeHeight: number;
  fovDegrees: number;
  reachRadius: number;
  obstaclesInView: string[];
}

/**
 * Generate a VR camera perspective from a wheelchair user's viewpoint.
 */
export function vrWheelchairPerspective(
  position: Vec3,
  obstacles: { id: string; position: Vec3; heightCm: number }[],
  maxViewDistance: number = 20
): WheelchairCamera {
  const eyeHeight = 1.15; // Average seated eye height in meters
  const reachRadius = 0.6; // Average reach radius in meters

  const obstaclesInView = obstacles
    .filter((o) => {
      const dx = o.position.x - position.x;
      const dy = o.position.y - position.y;
      const dz = o.position.z - position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return dist <= maxViewDistance && o.heightCm > eyeHeight * 100;
    })
    .map((o) => o.id);

  return {
    position: { x: position.x, y: eyeHeight, z: position.z },
    eyeHeight,
    fovDegrees: 90,
    reachRadius,
    obstaclesInView,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Accessible Pathfinding
// ═══════════════════════════════════════════════════════════════════

export interface PathNode {
  id: string;
  position: Vec3;
  accessible: boolean;
  connections: string[];
}

/**
 * Find an accessible route between two nodes using BFS.
 * Only traverses accessible nodes.
 */
export function findAccessibleRoute(
  nodes: PathNode[],
  startId: string,
  endId: string
): string[] | null {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const queue: string[][] = [[startId]];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current === endId) return path;

    const node = nodeMap.get(current);
    if (!node) continue;

    for (const neighborId of node.connections) {
      if (visited.has(neighborId)) continue;
      const neighbor = nodeMap.get(neighborId);
      if (!neighbor || !neighbor.accessible) continue;
      visited.add(neighborId);
      queue.push([...path, neighborId]);
    }
  }

  return null; // No accessible route found
}

export function meetsWCAG(contrast: number, level: 'A' | 'AA' | 'AAA'): boolean {
  if (level === 'A') return contrast >= 3.0; // Basic text
  if (level === 'AA') return contrast >= 4.5;
  if (level === 'AAA') return contrast >= 7.0;
  return false;
}
