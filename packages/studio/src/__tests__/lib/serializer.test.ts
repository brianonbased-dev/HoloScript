/**
 * serializer.test.ts — Project Serialization Engine Tests
 *
 * Coverage: serializeProject, deserializeProject, projectChecksum,
 *           createEmptyProject, countNodes, findNodeById, estimateSize
 *
 * All functions are pure (no side effects, no I/O) — no mocking needed.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeProject,
  deserializeProject,
  projectChecksum,
  createEmptyProject,
  countNodes,
  findNodeById,
  estimateSize,
} from '../../lib/serializer';
import type { SceneNode, ProjectFile } from '../../lib/serializer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, children: SceneNode[] = []): SceneNode {
  return {
    id,
    name: `Node_${id}`,
    type: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    children,
    traits: [],
    properties: {},
  };
}

function makeProject(name = 'Test', scene: SceneNode[] = []): ProjectFile {
  const p = createEmptyProject(name);
  return { ...p, scene };
}

// ── serializeProject ──────────────────────────────────────────────────────────

describe('serializeProject()', () => {
  it('returns a valid JSON string', () => {
    const p = makeProject();
    const s = serializeProject(p);
    expect(() => JSON.parse(s)).not.toThrow();
  });

  it('round-trips through JSON.parse', () => {
    const p = makeProject('Round-trip');
    const parsed = JSON.parse(serializeProject(p));
    expect(parsed.name).toBe('Round-trip');
  });

  it('includes all required fields', () => {
    const p = makeProject();
    const parsed = JSON.parse(serializeProject(p));
    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('scene');
    expect(parsed).toHaveProperty('checksum');
    expect(parsed).toHaveProperty('createdAt');
    expect(parsed).toHaveProperty('modifiedAt');
  });

  it('uses pretty-printed 2-space indentation', () => {
    const p = makeProject();
    const s = serializeProject(p);
    expect(s).toContain('\n  ');
  });
});

// ── deserializeProject ────────────────────────────────────────────────────────

describe('deserializeProject()', () => {
  it('round-trips a serialized project', () => {
    const p = makeProject('Deserialize Me', [makeNode('n1')]);
    const json = serializeProject(p);
    const restored = deserializeProject(json);
    expect(restored).not.toBeNull();
    expect(restored!.name).toBe('Deserialize Me');
    expect(restored!.scene).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(deserializeProject('not json at all!!!')).toBeNull();
  });

  it('returns null when version field is missing', () => {
    const partial = JSON.stringify({ scene: [] });
    expect(deserializeProject(partial)).toBeNull();
  });

  it('returns null when scene field is missing', () => {
    const partial = JSON.stringify({ version: '1.0.0' });
    expect(deserializeProject(partial)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(deserializeProject('')).toBeNull();
  });

  it('accepts extra unknown fields without error', () => {
    const p = makeProject();
    const json = serializeProject({ ...p, extraField: 'bonus' } as any);
    const restored = deserializeProject(json);
    expect(restored).not.toBeNull();
  });
});

// ── projectChecksum ───────────────────────────────────────────────────────────

describe('projectChecksum()', () => {
  it('returns a string starting with "holo-"', () => {
    const p = makeProject();
    expect(projectChecksum(p)).toMatch(/^holo-/);
  });

  it('is deterministic for same project', () => {
    const p = makeProject('Deterministic');
    expect(projectChecksum(p)).toBe(projectChecksum(p));
  });

  it('differs when project name changes', () => {
    const p1 = makeProject('Alpha');
    const p2 = makeProject('Beta');
    expect(projectChecksum(p1)).not.toBe(projectChecksum(p2));
  });

  it('differs when scene changes', () => {
    const p1 = makeProject('Same', []);
    const p2 = makeProject('Same', [makeNode('n1')]);
    expect(projectChecksum(p1)).not.toBe(projectChecksum(p2));
  });
});

// ── createEmptyProject ────────────────────────────────────────────────────────

describe('createEmptyProject()', () => {
  it('creates project with given name', () => {
    const p = createEmptyProject('My Project');
    expect(p.name).toBe('My Project');
  });

  it('sets version to 1.0.0', () => {
    expect(createEmptyProject('x').version).toBe('1.0.0');
  });

  it('creates empty scene array', () => {
    expect(createEmptyProject('x').scene).toEqual([]);
  });

  it('sets valid ISO date strings for timestamps', () => {
    const p = createEmptyProject('x');
    expect(() => new Date(p.createdAt)).not.toThrow();
    expect(() => new Date(p.modifiedAt)).not.toThrow();
    expect(new Date(p.createdAt).toISOString()).toBe(p.createdAt);
  });

  it('includes a valid checksum', () => {
    const p = createEmptyProject('x');
    expect(p.checksum).toMatch(/^holo-/);
  });

  it('includes default environment', () => {
    const p = createEmptyProject('x');
    expect(p.environment).toHaveProperty('skybox');
    expect(p.environment).toHaveProperty('ambientLight');
  });

  it('creates unique checksums for different names', () => {
    expect(createEmptyProject('A').checksum).not.toBe(createEmptyProject('B').checksum);
  });
});

// ── countNodes ────────────────────────────────────────────────────────────────

describe('countNodes()', () => {
  it('returns 0 for empty scene', () => {
    expect(countNodes([])).toBe(0);
  });

  it('counts a single flat node', () => {
    expect(countNodes([makeNode('n1')])).toBe(1);
  });

  it('counts multiple flat nodes', () => {
    expect(countNodes([makeNode('n1'), makeNode('n2'), makeNode('n3')])).toBe(3);
  });

  it('counts nested children recursively', () => {
    const child = makeNode('child');
    const grandchild = makeNode('grandchild');
    child.children = [grandchild];
    const root = makeNode('root', [child]);
    expect(countNodes([root])).toBe(3); // root + child + grandchild
  });

  it('handles deeply nested tree (depth 5)', () => {
    let node = makeNode('d5');
    for (let i = 4; i >= 0; i--) {
      node = makeNode(`d${i}`, [node]);
    }
    expect(countNodes([node])).toBe(6);
  });
});

// ── findNodeById ──────────────────────────────────────────────────────────────

describe('findNodeById()', () => {
  it('returns null for empty scene', () => {
    expect(findNodeById([], 'any')).toBeNull();
  });

  it('finds a top-level node', () => {
    const n = makeNode('target');
    expect(findNodeById([n], 'target')).toBe(n);
  });

  it('finds a deeply nested node', () => {
    const deep = makeNode('deep');
    const mid = makeNode('mid', [deep]);
    const root = makeNode('root', [mid]);
    expect(findNodeById([root], 'deep')).toBe(deep);
  });

  it('returns null for non-existent ID', () => {
    const n = makeNode('existing');
    expect(findNodeById([n], 'nonexistent')).toBeNull();
  });

  it('finds the correct node when siblings have similar IDs', () => {
    const a = makeNode('node-1');
    const b = makeNode('node-2');
    expect(findNodeById([a, b], 'node-2')).toBe(b);
  });
});

// ── estimateSize ──────────────────────────────────────────────────────────────

describe('estimateSize()', () => {
  it('returns a positive integer', () => {
    const p = makeProject();
    expect(estimateSize(p)).toBeGreaterThan(0);
  });

  it('returns more bytes for larger scenes', () => {
    const small = makeProject('Small', []);
    const large = makeProject('Large', [makeNode('n1'), makeNode('n2'), makeNode('n3')]);
    expect(estimateSize(large)).toBeGreaterThan(estimateSize(small));
  });

  it('returns integer byte count', () => {
    const p = makeProject();
    const size = estimateSize(p);
    expect(Number.isInteger(size)).toBe(true);
  });
});
