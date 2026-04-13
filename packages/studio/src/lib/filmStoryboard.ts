/**
 * filmStoryboard.ts — Film Storyboarding Engine
 *
 * Shot composition, scene planning, camera angles,
 * narrative structure, and production scheduling.
 */

export type ShotSize =
  | 'extreme-wide'
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'extreme-close-up'
  | 'over-shoulder';
export type CameraMovement =
  | 'static'
  | 'pan'
  | 'tilt'
  | 'dolly'
  | 'crane'
  | 'handheld'
  | 'steadicam'
  | 'drone';
export type LightingSetup =
  | 'three-point'
  | 'natural'
  | 'high-key'
  | 'low-key'
  | 'chiaroscuro'
  | 'silhouette';
export type NarrativeAct = 'setup' | 'confrontation' | 'resolution';

export interface StoryboardPanel {
  id: string;
  sceneNumber: number;
  shotNumber: number;
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  lighting: LightingSetup;
  description: string;
  dialogue: string;
  durationSec: number;
  characters: string[];
  location: string;
  notes: string;
}

export interface Scene {
  id: string;
  number: number;
  name: string;
  act: NarrativeAct;
  location: string;
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  panels: StoryboardPanel[];
  emotionalTone: string;
}

export interface ProductionDay {
  date: string;
  scenes: string[]; // Scene IDs
  castRequired: string[];
  estimatedHours: number;
  location: string;
  weatherDependent: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Shot & Scene Analysis
// ═══════════════════════════════════════════════════════════════════

export function sceneDuration(scene: Scene): number {
  return scene.panels.reduce((sum, p) => sum + p.durationSec, 0);
}

export function totalFilmDuration(scenes: Scene[]): number {
  return scenes.reduce((sum, s) => sum + sceneDuration(s), 0);
}

export function shotCountBySize(panels: StoryboardPanel[]): Record<ShotSize, number> {
  const counts: Record<ShotSize, number> = {
    'extreme-wide': 0,
    wide: 0,
    medium: 0,
    'close-up': 0,
    'extreme-close-up': 0,
    'over-shoulder': 0,
  };
  for (const p of panels) counts[p.shotSize]++;
  return counts;
}

export function panelsByMovement(
  panels: StoryboardPanel[],
  movement: CameraMovement
): StoryboardPanel[] {
  return panels.filter((p) => p.cameraMovement === movement);
}

export function scenesByAct(scenes: Scene[], act: NarrativeAct): Scene[] {
  return scenes.filter((s) => s.act === act);
}

export function averageShotDuration(panels: StoryboardPanel[]): number {
  if (panels.length === 0) return 0;
  return panels.reduce((sum, p) => sum + p.durationSec, 0) / panels.length;
}

// ═══════════════════════════════════════════════════════════════════
// Narrative Structure
// ═══════════════════════════════════════════════════════════════════

export function threeActBalance(scenes: Scene[]): {
  setup: number;
  confrontation: number;
  resolution: number;
} {
  const total = totalFilmDuration(scenes);
  if (total === 0) return { setup: 0, confrontation: 0, resolution: 0 };
  return {
    setup: scenesByAct(scenes, 'setup').reduce((s, sc) => s + sceneDuration(sc), 0) / total,
    confrontation:
      scenesByAct(scenes, 'confrontation').reduce((s, sc) => s + sceneDuration(sc), 0) / total,
    resolution:
      scenesByAct(scenes, 'resolution').reduce((s, sc) => s + sceneDuration(sc), 0) / total,
  };
}

export function isBalancedStructure(balance: {
  setup: number;
  confrontation: number;
  resolution: number;
}): boolean {
  // Classic 25/50/25 split, with tolerance
  return (
    balance.setup >= 0.15 &&
    balance.setup <= 0.35 &&
    balance.confrontation >= 0.35 &&
    balance.confrontation <= 0.6 &&
    balance.resolution >= 0.15 &&
    balance.resolution <= 0.35
  );
}

// ═══════════════════════════════════════════════════════════════════
// Production Planning
// ═══════════════════════════════════════════════════════════════════

export function uniqueLocations(scenes: Scene[]): string[] {
  return [...new Set(scenes.map((s) => s.location))];
}

export function totalProductionDays(days: ProductionDay[]): number {
  return days.length;
}

export function totalProductionHours(days: ProductionDay[]): number {
  return days.reduce((sum, d) => sum + d.estimatedHours, 0);
}

// ═══════════════════════════════════════════════════════════════════
// Shot List Export
// ═══════════════════════════════════════════════════════════════════

export interface ShotListEntry {
  sceneNumber: number;
  shotNumber: number;
  shotSize: ShotSize;
  movement: CameraMovement;
  duration: number;
  description: string;
  location: string;
}

/**
 * Generates a structured shot list from scenes, suitable for export (PDF/CSV).
 */
export function generateShotList(scenes: Scene[]): ShotListEntry[] {
  const entries: ShotListEntry[] = [];
  for (const scene of scenes) {
    for (const panel of scene.panels) {
      entries.push({
        sceneNumber: scene.number,
        shotNumber: panel.shotNumber,
        shotSize: panel.shotSize,
        movement: panel.cameraMovement,
        duration: panel.durationSec,
        description: panel.description,
        location: scene.location,
      });
    }
  }
  return entries;
}

/**
 * Film pacing analysis — shots per minute by act.
 */
export function filmPacing(scenes: Scene[]): Record<NarrativeAct, number> {
  const result: Record<NarrativeAct, number> = { setup: 0, confrontation: 0, resolution: 0 };
  for (const act of ['setup', 'confrontation', 'resolution'] as NarrativeAct[]) {
    const actScenes = scenesByAct(scenes, act);
    const totalShots = actScenes.reduce((s, sc) => s + sc.panels.length, 0);
    const totalMin = actScenes.reduce((s, sc) => s + sceneDuration(sc), 0) / 60;
    result[act] = totalMin > 0 ? totalShots / totalMin : 0;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Previsualization — 3D Camera Path
// ═══════════════════════════════════════════════════════════════════

export interface CameraKeyframe {
  time: number; // seconds
  position: [number, number, number];
  lookAt: { x: number; y: number; z: number };
  fov: number; // field of view degrees
}

/**
 * Generate a previsualization camera path with Catmull-Rom interpolation.
 * Returns interpolated keyframes at the given sample rate.
 */
export function previsCamera(
  keyframes: CameraKeyframe[],
  sampleRate: number // samples per second
): CameraKeyframe[] {
  if (keyframes.length < 2) return [...keyframes];

  const totalDuration = keyframes[keyframes.length - 1].time - keyframes[0].time;
  const numSamples = Math.ceil(totalDuration * sampleRate) + 1;
  const result: CameraKeyframe[] = [];

  for (let i = 0; i < numSamples; i++) {
    const t = keyframes[0].time + (i / (numSamples - 1)) * totalDuration;

    // Find bracketing keyframes
    let k1 = 0;
    for (let k = 0; k < keyframes.length - 1; k++) {
      if (keyframes[k + 1].time >= t) {
        k1 = k;
        break;
      }
    }
    const k2 = Math.min(k1 + 1, keyframes.length - 1);
    const span = keyframes[k2].time - keyframes[k1].time;
    const frac = span > 0 ? (t - keyframes[k1].time) / span : 0;

    // Linear interpolation between keyframes
    const lerp = (a: number, b: number) => a + (b - a) * frac;

    result.push({
      time: t,
      position: {
        x: lerp(keyframes[k1].position.x, keyframes[k2].position.x),
        y: lerp(keyframes[k1].position.y, keyframes[k2].position.y),
        z: lerp(keyframes[k1].position.z, keyframes[k2].position.z),
      },
      lookAt: {
        x: lerp(keyframes[k1].lookAt.x, keyframes[k2].lookAt.x),
        y: lerp(keyframes[k1].lookAt.y, keyframes[k2].lookAt.y),
        z: lerp(keyframes[k1].lookAt.z, keyframes[k2].lookAt.z),
      },
      fov: lerp(keyframes[k1].fov, keyframes[k2].fov),
    });
  }
  return result;
}
