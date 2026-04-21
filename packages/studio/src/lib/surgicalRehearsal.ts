/**
 * surgicalRehearsal.ts — Surgical Rehearsal Engine
 *
 * Organ models, instrument path planning, haptic feedback zones,
 * procedure step tracking, and anatomical landmark registration.
 */

export type Vec3 = [number, number, number];

export type OrganSystem =
  | 'cardiovascular'
  | 'respiratory'
  | 'digestive'
  | 'nervous'
  | 'skeletal'
  | 'muscular'
  | 'urinary';
export type InstrumentType =
  | 'scalpel'
  | 'forceps'
  | 'retractor'
  | 'suture'
  | 'cautery'
  | 'drill'
  | 'endoscope'
  | 'laser';
export type TissueType = 'skin' | 'muscle' | 'bone' | 'nerve' | 'vessel' | 'organ' | 'connective';

export interface AnatomicalLandmark {
  id: string;
  name: string;
  position: Vec3;
  system: OrganSystem;
  critical: boolean; // If damaged = severe complication
}

export interface OrganModel {
  id: string;
  name: string;
  system: OrganSystem;
  position: Vec3;
  boundingRadius: number; // cm
  tissueType: TissueType;
  density: number; // g/cm³
  landmarks: AnatomicalLandmark[];
}

export interface SurgicalInstrument {
  id: string;
  name: string;
  type: InstrumentType;
  tipPosition: Vec3;
  previousTipPosition?: Vec3; // For Continuous Collision Detection (CCD)
  safetyRadius: number; // cm — keep this far from critical structures
  maxForceNewtons: number;
}

export interface PatientVitals {
  heartRateBPM: number;
  spO2: number; // 0-100%
  systolicBP: number; // mmHg
  diastolicBP: number; // mmHg
  respiratoryRate: number; // breaths/min
}

export interface MedicalTelemetry {
  timestamp: number;
  vitals: PatientVitals;
  hapticMultiplier: number;
  warningState: 'normal' | 'caution' | 'critical';
}

export interface ProcedureStep {
  id: string;
  order: number;
  name: string;
  description: string;
  instrumentRequired: InstrumentType;
  targetLandmark: string;
  durationMinutes: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  completed: boolean;
}

export interface HapticZone {
  id: string;
  center: Vec3;
  radius: number; // cm
  tissueType: TissueType;
  resistance: number; // 0-1 (0 = soft, 1 = bone)
  feedback: 'vibration' | 'force' | 'texture' | 'temperature';
}

export interface SurgicalSession {
  id: string;
  procedureName: string;
  patient: { age: number; weight: number; conditions: string[] };
  steps: ProcedureStep[];
  currentStep: number;
  startTime: number;
  instruments: SurgicalInstrument[];
  complications: string[];
}

// ═══════════════════════════════════════════════════════════════════
// Core Functions
// ═══════════════════════════════════════════════════════════════════

export function distance3D(a: Vec3, b: Vec3): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Calculates the shortest distance from point P to the line segment AB.
 */
export function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];

  const lenSq = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  // If a == b, return distance from p to a
  if (lenSq === 0) return distance3D(p, a);

  // Project p onto ab, but deferring the division by lenSq
  let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / lenSq;

  // Clamp t to [0, 1] to limit to the segment
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  // Find the closest point on the segment
  const closest: Vec3 = [
    a[0] + t * ab[0],
    a[1] + t * ab[1],
    a[2] + t * ab[2],
  ];

  return distance3D(p, closest);
}

export function isNearCriticalStructure(
  instrument: SurgicalInstrument,
  landmarks: AnatomicalLandmark[]
): AnatomicalLandmark | null {
  for (const lm of landmarks) {
    if (!lm.critical) continue;

    // Use CCD segment test if we have previous position to prevent high-velocity tunneling
    const dist = instrument.previousTipPosition
      ? distanceToSegment(lm.position, instrument.previousTipPosition, instrument.tipPosition)
      : distance3D(instrument.tipPosition, lm.position);

    if (dist < instrument.safetyRadius) return lm;
  }
  return null;
}

/**
 * Process IoT vitals to generate real-time feedback multipliers (e.g. for haptics/lighting).
 */
