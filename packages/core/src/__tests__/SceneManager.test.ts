import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneManager, SavedScene } from '../scene/SceneManager';

/**
 * SceneManager depends on SceneSerializer + SceneDeserializer internally.
 * The serializer's serialize() expects a World from the constructor, but
 * SceneManager.save() passes an HSPlusNode as the first arg (a known API mismatch).
 *
 * We test SceneManager by mocking the internal serializer & deserializer,
 * focusing on the manager's storage, listing, export/import, and lifecycle logic.
 */

function makeNode(id: string, children: any[] = []): any {
  return {
    id,
    type: 'object',
    name: `Node_${id}`,
    properties: { position: [0, 0, 0] },
    children,
    traits: new Map(),
    directives: [],
  };
}

function makeFakeSerializedScene(name: string, root: any): any {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    name,
    root: {
      id: root.id,
      type: root.type,
      properties: root.properties || {},
      traits: {},
      children: [],
    },
  };
}

describe('SceneManager', () => {
  let mgr: SceneManager;

  beforeEach(() => {
    mgr = new SceneManager();
    // Patch internal serializer to work without World dependency
    (mgr as any).serializer = {
      serialize: vi.fn((root: any, name: string, metadata?: any) => {
        return makeFakeSerializedScene(name, root);
      }),
    };
    (mgr as any).deserializer = {
      deserialize: vi.fn((scene: any) => makeNode(scene.root.id)),
    };
    (mgr as any).stateCapture = {
      capture: vi.fn(() => ({ timestamp: Date.now(), entities: [] })),
    };
  });

  it('saves and loads a scene', () => {
    const root = makeNode('root', [makeNode('child-1')]);
    mgr.save('test-scene', root);

    const loaded = mgr.load('test-scene');
    expect(loaded).not.toBeNull();
    expect(loaded!.node.id).toBe('root');
  });

  it('returns null for non-existent scene', () => {
    expect(mgr.load('nope')).toBeNull();
  });

  it('has() checks existence', () => {
    mgr.save('s1', makeNode('root'));
    expect(mgr.has('s1')).toBe(true);
    expect(mgr.has('s2')).toBe(false);
  });

  it('deletes a scene', () => {
    mgr.save('to-delete', makeNode('root'));
    expect(mgr.delete('to-delete')).toBe(true);
    expect(mgr.has('to-delete')).toBe(false);
  });

  it('lists saved scenes with metadata', () => {
    mgr.save('scene-a', makeNode('a'));
    mgr.save('scene-b', makeNode('b'));

    const list = mgr.list();
    expect(list.length).toBe(2);
    expect(list.find((e) => e.name === 'scene-a')).toBeDefined();
    expect(list.find((e) => e.name === 'scene-b')).toBeDefined();
  });

  it('exports scene to JSON', () => {
    mgr.save('my-scene', makeNode('root'));
    const json = mgr.exportJSON('my-scene');
    expect(json).toBeDefined();
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json!);
    expect(parsed.scene).toBeDefined();
    expect(parsed.scene.name).toBe('my-scene');
  });

  it('exports null for non-existent scene', () => {
    expect(mgr.exportJSON('no-such')).toBeNull();
  });

  it('imports a scene from JSON', () => {
    mgr.save('original', makeNode('root'));
    const json = mgr.exportJSON('original')!;

    mgr.delete('original');
    const name = mgr.importJSON(json);
    expect(name).toBe('original');
    expect(mgr.has('original')).toBe(true);
  });

  it('counts saved scenes', () => {
    expect(mgr.count).toBe(0);
    mgr.save('a', makeNode('a'));
    mgr.save('b', makeNode('b'));
    expect(mgr.count).toBe(2);
  });

  it('overwrites existing scene on re-save', () => {
    mgr.save('dup', makeNode('v1'));
    mgr.save('dup', makeNode('v2'));
    expect(mgr.count).toBe(1);
  });

  it('delete returns false for non-existent', () => {
    expect(mgr.delete('not-here')).toBe(false);
  });
});
