/**
 * GameEngine Tests
 *
 * Tests the top-level GameEngine facade that composes:
 *   - GameLoop (tick scheduling)
 *   - AssetPipeline (type-keyed asset loading)
 *   - HotReloadManager (live module reload)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../GameEngine';

// Advance timers manually so tests don't depend on real time
vi.useFakeTimers();

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine({ fps: 60 });
  });

  afterEach(() => {
    try { engine.stop(); } catch { /* already stopped */ }
    vi.clearAllTimers();
  });

  // ── Construction ─────────────────────────────────────────────────────────

  it('starts in idle phase', () => {
    expect(engine.phase).toBe('idle');
  });

  it('exposes loop, assets, hotReload sub-systems', () => {
    expect(engine.loop).toBeDefined();
    expect(engine.assets).toBeDefined();
    expect(engine.hotReload).toBeDefined();
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  it('start() transitions to running', () => {
    engine.start();
    expect(engine.phase).toBe('running');
    engine.stop();
  });

  it('stop() transitions to stopped', () => {
    engine.start();
    engine.stop();
    expect(engine.phase).toBe('stopped');
  });

  it('pause() transitions to paused', () => {
    engine.start();
    engine.pause();
    expect(engine.phase).toBe('paused');
    engine.stop();
  });

  it('resume() transitions back to running', () => {
    engine.start();
    engine.pause();
    engine.resume();
    expect(engine.phase).toBe('running');
    engine.stop();
  });

  it('calling start() twice is a no-op (stays running)', () => {
    engine.start();
    engine.start(); // second call — should not throw
    expect(engine.phase).toBe('running');
    engine.stop();
  });

  // ── Update Handlers ───────────────────────────────────────────────────────

  it('addUpdateHandler registers handlers', () => {
    engine.addUpdateHandler('physics', () => {});
    expect(engine.getHandlerNames()).toContain('physics');
  });

  it('removeUpdateHandler removes handlers', () => {
    engine.addUpdateHandler('ai', () => {});
    expect(engine.removeUpdateHandler('ai')).toBe(true);
    expect(engine.getHandlerNames()).not.toContain('ai');
  });

  it('removeUpdateHandler returns false for unknown name', () => {
    expect(engine.removeUpdateHandler('ghost')).toBe(false);
  });

  it('update handler is called on tick', () => {
    const spy = vi.fn();
    engine.addUpdateHandler('spy', spy);
    engine.start();
    vi.advanceTimersByTime(100); // triggers several ticks at 60fps
    engine.stop();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBeGreaterThan(0); // delta > 0
  });

  it('frame counter increments each tick', () => {
    engine.start();
    vi.advanceTimersByTime(100); // ~6 ticks @ 60fps
    engine.stop();
    expect(engine.frame).toBeGreaterThan(0);
  });

  // ── Assets ────────────────────────────────────────────────────────────────

  it('registerLoader registers a loader (fluent)', () => {
    const result = engine.registerLoader('json', async (path) => ({ path }));
    expect(result).toBe(engine); // fluent return
    expect(engine.assets.hasLoader('json')).toBe(true);
  });

  it('preload loads and caches an asset', async () => {
    engine.registerLoader('text', async (path: string) => `content of ${path}`);
    const asset = await engine.preload<string>('text', 'hello.txt');
    expect(asset).toBe('content of hello.txt');
  });

  it('preload returns cached asset on second call', async () => {
    let callCount = 0;
    engine.registerLoader('counted', async () => { callCount++; return 'data'; });
    await engine.preload('counted', 'x');
    await engine.preload('counted', 'x');
    expect(callCount).toBe(1); // loader only called once
  });

  // ── Hot Reload ────────────────────────────────────────────────────────────

  it('watch() registers a watcher on hotReload', () => {
    engine.watch('scene.hs', () => {});
    expect(engine.hotReload.isWatched('scene.hs')).toBe(true);
  });

  it('watch() returns an unsubscribe fn', () => {
    const unsub = engine.watch('module.hs', () => {});
    unsub();
    expect(engine.hotReload.isWatched('module.hs')).toBe(false);
  });

  it('reload() triggers the registered watcher', () => {
    const spy = vi.fn();
    engine.watch('level.hs', spy);
    engine.reload('level.hs', 'new content');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toBe('new content');
  });

  it('reload() increments version on hotReload', () => {
    expect(engine.hotReload.version('app.hs')).toBe(0);
    engine.reload('app.hs', {});
    expect(engine.hotReload.version('app.hs')).toBe(1);
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  it('getStats() returns correct snapshot', () => {
    const stats = engine.getStats();
    expect(stats.phase).toBe('idle');
    expect(stats.frame).toBe(0);
    expect(stats.assetCount).toBe(0);
  });

  it('getStats() reflects loaded asset count', async () => {
    engine.registerLoader('raw', async () => 'data');
    await engine.preload('raw', 'a.bin');
    await engine.preload('raw', 'b.bin');
    const stats = engine.getStats();
    expect(stats.assetCount).toBe(2);
  });
});
