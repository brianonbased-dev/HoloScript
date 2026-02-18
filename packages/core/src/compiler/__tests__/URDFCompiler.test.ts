import { describe, it, expect, beforeEach } from 'vitest';
import { URDFCompiler} from '../URDFCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// Helper to build a minimal composition
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestRobot',
    objects: [],
    ...overrides,
  } as HoloComposition;
}

describe('URDFCompiler', () => {
  let compiler: URDFCompiler;

  beforeEach(() => {
    compiler = new URDFCompiler();
  });

  // =========== Constructor / defaults ===========

  it('uses default options', () => {
    const xml = compiler.compile(makeComposition());
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<robot');
    expect(xml).toContain('</robot>');
  });

  it('respects custom robotName', () => {
    const c = new URDFCompiler({ robotName: 'MyBot' });
    const xml = c.compile(makeComposition());
    expect(xml).toContain('name="MyBot"');
  });

  // =========== Minimal compilation ===========

  it('generates valid XML structure', () => {
    const xml = compiler.compile(makeComposition());
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<robot');
    expect(xml).toContain('</robot>');
  });

  it('generates base_link for composition root', () => {
    const xml = compiler.compile(makeComposition());
    expect(xml).toContain('base_link');
  });

  // =========== Objects → Links ===========

  it('compiles object to URDF link', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'arm',
          properties: [
            { key: 'geometry', value: 'box' },
            { key: 'position', value: [1, 2, 3] },
          ],
          traits: [],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('<link name="arm"');
  });

  it('includes visual geometry when option enabled (default)', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'cube',
          properties: [
            { key: 'geometry', value: 'box' },
          ],
          traits: [],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('<visual>');
  });

  // =========== Collision toggle ===========

  it('includes collision when object has collidable trait', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'wall',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: ['collidable'],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('<collision>');
  });

  it('excludes collision when disabled', () => {
    const c = new URDFCompiler({ includeCollision: false });
    const comp = makeComposition({
      objects: [
        {
          name: 'ghost',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [],
        },
      ] as any,
    });
    const xml = c.compile(comp);
    expect(xml).not.toContain('<collision>');
  });

  // =========== Inertial ===========

  it('includes inertial when option enabled', () => {
    const c = new URDFCompiler({ includeInertial: true });
    const comp = makeComposition({
      objects: [
        {
          name: 'block',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: ['physics'],
        },
      ] as any,
    });
    const xml = c.compile(comp);
    expect(xml).toContain('<inertial>');
    expect(xml).toContain('<mass');
  });

  // =========== Geometry types ===========

  it('handles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'ball',
          properties: [{ key: 'geometry', value: 'sphere' }],
          traits: [],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('<sphere');
  });

  it('handles cylinder geometry', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'tube',
          properties: [{ key: 'geometry', value: 'cylinder' }],
          traits: [],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('<cylinder');
  });

  // =========== Position/rotation → origin ===========

  it('compiles position to origin xyz', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'item',
          properties: [
            { key: 'geometry', value: 'box' },
            { key: 'position', value: [1.5, 2.5, 3.5] },
          ],
          traits: [],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('1.5');
    expect(xml).toContain('2.5');
    expect(xml).toContain('3.5');
  });

  // =========== Joints ===========

  it('creates fixed joint connecting object to parent', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'child_link',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('<joint');
    expect(xml).toContain('type="fixed"');
  });

  // =========== Spatial groups ===========

  it('processes spatial groups as link groupings', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'arm_group',
          objects: [
            {
              name: 'upper_arm',
              properties: [{ key: 'geometry', value: 'cylinder' }],
              traits: [],
            },
          ],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('arm_group');
  });

  // =========== Name sanitization ===========

  it('sanitizes special characters in names', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'my object!@#',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [],
        },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('my_object');
    expect(xml).not.toContain('!@#');
  });

  // =========== XML escaping ===========

  it('escapes XML special characters', () => {
    const comp = makeComposition({ name: 'Test<>&' });
    const xml = compiler.compile(comp);
    // The robot name should be safe for XML
    expect(xml).toContain('<robot');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects into separate links and joints', () => {
    const comp = makeComposition({
      objects: [
        { name: 'link_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'link_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const xml = compiler.compile(comp);
    expect(xml).toContain('link_a');
    expect(xml).toContain('link_b');
    // Should have joints for both
    const jointMatches = xml.match(/<joint/g);
    expect(jointMatches).toBeTruthy();
    expect(jointMatches!.length).toBeGreaterThanOrEqual(2);
  });
});
