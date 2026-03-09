import { describe, it, expect } from 'vitest';
import {
  walkPreset,
  runPreset,
  jumpPreset,
  crouchPreset,
  swimPreset,
  flyPreset,
  climbPreset,
  locomotionPresets,
  attackPreset,
  combatPresets,
  speakPreset,
  wavePreset,
  socialPresets,
  dancePreset,
  emotePreset,
  emotePresets,
  idlePreset,
  sitPreset,
  sleepPreset,
  environmentalPresets,
  allPresets,
} from '../presets/index.js';
import type { AnimationPreset, PresetName } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_LOOP_MODES = ['once', 'loop', 'pingpong', 'clamp'] as const;

const VALID_CATEGORIES = [
  'locomotion',
  'combat',
  'social',
  'emote',
  'environmental',
] as const;

const VALID_EASINGS = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'ease-in-bounce',
  'ease-out-bounce',
  'ease-in-out-bounce',
  'ease-in-elastic',
  'ease-out-elastic',
  'ease-in-back',
  'ease-out-back',
] as const;

const ALL_PRESET_NAMES: PresetName[] = [
  'walk',
  'idle',
  'attack',
  'speak',
  'dance',
  'run',
  'jump',
  'wave',
  'sit',
  'sleep',
  'crouch',
  'swim',
  'fly',
  'climb',
  'emote',
];

