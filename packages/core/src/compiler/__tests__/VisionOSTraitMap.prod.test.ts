/**
 * VisionOSTraitMap — Production Test Suite
 *
 * Covers: trait maps (physics, interaction, visual, AR, accessibility,
 * UI, portal, V43), helper functions (getTraitMapping, generateTraitCode,
 * getRequiredImports, getMinVisionOSVersion, listAllTraits, listTraitsByLevel).
 */
import { describe, it, expect } from 'vitest';
import {
  PHYSICS_TRAIT_MAP,
  INTERACTION_TRAIT_MAP,
  VISUAL_TRAIT_MAP,
  ACCESSIBILITY_TRAIT_MAP,
  AR_TRAIT_MAP,
  UI_TRAIT_MAP,
  PORTAL_TRAIT_MAP,
  V43_TRAIT_MAP,
  VISIONOS_TRAIT_MAP,
  getTraitMapping,
  generateTraitCode,
  getRequiredImports,
  getMinVisionOSVersion,
  listAllTraits,
  listTraitsByLevel,
} from '../VisionOSTraitMap';

describe('VisionOSTraitMap — Production', () => {
  // ─── Combined Map ─────────────────────────────────────────────────
  it('VISIONOS_TRAIT_MAP merges all sub-maps', () => {
    const subMaps = [
      PHYSICS_TRAIT_MAP, INTERACTION_TRAIT_MAP, VISUAL_TRAIT_MAP,
      ACCESSIBILITY_TRAIT_MAP, AR_TRAIT_MAP, UI_TRAIT_MAP,
      PORTAL_TRAIT_MAP, V43_TRAIT_MAP,
    ];
    const expectedCount = subMaps.reduce((n, m) => n + Object.keys(m).length, 0);
    // May have fewer if there are key collisions, but should be close
    expect(Object.keys(VISIONOS_TRAIT_MAP).length).toBeGreaterThanOrEqual(expectedCount - 5);
  });

  // ─── Physics Traits ───────────────────────────────────────────────
  it('collidable trait generates CollisionComponent code', () => {
    const mapping = PHYSICS_TRAIT_MAP['collidable'];
    expect(mapping.level).toBe('full');
    expect(mapping.components).toContain('CollisionComponent');
    const lines = mapping.generate('myEntity', {});
    expect(lines.some(l => l.includes('CollisionComponent'))).toBe(true);
  });

  it('physics trait supports dynamic/kinematic modes', () => {
    const lines = PHYSICS_TRAIT_MAP['physics'].generate('obj', { mode: 'dynamic' });
    expect(lines.length).toBeGreaterThan(0);
  });

  // ─── Interaction Traits ───────────────────────────────────────────
  it('grabbable trait includes InputTargetComponent', () => {
    const m = INTERACTION_TRAIT_MAP['grabbable'];
    expect(m.components).toContain('InputTargetComponent');
    const lines = m.generate('cube', {});
    expect(lines.length).toBeGreaterThan(0);
  });

  it('hoverable trait sets minVersion', () => {
    const m = INTERACTION_TRAIT_MAP['hoverable'];
    expect(m.minVersion).toBeDefined();
    expect(m.level).toBe('full');
  });

  // ─── Visual Traits ────────────────────────────────────────────────
  it('billboard trait generates BillboardComponent', () => {
    const lines = VISUAL_TRAIT_MAP['billboard'].generate('sign', {});
    expect(lines.some(l => l.includes('BillboardComponent'))).toBe(true);
  });

  it('particle_emitter trait uses config rate and lifetime', () => {
    const lines = VISUAL_TRAIT_MAP['particle_emitter'].generate('fx', { rate: 200, lifetime: 2.0 });
    expect(lines.some(l => l.includes('200'))).toBe(true);
    expect(lines.some(l => l.includes('2'))).toBe(true);
  });

  it('animated trait handles clip name', () => {
    const lines = VISUAL_TRAIT_MAP['animated'].generate('char', { clip: 'walk', loop: true });
    expect(lines.some(l => l.includes('walk'))).toBe(true);
  });

  // ─── AR Traits ────────────────────────────────────────────────────
  it('hand_tracking trait requires ARKit import', () => {
    const m = AR_TRAIT_MAP['hand_tracking'];
    expect(m.imports).toContain('ARKit');
    const lines = m.generate('hand', {});
    expect(lines.some(l => l.includes('HandTrackingProvider'))).toBe(true);
  });

  it('geospatial trait is unsupported', () => {
    const m = AR_TRAIT_MAP['geospatial'];
    expect(m.level).toBe('unsupported');
  });

  // ─── Accessibility Traits ─────────────────────────────────────────
  it('accessible trait generates AccessibilityComponent with label', () => {
    const lines = ACCESSIBILITY_TRAIT_MAP['accessible'].generate('btn', { label: 'Play', isButton: true });
    expect(lines.some(l => l.includes('AccessibilityComponent'))).toBe(true);
    expect(lines.some(l => l.includes('Play'))).toBe(true);
    expect(lines.some(l => l.includes('isButton'))).toBe(true);
  });

  // ─── Portal Traits ───────────────────────────────────────────────
  it('portal trait generates PortalComponent + WorldComponent', () => {
    const m = PORTAL_TRAIT_MAP['portal'];
    expect(m.components).toContain('PortalComponent');
    expect(m.components).toContain('WorldComponent');
    const lines = m.generate('door', {});
    expect(lines.some(l => l.includes('PortalComponent'))).toBe(true);
  });

  it('immersive trait supports style config', () => {
    const lines = PORTAL_TRAIT_MAP['immersive'].generate('space', { style: 'full' });
    expect(lines.some(l => l.includes('.full'))).toBe(true);
  });

  // ─── Helper Functions ─────────────────────────────────────────────
  it('getTraitMapping returns mapping for known trait', () => {
    const m = getTraitMapping('collidable');
    expect(m).toBeDefined();
    expect(m!.trait).toBe('collidable');
  });

  it('getTraitMapping returns undefined for unknown trait', () => {
    expect(getTraitMapping('nonexistent_trait_xyz')).toBeUndefined();
  });

  it('generateTraitCode returns fallback for unknown trait', () => {
    const lines = generateTraitCode('unknown_xyz', 'obj', { foo: 1 });
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('no mapping defined');
  });

  it('getRequiredImports collects unique imports', () => {
    const imports = getRequiredImports(['hand_tracking', 'scene_reconstruction', 'collidable']);
    expect(imports).toContain('ARKit');
    // no duplicates
    expect(imports.filter(i => i === 'ARKit').length).toBe(1);
  });

  it('getMinVisionOSVersion returns highest among traits', () => {
    const version = getMinVisionOSVersion(['collidable', 'spatial_persona']); // spatial_persona = 2.0
    expect(parseFloat(version)).toBeGreaterThanOrEqual(2.0);
  });

  it('listAllTraits returns non-empty array', () => {
    const traits = listAllTraits();
    expect(traits.length).toBeGreaterThan(20);
  });

  it('listTraitsByLevel filters correctly', () => {
    const fullTraits = listTraitsByLevel('full');
    expect(fullTraits.length).toBeGreaterThan(5);
    const unsupported = listTraitsByLevel('unsupported');
    expect(unsupported).toContain('geospatial');
  });
});
