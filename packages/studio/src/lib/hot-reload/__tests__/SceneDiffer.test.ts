/**
 * SceneDiffer tests — verify minimal mutation generation between AST snapshots.
 */

import { describe, it, expect } from 'vitest';
import { diffScenes } from '../SceneDiffer';
import type { HoloComposition, HoloObjectDecl, HoloObjectProperty } from '../../../parser/HoloCompositionTypes';
import type { ASTMutation } from '../../StudioBridge';

function makeComposition(partial: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: partial.name ?? 'TestScene',
    objects: partial.objects ?? [],
    spatialGroups: partial.spatialGroups ?? [],
    lights: partial.lights ?? [],
    camera: partial.camera,
    environment: partial.environment,
    timelines: partial.timelines ?? [],
  } as HoloComposition;
}

function makeObject(
  name: string,
  props: Record<string, unknown> = {},
  traits: Array<{ name: string; config?: Record<string, unknown> }> = [],
  children?: HoloObjectDecl[]
): HoloObjectDecl {
  const properties: HoloObjectProperty[] = Object.entries(props).map(([key, value]) => ({
    type: 'ObjectProperty',
    key,
    value: value as import('../../../parser/HoloCompositionTypes').HoloValue,
  }));

  return {
    type: 'ObjectDecl',
    name,
    properties,
    traits: traits.map((t) => ({
      type: 'ObjectTrait',
      name: t.name,
      config: t.config ?? {},
    })),
    children,
  } as HoloObjectDecl;
}

