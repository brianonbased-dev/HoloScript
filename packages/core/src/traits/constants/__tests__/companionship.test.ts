import { describe, expect, it } from 'vitest';
import { COMPANIONSHIP_TRAITS, VR_TRAITS } from '../index';

describe('companionship trait constants', () => {
  it('registers the seven daimon embodiment traits', () => {
    expect(COMPANIONSHIP_TRAITS).toHaveLength(7);
    expect(COMPANIONSHIP_TRAITS).toContain('companion_presence');
    expect(COMPANIONSHIP_TRAITS).toContain('affect_state');
    expect(COMPANIONSHIP_TRAITS).toContain('flourishing_guard');
  });

  it('wires every companionship trait into VR_TRAITS', () => {
    for (const trait of COMPANIONSHIP_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });
});
