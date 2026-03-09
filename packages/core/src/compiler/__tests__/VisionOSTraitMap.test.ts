import { describe, it, expect } from 'vitest';
import {
  VISIONOS_TRAIT_MAP,
  PHYSICS_TRAIT_MAP,
  INTERACTION_TRAIT_MAP,
  AUDIO_TRAIT_MAP,
  AR_TRAIT_MAP,
  VISUAL_TRAIT_MAP,
  ACCESSIBILITY_TRAIT_MAP,
  UI_TRAIT_MAP,
  PORTAL_TRAIT_MAP,
  getTraitMapping,
  generateTraitCode,
  getRequiredImports,
  getMinVisionOSVersion,
  listAllTraits,
  listTraitsByLevel,
} from '../VisionOSTraitMap';

describe('VisionOSTraitMap', () => {
  // =========== Combined map ===========

  it('VISIONOS_TRAIT_MAP includes all sub-maps', () => {
    const allKeys = [
      ...Object.keys(PHYSICS_TRAIT_MAP),
      ...Object.keys(INTERACTION_TRAIT_MAP),
      ...Object.keys(AUDIO_TRAIT_MAP),
      ...Object.keys(AR_TRAIT_MAP),
      ...Object.keys(VISUAL_TRAIT_MAP),
      ...Object.keys(ACCESSIBILITY_TRAIT_MAP),
      ...Object.keys(UI_TRAIT_MAP),
      ...Object.keys(PORTAL_TRAIT_MAP),
    ];
    for (const key of allKeys) {
      expect(VISIONOS_TRAIT_MAP[key]).toBeDefined();
    }
  });

  it('listAllTraits returns all trait names', () => {
    const traits = listAllTraits();
    expect(traits.length).toBe(Object.keys(VISIONOS_TRAIT_MAP).length);
    expect(traits).toContain('collidable');
    expect(traits).toContain('grabbable');
  });

  // =========== getTraitMapping ===========

  it('returns mapping for known trait', () => {
    const mapping = getTraitMapping('collidable');
    expect(mapping).toBeDefined();
    expect(mapping!.trait).toBe('collidable');
    expect(mapping!.components).toContain('CollisionComponent');
  });

  it('returns undefined for unknown trait', () => {
    expect(getTraitMapping('nonexistent')).toBeUndefined();
  });

  // =========== generateTraitCode ===========

  it('generates Swift code for physics trait', () => {
    const code = generateTraitCode('physics', 'myEntity', { mode: 'dynamic' });
    expect(code.length).toBeGreaterThan(0);
    expect(code.some((l) => l.includes('myEntity'))).toBe(true);
    expect(code.some((l) => l.includes('PhysicsBodyComponent'))).toBe(true);
  });

  it('generates Swift code for collidable trait', () => {
    const code = generateTraitCode('collidable', 'ball', {});
    expect(code.some((l) => l.includes('CollisionComponent'))).toBe(true);
  });

  it('generates Swift code for grabbable trait', () => {
    const code = generateTraitCode('grabbable', 'cube', {});
    expect(code.some((l) => l.includes('cube'))).toBe(true);
  });

  it('generates fallback comment for unknown trait', () => {
    const code = generateTraitCode('unknown_trait', 'entity', { x: 1 });
    expect(code.length).toBe(1);
    expect(code[0]).toContain('no mapping defined');
  });

  it('generates portal code', () => {
    const code = generateTraitCode('portal', 'gate', { target_world: 'myWorld' });
    expect(code.some((l) => l.includes('PortalComponent'))).toBe(true);
  });

  it('generates spatial_audio code', () => {
    const code = generateTraitCode('spatial_audio', 'speaker', {});
    expect(code.some((l) => l.includes('speaker'))).toBe(true);
    expect(code.some((l) => l.includes('SpatialAudioComponent'))).toBe(true);
  });

  it('generates hover effect code', () => {
    const code = generateTraitCode('hoverable', 'btn', {});
    expect(code.some((l) => l.includes('HoverEffectComponent'))).toBe(true);
  });

  // =========== getRequiredImports ===========

  it('returns required imports for audio trait', () => {
    const imports = getRequiredImports(['audio']);
    expect(imports).toContain('AVFoundation');
  });

  it('deduplicates imports', () => {
    // Both audio and ambisonics should not produce duplicates
    const imports = getRequiredImports(['audio', 'audio']);
    const avCount = imports.filter((i) => i === 'AVFoundation').length;
    expect(avCount).toBe(1);
  });

  it('returns empty for traits with no imports', () => {
    const imports = getRequiredImports(['collidable']);
    expect(imports.length).toBe(0);
  });

  // =========== getMinVisionOSVersion ===========

  it('returns min version for basic traits', () => {
    const version = getMinVisionOSVersion(['collidable']);
    expect(version).toBe('1.0');
  });

  it('returns highest version among traits', () => {
    const version = getMinVisionOSVersion(listAllTraits());
    expect(parseFloat(version)).toBeGreaterThanOrEqual(1.0);
  });

  // =========== listTraitsByLevel ===========

  it('lists traits by implementation level', () => {
    const fullTraits = listTraitsByLevel('full');
    expect(fullTraits.length).toBeGreaterThan(0);
    for (const t of fullTraits) {
      expect(VISIONOS_TRAIT_MAP[t].level).toBe('full');
    }
  });

  it('lists partial traits', () => {
    const partialTraits = listTraitsByLevel('partial');
    expect(partialTraits.length).toBeGreaterThan(0);
  });

  // =========== Individual trait categories ===========

  it('PHYSICS_TRAIT_MAP contains collidable/physics/static/kinematic', () => {
    expect(PHYSICS_TRAIT_MAP.collidable).toBeDefined();
    expect(PHYSICS_TRAIT_MAP.physics).toBeDefined();
    expect(PHYSICS_TRAIT_MAP.static).toBeDefined();
    expect(PHYSICS_TRAIT_MAP.kinematic).toBeDefined();
  });

  it('INTERACTION_TRAIT_MAP contains grabbable/draggable/throwable', () => {
    expect(INTERACTION_TRAIT_MAP.grabbable).toBeDefined();
    expect(INTERACTION_TRAIT_MAP.draggable).toBeDefined();
    expect(INTERACTION_TRAIT_MAP.throwable).toBeDefined();
  });

  it('PORTAL_TRAIT_MAP contains portal/volume/immersive', () => {
    expect(PORTAL_TRAIT_MAP.portal).toBeDefined();
    expect(PORTAL_TRAIT_MAP.volume).toBeDefined();
    expect(PORTAL_TRAIT_MAP.immersive).toBeDefined();
  });

  it('each mapping has a generate function', () => {
    for (const [, mapping] of Object.entries(VISIONOS_TRAIT_MAP)) {
      expect(typeof mapping.generate).toBe('function');
    }
  });
});
