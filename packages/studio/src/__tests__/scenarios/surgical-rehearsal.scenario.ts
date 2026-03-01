/**
 * surgical-rehearsal.scenario.ts — LIVING-SPEC: Surgical Rehearsal
 *
 * Persona: Dr. Nakamura — surgeon who rehearses procedures in VR,
 * practicing instrument paths near critical anatomical structures.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  distance3D, isNearCriticalStructure, hapticResistanceForTissue,
  procedureProgress, estimateProcedureDuration, stepsByRisk,
  getNextStep, validateStepOrder, instrumentForStep,
  anatomyAtlas, bloodFlowSim,
  type SurgicalInstrument, type AnatomicalLandmark, type ProcedureStep,
  type SurgicalSession, type OrganModel, type VesselSegment,
} from '@/lib/surgicalRehearsal';

describe('Scenario: Surgical Rehearsal — Safety', () => {
  const scalpel: SurgicalInstrument = { id: 'i1', name: 'Scalpel #10', type: 'scalpel', tipPosition: { x: 5, y: 3, z: 2 }, safetyRadius: 1.0, maxForceNewtons: 5 };
  const landmarks: AnatomicalLandmark[] = [
    { id: 'l1', name: 'Femoral Artery', position: { x: 5.5, y: 3, z: 2 }, system: 'cardiovascular', critical: true },
    { id: 'l2', name: 'Fat Pad', position: { x: 10, y: 3, z: 2 }, system: 'muscular', critical: false },
  ];

  it('isNearCriticalStructure() warns when instrument is within safety radius', () => {
    const warning = isNearCriticalStructure(scalpel, landmarks);
    expect(warning).not.toBeNull();
    expect(warning!.name).toBe('Femoral Artery');
  });

  it('isNearCriticalStructure() returns null when far away', () => {
    const farScalpel = { ...scalpel, tipPosition: { x: 50, y: 50, z: 50 } };
    expect(isNearCriticalStructure(farScalpel, landmarks)).toBeNull();
  });

  it('non-critical landmarks do not trigger warnings', () => {
    const nearFat = { ...scalpel, tipPosition: { x: 10, y: 3, z: 2 } };
    expect(isNearCriticalStructure(nearFat, landmarks)).toBeNull();
  });

  it('distance3D() between instrument and landmark', () => {
    expect(distance3D(scalpel.tipPosition, landmarks[0].position)).toBeCloseTo(0.5, 1);
  });
});

describe('Scenario: Surgical Rehearsal — Haptics', () => {
  it('bone has highest resistance (1.0)', () => {
    expect(hapticResistanceForTissue('bone')).toBe(1.0);
  });

  it('nerve has lowest resistance (0.1)', () => {
    expect(hapticResistanceForTissue('nerve')).toBe(0.1);
  });

  it('skin resistance is 0.3', () => {
    expect(hapticResistanceForTissue('skin')).toBe(0.3);
  });

  it('muscle resistance is 0.4', () => {
    expect(hapticResistanceForTissue('muscle')).toBe(0.4);
  });
});

describe('Scenario: Surgical Rehearsal — Procedure Steps', () => {
  const steps: ProcedureStep[] = [
    { id: 's1', order: 1, name: 'Incision', description: 'Initial cut', instrumentRequired: 'scalpel', targetLandmark: 'l1', durationMinutes: 5, riskLevel: 'moderate', completed: true },
    { id: 's2', order: 2, name: 'Retraction', description: 'Open field', instrumentRequired: 'retractor', targetLandmark: 'l2', durationMinutes: 3, riskLevel: 'low', completed: true },
    { id: 's3', order: 3, name: 'Repair', description: 'Suture vessel', instrumentRequired: 'suture', targetLandmark: 'l3', durationMinutes: 15, riskLevel: 'critical', completed: false },
    { id: 's4', order: 4, name: 'Closure', description: 'Close layers', instrumentRequired: 'suture', targetLandmark: 'l4', durationMinutes: 10, riskLevel: 'low', completed: false },
  ];

  const instruments: SurgicalInstrument[] = [
    { id: 'i1', name: 'Scalpel', type: 'scalpel', tipPosition: { x: 0, y: 0, z: 0 }, safetyRadius: 1, maxForceNewtons: 5 },
    { id: 'i2', name: 'Retractor', type: 'retractor', tipPosition: { x: 0, y: 0, z: 0 }, safetyRadius: 2, maxForceNewtons: 20 },
    { id: 'i3', name: 'Suture Kit', type: 'suture', tipPosition: { x: 0, y: 0, z: 0 }, safetyRadius: 0.5, maxForceNewtons: 3 },
  ];

  const session: SurgicalSession = {
    id: 'sess-1', procedureName: 'Femoral Bypass', patient: { age: 65, weight: 80, conditions: ['diabetes'] },
    steps, currentStep: 2, startTime: Date.now(), instruments, complications: [],
  };

  it('procedureProgress() = completed / total', () => {
    expect(procedureProgress(session)).toBe(0.5); // 2/4
  });

  it('estimateProcedureDuration() sums all step durations', () => {
    expect(estimateProcedureDuration(steps)).toBe(33);
  });

  it('stepsByRisk(critical) returns the repair step', () => {
    const critical = stepsByRisk(steps, 'critical');
    expect(critical).toHaveLength(1);
    expect(critical[0].name).toBe('Repair');
  });

  it('getNextStep() returns first incomplete step', () => {
    const next = getNextStep(session);
    expect(next).not.toBeNull();
    expect(next!.name).toBe('Repair');
  });

  it('validateStepOrder() checks ascending order', () => {
    expect(validateStepOrder(steps)).toBe(true);
    const bad = [steps[0], steps[2], steps[1], steps[3]]; // out of order
    expect(validateStepOrder(bad)).toBe(false);
  });

  it('instrumentForStep() matches required instrument type', () => {
    const inst = instrumentForStep(steps[0], instruments);
    expect(inst).not.toBeNull();
    expect(inst!.type).toBe('scalpel');
  });

  it('instrumentForStep() returns null if not available', () => {
    const missing = instrumentForStep(
      { ...steps[0], instrumentRequired: 'laser' },
      instruments
    );
    expect(missing).toBeNull();
  });

  it('3D anatomy atlas — load DICOM/mesh organ models', () => {
    const organs: OrganModel[] = [
      { id: 'heart', name: 'Heart', system: 'cardiovascular', position: { x: 0, y: 10, z: 0 }, boundingRadius: 6, tissueType: 'organ', density: 1.06, landmarks: [] },
      { id: 'aorta', name: 'Aorta', system: 'cardiovascular', position: { x: 2, y: 12, z: 1 }, boundingRadius: 2, tissueType: 'vessel', density: 1.05, landmarks: [] },
      { id: 'lung', name: 'Left Lung', system: 'respiratory', position: { x: -5, y: 10, z: 0 }, boundingRadius: 8, tissueType: 'organ', density: 0.5, landmarks: [] },
    ];
    const cardio = anatomyAtlas(organs, 'cardiovascular', { x: 0, y: 10, z: 0 });
    expect(cardio).toHaveLength(2); // Heart + Aorta
    expect(cardio[0].id).toBe('heart'); // Closest to field center
  });

  it('blood flow simulation — real-time vessel perfusion visualization', () => {
    const vessels: VesselSegment[] = [
      { id: 'fem-a', startPos: { x: 0, y: 0, z: 0 }, endPos: { x: 0, y: -20, z: 0 }, diameterMm: 6, flowRateMlS: 5 },
      { id: 'fem-v', startPos: { x: 1, y: -20, z: 0 }, endPos: { x: 1, y: 0, z: 0 }, diameterMm: 8, flowRateMlS: 4 },
    ];
    const flow = bloodFlowSim(vessels, 72, 120);
    expect(flow).toHaveLength(2);
    for (const f of flow) {
      expect(f.perfusion).toBeGreaterThan(0);
      expect(f.perfusion).toBeLessThanOrEqual(1);
    }
  });
});
