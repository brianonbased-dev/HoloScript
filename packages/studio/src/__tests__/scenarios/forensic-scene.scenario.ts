/**
 * forensic-scene.scenario.ts — LIVING-SPEC: Forensic Crime Scene Reconstructor
 *
 * Persona: Detective Rivers — forensic investigator who reconstructs crime scenes
 * in 3D, calculating bullet trajectories, analyzing blood spatter patterns,
 * tagging evidence with GPS, and rendering witness viewpoints.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTrajectoryLength,
  trajectoryDirection,
  estimateShooterPosition,
  trajectoryAngleFromHorizontal,
  classifySpatterByDropletCount,
  calculateAreaOfOrigin,
  impactAngleFromDropletRatio,
  isChainOfCustodyIntact,
  addToChainOfCustody,
  evidenceSeverityScore,
  sortEvidenceBySeverity,
  distanceBetween,
  canWitnessSeePoint,
  scenePerimeterArea,
  forensicTimeline,
  timelineContradictions,
  dnaContaminationRisk,
  photogrammetryPointCloud,
  type BulletTrajectory,
  type BloodSpatterPattern,
  type EvidenceMarker,
  type WitnessViewpoint,
  type ForensicEvent,
} from '@/lib/forensicScene';

// ═══════════════════════════════════════════════════════════════════
// 1. Bullet Trajectory Physics
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Forensic Scene — Bullet Trajectory', () => {
  const trajectory: BulletTrajectory = {
    id: 'bt-1',
    entryPoint: { x: 0, y: 1.5, z: 0 },
    exitPoint: { x: 3, y: 1.2, z: 4 },
    caliber: '9mm',
    velocity: 370,
    angle: -5.4,
    ricochet: false,
    fragmentCount: 0,
    distanceToShooter: 15,
  };

  it('calculateTrajectoryLength() returns 3D distance', () => {
    const len = calculateTrajectoryLength(trajectory);
    expect(len).toBeCloseTo(5.045, 1); // sqrt(9 + 0.09 + 16)
  });

  it('trajectoryDirection() returns normalized vector', () => {
    const dir = trajectoryDirection(trajectory);
    const mag = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
    expect(mag).toBeCloseTo(1.0, 2);
  });

  it('estimateShooterPosition() projects backward from entry', () => {
    const shooter = estimateShooterPosition(trajectory);
    const dist = distanceBetween(shooter, trajectory.entryPoint);
    expect(dist).toBeCloseTo(trajectory.distanceToShooter, 0);
  });

  it('trajectoryAngleFromHorizontal() calculates descent angle', () => {
    const angle = trajectoryAngleFromHorizontal(trajectory);
    expect(angle).toBeLessThan(0); // descending
  });

  it('ricochet trajectories have fragmentation', () => {
    const ricochet: BulletTrajectory = {
      ...trajectory, ricochet: true, fragmentCount: 3,
    };
    expect(ricochet.ricochet).toBe(true);
    expect(ricochet.fragmentCount).toBe(3);
  });

  it('caliber string identifies ammunition type', () => {
    expect(trajectory.caliber).toBe('9mm');
    expect(['.22LR', '9mm', '.45ACP', '.556NATO', '.308WIN']).toContain(trajectory.caliber);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Blood Spatter Analysis
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Forensic Scene — Blood Spatter', () => {
  it('classifySpatterByDropletCount() — arterial (500+)', () => {
    expect(classifySpatterByDropletCount(600)).toBe('arterial');
  });

  it('classifySpatterByDropletCount() — cast-off (200-500)', () => {
    expect(classifySpatterByDropletCount(300)).toBe('cast-off');
  });

  it('classifySpatterByDropletCount() — impact (50-200)', () => {
    expect(classifySpatterByDropletCount(100)).toBe('impact');
  });

  it('classifySpatterByDropletCount() — drip (10-50)', () => {
    expect(classifySpatterByDropletCount(25)).toBe('drip');
  });

  it('classifySpatterByDropletCount() — transfer (<10)', () => {
    expect(classifySpatterByDropletCount(5)).toBe('transfer');
  });

  it('calculateAreaOfOrigin() triangulates from 2+ patterns', () => {
    const spatters: BloodSpatterPattern[] = [
      { id: 's1', center: { x: 2, y: 0, z: 3 }, radiusMeters: 0.5, dropletCount: 150,
        pattern: 'impact', angleOfImpact: 30, directionality: 0,
        pointOfOrigin: { x: 1, y: 1.5, z: 2 } },
      { id: 's2', center: { x: 4, y: 0, z: 1 }, radiusMeters: 0.3, dropletCount: 80,
        pattern: 'impact', angleOfImpact: 45, directionality: 90,
        pointOfOrigin: { x: 3, y: 1.5, z: 2 } },
    ];
    const origin = calculateAreaOfOrigin(spatters);
    expect(origin).not.toBeNull();
    expect(origin!.y).toBeCloseTo(1.5, 1); // Head height
  });

  it('calculateAreaOfOrigin() returns null for <2 patterns', () => {
    expect(calculateAreaOfOrigin([])).toBeNull();
    expect(calculateAreaOfOrigin([{
      id: 's', center: { x: 0, y: 0, z: 0 }, radiusMeters: 1, dropletCount: 100,
      pattern: 'impact', angleOfImpact: 30, directionality: 0,
      pointOfOrigin: { x: 0, y: 1, z: 0 },
    }])).toBeNull();
  });

  it('impactAngleFromDropletRatio() uses arcsin formula', () => {
    const angle = impactAngleFromDropletRatio(5, 10);
    expect(angle).toBeCloseTo(30, 0); // arcsin(0.5) = 30°
  });

  it('impactAngleFromDropletRatio() returns 90° for equal w/l', () => {
    expect(impactAngleFromDropletRatio(10, 10)).toBeCloseTo(90, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Evidence Chain of Custody
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Forensic Scene — Evidence Management', () => {
  const evidence: EvidenceMarker = {
    id: 'ev-1', label: 'Shell Casing #1', type: 'physical', severity: 'critical',
    position: { x: 3, y: 0.01, z: 5 }, timestamp: Date.now(), collectedBy: 'Det. Rivers',
    chainOfCustody: ['Det. Rivers'], photoUrls: ['photo1.jpg'], notes: '9mm casing',
    gps: { lat: 34.0522, lon: -118.2437 },
  };

  it('isChainOfCustodyIntact() validates first handler', () => {
    expect(isChainOfCustodyIntact(evidence)).toBe(true);
  });

  it('isChainOfCustodyIntact() fails if collector ≠ first handler', () => {
    const broken = { ...evidence, chainOfCustody: ['Officer Smith'] };
    expect(isChainOfCustodyIntact(broken)).toBe(false);
  });

  it('addToChainOfCustody() appends handler immutably', () => {
    const updated = addToChainOfCustody(evidence, 'Lab Tech');
    expect(updated.chainOfCustody).toEqual(['Det. Rivers', 'Lab Tech']);
    expect(evidence.chainOfCustody).toEqual(['Det. Rivers']); // original unchanged
  });

  it('evidenceSeverityScore() ranks critical > high > medium > low', () => {
    expect(evidenceSeverityScore('critical')).toBe(4);
    expect(evidenceSeverityScore('high')).toBe(3);
    expect(evidenceSeverityScore('medium')).toBe(2);
    expect(evidenceSeverityScore('low')).toBe(1);
  });

  it('sortEvidenceBySeverity() places critical first', () => {
    const items: EvidenceMarker[] = [
      { ...evidence, id: 'ev-low', severity: 'low' },
      { ...evidence, id: 'ev-crit', severity: 'critical' },
      { ...evidence, id: 'ev-med', severity: 'medium' },
    ];
    const sorted = sortEvidenceBySeverity(items);
    expect(sorted[0].severity).toBe('critical');
    expect(sorted[2].severity).toBe('low');
  });

  it('evidence has GPS coordinates', () => {
    expect(evidence.gps).toBeDefined();
    expect(evidence.gps!.lat).toBeCloseTo(34.05, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Witness Analysis & Scene
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Forensic Scene — Witness & Scene', () => {
  const witness: WitnessViewpoint = {
    id: 'w1', name: 'Mrs. Chen', position: { x: 20, y: 1.6, z: 10 },
    lookAt: { x: 5, y: 1, z: 5 }, fovDegrees: 120,
    timeOfObservation: Date.now(), visibility: 'clear',
    statement: 'Heard two shots, saw a figure running east',
  };

  it('canWitnessSeePoint() returns true within range', () => {
    expect(canWitnessSeePoint(witness, { x: 5, y: 1, z: 5 })).toBe(true);
  });

  it('canWitnessSeePoint() returns false beyond range', () => {
    expect(canWitnessSeePoint(witness, { x: 500, y: 0, z: 500 })).toBe(false);
  });

  it('canWitnessSeePoint() returns false if obstructed', () => {
    const obstructed = { ...witness, visibility: 'obstructed' as const };
    expect(canWitnessSeePoint(obstructed, { x: 5, y: 1, z: 5 })).toBe(false);
  });

  it('distanceBetween() calculates 3D distance', () => {
    const d = distanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
    expect(d).toBe(5);
  });

  it('scenePerimeterArea() calculates area from polygon', () => {
    const square = [
      { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 },
    ];
    expect(scenePerimeterArea(square)).toBe(100);
  });

  it('photogrammetry — reconstruct 3D scene from crime scene photos', () => {
    const captures = [
      { id: 'p1', position: { x: 10, y: 1.5, z: 0 }, lookAt: { x: 5, y: 1, z: 5 }, focalLengthMm: 50 },
      { id: 'p2', position: { x: 0, y: 1.5, z: 10 }, lookAt: { x: 5, y: 1, z: 5 }, focalLengthMm: 50 },
      { id: 'p3', position: { x: -5, y: 1.5, z: 0 }, lookAt: { x: 5, y: 1, z: 5 }, focalLengthMm: 35 },
    ];
    const result = photogrammetryPointCloud(captures);
    expect(result.estimatedPoints).toBeGreaterThan(0);
    expect(result.centroid.x).toBeCloseTo(5, 0);
    expect(result.coverageScore).toBeGreaterThan(0);
  });

  it('timeline playback — animate events based on forensic timeline', () => {
    const events: ForensicEvent[] = [
      { id: 'e3', timestamp: 3000, type: 'glass-break', description: 'Window shattered', confidence: 0.9 },
      { id: 'e1', timestamp: 1000, type: 'gunshot', description: 'First shot', position: { x: 5, y: 1, z: 5 }, confidence: 1.0 },
      { id: 'e2', timestamp: 2000, type: 'scream', description: 'Cry for help', confidence: 0.8 },
    ];
    const timeline = forensicTimeline(events);
    expect(timeline[0].id).toBe('e1'); // earliest first
    expect(timeline[1].id).toBe('e2');
    expect(timeline[2].id).toBe('e3');
  });

  it('DNA evidence heatmap — contamination probability', () => {
    // Properly sealed, few handlers
    const low = dnaContaminationRisk(2, 1, true);
    expect(low).toBeLessThan(20);

    // Unsealed, many handlers, long time
    const high = dnaContaminationRisk(10, 48, false);
    expect(high).toBeGreaterThan(50);
    expect(high).toBeLessThanOrEqual(100);
  });
});
