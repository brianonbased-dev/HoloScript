/**
 * filmStoryboard.ts — Film Storyboarding Engine
 *
 * Shot composition, scene planning, camera angles,
 * narrative structure, and production scheduling.
 */

export type ShotSize = 'extreme-wide' | 'wide' | 'medium' | 'close-up' | 'extreme-close-up' | 'over-shoulder';
export type CameraMovement = 'static' | 'pan' | 'tilt' | 'dolly' | 'crane' | 'handheld' | 'steadicam' | 'drone';
export type LightingSetup = 'three-point' | 'natural' | 'high-key' | 'low-key' | 'chiaroscuro' | 'silhouette';
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
  scenes: string[];        // Scene IDs
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
  const counts: Record<ShotSize, number> = { 'extreme-wide': 0, wide: 0, medium: 0, 'close-up': 0, 'extreme-close-up': 0, 'over-shoulder': 0 };
  for (const p of panels) counts[p.shotSize]++;
  return counts;
}

export function panelsByMovement(panels: StoryboardPanel[], movement: CameraMovement): StoryboardPanel[] {
  return panels.filter(p => p.cameraMovement === movement);
}

export function scenesByAct(scenes: Scene[], act: NarrativeAct): Scene[] {
  return scenes.filter(s => s.act === act);
}

export function averageShotDuration(panels: StoryboardPanel[]): number {
  if (panels.length === 0) return 0;
  return panels.reduce((sum, p) => sum + p.durationSec, 0) / panels.length;
}

// ═══════════════════════════════════════════════════════════════════
// Narrative Structure
// ═══════════════════════════════════════════════════════════════════

export function threeActBalance(scenes: Scene[]): { setup: number; confrontation: number; resolution: number } {
  const total = totalFilmDuration(scenes);
  if (total === 0) return { setup: 0, confrontation: 0, resolution: 0 };
  return {
    setup: scenesByAct(scenes, 'setup').reduce((s, sc) => s + sceneDuration(sc), 0) / total,
    confrontation: scenesByAct(scenes, 'confrontation').reduce((s, sc) => s + sceneDuration(sc), 0) / total,
    resolution: scenesByAct(scenes, 'resolution').reduce((s, sc) => s + sceneDuration(sc), 0) / total,
  };
}

export function isBalancedStructure(balance: { setup: number; confrontation: number; resolution: number }): boolean {
  // Classic 25/50/25 split, with tolerance
  return balance.setup >= 0.15 && balance.setup <= 0.35
    && balance.confrontation >= 0.35 && balance.confrontation <= 0.60
    && balance.resolution >= 0.15 && balance.resolution <= 0.35;
}

// ═══════════════════════════════════════════════════════════════════
// Production Planning
// ═══════════════════════════════════════════════════════════════════

export function uniqueLocations(scenes: Scene[]): string[] {
  return [...new Set(scenes.map(s => s.location))];
}

export function totalProductionDays(days: ProductionDay[]): number {
  return days.length;
}

export function totalProductionHours(days: ProductionDay[]): number {
  return days.reduce((sum, d) => sum + d.estimatedHours, 0);
}
