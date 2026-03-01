/**
 * courtroom-evidence.scenario.ts — LIVING-SPEC: Courtroom 3D Evidence Presenter
 *
 * Persona: Counselor Vega — trial attorney who presents 3D crime scene
 * reconstructions to juries, with annotations, measurements, and witness POVs.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  distance3D, createMeasurement, formatExhibitNumber,
  sortTimelineEvents, filterAdmittedExhibits, exhibitsByClass,
  isExhibitVisible, annotationsForExhibit, totalExhibitCount,
  juryPerspectiveCamera, activeVoiceAnnotation, totalNarrationDuration,
  type EvidenceExhibit, type TimelineEvent, type WitnessPOV, type Annotation3D, type VoiceAnnotation,
} from '@/lib/courtroomEvidence';

describe('Scenario: Courtroom Evidence — Measurements', () => {
  it('distance3D() returns Euclidean distance', () => {
    expect(distance3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });

  it('createMeasurement() includes calculated distance', () => {
    const m = createMeasurement({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'Hallway');
    expect(m.distanceMeters).toBe(10);
    expect(m.label).toBe('Hallway');
  });

  it('formatExhibitNumber() generates hierarchical IDs', () => {
    expect(formatExhibitNumber('CR-2024', 0)).toBe('CR-2024-A-1');
    expect(formatExhibitNumber('CR-2024', 10)).toBe('CR-2024-B-1');
  });
});

describe('Scenario: Courtroom Evidence — Timeline & Exhibits', () => {
  const exhibits: EvidenceExhibit[] = [
    { id: 'e1', exhibitNumber: 'A-1', title: 'Weapon', class: 'physical', description: 'Knife', admittedDate: '2024-01-15', objectionsRuled: 'admitted', position: { x: 5, y: 0, z: 3 } },
    { id: 'e2', exhibitNumber: 'A-2', title: 'Security Footage', class: 'digital', description: 'Lobby camera', admittedDate: '2024-01-15', objectionsRuled: 'admitted' },
    { id: 'e3', exhibitNumber: 'A-3', title: 'Text Messages', class: 'digital', description: 'Phone export', admittedDate: '2024-01-16', objectionsRuled: 'sustained' },
    { id: 'e4', exhibitNumber: 'B-1', title: 'Witness Sketch', class: 'testimonial', description: 'Composite', admittedDate: '2024-01-17', objectionsRuled: 'admitted' },
  ];

  it('filterAdmittedExhibits() removes sustained objections', () => {
    const admitted = filterAdmittedExhibits(exhibits);
    expect(admitted).toHaveLength(3);
    expect(admitted.find(e => e.id === 'e3')).toBeUndefined();
  });

  it('exhibitsByClass(digital) returns 2 digital exhibits', () => {
    expect(exhibitsByClass(exhibits, 'digital')).toHaveLength(2);
  });

  it('totalExhibitCount() breaks down by class', () => {
    const counts = totalExhibitCount(exhibits);
    expect(counts.physical).toBe(1);
    expect(counts.digital).toBe(2);
    expect(counts.testimonial).toBe(1);
  });

  it('sortTimelineEvents() orders by timestamp', () => {
    const events: TimelineEvent[] = [
      { id: 't3', timestamp: 3000, label: 'C', description: '', linkedExhibits: [] },
      { id: 't1', timestamp: 1000, label: 'A', description: '', linkedExhibits: [] },
      { id: 't2', timestamp: 2000, label: 'B', description: '', linkedExhibits: [] },
    ];
    const sorted = sortTimelineEvents(events);
    expect(sorted.map(e => e.label)).toEqual(['A', 'B', 'C']);
  });
});

describe('Scenario: Courtroom Evidence — Witness & Annotations', () => {
  const pov: WitnessPOV = {
    id: 'w1', witnessName: 'Mr. Park', position: { x: 20, y: 1.6, z: 10 },
    lookDirection: { x: -1, y: 0, z: 0 }, fovDegrees: 120,
    timeOfEvent: Date.now(), canSee: ['e1', 'e2'],
  };

  const annotations: Annotation3D[] = [
    { id: 'a1', type: 'label', position: { x: 5, y: 1, z: 3 }, text: 'Weapon location', color: '#ff0000', visible: true, linkedEvidenceId: 'e1' },
    { id: 'a2', type: 'measurement', position: { x: 5, y: 0, z: 3 }, targetPosition: { x: 10, y: 0, z: 3 }, text: '5m', color: '#00ff00', visible: true, linkedEvidenceId: 'e1' },
    { id: 'a3', type: 'arrow', position: { x: 0, y: 0, z: 0 }, text: 'Entry', color: '#0000ff', visible: true, linkedEvidenceId: 'e2' },
  ];

  it('isExhibitVisible() checks witness canSee list', () => {
    expect(isExhibitVisible({ id: 'e1', exhibitNumber: 'A-1', title: '', class: 'physical', description: '', admittedDate: '', objectionsRuled: 'admitted' }, pov)).toBe(true);
    expect(isExhibitVisible({ id: 'e3', exhibitNumber: 'A-3', title: '', class: 'digital', description: '', admittedDate: '', objectionsRuled: 'admitted' }, pov)).toBe(false);
  });

  it('annotationsForExhibit() filters by linked exhibit', () => {
    expect(annotationsForExhibit(annotations, 'e1')).toHaveLength(2);
    expect(annotationsForExhibit(annotations, 'e2')).toHaveLength(1);
    expect(annotationsForExhibit(annotations, 'e3')).toHaveLength(0);
  });

  it('jury perspective mode — locked camera angle facing evidence display', () => {
    const cam = juryPerspectiveCamera({ x: 15, y: 1.5, z: 8 }, { x: 5, y: 1, z: 3 });
    expect(cam.label).toBe('Jury Perspective');
    expect(cam.position.x).toBe(15);
    expect(cam.lookAt.x).toBe(5);
    expect(cam.fov).toBe(60);
  });

  it('voice annotation playback — sync audio commentary with 3D walkthrough', () => {
    const annotations: VoiceAnnotation[] = [
      { id: 'v1', startTimeSec: 0, endTimeSec: 10, transcript: 'The defendant entered here', speakerName: 'Prosecutor', linkedPosition: { x: 5, y: 0, z: 3 } },
      { id: 'v2', startTimeSec: 10, endTimeSec: 25, transcript: 'The weapon was found here', speakerName: 'Prosecutor', linkedPosition: { x: 8, y: 0, z: 5 } },
    ];
    expect(activeVoiceAnnotation(annotations, 5)?.id).toBe('v1');
    expect(activeVoiceAnnotation(annotations, 15)?.id).toBe('v2');
    expect(activeVoiceAnnotation(annotations, 30)).toBeNull();
    expect(totalNarrationDuration(annotations)).toBe(25);
  });
});
