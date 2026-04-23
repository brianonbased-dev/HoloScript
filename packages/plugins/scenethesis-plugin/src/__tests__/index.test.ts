import { describe, it, expect } from 'vitest';
import { mapToHoloTraits } from '../index';

describe('scenethesis-plugin stub', () => {
  it('emits one @spatial trait per object', () => {
    const r = mapToHoloTraits({
      objects: [
        { id: 'sofa', category: 'furniture', position: [0, 0, 0] },
        { id: 'lamp', category: 'prop', position: [1, 0, 0.5] },
      ],
    });
    const spatials = r.traits.filter((t) => t.kind === '@spatial');
    expect(spatials.length).toBe(2);
    expect(spatials[0].target_id).toBe('sofa');
  });

  it('maps predicates to constraint verbs', () => {
    const r = mapToHoloTraits({
      objects: [
        { id: 'a', category: 'furniture', position: [0, 0, 0] },
        { id: 'b', category: 'prop', position: [0, 1, 0] },
      ],
      relations: [{ subject: 'b', predicate: 'on', object: 'a' }],
    });
    const constraint = r.traits.find((t) => t.kind === '@constraint');
    expect(constraint?.params.verb).toBe('rests_on');
    expect(constraint?.params.other).toBe('a');
  });

  it('warns on missing structural categories', () => {
    const r = mapToHoloTraits({ objects: [{ id: 'x', category: 'prop', position: [0, 0, 0] }] });
    expect(r.warnings.length).toBeGreaterThanOrEqual(3); // wall, floor, ceiling
    expect(r.warnings.some((w) => w.includes('wall'))).toBe(true);
  });

  it('emits @region trait when region bounds provided', () => {
    const r = mapToHoloTraits({
      objects: [],
      region: { bounds: [0, 0, 0, 10, 3, 10] },
    });
    const region = r.traits.find((t) => t.kind === '@region');
    expect(region).toBeTruthy();
    expect(region?.params.aabb).toEqual([0, 0, 0, 10, 3, 10]);
  });
});
