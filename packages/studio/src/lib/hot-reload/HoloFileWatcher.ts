/**
 * HoloFileWatcher — Lightweight Node.js fs.watch wrapper for .holo files.
 *
 * Uses Node's built-in fs.watch to avoid adding chokidar as a dependency.
 * Debounces rapid-fire change events (e.g. save + format-on-save).
 *
 * @package @holoscript/studio
 */

import { watch, FSWatcher, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';

export type WatchEventType = 'modified' | 'created' | 'deleted';

export interface HoloFileWatcherOptions {
  /** Debounce interval in ms (default: 300) */
  debounceMs?: number;
  /** Callback when a file changes */
  onChange?: (filePath: string, event: WatchEventType) => void | Promise<void>;
  /** Callback on watcher error */
  onError?: (error: Error) => void;
}

/**
 * Watches a single .holo file or a directory for .holo file changes.
 *
 * Usage:
 *   const watcher = new HoloFileWatcher('/path/to/scene.holo');
 *   watcher.start((file, event) => { ... });
 *   watcher.stop();
 */
export class HoloFileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFiles = new Map<
    string,
    { event: WatchEventType; mtime: number }
  >();
  private options: HoloFileWatcherOptions;
  private targetPath: string;
  private isDirectory: boolean;

  constructor(targetPath: string, options: HoloFileWatcherOptions = {}) {
    this.targetPath = resolve(targetPath);
    this.isDirectory = existsSync(this.targetPath) && statSync(this.targetPath).isDirectory();
    this.options = {
      debounceMs: 300,
      ...options,
    };
  }

  /**
   * Start watching.
   */
  start(onChange?: HoloFileWatcherOptions['onChange']): void {
    if (this.watcher) return;

    const handler = onChange ?? this.options.onChange;

    try {
      this.watcher = watch(this.targetPath, { recursive: this.isDirectory }, (eventType, filename) => {
        if (!filename) return;
        const filePath = this.isDirectory ? resolve(this.targetPath, filename) : this.targetPath;

        // Filter to .holo files only
        if (!filePath.endsWith('.holo')) return;

        const kind: WatchEventType = eventType === 'rename' && !existsSync(filePath)
          ? 'deleted'
          : existsSync(filePath) && !this.pendingFiles.has(filePath)
          ? 'created'
          : 'modified';

        this.pendingFiles.set(filePath, { event: kind, mtime: Date.now() });

        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.flush(handler);
        }, this.options.debounceMs);
      });

      this.watcher.on('error', (err) => {
        this.options.onError?.(err);
      });
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Stop watching and clean up.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.pendingFiles.clear();
  }

  private async flush(
    handler?: (filePath: string, event: WatchEventType) => void | Promise<void>
  ): Promise<void> {
    if (!handler) return;
    const batch = new Map(this.pendingFiles);
    this.pendingFiles.clear();

    for (const [filePath, { event }] of batch) {
      try {
        await handler(filePath, event);
      } catch (err) {
        this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}

export default HoloFileWatcher;
