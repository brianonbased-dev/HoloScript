/**
 * SceneSerializer Production Tests
 *
 * Node serialization, sanitization, circular reference protection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneSerializer } from '../SceneSerializer';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

function makeNode(id: string, type = 'mesh', children: HSPlusNode[] = []): HSPlusNode {
  return {
    id,
    type: type as any,
    properties: { color: '#ff0000', visible: true },
    traits: { grabbable: { enabled: true } },
    children,
    parent: undefined as any,
  } as unknown as HSPlusNode;
}

describe('SceneSerializer — Production', () => {
  let serializer: SceneSerializer;

  beforeEach(() => {
    serializer = new SceneSerializer();
  });

  describe('serializeNode', () => {
    it('serializes a simple node', () => {
      const node = makeNode('n1', 'mesh');
      const result = serializer.serializeNode(node);
      expect(result.id).toBe('n1');
      expect(result.type).toBe('mesh');
      expect(result.children).toHaveLength(0);
    });

    it('serializes children recursively', () => {
      const child = makeNode('c1', 'light');
      const root = makeNode('root', 'group', [child]);
      const result = serializer.serializeNode(root);
      expect(result.children).toHaveLength(1);
      expect(result.children[0].id).toBe('c1');
    });
  });

  describe('serialize', () => {
    it('produces SerializedScene with version and timestamp', () => {
      const root = makeNode('root', 'group');
      const scene = serializer.serialize(root, 'TestScene');
      expect(scene.version).toBe(1);
      expect(scene.name).toBe('TestScene');
      expect(scene.timestamp).toBeTruthy();
      expect(scene.root.id).toBe('root');
    });

    it('includes metadata', () => {
      const root = makeNode('root', 'group');
      const scene = serializer.serialize(root, 'Test', { author: 'brian' });
      expect(scene.metadata?.author).toBe('brian');
    });
  });

  describe('toJSON', () => {
    it('produces valid JSON string', () => {
      const root = makeNode('root', 'group');
      const json = serializer.toJSON(root, 'Scene1');
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('Scene1');
    });
  });

  describe('sanitizeValue', () => {
    it('converts Map to object', () => {
      const result = (serializer as any).sanitizeValue(
        new Map([
          ['a', 1],
          ['b', 2],
        ])
      );
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('converts Set to array', () => {
      const result = (serializer as any).sanitizeValue(new Set([1, 2, 3]));
      expect(result).toEqual([1, 2, 3]);
    });

    it('handles null/undefined', () => {
      expect((serializer as any).sanitizeValue(null)).toBeNull();
      expect((serializer as any).sanitizeValue(undefined)).toBeUndefined();
    });

    it('passes primitives through', () => {
      expect((serializer as any).sanitizeValue(42)).toBe(42);
      expect((serializer as any).sanitizeValue('hello')).toBe('hello');
    });
  });
});
