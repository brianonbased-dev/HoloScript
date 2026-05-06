import { describe, expect, it } from 'vitest';
import { GEMS_MINERALS_TRAITS, VR_TRAITS } from '../index';

describe('gems and minerals trait constants', () => {
  it('includes gem_resonance for enchanted crystal audio', () => {
    expect(GEMS_MINERALS_TRAITS).toContain('crystal_gem');
    expect(GEMS_MINERALS_TRAITS).toContain('gem_resonance');
  });

  it('wires every gems/minerals trait into VR_TRAITS', () => {
    for (const trait of GEMS_MINERALS_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });
});
