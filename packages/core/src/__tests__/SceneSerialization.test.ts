import { describe, it, expect } from 'vitest';
import { SceneSerializer } from '../scene/SceneSerializer';
import { SceneDeserializer } from '../scene/SceneDeserializer';
import { SceneManager } from '../scene/SceneManager';
import type { HSPlusNode } from '../types/HoloScriptPlus';

function makeTestScene(): HSPlusNode {
  return {
    id: 'root',
    type: 'composition',
    properties: {
      position: { x: 0, y: 1, z: -2 },
      text: 'Hello World',
      visible: true,
      _internal: 'should_be_stripped',
    },
    traits: new Map([
      ['render', { type: 'box', color: '#ff0000', size: [1, 1, 1] }],
      ['grabbable', { snapToHand: true }],
    ]),
    children: [
      {
        id: 'child_1',
        type: 'entity',
        properties: { position: { x: 1, y: 0, z: 0 }, tag: 'cube' },
        traits: new Map([['collider', { type: 'box', size: [0.5, 0.5, 0.5] }]]),
        children: [],
      } as any,
      {
        id: 'child_2',
        type: 'text',
        properties: { text: 'Label', fontSize: 0.05 },
        traits: new Map(),
        children: [],
      } as any,
    ],
  } as any;
}

describe('Scene Serialization', () => {
  describe('SceneSerializer', () => {
    it('Serializes a node tree to JSON-safe format', () => {
      const serializer = new SceneSerializer();
      const scene = serializer.serialize(makeTestScene(), 'test_scene');

      expect(scene.version).toBe(1);
      expect(scene.name).toBe('test_scene');
      expect(scene.root.id).toBe('root');
      expect(scene.root.children).toHaveLength(2);
    });

    it('Converts Map-based traits to plain objects', () => {
      const serializer = new SceneSerializer();
      const scene = serializer.serialize(makeTestScene());

      expect(scene.root.traits).toBeDefined();
      expect(scene.root.traits['render']).toEqual({
        type: 'box',
        color: '#ff0000',
        size: [1, 1, 1],
      });
      expect(scene.root.traits['grabbable']).toEqual({ snapToHand: true });
    });

    it('Strips internal properties starting with _', () => {
      const serializer = new SceneSerializer();
      const scene = serializer.serialize(makeTestScene());

      expect(scene.root.properties['_internal']).toBeUndefined();
      expect(scene.root.properties['text']).toBe('Hello World');
    });

    it('Produces valid JSON output', () => {
      const serializer = new SceneSerializer();
      const json = serializer.toJSON(makeTestScene(), 'json_test');

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('json_test');
    });
  });

  describe('SceneDeserializer', () => {
    it('Reconstructs a live node tree from serialized data', () => {
      const serializer = new SceneSerializer();
      const deserializer = new SceneDeserializer();

      const serialized = serializer.serialize(makeTestScene(), 'roundtrip');
      const rebuilt = deserializer.deserialize(serialized);

      expect(rebuilt.id).toBe('root');
      expect(rebuilt.type).toBe('composition');
      expect(rebuilt.traits instanceof Map).toBe(true);
      expect(rebuilt.traits!.get('render')).toEqual({
        type: 'box',
        color: '#ff0000',
        size: [1, 1, 1],
      });
    });

    it('Roundtrips JSON string faithfully', () => {
      const serializer = new SceneSerializer();
      const deserializer = new SceneDeserializer();

      const json = serializer.toJSON(makeTestScene(), 'json_roundtrip');
      const { node, name } = deserializer.fromJSON(json);

      expect(name).toBe('json_roundtrip');
      expect(node.children).toHaveLength(2);
      expect((node.children![0] as any).id).toBe('child_1');
    });
  });

  describe('SceneManager', () => {
    it('Saves and loads scenes', () => {
      const manager = new SceneManager();
      manager.save('my_scene', makeTestScene());

      expect(manager.has('my_scene')).toBe(true);

      const loaded = manager.load('my_scene');
      expect(loaded).not.toBeNull();
      expect(loaded!.node.id).toBe('root');
    });

    it('Lists saved scenes', () => {
      const manager = new SceneManager();
      manager.save('scene_a', makeTestScene());
      manager.save('scene_b', makeTestScene());

      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list.map((e) => e.name)).toContain('scene_a');
      expect(list[0].nodeCount).toBe(3); // root + 2 children
    });

    it('Exports and imports JSON', () => {
      const manager = new SceneManager();
      manager.save('exportable', makeTestScene());

      const json = manager.exportJSON('exportable');
      expect(json).not.toBeNull();

      const manager2 = new SceneManager();
      const importedName = manager2.importJSON(json!);
      expect(importedName).toBe('exportable');
      expect(manager2.has('exportable')).toBe(true);
    });

    it('Deletes scenes', () => {
      const manager = new SceneManager();
      manager.save('to_delete', makeTestScene());
      expect(manager.count).toBe(1);

      manager.delete('to_delete');
      expect(manager.count).toBe(0);
      expect(manager.load('to_delete')).toBeNull();
    });
  });
});
