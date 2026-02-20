/**
 * SceneManager — production test suite
 *
 * Tests: save/load/has/delete/list/exportJSON/importJSON lifecycle,
 * count, node counting, metadata, and state capture integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneManager } from '../SceneManager';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, children: HSPlusNode[] = []): HSPlusNode {
  return {
    id,
    type: 'entity',
    properties: { label: id },
    traits: new Map(),
    children,
  } as unknown as HSPlusNode;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SceneManager: production', () => {
  let mgr: SceneManager;

  beforeEach(() => {
    mgr = new SceneManager();
  });

  // ─── save / has ───────────────────────────────────────────────────────────
  describe('save / has', () => {
    it('starts empty', () => {
      expect(mgr.count).toBe(0);
    });

    it('saves a scene and reports it exists', () => {
      mgr.save('level-1', makeNode('root'));
      expect(mgr.has('level-1')).toBe(true);
    });

    it('has() returns false for unknown scenes', () => {
      expect(mgr.has('nonexistent')).toBe(false);
    });

    it('save returns a SavedScene with scene data', () => {
      const saved = mgr.save('test', makeNode('root'));
      expect(saved.scene).toBeDefined();
      expect(saved.scene.name).toBe('test');
    });

    it('save increments count', () => {
      mgr.save('a', makeNode('r1'));
      mgr.save('b', makeNode('r2'));
      expect(mgr.count).toBe(2);
    });

    it('saving the same name overwrites', () => {
      mgr.save('s1', makeNode('first'));
      mgr.save('s1', makeNode('second'));
      expect(mgr.count).toBe(1);
    });
  });

  // ─── load ─────────────────────────────────────────────────────────────────
  describe('load', () => {
    it('returns null for unknown scene', () => {
      expect(mgr.load('ghost')).toBeNull();
    });

    it('loads a saved scene and returns a node', () => {
      mgr.save('myScene', makeNode('root'));
      const result = mgr.load('myScene');
      expect(result).not.toBeNull();
      expect(result!.node).toBeDefined();
    });

    it('loaded node has the same id as saved root', () => {
      mgr.save('hero', makeNode('hero-root'));
      const result = mgr.load('hero');
      expect(result!.node.id).toBe('hero-root');
    });

    it('loaded result has no state when not captured', () => {
      mgr.save('s', makeNode('r'));
      expect(mgr.load('s')!.state).toBeUndefined();
    });

    it('loaded result includes state when captured', () => {
      mgr.save('s', makeNode('r'), {});  // empty stateOptions → captures state
      const result = mgr.load('s');
      expect(result!.state).toBeDefined();
      expect(result!.state!.timestamp).toBeTruthy();
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('deletes a saved scene', () => {
      mgr.save('del-me', makeNode('r'));
      mgr.delete('del-me');
      expect(mgr.has('del-me')).toBe(false);
    });

    it('returns true when deleting existing scene', () => {
      mgr.save('x', makeNode('r'));
      expect(mgr.delete('x')).toBe(true);
    });

    it('returns false when deleting non-existent scene', () => {
      expect(mgr.delete('ghost')).toBe(false);
    });

    it('decrements count', () => {
      mgr.save('a', makeNode('r'));
      mgr.delete('a');
      expect(mgr.count).toBe(0);
    });
  });

  // ─── list ─────────────────────────────────────────────────────────────────
  describe('list', () => {
    it('returns empty array when no scenes saved', () => {
      expect(mgr.list()).toEqual([]);
    });

    it('lists all saved scenes', () => {
      mgr.save('s1', makeNode('r1'));
      mgr.save('s2', makeNode('r2'));
      const names = mgr.list().map(e => e.name);
      expect(names).toContain('s1');
      expect(names).toContain('s2');
    });

    it('list entry includes name, timestamp, and nodeCount', () => {
      mgr.save('scene', makeNode('root', [makeNode('child1'), makeNode('child2')]));
      const entry = mgr.list()[0];
      expect(entry.name).toBe('scene');
      expect(entry.timestamp).toBeTruthy();
      expect(entry.nodeCount).toBe(3); // root + 2 children
    });
  });

  // ─── exportJSON / importJSON ──────────────────────────────────────────────
  describe('exportJSON / importJSON', () => {
    it('exportJSON returns null for unknown scene', () => {
      expect(mgr.exportJSON('ghost')).toBeNull();
    });

    it('exportJSON returns valid JSON string', () => {
      mgr.save('export-me', makeNode('r'));
      const json = mgr.exportJSON('export-me');
      expect(json).not.toBeNull();
      expect(() => JSON.parse(json!)).not.toThrow();
    });

    it('importJSON restores a scene and returns its name', () => {
      mgr.save('original', makeNode('r'));
      const json = mgr.exportJSON('original')!;
      mgr.delete('original');
      const name = mgr.importJSON(json);
      expect(name).toBe('original');
      expect(mgr.has('original')).toBe(true);
    });

    it('import/export roundtrip preserves node structure', () => {
      mgr.save('rt', makeNode('root', [makeNode('child')]));
      const json = mgr.exportJSON('rt')!;
      mgr.delete('rt');
      mgr.importJSON(json);
      const result = mgr.load('rt');
      expect(result!.node.id).toBe('root');
    });
  });
});
