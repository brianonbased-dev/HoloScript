import { describe, it, expect } from 'vitest';
import {
  distance3D,
  distanceToSegment,
  isNearCriticalStructure,
  processVitalsTelemetry,
  hapticResistanceForTissue,
  type Vec3,
  type AnatomicalLandmark,
  type SurgicalInstrument,
  type PatientVitals,
  type TissueType,
} from '../surgicalRehearsal';

describe('surgicalRehearsal', () => {
  describe('distance3D', () => {
    it('should calculate distance between two 3D points', () => {
      const a: Vec3 = { x: 0, y: 0, z: 0 };
      const b: Vec3 = { x: 3, y: 4, z: 0 };

      expect(distance3D(a, b)).toBe(5); // 3-4-5 triangle
    });

    it('should calculate distance for 3D diagonal', () => {
      const a: Vec3 = { x: 1, y: 1, z: 1 };
      const b: Vec3 = { x: 4, y: 5, z: 13 };

      // sqrt((4-1)² + (5-1)² + (13-1)²) = sqrt(9 + 16 + 144) = sqrt(169) = 13
      expect(distance3D(a, b)).toBe(13);
    });

    it('should return 0 for identical points', () => {
      const a: Vec3 = { x: 5.5, y: -2.3, z: 8.9 };
      const b: Vec3 = { x: 5.5, y: -2.3, z: 8.9 };

      expect(distance3D(a, b)).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const a: Vec3 = { x: -1, y: -1, z: -1 };
      const b: Vec3 = { x: 1, y: 1, z: 1 };

      // sqrt(4 + 4 + 4) = sqrt(12) = 2*sqrt(3)
      expect(distance3D(a, b)).toBeCloseTo(3.464, 3);
    });

    it('should handle floating point coordinates', () => {
      const a: Vec3 = { x: 1.5, y: 2.5, z: 3.5 };
      const b: Vec3 = { x: 4.5, y: 6.5, z: 7.5 };

      // sqrt(9 + 16 + 16) = sqrt(41)
      expect(distance3D(a, b)).toBeCloseTo(6.403, 3);
    });
  });

  describe('distanceToSegment', () => {
    it('should calculate distance to line segment when point projects within segment', () => {
      const p: Vec3 = { x: 0, y: 1, z: 0 };
      const a: Vec3 = { x: -1, y: 0, z: 0 };
      const b: Vec3 = { x: 1, y: 0, z: 0 };

      expect(distanceToSegment(p, a, b)).toBe(1); // Distance to x-axis
    });

    it('should calculate distance to segment endpoint when point projects outside', () => {
      const p: Vec3 = { x: 2, y: 1, z: 0 };
      const a: Vec3 = { x: -1, y: 0, z: 0 };
      const b: Vec3 = { x: 1, y: 0, z: 0 };

      // Point projects beyond b, so distance is to b
      expect(distanceToSegment(p, a, b)).toBeCloseTo(Math.sqrt(2), 3);
    });

    it('should handle degenerate segment (a == b)', () => {
      const p: Vec3 = { x: 1, y: 1, z: 0 };
      const a: Vec3 = { x: 0, y: 0, z: 0 };
      const b: Vec3 = { x: 0, y: 0, z: 0 };

      expect(distanceToSegment(p, a, b)).toBeCloseTo(Math.sqrt(2), 3);
    });

    it('should work in 3D space', () => {
      const p: Vec3 = { x: 0, y: 0, z: 1 };
      const a: Vec3 = { x: -1, y: 0, z: 0 };
      const b: Vec3 = { x: 1, y: 0, z: 0 };

      expect(distanceToSegment(p, a, b)).toBe(1); // Distance to xy-plane
    });
  });

  describe('isNearCriticalStructure', () => {
    const createInstrument = (tipPos: Vec3, prevPos?: Vec3): SurgicalInstrument => ({
      id: 'test-scalpel',
      name: 'Test Scalpel',
      type: 'scalpel',
      tipPosition: tipPos,
      previousTipPosition: prevPos,
      safetyRadius: 2.0,
      maxForceNewtons: 5.0,
    });

    const createLandmark = (pos: Vec3, critical: boolean = true): AnatomicalLandmark => ({
      id: 'test-landmark',
      name: 'Test Landmark',
      position: pos,
      system: 'nervous',
      critical,
    });

    it('should detect when instrument is near critical structure', () => {
      const instrument = createInstrument({ x: 0, y: 0, z: 0 });
      const landmarks = [createLandmark({ x: 1, y: 0, z: 0 })];

      const result = isNearCriticalStructure(instrument, landmarks);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-landmark');
    });

    it('should return null when instrument is far from critical structures', () => {
      const instrument = createInstrument({ x: 0, y: 0, z: 0 });
      const landmarks = [createLandmark({ x: 5, y: 0, z: 0 })];

      const result = isNearCriticalStructure(instrument, landmarks);
      expect(result).toBeNull();
    });

    it('should ignore non-critical landmarks', () => {
      const instrument = createInstrument({ x: 0, y: 0, z: 0 });
      const landmarks = [createLandmark({ x: 1, y: 0, z: 0 }, false)];

      const result = isNearCriticalStructure(instrument, landmarks);
      expect(result).toBeNull();
    });

    it('should use continuous collision detection when previous position available', () => {
      const instrument = createInstrument({ x: 5, y: 0, z: 0 }, { x: -5, y: 0, z: 0 });
      const landmarks = [createLandmark({ x: 0, y: 1, z: 0 })];

      // Fast-moving instrument passes near landmark
      const result = isNearCriticalStructure(instrument, landmarks);
      expect(result).not.toBeNull();
    });

    it('should check multiple landmarks and return first violation', () => {
      const instrument = createInstrument({ x: 0, y: 0, z: 0 });
      const landmarks = [
        { ...createLandmark({ x: 10, y: 0, z: 0 }), id: 'far-landmark' },
        { ...createLandmark({ x: 1, y: 0, z: 0 }), id: 'near-landmark' },
      ];

      const result = isNearCriticalStructure(instrument, landmarks);
      expect(result?.id).toBe('near-landmark'); // Nearest landmark to instrument
    });
  });

  describe('processVitalsTelemetry', () => {
    const normalVitals: PatientVitals = {
      heartRateBPM: 80,
      spO2: 98,
      systolicBP: 120,
      diastolicBP: 80,
      respiratoryRate: 16,
    };

    it('should process normal vitals correctly', () => {
      const result = processVitalsTelemetry(normalVitals);

      expect(result.vitals).toEqual(normalVitals);
      expect(result.warningState).toBe('normal');
      expect(result.hapticMultiplier).toBe(1.0);
      expect(typeof result.timestamp).toBe('number');
    });

    it('should detect tachycardia and set caution state', () => {
      const vitals = { ...normalVitals, heartRateBPM: 130 };
      const result = processVitalsTelemetry(vitals);

      expect(result.warningState).toBe('caution');
      expect(result.hapticMultiplier).toBe(1.5);
    });

    it('should detect bradycardia and set caution state', () => {
      const vitals = { ...normalVitals, heartRateBPM: 45 };
      const result = processVitalsTelemetry(vitals);

      expect(result.warningState).toBe('caution');
      expect(result.hapticMultiplier).toBe(1.5);
    });

    it('should detect severe tachycardia and set critical state', () => {
      const vitals = { ...normalVitals, heartRateBPM: 170 };
      const result = processVitalsTelemetry(vitals);

      expect(result.warningState).toBe('critical');
      expect(result.hapticMultiplier).toBe(2.0);
    });

    it('should detect severe bradycardia and set critical state', () => {
      const vitals = { ...normalVitals, heartRateBPM: 35 };
      const result = processVitalsTelemetry(vitals);

      expect(result.warningState).toBe('critical');
      expect(result.hapticMultiplier).toBe(2.0);
    });

    it('should detect hypoxemia and set critical state', () => {
      const vitals = { ...normalVitals, spO2: 85 };
      const result = processVitalsTelemetry(vitals);

      expect(result.warningState).toBe('critical');
      expect(result.hapticMultiplier).toBe(2.0);
    });

    it('should prioritize critical over caution conditions', () => {
      const vitals = { ...normalVitals, heartRateBPM: 125, spO2: 85 };
      const result = processVitalsTelemetry(vitals);

      expect(result.warningState).toBe('critical'); // spO2 < 88 overrides HR caution
      expect(result.hapticMultiplier).toBe(2.0);
    });
  });

  describe('hapticResistanceForTissue', () => {
    it('should return correct resistance for each tissue type', () => {
      const expectedResistances: Record<TissueType, number> = {
        skin: 0.3,
        muscle: 0.4,
        bone: 1.0,
        nerve: 0.1,
        vessel: 0.2,
        organ: 0.35,
        connective: 0.5,
      };

      Object.entries(expectedResistances).forEach(([tissue, expectedResistance]) => {
        const resistance = hapticResistanceForTissue(tissue as TissueType);
        expect(resistance).toBe(expectedResistance);
      });
    });

    it('should return bone as highest resistance', () => {
      const boneResistance = hapticResistanceForTissue('bone');
      expect(boneResistance).toBe(1.0);
    });

    it('should return nerve as lowest resistance', () => {
      const nerveResistance = hapticResistanceForTissue('nerve');
      expect(nerveResistance).toBe(0.1);
    });
  });
});