function assertValidPreset(preset: AnimationPreset): void {
  // Name
  expect(ALL_PRESET_NAMES).toContain(preset.name);

  // Description
  expect(preset.description).toBeTruthy();
  expect(preset.description.length).toBeGreaterThan(10);

  // Category
  expect(VALID_CATEGORIES).toContain(preset.category);

  // Timing
  expect(preset.timing.duration).toBeGreaterThan(0);
  expect(preset.timing.delay).toBeGreaterThanOrEqual(0);
  expect(VALID_EASINGS).toContain(preset.timing.easing);

  // Loop mode
  expect(VALID_LOOP_MODES).toContain(preset.loopMode);

  // Blend weight
  expect(preset.blendWeight).toBeGreaterThanOrEqual(0);
  expect(preset.blendWeight).toBeLessThanOrEqual(1);

  // Speed multiplier
  expect(preset.speedMultiplier).toBeGreaterThan(0);

  // Mixamo clip mapping
  expect(preset.mixamoClip.clipName).toBeTruthy();
  expect(preset.mixamoClip.pack).toBeTruthy();
  expect(preset.mixamoClip.alternatives).toBeInstanceOf(Array);
  expect(preset.mixamoClip.alternatives.length).toBeGreaterThanOrEqual(3);

  // Tags
  expect(preset.tags).toBeInstanceOf(Array);
  expect(preset.tags.length).toBeGreaterThanOrEqual(2);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Animation Presets', () => {
  describe('allPresets collection', () => {
    it('should contain exactly 15 presets', () => {
      expect(allPresets).toHaveLength(15);
    });

    it('should contain all 15 canonical preset names', () => {
      const names = allPresets.map((p) => p.name);
      for (const expected of ALL_PRESET_NAMES) {
        expect(names).toContain(expected);
      }
    });

    it('should have no duplicate names', () => {
      const names = allPresets.map((p) => p.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('every preset should pass structural validation', () => {
      for (const preset of allPresets) {
        assertValidPreset(preset);
      }
    });
  });

  describe('Locomotion presets', () => {
    it('should contain 7 presets', () => {
      expect(locomotionPresets).toHaveLength(7);
    });

    it('all should have category "locomotion"', () => {
      for (const p of locomotionPresets) {
        expect(p.category).toBe('locomotion');
      }
    });

    it('walk should have loop mode', () => {
      expect(walkPreset.loopMode).toBe('loop');
      expect(walkPreset.mixamoClip.clipName).toBe('Walking');
    });

    it('run should be faster than walk', () => {
      expect(runPreset.speedMultiplier).toBeGreaterThan(walkPreset.speedMultiplier);
      expect(runPreset.timing.duration).toBeLessThan(walkPreset.timing.duration);
    });

    it('jump should play once', () => {
      expect(jumpPreset.loopMode).toBe('once');
    });

    it('crouch should clamp at final pose', () => {
      expect(crouchPreset.loopMode).toBe('clamp');
    });

    it('swim should loop', () => {
      expect(swimPreset.loopMode).toBe('loop');
      expect(swimPreset.mixamoClip.pack).toBe('Aquatic');
    });

    it('fly should loop with reduced speed', () => {
      expect(flyPreset.loopMode).toBe('loop');
      expect(flyPreset.speedMultiplier).toBeLessThan(1.0);
    });

    it('climb should loop', () => {
      expect(climbPreset.loopMode).toBe('loop');
    });
  });

  describe('Combat presets', () => {
    it('should contain 1 preset', () => {
      expect(combatPresets).toHaveLength(1);
    });

    it('attack should play once for responsive feel', () => {
      expect(attackPreset.loopMode).toBe('once');
      expect(attackPreset.category).toBe('combat');
    });

    it('attack should have faster speed multiplier', () => {
      expect(attackPreset.speedMultiplier).toBeGreaterThan(1.0);
    });

    it('attack should have short duration for responsiveness', () => {
      expect(attackPreset.timing.duration).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Social presets', () => {
    it('should contain 2 presets', () => {
      expect(socialPresets).toHaveLength(2);
    });

    it('speak should loop for continuous dialogue', () => {
      expect(speakPreset.loopMode).toBe('loop');
      expect(speakPreset.category).toBe('social');
    });

    it('speak should have reduced blend weight for layering', () => {
      expect(speakPreset.blendWeight).toBeLessThan(1.0);
    });

    it('wave should play once as greeting', () => {
      expect(wavePreset.loopMode).toBe('once');
    });
  });

  describe('Emote presets', () => {
    it('should contain 2 presets', () => {
      expect(emotePresets).toHaveLength(2);
    });

    it('dance should loop continuously', () => {
      expect(dancePreset.loopMode).toBe('loop');
      expect(dancePreset.category).toBe('emote');
    });

    it('emote should play once as a reaction', () => {
      expect(emotePreset.loopMode).toBe('once');
    });
  });

  describe('Environmental presets', () => {
    it('should contain 3 presets', () => {
      expect(environmentalPresets).toHaveLength(3);
    });

    it('idle should loop as default state', () => {
      expect(idlePreset.loopMode).toBe('loop');
      expect(idlePreset.category).toBe('environmental');
    });

    it('idle should have longest duration for natural feel', () => {
      expect(idlePreset.timing.duration).toBeGreaterThanOrEqual(3.0);
    });

    it('sit should clamp at final seated pose', () => {
      expect(sitPreset.loopMode).toBe('clamp');
    });

    it('sleep should have slow speed multiplier', () => {
      expect(sleepPreset.speedMultiplier).toBeLessThan(1.0);
      expect(sleepPreset.timing.duration).toBeGreaterThanOrEqual(5.0);
    });
  });

  describe('Mixamo clip mapping completeness', () => {
    it('every preset should have a non-empty clip name', () => {
      for (const preset of allPresets) {
        expect(preset.mixamoClip.clipName.length).toBeGreaterThan(0);
      }
    });

    it('every preset should have a pack reference', () => {
      for (const preset of allPresets) {
        expect(preset.mixamoClip.pack.length).toBeGreaterThan(0);
      }
    });

    it('every preset should have at least 3 alternative clips', () => {
      for (const preset of allPresets) {
        expect(preset.mixamoClip.alternatives.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('alternative clip names should not include the primary clip', () => {
      for (const preset of allPresets) {
        expect(preset.mixamoClip.alternatives).not.toContain(
          preset.mixamoClip.clipName,
        );
      }
    });
  });
});