describe('SceneDiffer', () => {
  it('returns empty diff for identical scenes', () => {
    const ast = makeComposition({ objects: [makeObject('Cube')] });
    const result = diffScenes(ast, ast);
    expect(result.mutations).toHaveLength(0);
    expect(result.affectedObjectNames).toHaveLength(0);
  });

  it('detects added top-level object', () => {
    const prev = makeComposition();
    const next = makeComposition({ objects: [makeObject('Cube')] });
    const result = diffScenes(prev, next);
    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0].type).toBe('addObject');
    expect(result.affectedObjectNames).toContain('Cube');
  });

  it('detects removed top-level object', () => {
    const prev = makeComposition({ objects: [makeObject('Cube')] });
    const next = makeComposition();
    const result = diffScenes(prev, next);
    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0].type).toBe('removeObject');
    expect(result.affectedObjectNames).toContain('Cube');
  });

  it('detects added non-transform property', () => {
    const prev = makeComposition({ objects: [makeObject('Cube')] });
    const next = makeComposition({
      objects: [makeObject('Cube', { color: '#ff0000' })],
    });
    const result = diffScenes(prev, next);
    const propMut = result.mutations.find((m) => m.type === 'updateObjectProperty');
    expect(propMut).toBeDefined();
    expect((propMut as ASTMutation & { key: string }).key).toBe('color');
  });

  it('detects changed non-transform property', () => {
    const prev = makeComposition({
      objects: [makeObject('Cube', { color: '#ff0000' })],
    });
    const next = makeComposition({
      objects: [makeObject('Cube', { color: '#00ff00' })],
    });
    const result = diffScenes(prev, next);
    const propMut = result.mutations.find((m) => m.type === 'updateObjectProperty');
    expect(propMut).toBeDefined();
    expect((propMut as ASTMutation & { value: unknown }).value).toEqual('#00ff00');
  });

  it('detects added trait', () => {
    const prev = makeComposition({ objects: [makeObject('Cube')] });
    const next = makeComposition({
      objects: [makeObject('Cube', {}, [{ name: 'physics', config: { mass: 1 } }])],
    });
    const result = diffScenes(prev, next);
    const addTrait = result.mutations.find((m) => m.type === 'addTrait');
    expect(addTrait).toBeDefined();
  });

  it('detects removed trait', () => {
    const prev = makeComposition({
      objects: [makeObject('Cube', {}, [{ name: 'physics' }])],
    });
    const next = makeComposition({ objects: [makeObject('Cube')] });
    const result = diffScenes(prev, next);
    const remTrait = result.mutations.find((m) => m.type === 'removeTrait');
    expect(remTrait).toBeDefined();
  });

  it('detects trait config change', () => {
    const prev = makeComposition({
      objects: [makeObject('Cube', {}, [{ name: 'physics', config: { mass: 1 } }])],
    });
    const next = makeComposition({
      objects: [makeObject('Cube', {}, [{ name: 'physics', config: { mass: 2 } }])],
    });
    const result = diffScenes(prev, next);
    const cfgMut = result.mutations.find((m) => m.type === 'updateTraitConfig');
    expect(cfgMut).toBeDefined();
    expect((cfgMut as ASTMutation & { configKey: string; configValue: unknown }).configValue).toBe(2);
  });

  it('diffs child objects recursively', () => {
    const prev = makeComposition({
      objects: [
        makeObject('Parent', {}, [], [makeObject('Child', { scale: 1 })]),
      ],
    });
    const next = makeComposition({
      objects: [
        makeObject('Parent', {}, [], [makeObject('Child', { scale: 2 })]),
      ],
    });
    const result = diffScenes(prev, next);
    expect(result.mutations.length).toBeGreaterThan(0);
    expect(result.affectedObjectNames).toContain('Child');
  });

  it('detects added light', () => {
    const prev = makeComposition();
    const next = makeComposition({
      lights: [{ type: 'Light', name: 'Sun', lightType: 'directional', properties: [] }],
    });
    const result = diffScenes(prev, next);
    expect(result.mutations.some((m) => m.type === 'addLight')).toBe(true);
  });

  it('detects removed light', () => {
    const prev = makeComposition({
      lights: [{ type: 'Light', name: 'Sun', lightType: 'directional', properties: [] }],
    });
    const next = makeComposition();
    const result = diffScenes(prev, next);
    expect(result.mutations.some((m) => m.type === 'removeLight')).toBe(true);
  });

  it('detects camera property change', () => {
    const prev = makeComposition({
      camera: {
        type: 'Camera',
        cameraType: 'perspective',
        properties: [{ type: 'CameraProperty', key: 'fov', value: 60 }],
      },
    });
    const next = makeComposition({
      camera: {
        type: 'Camera',
        cameraType: 'perspective',
        properties: [{ type: 'CameraProperty', key: 'fov', value: 75 }],
      },
    });
    const result = diffScenes(prev, next);
    expect(result.mutations.some((m) => m.type === 'updateCamera')).toBe(true);
  });

  it('consolidates transform properties into dedicated mutations', () => {
    const prev = makeComposition({
      objects: [makeObject('Cube', { position: [0, 0, 0] })],
    });
    const next = makeComposition({
      objects: [makeObject('Cube', { position: [1, 2, 3] })],
    });
    const result = diffScenes(prev, next);
    const posMut = result.mutations.find((m) => m.type === 'updatePosition');
    expect(posMut).toBeDefined();
    expect(result.mutations.some((m) => m.type === 'updateObjectProperty' && m.key === 'position')).toBe(false);
  });

  it('handles large scene (1000 objects) efficiently', () => {
    const objects: HoloObjectDecl[] = [];
    for (let i = 0; i < 1000; i++) {
      objects.push(makeObject(`Obj${i}`, { x: i }));
    }
    const prev = makeComposition({ objects });
    const next = makeComposition({
      objects: objects.map((o, idx) =>
        idx === 500 ? makeObject(o.name, { x: idx, y: 1 }) : o
      ),
    });
    const t0 = performance.now();
    const result = diffScenes(prev, next);
    const t1 = performance.now();
    expect(result.mutations.length).toBe(1); // only one object changed
    expect(result.affectedObjectNames).toContain('Obj500');
    expect(t1 - t0).toBeLessThan(500); // 500ms budget for 1000 objects
  });
});
