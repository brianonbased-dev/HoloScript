/**
 * WatchRunner — CLI-facing module for `holoscript run --watch`
 *
 * Wires the HotReloadWatcher to the HeadlessRuntime so that:
 * 1. File changes in .hs/.hsplus/.holo are detected
 * 2. The AST is re-parsed and re-injected into the runtime
 * 3. If @script_test blocks exist, they are re-run automatically
 *
 * Usage:
 * ```ts
 * import { WatchRunner } from './WatchRunner';
 * const runner = new WatchRunner({ watchPaths: ['./scenes'], debug: true });
 * runner.start();
 * // Ctrl+C to stop
 * ```
 */

import { HotReloadWatcher, type HotReloadConfig } from '../traits/HotReloadTrait';
import { ScriptTestRunner } from '../traits/ScriptTestTrait';
import { createHeadlessRuntime, type HeadlessRuntime } from './HeadlessRuntime';
import type { HSPlusAST } from '../types/HoloScriptPlus';
import * as fs from 'fs';
import { logger } from '../logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WatchRunnerOptions {
  /** Paths to watch for .hs/.hsplus/.holo changes */
  watchPaths: string[];
  /** Debounce interval (ms) */
  debounceMs?: number;
  /** Debug logging */
  debug?: boolean;
  /** Run @script_test blocks on reload */
  autoTest?: boolean;
  /** Exit on first test failure */
  bail?: boolean;
}

export interface WatchEvent {
  type: 'reload' | 'test-pass' | 'test-fail' | 'error';
  filePath?: string;
  message: string;
  timestamp: number;
}

// ── WatchRunner ──────────────────────────────────────────────────────────────

export class WatchRunner {
  private watcher: HotReloadWatcher;
  private testRunner: ScriptTestRunner;
  private runtime: HeadlessRuntime | null = null;
  private options: Required<WatchRunnerOptions>;
  private events: WatchEvent[] = [];
  private running = false;

  constructor(options: WatchRunnerOptions) {
    this.options = {
      watchPaths: options.watchPaths,
      debounceMs: options.debounceMs ?? 200,
      debug: options.debug ?? false,
      autoTest: options.autoTest ?? true,
      bail: options.bail ?? false,
    };

    this.watcher = new HotReloadWatcher({
      watchPaths: this.options.watchPaths,
      debounceMs: this.options.debounceMs,
      extensions: ['.hs', '.hsplus', '.holo'],
    });

    this.testRunner = new ScriptTestRunner({
      debug: this.options.debug,
      bail: this.options.bail,
    });

    // Wire reload events to re-parse + re-test
    this.watcher.on('reload', (event: { filePath: string; type: string }) => {
      this.handleReload(event.filePath);
    });
  }

  /** Start watching */
  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.options.debug) {
      logger.debug(`[WatchRunner] Watching: ${this.options.watchPaths.join(', ')}`);
    }

    // Create a minimal runtime for state binding
    this.runtime = createHeadlessRuntime({ type: 'Program', body: [], root: { type: 'root', id: 'root', name: 'root', children: [], properties: {} } } as HSPlusAST);
    this.watcher.start();

    this.pushEvent({
      type: 'reload',
      message: `Watching ${this.options.watchPaths.length} path(s)`,
      timestamp: Date.now(),
    });
  }

  /** Stop watching */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    this.watcher.stop();
    if (this.runtime) {
      this.runtime.stop();
      this.runtime = null;
    }

    if (this.options.debug) {
      logger.debug('[WatchRunner] Stopped');
    }
  }

  /** Check if running */
  isRunning(): boolean {
    return this.running;
  }

  /** Get event history */
  getEvents(): WatchEvent[] {
    return [...this.events];
  }

  /** Get watcher stats */
  getStats(): { reloadCount: number; events: number; running: boolean } {
    return {
      reloadCount: this.watcher.getStats().reloadCount,
      events: this.events.length,
      running: this.running,
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private handleReload(filePath: string): void {
    this.pushEvent({
      type: 'reload',
      filePath,
      message: `File changed: ${filePath}`,
      timestamp: Date.now(),
    });

    if (this.options.debug) {
      logger.debug(`[WatchRunner] Reload: ${filePath}`);
    }

    // Auto-run @script_test blocks if enabled
    if (this.options.autoTest) {
      try {
        const source = fs.readFileSync(filePath, 'utf-8');

        // Bind runtime state if available
        if (this.runtime) {
          this.testRunner.bindHeadlessRuntime(this.runtime);
        }

        const results = this.testRunner.runTestsFromSource(source, filePath);

        if (results.length > 0) {
          const passed = results.filter((r) => r.status === 'passed').length;
          const failed = results.filter((r) => r.status === 'failed').length;
          const total = results.length;

          const allPassed = failed === 0;
          this.pushEvent({
            type: allPassed ? 'test-pass' : 'test-fail',
            filePath,
            message: `Tests: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`,
            timestamp: Date.now(),
          });

          if (this.options.debug) {
            for (const r of results) {
              const icon = r.status === 'passed' ? '✓' : r.status === 'failed' ? '✗' : '○';
              logger.debug(`  ${icon} ${r.name} (${r.durationMs}ms)`);
              if (r.error) logger.debug(`    ${r.error}`);
            }
          }
        }
      } catch (err) {
        this.pushEvent({
          type: 'error',
          filePath,
          message: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        });
      }
    }
  }

  private pushEvent(event: WatchEvent): void {
    this.events.push(event);
    // Keep only last 100 events
    if (this.events.length > 100) {
      this.events = this.events.slice(-100);
    }
  }
}
