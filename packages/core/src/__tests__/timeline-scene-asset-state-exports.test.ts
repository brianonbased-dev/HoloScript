/**
 * @fileoverview Tests for Timeline, SceneManager, AssetRegistry, ReactiveState barrel exports
 */
import { describe, it, expect } from 'vitest';
import { Timeline, SceneManager, AssetRegistry, ReactiveState, Easing } from '../index';

describe('Timeline exports', () => {
  it('creates sequential timeline', () => {
    const tl = new Timeline({ mode: 'sequential' });
    expect(tl.getDuration()).toBe(0);
    expect(tl.getProgress()).toBe(0);
  });

  it('adds clips and calculates duration', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add({ id: 'a', property: 'x', from: 0, to: 1, duration: 500 }, () => {});
    tl.add({ id: 'b', property: 'y', from: 0, to: 1, duration: 300 }, () => {});
    expect(tl.getDuration()).toBe(800);
  });

  it('plays timeline and tracks elapsed', () => {
    const tl = new Timeline({ mode: 'parallel' });
    tl.add(
      { id: 'a', property: 'x', from: 0, to: 1, duration: 1000, easing: Easing.linear },
      () => {}
    );
    tl.add(
      { id: 'b', property: 'y', from: 0, to: 1, duration: 500, easing: Easing.linear },
      () => {},
      200
    );
    expect(tl.getDuration()).toBe(1000); // parallel: max of (0+1000, 200+500)
    tl.play();
    expect(tl.getProgress()).toBe(0);
  });

  it('pause and resume', () => {
    const tl = new Timeline();
    tl.add({ id: 'a', property: 'x', from: 0, to: 1, duration: 500 }, () => {});
    tl.play();
    tl.pause();
    tl.resume();
    // Just verify no crash and duration is correct
    expect(tl.getDuration()).toBe(500);
  });
});

describe('SceneManager exports', () => {
  it('saves and loads scenes', () => {
    const sm = new SceneManager();
    const node = { type: 'root', name: 'Test', traits: {}, children: [] };
    sm.save('test', node as any);
    expect(sm.has('test')).toBe(true);
    const loaded = sm.load('test');
    expect(loaded).not.toBeNull();
  });

  it('lists saved scenes', () => {
    const sm = new SceneManager();
    sm.save('a', { type: 'root', name: 'A', traits: {}, children: [] } as any);
    sm.save('b', {
      type: 'root',
      name: 'B',
      traits: {},
      children: [{ type: 'entity', name: 'child', traits: {}, children: [] }],
    } as any);
    const list = sm.list();
    expect(list.length).toBe(2);
    expect(list[1].nodeCount).toBe(2); // root + child
  });

  it('deletes scenes', () => {
    const sm = new SceneManager();
    sm.save('del', { type: 'root', name: 'Del', traits: {}, children: [] } as any);
    expect(sm.delete('del')).toBe(true);
    expect(sm.has('del')).toBe(false);
  });

  it('exports and imports JSON round-trip', () => {
    const sm = new SceneManager();
    sm.save('exp', { type: 'root', name: 'exp', traits: {}, children: [] } as any);
    const json = sm.exportJSON('exp');
    expect(json).toBeTruthy();
    const sm2 = new SceneManager();
    const name = sm2.importJSON(json!);
    expect(name).toBe('exp');
    expect(sm2.has('exp')).toBe(true);
  });
});

describe('AssetRegistry exports', () => {
  it('creates registry with config', () => {
    AssetRegistry.resetInstance();
    const reg = AssetRegistry.getInstance({ maxCacheSize: 100 });
    expect(reg.getConfig().maxCacheSize).toBe(100);
    AssetRegistry.resetInstance();
  });

  it('cache set and get', () => {
    AssetRegistry.resetInstance();
    const reg = AssetRegistry.getInstance();
    reg.setCached('test-asset', { data: 'hello' }, 100);
    const cached = reg.getCached('test-asset');
    expect(cached).toEqual({ data: 'hello' });
    AssetRegistry.resetInstance();
  });

  it('updates config', () => {
    AssetRegistry.resetInstance();
    const reg = AssetRegistry.getInstance();
    reg.updateConfig({ autoEvict: false });
    expect(reg.getConfig().autoEvict).toBe(false);
    AssetRegistry.resetInstance();
  });
});

describe('ReactiveState exports', () => {
  it('creates and reads state', () => {
    const rs = new ReactiveState({ count: 0, name: 'test' });
    expect(rs.get('count')).toBe(0);
    expect(rs.get('name')).toBe('test');
  });

  it('set and snapshot', () => {
    const rs = new ReactiveState({ x: 1 });
    rs.set('x', 42);
    expect(rs.getSnapshot().x).toBe(42);
  });

  it('undo/redo', () => {
    const rs = new ReactiveState({ val: 'a' });
    rs.set('val', 'b');
    rs.set('val', 'c');
    rs.undo();
    expect(rs.get('val')).toBe('b');
    rs.redo();
    expect(rs.get('val')).toBe('c');
  });

  it('subscribers receive updates', () => {
    const rs = new ReactiveState({ score: 0 });
    let received = false;
    rs.subscribe(() => {
      received = true;
    });
    rs.set('score', 10);
    expect(received).toBe(true);
  });
});
