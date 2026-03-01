/**
 * film-storyboard.scenario.ts — LIVING-SPEC: Film Storyboard
 *
 * Persona: Alex — director who plans shot compositions,
 * manages three-act structure, and schedules production days.
 */

import { describe, it, expect } from 'vitest';
import {
  sceneDuration, totalFilmDuration, shotCountBySize,
  panelsByMovement, scenesByAct, averageShotDuration,
  threeActBalance, isBalancedStructure,
  uniqueLocations, totalProductionDays, totalProductionHours,
  generateShotList, filmPacing, previsCamera,
  type Scene, type StoryboardPanel, type ProductionDay, type CameraKeyframe,
} from '@/lib/filmStoryboard';

const makePanel = (overrides: Partial<StoryboardPanel> = {}): StoryboardPanel => ({
  id: 'p1', sceneNumber: 1, shotNumber: 1, shotSize: 'medium',
  cameraMovement: 'static', lighting: 'three-point',
  description: '', dialogue: '', durationSec: 5,
  characters: [], location: 'studio', notes: '', ...overrides,
});

describe('Scenario: Film Storyboard — Shot Analysis', () => {
  const panels: StoryboardPanel[] = [
    makePanel({ id: 'p1', shotSize: 'wide', durationSec: 8, cameraMovement: 'crane' }),
    makePanel({ id: 'p2', shotSize: 'medium', durationSec: 5, cameraMovement: 'static' }),
    makePanel({ id: 'p3', shotSize: 'close-up', durationSec: 3, cameraMovement: 'handheld' }),
    makePanel({ id: 'p4', shotSize: 'wide', durationSec: 10, cameraMovement: 'drone' }),
  ];

  it('shotCountBySize counts each size', () => {
    const counts = shotCountBySize(panels);
    expect(counts.wide).toBe(2);
    expect(counts.medium).toBe(1);
    expect(counts['close-up']).toBe(1);
  });

  it('panelsByMovement(static) returns 1 panel', () => {
    expect(panelsByMovement(panels, 'static')).toHaveLength(1);
  });

  it('averageShotDuration = 6.5 sec', () => {
    expect(averageShotDuration(panels)).toBeCloseTo(6.5, 1);
  });
});

describe('Scenario: Film Storyboard — Scenes & Narrative', () => {
  const scenes: Scene[] = [
    { id: 's1', number: 1, name: 'Opening', act: 'setup', location: 'Park', timeOfDay: 'dawn', panels: [makePanel({ durationSec: 30 }), makePanel({ durationSec: 20 })], emotionalTone: 'hopeful' },
    { id: 's2', number: 2, name: 'Chase', act: 'confrontation', location: 'Street', timeOfDay: 'day', panels: [makePanel({ durationSec: 60 }), makePanel({ durationSec: 40 })], emotionalTone: 'tense' },
    { id: 's3', number: 3, name: 'Finale', act: 'resolution', location: 'Rooftop', timeOfDay: 'dusk', panels: [makePanel({ durationSec: 25 }), makePanel({ durationSec: 25 })], emotionalTone: 'cathartic' },
  ];

  it('sceneDuration(Opening) = 50 sec', () => {
    expect(sceneDuration(scenes[0])).toBe(50);
  });

  it('totalFilmDuration = 200 sec', () => {
    expect(totalFilmDuration(scenes)).toBe(200);
  });

  it('scenesByAct(setup) returns 1 scene', () => {
    expect(scenesByAct(scenes, 'setup')).toHaveLength(1);
  });

  it('threeActBalance is approximately 25/50/25', () => {
    const balance = threeActBalance(scenes);
    expect(balance.setup).toBeCloseTo(0.25, 1);
    expect(balance.confrontation).toBeCloseTo(0.50, 1);
    expect(balance.resolution).toBeCloseTo(0.25, 1);
  });

  it('isBalancedStructure returns true for classic structure', () => {
    expect(isBalancedStructure({ setup: 0.25, confrontation: 0.50, resolution: 0.25 })).toBe(true);
  });

  it('isBalancedStructure returns false for unbalanced', () => {
    expect(isBalancedStructure({ setup: 0.05, confrontation: 0.85, resolution: 0.10 })).toBe(false);
  });

  it('uniqueLocations returns 3 distinct locations', () => {
    expect(uniqueLocations(scenes)).toHaveLength(3);
  });
});

describe('Scenario: Film Storyboard — Production', () => {
  const days: ProductionDay[] = [
    { date: '2026-03-01', scenes: ['s1'], castRequired: ['Lead'], estimatedHours: 8, location: 'Park', weatherDependent: true },
    { date: '2026-03-02', scenes: ['s2'], castRequired: ['Lead', 'Villain'], estimatedHours: 12, location: 'Street', weatherDependent: true },
    { date: '2026-03-03', scenes: ['s3'], castRequired: ['Lead'], estimatedHours: 6, location: 'Studio', weatherDependent: false },
  ];

  it('totalProductionDays = 3', () => {
    expect(totalProductionDays(days)).toBe(3);
  });

  it('totalProductionHours = 26', () => {
    expect(totalProductionHours(days)).toBe(26);
  });

  it('shot list export — generate structured shot list per scene', () => {
    const scenes: Scene[] = [
      { id: 's1', number: 1, name: 'Opening', act: 'setup', location: 'Park', timeOfDay: 'dawn', panels: [makePanel({ shotNumber: 1, shotSize: 'wide' }), makePanel({ shotNumber: 2, shotSize: 'close-up' })], emotionalTone: 'hopeful' },
      { id: 's2', number: 2, name: 'Chase', act: 'confrontation', location: 'Street', timeOfDay: 'day', panels: [makePanel({ shotNumber: 1, shotSize: 'medium' })], emotionalTone: 'tense' },
    ];
    const shotList = generateShotList(scenes);
    expect(shotList).toHaveLength(3);
    expect(shotList[0].sceneNumber).toBe(1);
    expect(shotList[0].location).toBe('Park');
    expect(shotList[2].sceneNumber).toBe(2);
  });

  it('previsualization — 3D camera path animation preview', () => {
    const keyframes: CameraKeyframe[] = [
      { time: 0, position: { x: 0, y: 2, z: -5 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 50 },
      { time: 2, position: { x: 5, y: 3, z: 0 }, lookAt: { x: 0, y: 1, z: 0 }, fov: 35 },
      { time: 4, position: { x: 0, y: 1, z: 5 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 60 },
    ];
    const path = previsCamera(keyframes, 10); // 10 samples/sec over 4 sec
    expect(path.length).toBeGreaterThan(10);
    // First sample should match first keyframe
    expect(path[0].position.x).toBeCloseTo(0, 1);
    expect(path[0].fov).toBeCloseTo(50, 1);
    // Last sample should match last keyframe
    expect(path[path.length - 1].position.z).toBeCloseTo(5, 1);
    // Midpoint should be interpolated
    const mid = path[Math.floor(path.length / 2)];
    expect(mid.time).toBeGreaterThan(1);
    expect(mid.time).toBeLessThan(3);
  });
});
