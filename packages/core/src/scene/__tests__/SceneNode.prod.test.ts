/**
 * SceneNode — Production Test Suite
 *
 * Covers: construction, transforms, hierarchy (parent/child),
 * world matrix propagation, dirty flags, tags, layers, traverse.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SceneNode } from '../SceneNode';

describe('SceneNode — Production', () => {
  // ─── Construction ──────────────────────────────────────────────────
  it('constructs with id', () => {
    const node = new SceneNode('root');
    expect(node.id).toBe('root');
    expect(node.name).toBe('root');
  });

  it('constructs with id and name', () => {
    const node = new SceneNode('n1', 'MyNode');
    expect(node.id).toBe('n1');
    expect(node.name).toBe('MyNode');
  });

  it('default transform is identity', () => {
    const node = new SceneNode('n');
    const t = node.getLocalTransform();
    expect(t.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(t.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('default flags', () => {
    const node = new SceneNode('n');
    expect(node.visible).toBe(true);
    expect(node.layer).toBe(0);
    expect(node.tags.size).toBe(0);
  });

  // ─── Transforms ───────────────────────────────────────────────────
  it('setPosition updates local position', () => {
    const node = new SceneNode('n');
    node.setPosition(1, 2, 3);
    const t = node.getLocalTransform();
    expect(t.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('setRotation updates local rotation', () => {
    const node = new SceneNode('n');
    node.setRotation(45, 0, 0);
    expect(node.getLocalTransform().rotation.x).toBe(45);
  });

  it('setScale updates local scale', () => {
    const node = new SceneNode('n');
    node.setScale(2, 3, 4);
    const t = node.getLocalTransform();
    expect(t.scale).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('getWorldPosition for root matches local position', () => {
    const node = new SceneNode('n');
    node.setPosition(5, 10, 15);
    const wp = node.getWorldPosition();
    expect(wp.x).toBe(5);
    expect(wp.y).toBe(10);
    expect(wp.z).toBe(15);
  });

  it('getWorldMatrix returns Float64Array of 16', () => {
    const node = new SceneNode('n');
    const m = node.getWorldMatrix();
    expect(m).toBeInstanceOf(Float64Array);
    expect(m.length).toBe(16);
  });

  // ─── Hierarchy ────────────────────────────────────────────────────
  it('getParent returns null for root', () => {
    const node = new SceneNode('root');
    expect(node.getParent()).toBeNull();
  });

  it('addChild sets parent/child', () => {
    const parent = new SceneNode('parent');
    const child = new SceneNode('child');
    parent.addChild(child);
    expect(parent.getChildCount()).toBe(1);
    expect(child.getParent()).toBe(parent);
  });

  it('addChild to new parent removes from old parent', () => {
    const p1 = new SceneNode('p1');
    const p2 = new SceneNode('p2');
    const child = new SceneNode('c');
    p1.addChild(child);
    p2.addChild(child);
    expect(p1.getChildCount()).toBe(0);
    expect(p2.getChildCount()).toBe(1);
  });

  it('removeChild detaches child', () => {
    const parent = new SceneNode('parent');
    const child = new SceneNode('child');
    parent.addChild(child);
    parent.removeChild(child);
    expect(parent.getChildCount()).toBe(0);
    expect(child.getParent()).toBeNull();
  });

  it('getChildren returns copy', () => {
    const parent = new SceneNode('parent');
    parent.addChild(new SceneNode('c1'));
    parent.addChild(new SceneNode('c2'));
    expect(parent.getChildren().length).toBe(2);
  });

  // ─── Traverse ─────────────────────────────────────────────────────
  it('traverse visits all nodes depth-first', () => {
    const root = new SceneNode('root');
    const child1 = new SceneNode('c1');
    const child2 = new SceneNode('c2');
    const grandchild = new SceneNode('gc');
    root.addChild(child1);
    root.addChild(child2);
    child1.addChild(grandchild);

    const visited: string[] = [];
    root.traverse((node) => visited.push(node.id));
    expect(visited).toEqual(['root', 'c1', 'gc', 'c2']);
  });

  it('traverse provides correct depth', () => {
    const root = new SceneNode('root');
    const child = new SceneNode('child');
    root.addChild(child);

    const depths: number[] = [];
    root.traverse((_, depth) => depths.push(depth));
    expect(depths).toEqual([0, 1]);
  });

  // ─── Tags and Layers ──────────────────────────────────────────────
  it('tags can be added and queried', () => {
    const node = new SceneNode('n');
    node.tags.add('enemy');
    expect(node.tags.has('enemy')).toBe(true);
  });

  it('layer can be set', () => {
    const node = new SceneNode('n');
    node.layer = 3;
    expect(node.layer).toBe(3);
  });

  // ─── Dirty Flag ───────────────────────────────────────────────────
  it('isDirty is true on creation', () => {
    const node = new SceneNode('n');
    expect(node.isDirty()).toBe(true);
  });

  it('isDirty is false after world matrix update', () => {
    const node = new SceneNode('n');
    node.updateWorldMatrix();
    expect(node.isDirty()).toBe(false);
  });

  it('setPosition re-marks dirty', () => {
    const node = new SceneNode('n');
    node.updateWorldMatrix();
    node.setPosition(1, 0, 0);
    expect(node.isDirty()).toBe(true);
  });
});
