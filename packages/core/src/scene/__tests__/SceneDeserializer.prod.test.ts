/**
 * SceneDeserializer — production test suite
 *
 * Tests: deserialize from SerializedScene, fromJSON roundtrip,
 * trait Map reconstruction, child tree recursion, ref node handling,
 * unknown version warning, and property preservation.
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneDeserializer } from '../SceneDeserializer';
import { SceneSerializer } from '../SceneSerializer';
import type { SerializedScene } from '../SceneSerializer';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHSNode(
  id: string,
  type = 'entity',
  props: Record<string, unknown> = {},
  traits: Map<string, unknown> = new Map(),
  children: HSPlusNode[] = []
): HSPlusNode {
  return { id, type, properties: props, traits, children } as any;
}

function makeScene(root: HSPlusNode, name = 'Test'): string {
  const serializer = new SceneSerializer();
  const serialized = serializer.serialize(root, name);
  return JSON.stringify(serialized);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SceneDeserializer: production', () => {
  const deser = new SceneDeserializer();

  // ─── deserialize ──────────────────────────────────────────────────────────
  describe('deserialize', () => {
    it('returns root node with correct id', () => {
      const scene: SerializedScene = {
        version: 1,
        name: 'Test',
        exportedAt: new Date().toISOString(),
        root: { id: 'r1', type: 'entity', properties: {}, traits: {}, children: [] },
      };
      const node = deser.deserialize(scene);
      expect(node.id).toBe('r1');
    });

    it('returns correct node type', () => {
      const scene: SerializedScene = {
        version: 1,
        name: 'Test',
        exportedAt: new Date().toISOString(),
        root: { id: 'r1', type: 'world', properties: {}, traits: {}, children: [] },
      };
      expect(deser.deserialize(scene).type).toBe('world');
    });
  });

  // ─── fromJSON roundtrip ──────────────────────────────────────────────────
  describe('fromJSON roundtrip', () => {
    it('serializes then deserializes single node preserving id', () => {
      const root = makeHSNode('root-1', 'entity');
      const json = makeScene(root, 'scene1');
      const { node, name } = deser.fromJSON(json);
      expect(node.id).toBe('root-1');
      expect(name).toBe('scene1');
    });

    it('preserves properties', () => {
      const root = makeHSNode('e1', 'entity', { hp: 100, name: 'hero' });
      const json = makeScene(root);
      const { node } = deser.fromJSON(json);
      expect(node.properties.hp).toBe(100);
      expect(node.properties.name).toBe('hero');
    });

    it('reconstructs traits as a Map', () => {
      const traits = new Map<string, unknown>([
        ['Health', { max: 100 }],
        ['Speed', 5],
      ]);
      const root = makeHSNode('e1', 'entity', {}, traits);
      const json = makeScene(root);
      const { node } = deser.fromJSON(json);
      expect(node.traits instanceof Map).toBe(true);
      expect(node.traits.has('Health')).toBe(true);
    });

    it('preserves trait values', () => {
      const traits = new Map<string, unknown>([['Speed', 42]]);
      const root = makeHSNode('e1', 'entity', {}, traits);
      const json = makeScene(root);
      const { node } = deser.fromJSON(json);
      expect(node.traits.get('Speed')).toBe(42);
    });

    it('preserves metadata when provided', () => {
      // Build manual JSON with metadata
      const serialized: SerializedScene = {
        version: 1,
        name: 'Meta',
        exportedAt: new Date().toISOString(),
        root: { id: 'r1', type: 'entity', properties: {}, traits: {}, children: [] },
        metadata: { author: 'test' },
      };
      const { metadata } = deser.fromJSON(JSON.stringify(serialized));
      expect(metadata?.author).toBe('test');
    });
  });

  // ─── child tree ─────────────────────────────────────────────────────────
  describe('child tree reconstruction', () => {
    it('rebuilds children recursively', () => {
      const child = makeHSNode('child-1', 'entity');
      const root = makeHSNode('root-1', 'entity', {}, new Map(), [child]);
      const json = makeScene(root);
      const { node } = deser.fromJSON(json);
      expect(node.children.length).toBe(1);
      expect(node.children[0].id).toBe('child-1');
    });

    it('rebuilds nested grandchildren', () => {
      const grand = makeHSNode('grand', 'entity');
      const child = makeHSNode('child', 'entity', {}, new Map(), [grand]);
      const root = makeHSNode('root', 'entity', {}, new Map(), [child]);
      const json = makeScene(root);
      const { node } = deser.fromJSON(json);
      expect(node.children[0].children[0].id).toBe('grand');
    });
  });

  // ─── ref node handling ───────────────────────────────────────────────────
  describe('ref node handling', () => {
    it('ref-type node is rebuilt with _isRef flag', () => {
      const scene: SerializedScene = {
        version: 1,
        name: 'Test',
        exportedAt: new Date().toISOString(),
        root: { id: 'ref-1', type: 'ref', properties: {}, traits: {}, children: [] },
      };
      const node = deser.deserialize(scene);
      expect(node.properties._isRef).toBe(true);
    });
  });

  // ─── unknown version warning ─────────────────────────────────────────────
  describe('unknown version warning', () => {
    it('logs a warning for version !== 1', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const serialized: SerializedScene = {
        version: 99 as any,
        name: 'Old',
        exportedAt: new Date().toISOString(),
        root: { id: 'r1', type: 'entity', properties: {}, traits: {}, children: [] },
      };
      deser.fromJSON(JSON.stringify(serialized));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown version'));
      warnSpy.mockRestore();
    });
  });
});
