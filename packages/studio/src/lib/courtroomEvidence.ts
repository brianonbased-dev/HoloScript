/**
 * courtroomEvidence.ts — Courtroom 3D Evidence Presentation Engine
 *
 * 3D scene annotation, witness perspective rendering, evidence timeline,
 * measurement tools, and jury-facing presentation modes.
 */

export type Vec3 = [number, number, number];

export type AnnotationType = 'label' | 'measurement' | 'highlight' | 'arrow' | 'circle' | 'callout';
export type EvidenceClass =
  | 'physical'
  | 'digital'
  | 'testimonial'
  | 'demonstrative'
  | 'documentary';
export type PresentationMode =
  | 'overview'
  | 'walkthrough'
  | 'witness-pov'
  | 'comparison'
  | 'timeline';

export interface Annotation3D {
  id: string;
  type: AnnotationType;
  position: Vec3;
  targetPosition?: Vec3; // For arrows/measurements
  text: string;
  color: string;
  visible: boolean;
  linkedEvidenceId?: string;
}

export interface EvidenceExhibit {
  id: string;
  exhibitNumber: string; // e.g., 'Exhibit A-1'
  title: string;
  class: EvidenceClass;
  description: string;
  admittedDate: string;
  objectionsRuled: 'admitted' | 'sustained' | 'overruled' | 'pending';
  position?: Vec3; // 3D placement in scene
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  label: string;
  description: string;
  linkedExhibits: string[];
  position?: Vec3;
}

export interface WitnessPOV {
  id: string;
  witnessName: string;
  position: Vec3;
  lookDirection: Vec3;
  fovDegrees: number;
  timeOfEvent: number;
  canSee: string[]; // IDs of visible exhibits
}

export interface MeasurementResult {
  from: Vec3;
  to: Vec3;
  distanceMeters: number;
  label: string;
}

// ═══════════════════════════════════════════════════════════════════
// Core Functions
// ═══════════════════════════════════════════════════════════════════

export function distance3D(a: Vec3, b: Vec3): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

export function createMeasurement(from: Vec3, to: Vec3, label: string): MeasurementResult {
  return { from, to, distanceMeters: distance3D(from, to), label };
}

export function formatExhibitNumber(casePrefix: string, index: number): string {
  const letter = String.fromCharCode(65 + Math.floor(index / 10));
  const num = (index % 10) + 1;
  return `${casePrefix}-${letter}-${num}`;
}

export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.timestamp - b.timestamp);
}

export function filterAdmittedExhibits(exhibits: EvidenceExhibit[]): EvidenceExhibit[] {
  return exhibits.filter((e) => e.objectionsRuled === 'admitted');
}

export function exhibitsByClass(
  exhibits: EvidenceExhibit[],
  cls: EvidenceClass
): EvidenceExhibit[] {
  return exhibits.filter((e) => e.class === cls);
}

export function isExhibitVisible(exhibit: EvidenceExhibit, pov: WitnessPOV): boolean {
  return pov.canSee.includes(exhibit.id);
}

export function annotationsForExhibit(
  annotations: Annotation3D[],
  exhibitId: string
): Annotation3D[] {
  return annotations.filter((a) => a.linkedEvidenceId === exhibitId);
}

export function totalExhibitCount(exhibits: EvidenceExhibit[]): Record<EvidenceClass, number> {
  const counts: Record<EvidenceClass, number> = {
    physical: 0,
    digital: 0,
    testimonial: 0,
    demonstrative: 0,
    documentary: 0,
  };
  for (const e of exhibits) counts[e.class]++;
  return counts;
}

// ═══════════════════════════════════════════════════════════════════
// Jury Perspective Camera
// ═══════════════════════════════════════════════════════════════════

export interface CameraSetup {
  position: Vec3;
  lookAt: Vec3;
  fov: number;
  label: string;
}

/**
 * Generate a locked jury perspective camera facing the evidence display.
 */
export function juryPerspectiveCamera(
  juryBoxCenter: Vec3,
  evidenceDisplayCenter: Vec3,
  fovDegrees: number = 60
): CameraSetup {
  return {
    position: juryBoxCenter,
    lookAt: evidenceDisplayCenter,
    fov: fovDegrees,
    label: 'Jury Perspective',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Voice Annotation Playback
// ═══════════════════════════════════════════════════════════════════

export interface VoiceAnnotation {
  id: string;
  startTimeSec: number;
  endTimeSec: number;
  transcript: string;
  speakerName: string;
  linkedPosition?: Vec3;
}

/**
 * Find the active voice annotation at a given playback time.
 */
export function activeVoiceAnnotation(
  annotations: VoiceAnnotation[],
  timeSec: number
): VoiceAnnotation | null {
  return annotations.find((a) => timeSec >= a.startTimeSec && timeSec < a.endTimeSec) ?? null;
}

/**
 * Compute total narration duration from all voice annotations.
 */
export function totalNarrationDuration(annotations: VoiceAnnotation[]): number {
  return annotations.reduce((sum, a) => sum + (a.endTimeSec - a.startTimeSec), 0);
}