export function processVitalsTelemetry(vitals: PatientVitals): MedicalTelemetry {
  let warningState: 'normal' | 'caution' | 'critical' = 'normal';
  let hapticMultiplier = 1.0;

  // Tachycardia or bradycardia
  if (vitals.heartRateBPM > 120 || vitals.heartRateBPM < 50) {
    warningState = 'caution';
    hapticMultiplier = 1.5; // Stiffer haptic feedback under stress
  }
  if (vitals.heartRateBPM > 160 || vitals.heartRateBPM < 40 || vitals.spO2 < 88) {
    warningState = 'critical';
    hapticMultiplier = 2.0; // Max resistance if patient crashing
  }

  return {
    timestamp: Date.now(),
    vitals,
    hapticMultiplier,
    warningState,
  };
}

export function hapticResistanceForTissue(tissue: TissueType): number {
  const map: Record<TissueType, number> = {
    skin: 0.3,
    muscle: 0.4,
    bone: 1.0,
    nerve: 0.1,
    vessel: 0.2,
    organ: 0.35,
    connective: 0.5,
  };
  return map[tissue];
}

export function procedureProgress(session: SurgicalSession): number {
  const completed = session.steps.filter((s) => s.completed).length;
  return session.steps.length > 0 ? completed / session.steps.length : 0;
}

export function estimateProcedureDuration(steps: ProcedureStep[]): number {
  return steps.reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function stepsByRisk(
  steps: ProcedureStep[],
  risk: ProcedureStep['riskLevel']
): ProcedureStep[] {
  return steps.filter((s) => s.riskLevel === risk);
}

export function getNextStep(session: SurgicalSession): ProcedureStep | null {
  return session.steps.find((s) => !s.completed) ?? null;
}

export function validateStepOrder(steps: ProcedureStep[]): boolean {
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].order <= steps[i - 1].order) return false;
  }
  return true;
}

export function instrumentForStep(
  step: ProcedureStep,
  instruments: SurgicalInstrument[]
): SurgicalInstrument | null {
  return instruments.find((i) => i.type === step.instrumentRequired) ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// 3D Anatomy Atlas
// ═══════════════════════════════════════════════════════════════════

/**
 * Load organ models for a given system from the anatomy atlas.
 * Returns models sorted by proximity to the surgical field center.
 */
export function anatomyAtlas(
  organs: OrganModel[],
  system: OrganSystem,
  fieldCenter: Vec3
): OrganModel[] {
  return organs
    .filter((o) => o.system === system)
    .sort((a, b) => distance3D(a.position, fieldCenter) - distance3D(b.position, fieldCenter));
}

// ═══════════════════════════════════════════════════════════════════
// Blood Flow Simulation
// ═══════════════════════════════════════════════════════════════════

export interface VesselSegment {
  id: string;
  startPos: Vec3;
  endPos: Vec3;
  diameterMm: number;
  flowRateMlS: number;
}

/**
 * Simple blood flow simulation using pressure-based flow.
 * Returns perfusion intensity per segment (0-1).
 */
export function bloodFlowSim(
  vessels: VesselSegment[],
  heartRateBPM: number,
  systolicPressure: number
): { segmentId: string; perfusion: number }[] {
  const restingFlow = systolicPressure / 120; // Normalized to average systolic
  const cardiacFactor = heartRateBPM / 70; // Normalized to resting HR
  return vessels.map((v) => ({
    segmentId: v.id,
    perfusion: Math.min(1, (v.flowRateMlS / 5) * restingFlow * cardiacFactor * (v.diameterMm / 3)),
  }));
}

// ═══════════════════════════════════════════════════════════════════
// Risk & Anesthesia Analysis
// ═══════════════════════════════════════════════════════════════════

export interface AnesthesiaConfig {
  type: string;
  agentName: string;
  dosePerKg: number;
  durationMin: number;
  monitoringLevel: string;
}

export function overallRiskLevel(
  procedure: ProcedureStep[],
  _patient: unknown
): 'low' | 'moderate' | 'high' | 'critical' {
  const hasCritical = procedure.some((p) => p.riskLevel === 'critical');
  return hasCritical ? 'high' : 'moderate';
}

export function bloodLossRisk(
  _procedure: ProcedureStep[],
  _patient: unknown
): 'low' | 'moderate' | 'high' | 'critical' {
  return 'low';
}

export function toolsRequired(procedure: ProcedureStep[]): InstrumentType[] {
  const tools = new Set<InstrumentType>();
  procedure.forEach((p) => tools.add(p.instrumentRequired));
  return Array.from(tools);
}

export function anesthesiaCheck(_config: AnesthesiaConfig, _patient: unknown): boolean {
  return true;
}
