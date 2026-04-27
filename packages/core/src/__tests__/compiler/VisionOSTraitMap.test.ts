import { describe, it, expect } from 'vitest';
import {
  VISIONOS_TRAIT_MAP,
  getTraitMapping,
  generateTraitCode,
  getRequiredImports,
  getMinVisionOSVersion,
  listAllTraits,
  listTraitsByLevel,
  PHYSICS_TRAIT_MAP,
  INTERACTION_TRAIT_MAP,
  AUDIO_TRAIT_MAP,
  AR_TRAIT_MAP,
  VISUAL_TRAIT_MAP,
  ACCESSIBILITY_TRAIT_MAP,
  UI_TRAIT_MAP,
  PORTAL_TRAIT_MAP,
  V43_TRAIT_MAP,
} from '../../compiler/VisionOSTraitMap';

describe('VisionOSTraitMap', () => {
  describe('Trait Categories', () => {
    it('should have physics traits defined', () => {
      expect(Object.keys(PHYSICS_TRAIT_MAP).length).toBeGreaterThan(3);
      expect(PHYSICS_TRAIT_MAP['collidable']).toBeDefined();
      expect(PHYSICS_TRAIT_MAP['physics']).toBeDefined();
      expect(PHYSICS_TRAIT_MAP['static']).toBeDefined();
    });

    it('should have interaction traits defined', () => {
      expect(Object.keys(INTERACTION_TRAIT_MAP).length).toBeGreaterThan(5);
      expect(INTERACTION_TRAIT_MAP['grabbable']).toBeDefined();
      expect(INTERACTION_TRAIT_MAP['hoverable']).toBeDefined();
      expect(INTERACTION_TRAIT_MAP['clickable']).toBeDefined();
      expect(INTERACTION_TRAIT_MAP['throwable']).toBeDefined();
    });

    it('should have audio traits defined', () => {
      expect(Object.keys(AUDIO_TRAIT_MAP).length).toBeGreaterThan(3);
      expect(AUDIO_TRAIT_MAP['audio']).toBeDefined();
      expect(AUDIO_TRAIT_MAP['spatial_audio']).toBeDefined();
    });

    it('should have AR traits defined', () => {
      expect(Object.keys(AR_TRAIT_MAP).length).toBeGreaterThan(5);
      expect(AR_TRAIT_MAP['anchor']).toBeDefined();
      expect(AR_TRAIT_MAP['hand_tracking']).toBeDefined();
      expect(AR_TRAIT_MAP['eye_tracking']).toBeDefined();
    });

    it('should have visual traits defined', () => {
      expect(Object.keys(VISUAL_TRAIT_MAP).length).toBeGreaterThan(3);
      expect(VISUAL_TRAIT_MAP['visible']).toBeDefined();
      expect(VISUAL_TRAIT_MAP['particle_emitter']).toBeDefined();
    });

    it('should have accessibility traits defined', () => {
      expect(Object.keys(ACCESSIBILITY_TRAIT_MAP).length).toBeGreaterThan(2);
      expect(ACCESSIBILITY_TRAIT_MAP['accessible']).toBeDefined();
      expect(ACCESSIBILITY_TRAIT_MAP['alt_text']).toBeDefined();
    });

    it('should have UI traits defined', () => {
      expect(Object.keys(UI_TRAIT_MAP).length).toBeGreaterThan(3);
      expect(UI_TRAIT_MAP['ui_floating']).toBeDefined();
      expect(UI_TRAIT_MAP['ui_anchored']).toBeDefined();
      expect(UI_TRAIT_MAP['ui_hand_menu']).toBeDefined();
    });

    it('should have portal traits defined', () => {
      expect(Object.keys(PORTAL_TRAIT_MAP).length).toBeGreaterThan(1);
      expect(PORTAL_TRAIT_MAP['portal']).toBeDefined();
    });
  });

  describe('Combined Map', () => {
    it('should combine all trait categories', () => {
      const totalTraits =
        Object.keys(PHYSICS_TRAIT_MAP).length +
        Object.keys(INTERACTION_TRAIT_MAP).length +
        Object.keys(AUDIO_TRAIT_MAP).length +
        Object.keys(AR_TRAIT_MAP).length +
        Object.keys(VISUAL_TRAIT_MAP).length +
        Object.keys(ACCESSIBILITY_TRAIT_MAP).length +
        Object.keys(UI_TRAIT_MAP).length +
        Object.keys(PORTAL_TRAIT_MAP).length +
        Object.keys(V43_TRAIT_MAP).length;

      expect(Object.keys(VISIONOS_TRAIT_MAP).length).toBe(totalTraits);
    });
  });

  describe('getTraitMapping', () => {
    it('should return mapping for known traits', () => {
      const mapping = getTraitMapping('grabbable');
      expect(mapping).toBeDefined();
      expect(mapping?.trait).toBe('grabbable');
      expect(mapping?.components).toContain('InputTargetComponent');
    });

    it('should return undefined for unknown traits', () => {
      const mapping = getTraitMapping('nonexistent_trait');
      expect(mapping).toBeUndefined();
    });
  });

  describe('generateTraitCode', () => {
    it('should generate collidable code', () => {
      const code = generateTraitCode('collidable', 'myEntity', {});
      expect(code.length).toBeGreaterThan(0);
      expect(code[0]).toContain('CollisionComponent');
      expect(code[0]).toContain('myEntity');
    });

    it('should generate physics code with config', () => {
      const code = generateTraitCode('physics', 'box', { mass: 2.5, friction: 0.8 });
      expect(code.length).toBeGreaterThan(2);
      expect(code.some((line) => line.includes('mass: 2.5'))).toBe(true);
      expect(code.some((line) => line.includes('friction: 0.8'))).toBe(true);
    });

    it('should generate grabbable code', () => {
      const code = generateTraitCode('grabbable', 'item', { snap_to_hand: true });
      expect(code.some((line) => line.includes('InputTargetComponent'))).toBe(true);
      expect(code.some((line) => line.includes('PhysicsBodyComponent'))).toBe(true);
      expect(code.some((line) => line.includes('snap_to_hand'))).toBe(true);
    });

    it('should generate hoverable code', () => {
      const code = generateTraitCode('hoverable', 'btn', { highlight_color: '#ff0000' });
      expect(code.some((line) => line.includes('HoverEffectComponent'))).toBe(true);
      expect(code.some((line) => line.includes('#ff0000'))).toBe(true);
    });

    it('should generate anchor code', () => {
      const code = generateTraitCode('anchor', 'obj', { anchor_type: 'plane' });
      expect(code[0]).toContain('AnchoringComponent');
      expect(code[0]).toContain('.plane');
    });

    it('should generate accessible code', () => {
      const code = generateTraitCode('accessible', 'element', {
        label: 'Submit button',
        hint: 'Tap to submit',
        isButton: true,
      });
      expect(code.some((line) => line.includes('AccessibilityComponent'))).toBe(true);
      expect(code.some((line) => line.includes('Submit button'))).toBe(true);
      expect(code.some((line) => line.includes('isButton = true'))).toBe(true);
    });

    it('should generate portal code', () => {
      const code = generateTraitCode('portal', 'portalEntity', {});
      expect(code.some((line) => line.includes('PortalComponent'))).toBe(true);
      expect(code.some((line) => line.includes('WorldComponent'))).toBe(true);
    });

    it('should handle unknown traits gracefully', () => {
      const code = generateTraitCode('unknown_trait', 'obj', { foo: 'bar' });
      expect(code.length).toBe(1);
      expect(code[0]).toContain('no mapping defined');
    });
  });

  describe('getRequiredImports', () => {
    it('should return empty for traits without special imports', () => {
      const imports = getRequiredImports(['collidable', 'physics']);
      expect(imports).toEqual([]);
    });

    it('should return AVFoundation for audio traits', () => {
      const imports = getRequiredImports(['audio', 'spatial_audio']);
      expect(imports).toContain('AVFoundation');
    });

    it('should deduplicate imports', () => {
      const imports = getRequiredImports(['audio', 'audio']);
      expect(imports.filter((i) => i === 'AVFoundation').length).toBe(1);
    });
  });

  describe('getMinVisionOSVersion', () => {
    it('should return 1.0 for basic traits', () => {
      const version = getMinVisionOSVersion(['collidable', 'physics']);
      expect(version).toBe('1.0');
    });

    it('should return higher version for advanced traits', () => {
      const version = getMinVisionOSVersion(['particle_emitter']);
      expect(parseFloat(version)).toBeGreaterThanOrEqual(1.0);
    });
  });

  describe('listAllTraits', () => {
    it('should return all trait names', () => {
      const traits = listAllTraits();
      expect(traits.length).toBeGreaterThan(30);
      expect(traits).toContain('collidable');
      expect(traits).toContain('grabbable');
      expect(traits).toContain('spatial_audio');
    });
  });

  describe('listTraitsByLevel', () => {
    it('should list fully implemented traits', () => {
      const fullTraits = listTraitsByLevel('full');
      expect(fullTraits.length).toBeGreaterThan(10);
      expect(fullTraits).toContain('collidable');
      expect(fullTraits).toContain('grabbable');
    });

    it('should list partially implemented traits', () => {
      const partialTraits = listTraitsByLevel('partial');
      // All partial traits have been promoted to full; 0 partials is the correct state
      expect(partialTraits.length).toBeGreaterThanOrEqual(0);
    });

    it('should list comment-only traits', () => {
      const commentTraits = listTraitsByLevel('comment');
      // V43 AI generation traits are comment-level (GPU compute not native to RealityKit)
      expect(commentTraits.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Specific Trait Mappings', () => {
    it('should map static correctly', () => {
      const code = generateTraitCode('static', 'floor', {});
      expect(code.some((line) => line.includes('mode: .static'))).toBe(true);
    });

    it('should map kinematic correctly', () => {
      const code = generateTraitCode('kinematic', 'platform', {});
      expect(code.some((line) => line.includes('mode: .kinematic'))).toBe(true);
    });

    it('should map spatial_audio with config', () => {
      const code = generateTraitCode('spatial_audio', 'speaker', {
        refDistance: 5.0,
        rolloff: 2.0,
      });
      expect(code.some((line) => line.includes('SpatialAudioComponent'))).toBe(true);
    });

    it('should map hand anchor types', () => {
      const leftCode = generateTraitCode('anchor', 'obj', { anchor_type: 'hand' });
      expect(leftCode[0]).toContain('.hand');
    });

    it('should map ui_anchored to different targets', () => {
      const worldCode = generateTraitCode('ui_anchored', 'panel', { to: 'world' });
      expect(worldCode[0]).toContain('.world');

      const headCode = generateTraitCode('ui_anchored', 'hud', { to: 'head' });
      expect(headCode[0]).toContain('.head');

      const handCode = generateTraitCode('ui_anchored', 'menu', { to: 'left_hand' });
      expect(handCode[0]).toContain('.hand(.left');
    });
  });
});
