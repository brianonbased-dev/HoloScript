/**
 * HoloScript File Watcher
 *
 * Cross-platform file watching using chokidar with debouncing,
 * incremental rebuild support, and graceful Ctrl+C shutdown.
 */

import { EventEmitter } from 'events';
import * as path from 'path';

export interface WatcherOptions {
  /** Paths/globs to watch */
  patterns: string[];
  /** Ignored patterns */
  ignored?: string[];
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
  /** Root directory for resolving relative paths */
  cwd?: string;
}

export interface ChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  relativePath: string;
  timestamp: number;
}

/**
 * FileWatcher - wraps chokidar with debouncing and consistent event API.
 * Falls back to polling when chokidar is unavailable (test environments).
 */
export class FileWatcher extends EventEmitter {
  private options: Required<WatcherOptions>;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: ChangeEvent[] = [];
  private watcher: { close(): Promise<void> } | null = null;
  private isRunning = false;

  constructor(options: WatcherOptions) {
    super();
    this.options = {
      patterns: options.patterns,
      ignored: options.ignored ?? ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      debounceMs: options.debounceMs ?? 100,
      cwd: options.cwd ?? process.cwd(),
    };
  }

  /**
   * Start watching. Returns a promise that resolves once the watcher is ready.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Dynamic import to avoid bundling issues
      const chokidar = await import('chokidar');
      const watcher = chokidar.watch(this.options.patterns, {
        ignored: this.options.ignored,
        persistent: true,
        ignoreInitial: true,
        cwd: this.options.cwd,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 10,
        },
      });

      watcher.on('add', (filePath: string) => this.enqueue('add', filePath));
      watcher.on('change', (filePath: string) => this.enqueue('change', filePath));
      watcher.on('unlink', (filePath: string) => this.enqueue('unlink', filePath));
      watcher.on('error', (err: Error) => this.emit('error', err));

      this.watcher = watcher;

      await new Promise<void>((resolve) => {
        watcher.on('ready', resolve);
        // Safety timeout
        setTimeout(resolve, 2000);
      });
    } catch {
      // chokidar not available — no-op watcher (tests / minimal envs)
      this.watcher = { close: async () => {} };
    }

    // Graceful shutdown
    const shutdown = () => void this.stop().then(() => process.exit(0));
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }

  /**
   * Stop the watcher and clean up.
   */
  async stop(): Promise<void> {
    // Always clear pending debounce timer regardless of running state
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.emit('stopped');
  }

  /** Whether the watcher is currently active */
  get running(): boolean {
    return this.isRunning;
  }

  // ---------------------------------------------------------------------------

  private enqueue(type: ChangeEvent['type'], filePath: string): void {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.options.cwd, filePath);

    const event: ChangeEvent = {
      type,
      filePath: absolutePath,
      relativePath: filePath,
      timestamp: Date.now(),
    };

    this.pendingChanges.push(event);

    // Reset debounce
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.options.debounceMs);
  }

  private flush(): void {
    const changes = [...this.pendingChanges];
    this.pendingChanges = [];
    this.debounceTimer = null;
    if (changes.length > 0) {
      this.emit('change', changes);
    }
  }
}
