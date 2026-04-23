/**
 * @holoscript/scenethesis-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 12 (Scenethesis / SceneCraft scene synthesis).
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { mapToHoloTraits, type ScenethesisInput } from '../index';

function input(overrides: Partial<ScenethesisInput> = {}): ScenethesisInput {
  return {
    objects: [
      { id: 'chair1', category: 'furniture', position: [0, 0, 0] },
      { id: 'wall1', category: 'wall', position: [0, 0, -5] },
    ],
    relations: [
      { subject: 'chair1', predicate: 'on', object: 'floor1' },
      { subject: 'chair1', predicate: 'facing', object: 'wall1' },
    ],
    region: { bounds: [-5, 0, -5, 5, 3, 5] },
    ...overrides,
  };
}

describe('CONTRACT: scenethesis-plugin adapter', () => {
  it('exposes mapToHoloTraits at stable public path', () => {
    expect(typeof mod.mapToHoloTraits).toBe('function');
  });

  it('each object emits exactly one @spatial trait', () => {
    const r = mapToHoloTraits(input());
    const spatials = r.traits.filter((t) => t.kind === '@spatial');
    expect(spatials.length).toBe(2);
  });

  it('each relation emits exactly one @constraint trait', () => {
    const r = mapToHoloTraits(input());
    const constraints = r.traits.filter((t) => t.kind === '@constraint');
    expect(constraints.length).toBe(2);
  });

  it('region emits exactly one @region trait with target_id "scene"', () => {
    const r = mapToHoloTraits(input());
    const region = r.traits.find((t) => t.kind === '@region');
    expect(region).toBeDefined();
    expect(region!.target_id).toBe('scene');
  });

  it('predicate "on" → verb "rests_on"', () => {
    const r = mapToHoloTraits({
      objects: [],
      relations: [{ subject: 'a', predicate: 'on', object: 'b' }],
    });
    expect(r.traits[0].params.verb).toBe('rests_on');
  });

  it('predicate "facing" → verb "oriented_toward"', () => {
    const r = mapToHoloTraits({
      objects: [],
      relations: [{ subject: 'a', predicate: 'facing', object: 'b' }],
    });
    expect(r.traits[0].params.verb).toBe('oriented_toward');
  });

  it('default orientation = [0,0,0,1] quat when missing', () => {
    const r = mapToHoloTraits({
      objects: [{ id: 'x', category: 'prop', position: [0, 0, 0] }],
    });
    const s = r.traits.find((t) => t.kind === '@spatial')!;
    expect(s.params.orientation).toEqual([0, 0, 0, 1]);
  });

  it('default scale = [1,1,1] when missing', () => {
    const r = mapToHoloTraits({
      objects: [{ id: 'x', category: 'prop', position: [0, 0, 0] }],
    });
    const s = r.traits.find((t) => t.kind === '@spatial')!;
    expect(s.params.scale).toEqual([1, 1, 1]);
  });

  it('missing wall/floor/ceiling categories produce warnings', () => {
    const r = mapToHoloTraits({
      objects: [{ id: 'x', category: 'prop', position: [0, 0, 0] }],
    });
    expect(r.warnings.some((w) => /floor/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /ceiling/.test(w))).toBe(true);
  });

  it('empty input → empty traits + warnings for missing categories, no throw', () => {
    expect(() => mapToHoloTraits({ objects: [] })).not.toThrow();
    const r = mapToHoloTraits({ objects: [] });
    expect(r.traits).toEqual([]);
  });
});
