/**
 * SceneQuery — Production Test Suite
 *
 * Covers: findByTag, findByLayer, findByName, findInRadius,
 * frustumCull, visit (visitor pattern), edge cases.
 */
import { describe, it, expect } from 'vitest';
import { SceneNode } from '../SceneNode';
import { SceneQuery } from '../SceneQuery';

function makeTree() {
  const root = new SceneNode('root', 'Root');
  root.tags.add('world');

  const child1 = new SceneNode('c1', 'Player');
  child1.tags.add('player');
  child1.layer = 1;
  child1.setPosition(0, 0, 0);

  const child2 = new SceneNode('c2', 'Enemy');
  child2.tags.add('enemy');
  child2.layer = 2;
  child2.setPosition(5, 0, 0);

  const grandchild = new SceneNode('gc', 'Bullet');
  grandchild.tags.add('projectile');
  grandchild.layer = 3;
  grandchild.setPosition(2, 0, 0);

  root.addChild(child1);
  root.addChild(child2);
  child1.addChild(grandchild);

  return { root, child1, child2, grandchild };
}

describe('SceneQuery — Production', () => {
  // ─── findByTag ────────────────────────────────────────────────────
  it('findByTag returns matching nodes', () => {
    const { root } = makeTree();
    const players = SceneQuery.findByTag(root, 'player');
    expect(players.length).toBe(1);
    expect(players[0].name).toBe('Player');
  });

  it('findByTag returns multiple matches', () => {
    const root = new SceneNode('root');
    const a = new SceneNode('a');
    a.tags.add('x');
    const b = new SceneNode('b');
    b.tags.add('x');
    root.addChild(a);
    root.addChild(b);
    expect(SceneQuery.findByTag(root, 'x').length).toBe(2);
  });

  it('findByTag returns empty for no match', () => {
    const { root } = makeTree();
    expect(SceneQuery.findByTag(root, 'nonexistent').length).toBe(0);
  });

  // ─── findByLayer ──────────────────────────────────────────────────
  it('findByLayer returns nodes on layer', () => {
    const { root } = makeTree();
    const results = SceneQuery.findByLayer(root, 2);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Enemy');
  });

  it('findByLayer includes root (layer 0)', () => {
    const { root } = makeTree();
    const results = SceneQuery.findByLayer(root, 0);
    expect(results.some((n) => n.id === 'root')).toBe(true);
  });

  // ─── findByName ───────────────────────────────────────────────────
  it('findByName returns named node', () => {
    const { root } = makeTree();
    const node = SceneQuery.findByName(root, 'Enemy');
    expect(node).not.toBeNull();
    expect(node!.id).toBe('c2');
  });

  it('findByName returns null for missing name', () => {
    const { root } = makeTree();
    expect(SceneQuery.findByName(root, 'Ghost')).toBeNull();
  });

  // ─── findInRadius ─────────────────────────────────────────────────
  it('findInRadius finds nodes within range', () => {
    const { root } = makeTree();
    // Player is at (0,0,0), radius 1 should include it
    const results = SceneQuery.findInRadius(root, { x: 0, y: 0, z: 0 }, 1);
    expect(results.some((n) => n.id === 'c1')).toBe(true);
  });

  it('findInRadius excludes out-of-range nodes', () => {
    const { root } = makeTree();
    // Enemy is at (5,0,0), small radius at origin should not include it
    const results = SceneQuery.findInRadius(root, { x: 0, y: 0, z: 0 }, 0.5);
    expect(results.some((n) => n.id === 'c2')).toBe(false);
  });

  it('findInRadius large radius finds all visible nodes', () => {
    const { root } = makeTree();
    const results = SceneQuery.findInRadius(root, { x: 0, y: 0, z: 0 }, 1000);
    expect(results.length).toBeGreaterThanOrEqual(4); // root + 3 children
  });

  // ─── frustumCull ──────────────────────────────────────────────────
  it('frustumCull returns visible nodes in frustum', () => {
    const { root } = makeTree();
    const results = SceneQuery.frustumCull(root, {
      position: { x: -10, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      fov: 90,
      near: 0.1,
      far: 100,
    });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('frustumCull excludes hidden nodes', () => {
    const root = new SceneNode('root');
    const hidden = new SceneNode('h');
    hidden.visible = false;
    hidden.setPosition(0, 0, 5);
    root.addChild(hidden);

    const results = SceneQuery.frustumCull(root, {
      position: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      fov: 90,
      near: 0.1,
      far: 100,
    });
    expect(results.some((n) => n.id === 'h')).toBe(false);
  });

  // ─── visit ────────────────────────────────────────────────────────
  it('visit traverses breadth-first', () => {
    const { root } = makeTree();
    const visited: string[] = [];
    SceneQuery.visit(root, (node) => {
      visited.push(node.id);
      return true;
    });
    expect(visited[0]).toBe('root');
    expect(visited.length).toBe(4);
  });

  it('visit stops when visitor returns false', () => {
    const { root } = makeTree();
    const visited: string[] = [];
    SceneQuery.visit(root, (node) => {
      visited.push(node.id);
      return visited.length < 2; // stop after 2
    });
    expect(visited.length).toBe(2);
  });
});
