/**
 * surgicalRehearsal.ts — Surgical Rehearsal Engine
 *
 * Organ models, instrument path planning, haptic feedback zones,
 * procedure step tracking, and anatomical landmark registration.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

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
  safetyRadius: number; // cm — keep this far from critical structures
  maxForceNewtons: number;
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
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

export function isNearCriticalStructure(
  instrument: SurgicalInstrument,
  landmarks: AnatomicalLandmark[]
): AnatomicalLandmark | null {
  for (const lm of landmarks) {
    if (!lm.critical) continue;
    const dist = distance3D(instrument.tipPosition, lm.position);
    if (dist < instrument.safetyRadius) return lm;
  }
  return null;
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
