/**
 * ParticlePresets Production Tests
 *
 * Validates all preset configurations have required fields.
 */

import { describe, it, expect } from 'vitest';
import { ParticlePresets } from '../ParticlePresets';

const PRESET_NAMES = ['dust', 'sparks', 'fire', 'confetti', 'snow', 'hapticPulse', 'smoke'];

describe('ParticlePresets — Production', () => {
  it('exports all expected presets', () => {
    for (const name of PRESET_NAMES) {
      expect(ParticlePresets[name]).toBeDefined();
    }
  });

  for (const name of PRESET_NAMES) {
    describe(`${name} preset`, () => {
      const preset = ParticlePresets[name];

      it('has shape', () => {
        expect(['box', 'cone', 'sphere']).toContain(preset.shape);
      });

      it('has rate', () => {
        expect(typeof preset.rate).toBe('number');
      });

      it('has maxParticles', () => {
        expect(preset.maxParticles).toBeGreaterThan(0);
      });

      it('has lifetime tuple', () => {
        expect(preset.lifetime).toHaveLength(2);
        expect(preset.lifetime[0]).toBeLessThanOrEqual(preset.lifetime[1]);
      });

      it('has speed tuple', () => {
        expect(preset.speed).toHaveLength(2);
      });

      it('has colorStart and colorEnd', () => {
        expect(preset.colorStart).toBeDefined();
        expect(preset.colorEnd).toBeDefined();
        expect(preset.colorStart.r).toBeGreaterThanOrEqual(0);
        expect(preset.colorEnd.a).toBeGreaterThanOrEqual(0);
      });
    });
  }
});
