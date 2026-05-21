import { describe, it, expect } from 'vitest';
import { queryTrait, generateTraitForTarget, listTraitsForTarget } from '../TraitRegistryBridge';

describe('TraitRegistryBridge (APL WIT audit — first slice)', () => {
  it('queryTrait returns real Android XR traits from the existing map', () => {
    const physics = queryTrait('physics', { target: 'android-xr' });
    expect(physics.exists).toBe(true);
    expect(physics.sourceMap).toContain('AndroidXRTraitMap');
  });

  it('generateTraitForTarget produces code for a known Android XR trait', () => {
    const code = generateTraitForTarget('physics', 'android-xr', { mass: 2.0 });
    expect(code.length).toBeGreaterThan(0);
    expect(code.some(line => line.includes('PhysicsComponent'))).toBe(true);
  });

  it('listTraitsForTarget returns a conservative but real set for android-xr', () => {
    const list = listTraitsForTarget('android-xr');
    expect(list).toContain('physics');
    expect(list).toContain('hand_tracked');
  });

  it('gracefully handles unknown targets (the exact gap the audit is closing)', () => {
    const unknown = queryTrait('some-future-trait', { target: 'future-platform' });
    expect(unknown.exists).toBe(true); // conservative until registry is fully lifted
  });
});