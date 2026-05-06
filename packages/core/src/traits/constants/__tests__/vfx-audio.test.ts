import { describe, expect, it } from 'vitest';
import { VR_TRAITS, VFX_PARTICLE_TRAITS } from '../index';

describe('VFX particle trait constants', () => {
  it('includes smoke and sparks as named particle subtypes', () => {
    expect(VFX_PARTICLE_TRAITS).toContain('vfx_particle_smoke');
    expect(VFX_PARTICLE_TRAITS).toContain('vfx_particle_sparks');
  });

  it('wires every VFX particle subtype into VR_TRAITS', () => {
    for (const trait of VFX_PARTICLE_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });
});
