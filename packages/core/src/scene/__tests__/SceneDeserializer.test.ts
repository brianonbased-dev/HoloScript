/**
 * SceneDeserializer Unit Tests
 *
 * Tests scene reconstruction from serialized data, JSON parsing,
 * trait rebuilding, child recursion, and ref-node handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneDeserializer } from '../SceneDeserializer';
import type { SerializedScene, SerializedNode } from '../SceneSerializer';

function makeSerializedScene(root: SerializedNode, name = 'test'): SerializedScene {
  return { version: 1, timestamp: new Date().toISOString(), name, root };
}

describe('SceneDeserializer', () => {
  let deserializer: SceneDeserializer;

  beforeEach(() => {
    deserializer = new SceneDeserializer();
  });

  describe('deserialize', () => {
    it('should rebuild a simple node', () => {
      const scene = makeSerializedScene({
        id: 'root', type: 'entity', properties: { name: 'Root' }, traits: {}, children: [],
      });
      const node = deserializer.deserialize(scene);
      expect(node.id).toBe('root');
      expect(node.properties.name).toBe('Root');
    });

    it('should rebuild traits as Map', () => {
      const scene = makeSerializedScene({
        id: 'n1', type: 'entity',
        properties: {},
        traits: { grabbable: { enabled: true }, physics: { mass: 10 } },
        children: [],
      });
      const node = deserializer.deserialize(scene);
      expect(node.traits).toBeInstanceOf(Map);
      expect(node.traits.get('grabbable')).toEqual({ enabled: true });
      expect(node.traits.get('physics')).toEqual({ mass: 10 });
    });

    it('should rebuild children recursively', () => {
      const scene = makeSerializedScene({
        id: 'root', type: 'entity', properties: {}, traits: {},
        children: [
          { id: 'child1', type: 'entity', properties: {}, traits: {}, children: [] },
          { id: 'child2', type: 'entity', properties: {}, traits: {},
            children: [{ id: 'grandchild', type: 'entity', properties: {}, traits: {}, children: [] }],
          },
        ],
      });
      const node = deserializer.deserialize(scene);
      expect(node.children.length).toBe(2);
      expect(node.children[1].children.length).toBe(1);
      expect(node.children[1].children[0].id).toBe('grandchild');
    });

    it('should handle ref nodes (circular reference placeholders)', () => {
      const scene = makeSerializedScene({
        id: 'root', type: 'entity', properties: {}, traits: {},
        children: [{ id: 'ref1', type: 'ref', properties: {}, traits: {}, children: [] }],
      });
      const node = deserializer.deserialize(scene);
      expect(node.children[0].id).toBe('ref1');
      expect(node.children[0].properties._isRef).toBe(true);
    });
  });

  describe('fromJSON', () => {
    it('should parse JSON string and return node, name, metadata', () => {
      const scene = makeSerializedScene(
        { id: 'root', type: 'entity', properties: {}, traits: {}, children: [] },
        'MyScene'
      );
      (scene as any).metadata = { author: 'test' };
      const json = JSON.stringify(scene);

      const result = deserializer.fromJSON(json);
      expect(result.name).toBe('MyScene');
      expect(result.node.id).toBe('root');
      expect(result.metadata?.author).toBe('test');
    });

    it('should warn but still load non-v1 data', () => {
      const scene = makeSerializedScene(
        { id: 'root', type: 'entity', properties: {}, traits: {}, children: [] },
      );
      (scene as any).version = 99;
      const json = JSON.stringify(scene);

      // Should not throw
      const result = deserializer.fromJSON(json);
      expect(result.node.id).toBe('root');
    });
  });
});
