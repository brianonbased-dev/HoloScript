import { describe, it, expect, beforeEach } from 'vitest';
import { SceneManager } from '../SceneManager';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

function makeScene(name = 'TestScene'): HSPlusNode {
  return {
    type: 'orb',
    id: name,
    name,
    traits: [],
    children: [
      { type: 'orb', id: 'child1', name: 'Child1', traits: [], children: [] } as HSPlusNode,
    ],
  } as HSPlusNode;
}

describe('SceneManager', () => {
  let mgr: SceneManager;

  beforeEach(() => {
    mgr = new SceneManager();
  });

  it('save and load round-trips scene', () => {
    const root = makeScene();
    mgr.save('s1', root);
    const loaded = mgr.load('s1');
    expect(loaded).not.toBeNull();
    expect(loaded!.node).toBeDefined();
  });

  it('has returns true for saved scene', () => {
    mgr.save('s1', makeScene());
    expect(mgr.has('s1')).toBe(true);
    expect(mgr.has('nope')).toBe(false);
  });

  it('delete removes scene', () => {
    mgr.save('s1', makeScene());
    expect(mgr.delete('s1')).toBe(true);
    expect(mgr.has('s1')).toBe(false);
  });

  it('delete returns false for missing', () => {
    expect(mgr.delete('nope')).toBe(false);
  });

  it('load returns null for missing', () => {
    expect(mgr.load('nope')).toBeNull();
  });

  it('count returns number of scenes', () => {
    expect(mgr.count).toBe(0);
    mgr.save('a', makeScene());
    mgr.save('b', makeScene());
    expect(mgr.count).toBe(2);
  });

  it('list returns scene entries', () => {
    mgr.save('s1', makeScene());
    const list = mgr.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('s1');
    expect(list[0].nodeCount).toBeGreaterThanOrEqual(1);
    expect(list[0].timestamp).toBeDefined();
  });

  it('exportJSON returns JSON string', () => {
    mgr.save('s1', makeScene());
    const json = mgr.exportJSON('s1');
    expect(json).not.toBeNull();
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json!);
    expect(parsed.scene).toBeDefined();
  });

  it('exportJSON returns null for missing', () => {
    expect(mgr.exportJSON('nope')).toBeNull();
  });

  it('importJSON adds scene and returns name', () => {
    mgr.save('s1', makeScene());
    const json = mgr.exportJSON('s1')!;
    mgr.delete('s1');
    const name = mgr.importJSON(json);
    expect(name).toBe('s1');
    expect(mgr.has('s1')).toBe(true);
  });

  it('save with metadata preserves it', () => {
    const saved = mgr.save('s1', makeScene(), undefined, { author: 'test' });
    expect(saved.scene.metadata?.author).toBe('test');
  });
});
