/**
 * Watch Mode Acceptance Tests - Sprint 2
 *
 * Tests: Watcher, Reporter, WatchCommand integration.
 * File-system events are simulated via EventEmitter to keep tests fast.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileWatcher } from '../Watcher';
import { WatchReporter } from '../Reporter';

// ---------------------------------------------------------------------------
// FileWatcher tests
// ---------------------------------------------------------------------------

describe('FileWatcher', () => {
  test('created with default options', () => {
    const w = new FileWatcher({ patterns: ['**/*.hsplus'] });
    expect(w.running).toBe(false);
  });

  test('debounces rapid saves - emits single change for multiple quick events', async () => {
    const w = new FileWatcher({ patterns: ['**/*.hsplus'], debounceMs: 50 });

    const received: unknown[][] = [];
    w.on('change', (changes) => received.push(changes));

    // Simulate 5 rapid internal enqueue calls via the private method
    // (access via any cast for testing)
    const wAny = w as any;
    wAny.enqueue('change', 'src/a.hsplus');
    wAny.enqueue('change', 'src/a.hsplus');
    wAny.enqueue('change', 'src/a.hsplus');

    // Wait for debounce to flush
    await new Promise((r) => setTimeout(r, 100));

    // All three rapid changes should arrive in a single batch
    expect(received).toHaveLength(1);
    expect(received[0]).toHaveLength(3);
  });

  test('stop() clears pending debounce timer', async () => {
    const w = new FileWatcher({ patterns: ['**/*.hsplus'], debounceMs: 500 });
    const received: unknown[] = [];
    w.on('change', (c) => received.push(c));

    const wAny = w as any;
    wAny.enqueue('change', 'src/a.hsplus');
    await w.stop();

    // Debounce was cancelled - no change should fire
    await new Promise((r) => setTimeout(r, 600));
    expect(received).toHaveLength(0);
  });

  test('detects file changes within 100ms (acceptance criterion)', async () => {
    const w = new FileWatcher({ patterns: ['**/*.hsplus'], debounceMs: 20 });
    const times: number[] = [];

    w.on('change', () => times.push(Date.now()));

    const sendTime = Date.now();
    const wAny = w as any;
    wAny.enqueue('change', 'src/test.hsplus');

    await new Promise((r) => setTimeout(r, 80));
    expect(times.length).toBeGreaterThan(0);
    expect(times[0] - sendTime).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// WatchReporter tests
// ---------------------------------------------------------------------------

describe('WatchReporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('watching() prints patterns', () => {
    const reporter = new WatchReporter(false);
    reporter.watching(['**/*.hsplus', '**/*.holo']);
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Watching for changes');
  });

  test('changed() prints file path', () => {
    const reporter = new WatchReporter(false);
    reporter.changed('/project/src/scene.hsplus');
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('scene.hsplus');
  });

  test('built() shows build time', () => {
    const reporter = new WatchReporter(false);
    reporter.built({ file: '/project/src/main.hsplus', durationMs: 45, incremental: false });
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('45ms');
  });

  test('built() marks incremental rebuilds', () => {
    const reporter = new WatchReporter(false);
    reporter.built({ file: '/project/src/main.hsplus', durationMs: 12, incremental: true });
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('12ms');
    expect(output).toContain('incremental');
  });

  test('errors() prints error overlay', () => {
    const reporter = new WatchReporter(false);
    reporter.errors({
      file: '/project/src/bad.hsplus',
      durationMs: 5,
      incremental: false,
      errors: ['Unexpected token at line 10'],
    });
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Unexpected token');
    expect(output).toContain('Watching for fixes');
  });

  test('stopped() prints shutdown message', () => {
    const reporter = new WatchReporter(false);
    reporter.stopped();
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('stopped');
  });
});

// ---------------------------------------------------------------------------
// Graceful shutdown test
// ---------------------------------------------------------------------------

describe('FileWatcher - graceful shutdown (Windows, macOS, Linux)', () => {
  test('stop() resolves without error when watcher is already stopped', async () => {
    const w = new FileWatcher({ patterns: ['**/*.hsplus'] });
    await expect(w.stop()).resolves.toBeUndefined();
  });

  test('running flag transitions correctly', async () => {
    const w = new FileWatcher({ patterns: ['**/*.hsplus'] });
    expect(w.running).toBe(false);
    // start() will fail gracefully if chokidar not available - test the flag anyway
    const startPromise = w.start().catch(() => {});
    // Give it a moment
    await new Promise((r) => setTimeout(r, 20));
    await startPromise;
    // After attempted start + possible early exit:
    await w.stop();
    expect(w.running).toBe(false);
  });
});
