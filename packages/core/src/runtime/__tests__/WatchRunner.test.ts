/**
 * WatchRunner.test.ts — Tests for holoscript run --watch CLI module
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { WatchRunner, type WatchRunnerOptions } from '../WatchRunner';

describe('WatchRunner', () => {
  const defaultOpts: WatchRunnerOptions = {
    watchPaths: ['.'],
    debounceMs: 50,
    debug: false,
    autoTest: true,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates with default options', () => {
    const runner = new WatchRunner(defaultOpts);
    expect(runner.isRunning()).toBe(false);
    expect(runner.getEvents()).toHaveLength(0);
  });

  it('starts and stops', () => {
    const runner = new WatchRunner(defaultOpts);
    // Mock FS for watcher (path doesn't need to exist for this test)
    const fsMock = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    const watchMock = vi.spyOn(require('fs'), 'watch').mockReturnValue({
      close: vi.fn(),
    } as any);

    runner.start();
    expect(runner.isRunning()).toBe(true);
    expect(runner.getEvents()).toHaveLength(1); // 'Watching N path(s)' event
    expect(runner.getEvents()[0].type).toBe('reload');

    runner.stop();
    expect(runner.isRunning()).toBe(false);

    fsMock.mockRestore();
    watchMock.mockRestore();
  });

  it('does not start twice', () => {
    const runner = new WatchRunner(defaultOpts);
    const fsMock = vi.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
    const watchMock = vi.spyOn(require('fs'), 'watch').mockReturnValue({
      close: vi.fn(),
    } as any);

    runner.start();
    runner.start(); // No-op
    expect(runner.getEvents()).toHaveLength(1); // Only one 'started' event

    runner.stop();
    fsMock.mockRestore();
    watchMock.mockRestore();
  });

  it('reports stats', () => {
    const runner = new WatchRunner(defaultOpts);
    const stats = runner.getStats();
    expect(stats.running).toBe(false);
    expect(stats.events).toBe(0);
    expect(stats.reloadCount).toBe(0);
  });

  it('stop is idempotent', () => {
    const runner = new WatchRunner(defaultOpts);
    runner.stop(); // Should not throw
    runner.stop(); // Still shouldn't throw
    expect(runner.isRunning()).toBe(false);
  });

  it('getEvents returns a copy', () => {
    const runner = new WatchRunner(defaultOpts);
    const events = runner.getEvents();
    events.push({ type: 'reload', message: 'mutated', timestamp: 0 });
    expect(runner.getEvents()).toHaveLength(0); // Original not mutated
  });

  it('accepts custom debounce and bail options', () => {
    const runner = new WatchRunner({
      watchPaths: ['/tmp/test'],
      debounceMs: 1000,
      debug: true,
      autoTest: false,
      bail: true,
    });
    expect(runner).toBeDefined();
    expect(runner.isRunning()).toBe(false);
  });
});
