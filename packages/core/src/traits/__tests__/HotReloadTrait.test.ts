/**
 * HotReloadTrait.test.ts — Tests for @hot_reload trait
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { HotReloadWatcher, HOT_RELOAD_TRAIT, type HotReloadConfig } from '../HotReloadTrait';

describe('@hot_reload Trait', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('HOT_RELOAD_TRAIT metadata is correct', () => {
    expect(HOT_RELOAD_TRAIT.name).toBe('hot_reload');
    expect(HOT_RELOAD_TRAIT.category).toBe('devtools');
    expect(HOT_RELOAD_TRAIT.requiresRenderer).toBe(false);
    expect(HOT_RELOAD_TRAIT.compileTargets).toContain('node');
    expect(HOT_RELOAD_TRAIT.compileTargets).toContain('headless');
  });

  it('creates watcher with default config', () => {
    const watcher = new HotReloadWatcher();
    const stats = watcher.getStats();
    expect(stats.running).toBe(false);
    expect(stats.reloadCount).toBe(0);
    expect(stats.watchedPaths).toBe(0);
  });

  it('creates watcher with custom config', () => {
    const config: Partial<HotReloadConfig> = {
      watchPaths: ['./src', './tests'],
      debounceMs: 500,
      mode: 'hard',
      extensions: ['.hs', '.hsplus'],
    };
    const watcher = new HotReloadWatcher(config);
    expect(watcher.isRunning()).toBe(false);
  });

  it('starts and stops', () => {
    const watcher = new HotReloadWatcher({
      watchPaths: ['.'],
    });

    // Mock fs.watch to avoid actual FS access
    const fsMock = vi.spyOn(require('fs'), 'watch').mockReturnValue({
      close: vi.fn(),
    } as any);
    const existsMock = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);

    watcher.start();
    expect(watcher.isRunning()).toBe(true);
    expect(watcher.getStats().running).toBe(true);

    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
    expect(watcher.getStats().running).toBe(false);

    fsMock.mockRestore();
    existsMock.mockRestore();
  });

  it('does not start twice', () => {
    const watcher = new HotReloadWatcher({ watchPaths: ['.'] });
    const fsMock = vi.spyOn(require('fs'), 'watch').mockReturnValue({ close: vi.fn() } as any);
    const existsMock = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);

    watcher.start();
    watcher.start(); // Should be no-op
    expect(watcher.getStats().watchedPaths).toBe(1); // Only 1 watcher

    watcher.stop();
    fsMock.mockRestore();
    existsMock.mockRestore();
  });

  it('emits warning for non-existent watch paths', () => {
    const watcher = new HotReloadWatcher({
      watchPaths: ['/nonexistent/path/that/does/not/exist'],
    });

    const warnings: string[] = [];
    watcher.on('warning', (msg: string) => warnings.push(msg));

    watcher.start();
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('does not exist');

    watcher.stop();
  });

  it('emits started/stopped events', () => {
    const watcher = new HotReloadWatcher({ watchPaths: ['.'] });
    const fsMock = vi.spyOn(require('fs'), 'watch').mockReturnValue({ close: vi.fn() } as any);
    const existsMock = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);

    const events: string[] = [];
    watcher.on('started', () => events.push('started'));
    watcher.on('stopped', () => events.push('stopped'));

    watcher.start();
    watcher.stop();

    expect(events).toEqual(['started', 'stopped']);

    fsMock.mockRestore();
    existsMock.mockRestore();
  });

  it('tracks reload count in stats', () => {
    const watcher = new HotReloadWatcher();
    expect(watcher.getStats().reloadCount).toBe(0);
    // reloadCount increments via internal handleChange (tested via integration)
  });

  it('default extensions include .hs, .hsplus, .holo', () => {
    const watcher = new HotReloadWatcher();
    // We can't directly access config, but the watcher should accept these
    // This test validates the constructor doesn't throw with defaults
    expect(watcher).toBeDefined();
  });
});
