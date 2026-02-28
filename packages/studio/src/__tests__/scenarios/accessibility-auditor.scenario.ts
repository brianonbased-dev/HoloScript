/**
 * accessibility-auditor.scenario.ts — LIVING-SPEC: Accessibility Auditor
 *
 * Persona: Maya — accessibility consultant who walks through buildings
 * in VR from wheelchair perspective, checking ADA compliance for doorways,
 * ramps, elevators, and restrooms.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect } from 'vitest';
import {
  checkDoorway,
  checkRamp,
  checkElevator,
  rampSlopePercent,
  rampSlopeRatio,
  generateAuditReport,
  wheelchairTurningRadius,
  isPathWideEnough,
  ADA,
  type Doorway,
  type Ramp,
  type Elevator,
  type AuditFinding,
} from '@/lib/accessibilityAuditor';

// ═══════════════════════════════════════════════════════════════════
// 1. Doorway Assessment
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Accessibility Auditor — Doorways', () => {
  it('ADA-compliant door (90cm wide, lever, low threshold) passes', () => {
    const door: Doorway = {
      id: 'd1', name: 'Main Entrance', position: { x: 0, y: 0, z: 0 },
      widthCm: 90, heightCm: 210, thresholdCm: 0.5,
      hasAutoOpener: false, handleType: 'lever', forceNewtons: 15,
    };
    const findings = checkDoorway(door);
    expect(findings).toHaveLength(0);
  });

  it('narrow door (70cm) fails ADA 404.2.3', () => {
    const door: Doorway = {
      id: 'd2', name: 'Storage', position: { x: 5, y: 0, z: 0 },
      widthCm: 70, heightCm: 200, thresholdCm: 0,
      hasAutoOpener: false, handleType: 'lever', forceNewtons: 10,
    };
    const findings = checkDoorway(door);
    expect(findings.some(f => f.standard === 'ADA 404.2.3')).toBe(true);
  });

  it('high threshold (3cm) fails ADA 404.2.5', () => {
    const door: Doorway = {
      id: 'd3', name: 'Patio', position: { x: 10, y: 0, z: 0 },
      widthCm: 91.4, heightCm: 210, thresholdCm: 3,
      hasAutoOpener: false, handleType: 'lever', forceNewtons: 15,
    };
    const findings = checkDoorway(door);
    expect(findings.some(f => f.standard === 'ADA 404.2.5')).toBe(true);
  });

  it('round knob handle fails ADA 404.2.7', () => {
    const door: Doorway = {
      id: 'd4', name: 'Office', position: { x: 15, y: 0, z: 0 },
      widthCm: 91.4, heightCm: 210, thresholdCm: 0,
      hasAutoOpener: false, handleType: 'knob', forceNewtons: 15,
    };
    const findings = checkDoorway(door);
    expect(findings.some(f => f.description.includes('knob'))).toBe(true);
  });

  it('heavy door (30N) without auto-opener gets warning', () => {
    const door: Doorway = {
      id: 'd5', name: 'Fire Door', position: { x: 20, y: 0, z: 0 },
      widthCm: 91.4, heightCm: 210, thresholdCm: 0,
      hasAutoOpener: false, handleType: 'push', forceNewtons: 30,
    };
    const findings = checkDoorway(door);
    expect(findings.some(f => f.compliance === 'warning')).toBe(true);
  });

  it('ADA minimum door width is 81.3cm (32 inches)', () => {
    expect(ADA.MIN_DOOR_WIDTH_CM).toBe(81.3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Ramp Assessment
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Accessibility Auditor — Ramps', () => {
  it('rampSlopePercent() calculates grade', () => {
    const ramp: Ramp = {
      id: 'r1', name: 'Front Ramp', startPos: { x: 0, y: 0, z: 0 },
      endPos: { x: 12, y: 1, z: 0 }, lengthMeters: 12, riseMeters: 1,
      widthCm: 100, hasHandrails: true, hasLandings: true, surfaceType: 'concrete',
    };
    expect(rampSlopePercent(ramp)).toBeCloseTo(8.33, 1); // 1:12
  });

  it('rampSlopeRatio() returns 1:N format', () => {
    const ramp: Ramp = {
      id: 'r2', name: 'Side Ramp', startPos: { x: 0, y: 0, z: 0 },
      endPos: { x: 12, y: 1, z: 0 }, lengthMeters: 12, riseMeters: 1,
      widthCm: 100, hasHandrails: true, hasLandings: true, surfaceType: 'concrete',
    };
    expect(rampSlopeRatio(ramp)).toBe('1:12');
  });

  it('ADA-compliant ramp (1:14, wide, with handrails) passes', () => {
    const ramp: Ramp = {
      id: 'r3', name: 'Good Ramp', startPos: { x: 0, y: 0, z: 0 },
      endPos: { x: 14, y: 1, z: 0 }, lengthMeters: 14, riseMeters: 1,
      widthCm: 100, hasHandrails: true, hasLandings: true, surfaceType: 'concrete',
    };
    expect(checkRamp(ramp)).toHaveLength(0);
  });

  it('steep ramp (1:8) fails ADA 405.2', () => {
    const ramp: Ramp = {
      id: 'r4', name: 'Steep', startPos: { x: 0, y: 0, z: 0 },
      endPos: { x: 8, y: 1, z: 0 }, lengthMeters: 8, riseMeters: 1,
      widthCm: 100, hasHandrails: true, hasLandings: true, surfaceType: 'concrete',
    };
    const findings = checkRamp(ramp);
    expect(findings.some(f => f.standard === 'ADA 405.2')).toBe(true);
  });

  it('narrow ramp (60cm) fails ADA 405.5', () => {
    const ramp: Ramp = {
      id: 'r5', name: 'Narrow', startPos: { x: 0, y: 0, z: 0 },
      endPos: { x: 12, y: 1, z: 0 }, lengthMeters: 12, riseMeters: 1,
      widthCm: 60, hasHandrails: true, hasLandings: true, surfaceType: 'concrete',
    };
    const findings = checkRamp(ramp);
    expect(findings.some(f => f.standard === 'ADA 405.5')).toBe(true);
  });

  it('ramp without handrails (rise > 15cm) fails ADA 405.8', () => {
    const ramp: Ramp = {
      id: 'r6', name: 'No Rails', startPos: { x: 0, y: 0, z: 0 },
      endPos: { x: 12, y: 1, z: 0 }, lengthMeters: 12, riseMeters: 1,
      widthCm: 100, hasHandrails: false, hasLandings: true, surfaceType: 'concrete',
    };
    const findings = checkRamp(ramp);
    expect(findings.some(f => f.standard === 'ADA 405.8')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Elevator Assessment
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Accessibility Auditor — Elevators', () => {
  it('ADA-compliant elevator passes all checks', () => {
    const elev: Elevator = {
      id: 'e1', position: { x: 0, y: 0, z: 0 },
      cabWidthCm: 175, cabDepthCm: 140, doorWidthCm: 95,
      floorsServed: [1, 2, 3], hasBraille: true, hasAudioAnnounce: true,
      controlHeightCm: 120,
    };
    const findings = checkElevator(elev);
    expect(findings).toHaveLength(0);
  });

  it('narrow door fails ADA 407.3.6', () => {
    const elev: Elevator = {
      id: 'e2', position: { x: 0, y: 0, z: 0 },
      cabWidthCm: 175, cabDepthCm: 140, doorWidthCm: 75,
      floorsServed: [1, 2], hasBraille: true, hasAudioAnnounce: true,
      controlHeightCm: 120,
    };
    expect(checkElevator(elev).some(f => f.standard === 'ADA 407.3.6')).toBe(true);
  });

  it('high controls (150cm) fail ADA 407.4.6', () => {
    const elev: Elevator = {
      id: 'e3', position: { x: 0, y: 0, z: 0 },
      cabWidthCm: 175, cabDepthCm: 140, doorWidthCm: 95,
      floorsServed: [1, 2], hasBraille: true, hasAudioAnnounce: true,
      controlHeightCm: 150,
    };
    expect(checkElevator(elev).some(f => f.standard === 'ADA 407.4.6')).toBe(true);
  });

  it('missing Braille fails ADA 407.4.7', () => {
    const elev: Elevator = {
      id: 'e4', position: { x: 0, y: 0, z: 0 },
      cabWidthCm: 175, cabDepthCm: 140, doorWidthCm: 95,
      floorsServed: [1, 2], hasBraille: false, hasAudioAnnounce: true,
      controlHeightCm: 120,
    };
    expect(checkElevator(elev).some(f => f.standard === 'ADA 407.4.7')).toBe(true);
  });

  it('no audio announce gets warning', () => {
    const elev: Elevator = {
      id: 'e5', position: { x: 0, y: 0, z: 0 },
      cabWidthCm: 175, cabDepthCm: 140, doorWidthCm: 95,
      floorsServed: [1, 2], hasBraille: true, hasAudioAnnounce: false,
      controlHeightCm: 120,
    };
    expect(checkElevator(elev).some(f => f.compliance === 'warning')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Audit Report & Mobility
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Accessibility Auditor — Reports & Mobility', () => {
  it('generateAuditReport() counts passes, warnings, fails', () => {
    const findings: AuditFinding[] = [
      { id: 'f1', elementId: 'd1', elementType: 'doorway', compliance: 'pass', standard: 'ADA 404', description: 'OK' },
      { id: 'f2', elementId: 'r1', elementType: 'ramp', compliance: 'fail', standard: 'ADA 405', description: 'Too steep' },
      { id: 'f3', elementId: 'e1', elementType: 'elevator', compliance: 'warning', standard: 'ADA 407', description: 'No audio' },
    ];
    const report = generateAuditReport('Test Building', findings);
    expect(report.passCount).toBe(1);
    expect(report.warningCount).toBe(1);
    expect(report.failCount).toBe(1);
    expect(report.overallScore).toBe(50); // (1 pass + 0.5 warning) / 3 * 100
  });

  it('perfect audit gets 100 score', () => {
    const findings: AuditFinding[] = [
      { id: 'f1', elementId: 'd1', elementType: 'doorway', compliance: 'pass', standard: 'ADA', description: 'OK' },
      { id: 'f2', elementId: 'd2', elementType: 'doorway', compliance: 'pass', standard: 'ADA', description: 'OK' },
    ];
    expect(generateAuditReport('Perfect', findings).overallScore).toBe(100);
  });

  it('wheelchairTurningRadius() calculates from device width', () => {
    const radius = wheelchairTurningRadius(63.5); // manual wheelchair width
    expect(radius).toBeCloseTo(99.75, 0); // ~100cm
  });

  it('isPathWideEnough() checks clearance for manual wheelchair', () => {
    expect(isPathWideEnough(90, 'manual-wheelchair')).toBe(true);  // 63.5 + 15 = 78.5 < 90
    expect(isPathWideEnough(70, 'manual-wheelchair')).toBe(false); // 70 < 78.5
  });

  it('isPathWideEnough() crutches need wider clearance', () => {
    expect(isPathWideEnough(100, 'crutches')).toBe(false); // 91.4 + 15 = 106.4 > 100
    expect(isPathWideEnough(110, 'crutches')).toBe(true);
  });

  it('ADA turning radius is 152.4cm (60 inches / 5 feet)', () => {
    expect(ADA.MIN_TURNING_RADIUS_CM).toBe(152.4);
  });

  it.todo('VR wheelchair perspective — render at seated eye height (112cm)');
  it.todo('pathfinding — find wheelchair-accessible route through building');
  it.todo('color contrast checker — WCAG 2.1 AA/AAA signage compliance');
});
