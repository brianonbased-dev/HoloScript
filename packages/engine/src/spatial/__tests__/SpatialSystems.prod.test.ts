/**
 * SpatialSystems.prod.test.ts
 *
 * Production tests for the spatial subsystem.
 * Covers: TransformGraph, SpatialQueryExecutor.
 * Pure in-memory, deterministic, no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransformGraph } from '../TransformGraph';
import { SpatialQueryExecutor } from '../SpatialQuery';
import type { SpatialEntity, Region } from '../SpatialTypes';

// =============================================================================
// Helpers
// =============================================================================

function makeEntity(id: string, x: number, y: number, z: number, type = 'unit'): SpatialEntity {
  return {
    id,
    type,
    position: { x, y, z },
    boundingBox: {
      min: { x: x - 0.5, y: y - 0.5, z: z - 0.5 },
      max: { x: x + 0.5, y: y + 0.5, z: z + 0.5 },
    },
  };
}

// =============================================================================
// TransformGraph
// =============================================================================

describe('TransformGraph', () => {
  let g: TransformGraph;
  beforeEach(() => {
    g = new TransformGraph();
  });

  it('starts empty', () => {
    expect(g.getNodeCount()).toBe(0);
    expect(g.getRoots()).toHaveLength(0);
  });

  it('addNode creates node at origin by default', () => {
    g.addNode('A');
    expect(g.getNodeCount()).toBe(1);
    const t = g.getLocalTransform('A');
    expect(t).not.toBeNull();
    expect(t!.x).toBe(0);
    expect(t!.y).toBe(0);
    expect(t!.z).toBe(0);
    expect(t!.sx).toBe(1);
    expect(t!.sy).toBe(1);
    expect(t!.sz).toBe(1);
  });

  it('addNode with initial transform overrides defaults', () => {
    g.addNode('B', { x: 5, y: 10, z: 0, sx: 2, sy: 2, sz: 1 });
    const t = g.getLocalTransform('B');
    expect(t!.x).toBe(5);
    expect(t!.sx).toBe(2);
  });

  it('removeNode deletes node', () => {
    g.addNode('A');
    g.removeNode('A');
    expect(g.getNodeCount()).toBe(0);
    expect(g.getLocalTransform('A')).toBeNull();
  });

  it('removeNode unparents children', () => {
    g.addNode('parent');
    g.addNode('child');
    g.setParent('child', 'parent');
    g.removeNode('parent');
    expect(g.getParent('child')).toBeNull();
  });

  it('setParent establishes hierarchy', () => {
    g.addNode('parent');
    g.addNode('child');
    g.setParent('child', 'parent');
    expect(g.getParent('child')).toBe('parent');
    expect(g.getChildren('parent')).toContain('child');
  });

  it('setParent to null detaches from parent', () => {
    g.addNode('parent');
    g.addNode('child');
    g.setParent('child', 'parent');
    g.setParent('child', null);
    expect(g.getParent('child')).toBeNull();
    expect(g.getChildren('parent')).not.toContain('child');
  });

  it('setParent re-parents correctly', () => {
    g.addNode('p1');
    g.addNode('p2');
    g.addNode('child');
    g.setParent('child', 'p1');
    g.setParent('child', 'p2');
    expect(g.getChildren('p1')).not.toContain('child');
    expect(g.getChildren('p2')).toContain('child');
  });

  it('getWorldPosition returns local coords for root node', () => {
    g.addNode('A', { x: 3, y: 4, z: 5 });
    const wp = g.getWorldPosition('A');
    expect(wp).toEqual({ x: 3, y: 4, z: 5 });
  });

  it('world position accumulates through hierarchy', () => {
    g.addNode('parent', { x: 10, y: 0, z: 0 });
    g.addNode('child', { x: 5, y: 0, z: 0 });
    g.setParent('child', 'parent');
    const wp = g.getWorldPosition('child');
    // child world = parent.world + child.local * parent.scale
    // = 10 + 5*1 = 15
    expect(wp!.x).toBe(15);
  });

  it('world position respects parent scale', () => {
    g.addNode('parent', { x: 0, y: 0, z: 0, sx: 2, sy: 2, sz: 1 });
    g.addNode('child', { x: 3, y: 3, z: 0 });
    g.setParent('child', 'parent');
    const wp = g.getWorldPosition('child');
    // child world = (0 + 3*2, 0 + 3*2, 0 + 0*1) = (6, 6, 0)
    expect(wp!.x).toBe(6);
    expect(wp!.y).toBe(6);
    expect(wp!.z).toBe(0);
  });

  it('setPosition marks dirty and updates world position', () => {
    g.addNode('A', { x: 0, y: 0, z: 0 });
    g.setPosition('A', 7, 8, 9);
    const wp = g.getWorldPosition('A');
    expect(wp!.x).toBe(7);
    expect(wp!.y).toBe(8);
    expect(wp!.z).toBe(9);
  });

  it('setScale marks dirty and affects children', () => {
    g.addNode('parent', { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 });
    g.addNode('child', { x: 2, y: 0, z: 0 });
    g.setParent('child', 'parent');
    g.setScale('parent', 3, 1, 1);
    const wp = g.getWorldPosition('child');
    expect(wp!.x).toBe(6); // 0 + 2*3
  });

  it('getRoots returns only nodes with no parents', () => {
    g.addNode('A');
    g.addNode('B');
    g.addNode('C');
    g.setParent('C', 'A');
    const roots = g.getRoots();
    expect(roots).toContain('A');
    expect(roots).toContain('B');
    expect(roots).not.toContain('C');
  });

  it('updateAll resolves all dirty nodes', () => {
    g.addNode('root', { x: 1, y: 0, z: 0 });
    g.addNode('mid', { x: 2, y: 0, z: 0 });
    g.addNode('leaf', { x: 3, y: 0, z: 0 });
    g.setParent('mid', 'root');
    g.setParent('leaf', 'mid');
    g.updateAll();
    const wp = g.getWorldPosition('leaf');
    expect(wp!.x).toBe(6); // 1 + 2 + 3
  });

  it('deep hierarchy computes correctly', () => {
    // root(1) → a(1) → b(1) → c(1) → world = 4
    g.addNode('root', { x: 1, y: 0, z: 0 });
    g.addNode('a', { x: 1, y: 0, z: 0 });
    g.addNode('b', { x: 1, y: 0, z: 0 });
    g.addNode('c', { x: 1, y: 0, z: 0 });
    g.setParent('a', 'root');
    g.setParent('b', 'a');
    g.setParent('c', 'b');
    const wp = g.getWorldPosition('c');
    expect(wp!.x).toBe(4);
  });

  it('getWorldPosition returns null for missing node', () => {
    expect(g.getWorldPosition('nonexistent')).toBeNull();
  });

  it('getLocalTransform returns null for missing node', () => {
    expect(g.getLocalTransform('nonexistent')).toBeNull();
  });

  it('getChildren returns empty for leaf node', () => {
    g.addNode('leaf');
    expect(g.getChildren('leaf')).toHaveLength(0);
  });

  it('multiple children all tracked', () => {
    g.addNode('parent');
    for (let i = 0; i < 5; i++) {
      g.addNode(`child${i}`);
      g.setParent(`child${i}`, 'parent');
    }
    expect(g.getChildren('parent')).toHaveLength(5);
  });
});

// =============================================================================
// SpatialQueryExecutor
// =============================================================================

describe('SpatialQueryExecutor — nearest', () => {
  let exec: SpatialQueryExecutor;

  beforeEach(() => {
    exec = new SpatialQueryExecutor();
    exec.updateEntities([
      makeEntity('a', 0, 0, 0),
      makeEntity('b', 3, 0, 0),
      makeEntity('c', 10, 0, 0),
    ]);
  });

  it('returns nearest entity from origin', () => {
    const results = exec.execute({
      type: 'nearest',
      from: { x: 0, y: 0, z: 0 },
      count: 1,
    });
    expect(results).toHaveLength(1);
    expect(results[0].entity.id).toBe('a'); // distance 0
  });

  it('returns N nearest entities sorted by distance', () => {
    const results = exec.execute({
      type: 'nearest',
      from: { x: 0, y: 0, z: 0 },
      count: 2,
    });
    expect(results).toHaveLength(2);
    expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
  });

  it('includes the querying origin entity in results', () => {
    const results = exec.execute({
      type: 'nearest',
      from: { x: 0, y: 0, z: 0 },
      count: 3,
    });
    expect(results.some((r) => r.entity.id === 'a')).toBe(true);
    expect(results.some((r) => r.entity.id === 'c')).toBe(true);
  });

  it('distances are non-negative', () => {
    const results = exec.execute({ type: 'nearest', from: { x: 0, y: 0, z: 0 } });
    results.forEach((r) => expect(r.distance).toBeGreaterThanOrEqual(0));
  });
});

describe('SpatialQueryExecutor — within radius', () => {
  let exec: SpatialQueryExecutor;

  beforeEach(() => {
    exec = new SpatialQueryExecutor();
    exec.updateEntities([
      makeEntity('near', 1, 0, 0),
      makeEntity('edge', 5, 0, 0),
      makeEntity('far', 20, 0, 0),
    ]);
  });

  it('returns entities within radius', () => {
    const results = exec.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 6,
    });
    expect(results.some((r) => r.entity.id === 'near')).toBe(true);
    expect(results.some((r) => r.entity.id === 'edge')).toBe(true);
    expect(results.some((r) => r.entity.id === 'far')).toBe(false);
  });

  it('returns empty when no entity within radius', () => {
    const results = exec.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 0.5,
    });
    expect(results).toHaveLength(0);
  });

  it('maxResults limits returned items', () => {
    const results = exec.execute({
      type: 'within',
      from: { x: 0, y: 0, z: 0 },
      radius: 100,
      maxResults: 2,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe('SpatialQueryExecutor — by_type', () => {
  let exec: SpatialQueryExecutor;

  beforeEach(() => {
    exec = new SpatialQueryExecutor();
    exec.updateEntities([
      makeEntity('e1', 0, 0, 0, 'enemy'),
      makeEntity('e2', 1, 0, 0, 'enemy'),
      makeEntity('a1', 2, 0, 0, 'ally'),
      makeEntity('n1', 3, 0, 0, 'neutral'),
    ]);
  });

  it('filters by entity type correctly', () => {
    const results = exec.execute({
      type: 'by_type',
      from: { x: 0, y: 0, z: 0 },
      entityTypes: ['enemy'],
    });
    expect(results.every((r) => r.entity.type === 'enemy')).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('multiple types can be filtered', () => {
    const results = exec.execute({
      type: 'by_type',
      from: { x: 0, y: 0, z: 0 },
      entityTypes: ['enemy', 'ally'],
    });
    expect(results.some((r) => r.entity.type === 'enemy')).toBe(true);
    expect(results.some((r) => r.entity.type === 'ally')).toBe(true);
    expect(results.every((r) => r.entity.type !== 'neutral')).toBe(true);
  });

  it('radius constraint on by_type query', () => {
    const results = exec.execute({
      type: 'by_type',
      from: { x: 0, y: 0, z: 0 },
      entityTypes: ['enemy'],
      radius: 0.9, // only e1 at dist=0 is within 0.9
    });
    expect(results.some((r) => r.entity.id === 'e1')).toBe(true);
    expect(results.every((r) => r.entity.id !== 'e2')).toBe(true);
  });
});

describe('SpatialQueryExecutor — in_region', () => {
  let exec: SpatialQueryExecutor;

  beforeEach(() => {
    exec = new SpatialQueryExecutor();
    exec.updateEntities([
      makeEntity('inside', 2, 2, 2),
      makeEntity('outside', 10, 10, 10),
      makeEntity('edge', 5, 5, 5),
    ]);
    exec.updateRegions([
      {
        id: 'box',
        type: 'box',
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 5 } },
      },
    ]);
  });

  it('returns entities inside the region', () => {
    const results = exec.execute({
      type: 'in_region',
      from: { x: 0, y: 0, z: 0 },
      region: {
        id: 'box',
        type: 'box',
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 5, z: 5 } },
      } as Region,
    });
    expect(results.some((r) => r.entity.id === 'inside')).toBe(true);
    expect(results.every((r) => r.entity.id !== 'outside')).toBe(true);
  });
});

describe('SpatialQueryExecutor — raycast', () => {
  let exec: SpatialQueryExecutor;

  beforeEach(() => {
    exec = new SpatialQueryExecutor();
    exec.updateEntities([makeEntity('target', 5, 0, 0), makeEntity('side', 0, 5, 0)]);
  });

  it('raycast along +X hits the entity in that direction', () => {
    const hits = exec.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
    });
    expect(hits.some((r) => r.entity.id === 'target')).toBe(true);
  });

  it('raycast along +Y does not hit target along +X', () => {
    const hits = exec.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
      maxDistance: 3, // won't reach 'side' at y=5
    });
    expect(hits.some((r) => r.entity.id === 'target')).toBe(false);
  });

  it('raycast maxDistance limits hits', () => {
    const hits = exec.execute({
      type: 'raycast',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 2, // target is at x=5, so outside range
    });
    expect(hits.some((r) => r.entity.id === 'target')).toBe(false);
  });
});

describe('SpatialQueryExecutor — visible', () => {
  let exec: SpatialQueryExecutor;

  beforeEach(() => {
    exec = new SpatialQueryExecutor();
    exec.updateEntities([
      makeEntity('ahead', 5, 0, 0),
      makeEntity('behind', -5, 0, 0),
      makeEntity('far', 100, 0, 0),
    ]);
  });

  it('visible query returns entities in fov cone', () => {
    const results = exec.execute({
      type: 'visible',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      fov: 90, // 90° fov
      maxDistance: 10,
    });
    expect(results.some((r) => r.entity.id === 'ahead')).toBe(true);
    expect(results.every((r) => r.entity.id !== 'behind')).toBe(true);
    expect(results.every((r) => r.entity.id !== 'far')).toBe(true);
  });

  it('wide fov captures off-axis entities', () => {
    exec.updateEntities([makeEntity('offaxis', 3, 3, 0)]);
    const results = exec.execute({
      type: 'visible',
      from: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      fov: 180,
      maxDistance: 10,
    });
    expect(results.some((r) => r.entity.id === 'offaxis')).toBe(true);
  });
});

describe('SpatialQueryExecutor — entity type filter', () => {
  let exec: SpatialQueryExecutor;

  beforeEach(() => {
    exec = new SpatialQueryExecutor();
    exec.updateEntities([makeEntity('e', 1, 0, 0, 'enemy'), makeEntity('a', 2, 0, 0, 'ally')]);
  });

  it('entityTypeFilter on nearest restricts results', () => {
    const results = exec.execute({
      type: 'nearest',
      from: { x: 0, y: 0, z: 0 },
      entityTypeFilter: ['ally'],
    });
    expect(results.every((r) => r.entity.type === 'ally')).toBe(true);
  });
});

describe('SpatialQueryExecutor — updateEntities', () => {
  it('updateEntities replaces entity set', () => {
    const exec = new SpatialQueryExecutor();
    exec.updateEntities([makeEntity('old', 0, 0, 0)]);
    exec.updateEntities([makeEntity('new1', 1, 0, 0), makeEntity('new2', 2, 0, 0)]);
    const results = exec.execute({ type: 'nearest', from: { x: 0, y: 0, z: 0 } });
    expect(results.every((r) => r.entity.id !== 'old')).toBe(true);
    expect(results.some((r) => r.entity.id === 'new1')).toBe(true);
  });

  it('empty entity set returns empty results', () => {
    const exec = new SpatialQueryExecutor();
    const results = exec.execute({ type: 'nearest', from: { x: 0, y: 0, z: 0 } });
    expect(results).toHaveLength(0);
  });
});
