/**
 * HotReloadBridge Tests
 *
 * Tests the bridge that connects HotReloadManager → ModuleResolver:
 *  - watchModule() registers a watcher and returns an unsubscribe fn
 *  - triggerReload() calls resolver.invalidate() before user callbacks
 *  - unwatchModule() / dispose() clean up correctly
 *  - onInvalidated / onReloaded / onError hooks fire correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotReloadBridge } from '../HotReloadBridge';
import { HotReloadManager } from '../HotReloadManager';
import { ModuleResolver } from '../../compiler/ModuleResolver';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeBridge(opts?: ConstructorParameters<typeof HotReloadBridge>[2]) {
  const hotReload = new HotReloadManager();
  // ModuleResolver with a no-op loader (we only test invalidation)
  const resolver = new ModuleResolver({ loader: () => '' });
  const bridge = new HotReloadBridge(hotReload, resolver, opts);
  return { bridge, hotReload, resolver };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('HotReloadBridge', () => {
  // ── Construction ────────────────────────────────────────────────────────────

  it('starts with 0 watched modules', () => {
    const { bridge } = makeBridge();
    expect(bridge.watchedCount).toBe(0);
  });

  // ── watchModule / isWatchingModule ─────────────────────────────────────────

  it('watchModule registers a watcher', () => {
    const { bridge, hotReload } = makeBridge();
    bridge.watchModule('/scene/main.hs');
    expect(bridge.isWatchingModule('/scene/main.hs')).toBe(true);
    expect(bridge.watchedCount).toBe(1);
    expect(hotReload.isWatched('/scene/main.hs')).toBe(true);
  });

  it('watchModule returns an unsubscribe fn', () => {
    const { bridge } = makeBridge();
    const unsub = bridge.watchModule('/scene/main.hs');
    unsub();
    expect(bridge.isWatchingModule('/scene/main.hs')).toBe(false);
  });

  it('can watch multiple modules independently', () => {
    const { bridge } = makeBridge();
    bridge.watchModule('/a.hs');
    bridge.watchModule('/b.hs');
    expect(bridge.watchedCount).toBe(2);
  });

  // ── triggerReload → invalidate ─────────────────────────────────────────────

  it('triggerReload calls resolver.invalidate()', () => {
    const { bridge, resolver } = makeBridge();
    const invalidateSpy = vi.spyOn(resolver, 'invalidate');

    bridge.watchModule('/main.hs');
    bridge.triggerReload('/main.hs', '@node Box {}');

    expect(invalidateSpy).toHaveBeenCalledWith('/main.hs');
  });

  it('triggerReload calls per-module onReloaded callback', () => {
    const { bridge } = makeBridge();
    const cb = vi.fn();
    bridge.watchModule('/main.hs', cb);
    bridge.triggerReload('/main.hs', 'new source');
    expect(cb).toHaveBeenCalledWith('/main.hs', 1);
  });

  it('triggerReload increments version on each call', () => {
    const { bridge, hotReload } = makeBridge();
    bridge.watchModule('/main.hs');
    bridge.triggerReload('/main.hs', 'v1');
    bridge.triggerReload('/main.hs', 'v2');
    expect(hotReload.version('/main.hs')).toBe(2);
  });

  // ── Global hooks ───────────────────────────────────────────────────────────

  it('fires onInvalidated hook after invalidate()', () => {
    const onInvalidated = vi.fn();
    const { bridge } = makeBridge({ onInvalidated });
    bridge.watchModule('/app.hs');
    bridge.triggerReload('/app.hs', 'new source');
    expect(onInvalidated).toHaveBeenCalledWith('/app.hs', 1);
  });

  it('fires onReloaded hook after the full sequence', () => {
    const onReloaded = vi.fn();
    const { bridge } = makeBridge({ onReloaded });
    bridge.watchModule('/app.hs');
    bridge.triggerReload('/app.hs', 'new source');
    expect(onReloaded).toHaveBeenCalledWith('/app.hs', 1);
  });

  it('routes errors to onError instead of throwing', () => {
    const onError = vi.fn();
    const { bridge, resolver } = makeBridge({ onError });

    // Make invalidate throw
    vi.spyOn(resolver, 'invalidate').mockImplementationOnce(() => {
      throw new Error('resolver exploded');
    });

    bridge.watchModule('/bad.hs');
    expect(() => bridge.triggerReload('/bad.hs', 'src')).not.toThrow();
    expect(onError).toHaveBeenCalledWith('/bad.hs', expect.any(Error));
  });

  it('errors are silently swallowed when no onError handler is set', () => {
    // HotReloadManager wraps each watcher in try/catch internally, so errors
    // from the bridge's watcher (including resolver.invalidate() failures) are
    // silently swallowed when no onError handler is configured.
    const { bridge, resolver } = makeBridge(); // no onError
    vi.spyOn(resolver, 'invalidate').mockImplementationOnce(() => {
      throw new Error('resolver exploded');
    });
    bridge.watchModule('/bad.hs');
    // Should NOT throw — HotReloadManager catches all watcher errors internally
    expect(() => bridge.triggerReload('/bad.hs', 'src')).not.toThrow();
  });

  // ── unwatchModule ─────────────────────────────────────────────────────────

  it('unwatchModule removes only the targeted module', () => {
    const { bridge } = makeBridge();
    bridge.watchModule('/a.hs');
    bridge.watchModule('/b.hs');
    bridge.unwatchModule('/a.hs');
    expect(bridge.isWatchingModule('/a.hs')).toBe(false);
    expect(bridge.isWatchingModule('/b.hs')).toBe(true);
    expect(bridge.watchedCount).toBe(1);
  });

  it('unwatchModule is a no-op for unknown path', () => {
    const { bridge } = makeBridge();
    expect(() => bridge.unwatchModule('/ghost.hs')).not.toThrow();
  });

  // ── dispose ────────────────────────────────────────────────────────────────

  it('dispose() clears all watched modules', () => {
    const { bridge } = makeBridge();
    bridge.watchModule('/a.hs');
    bridge.watchModule('/b.hs');
    bridge.dispose();
    expect(bridge.watchedCount).toBe(0);
  });

  it('after dispose(), triggerReload no longer calls invalidate', () => {
    const { bridge, resolver } = makeBridge();
    const invalidateSpy = vi.spyOn(resolver, 'invalidate');

    bridge.watchModule('/app.hs');
    bridge.dispose();
    bridge.triggerReload('/app.hs', 'new src');

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
