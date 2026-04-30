/**
 * @holoscript/fs - File Watch Module
 *
 * File and directory watching utilities for HoloScript Plus programs.
 */

import chokidar, { type FSWatcher, type WatchOptions as ChokidarOptions } from 'chokidar';
import { EventEmitter } from 'events';

/**
 * Watch event types
 */
export type WatchEventType =
  | 'add'
  | 'change'
  | 'unlink'
  | 'addDir'
  | 'unlinkDir'
  | 'error'
  | 'ready';

/**
 * Watch event
 */
export interface WatchEvent {
  type: WatchEventType;
  path: string;
  stats?: {
    size: number;
    mtime: Date;
  };
}

/**
 * Watch options
 */
export interface WatchOptions {
  /** Glob patterns to ignore */
  ignored?: string | string[];
  /** Use polling instead of native events */
  usePolling?: boolean;
  /** Polling interval in ms */
  interval?: number;
  /** Emit events for initial files */
  emitInitial?: boolean;
  /** Follow symlinks */
  followSymlinks?: boolean;
  /** Watch depth */
  depth?: number;
  /** Persistent watch */
  persistent?: boolean;
  /** Debounce delay in ms */
  debounce?: number;
}

/**
 * Watch callback
 */
export type WatchCallback = (event: WatchEvent) => void | Promise<void>;

/**
 * File watcher class
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private paths: string[];
  private options: WatchOptions;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(paths: string | string[], options: WatchOptions = {}) {
    super();
    this.paths = Array.isArray(paths) ? paths : [paths];
    this.options = {
      ignored: options.ignored || ['**/node_modules/**', '**/.git/**'],
      usePolling: options.usePolling || false,
      interval: options.interval || 100,
      emitInitial: options.emitInitial ?? true,
      followSymlinks: options.followSymlinks ?? true,
      depth: options.depth,
      persistent: options.persistent ?? true,
      debounce: options.debounce || 0,
    };
  }

  /**
   * Start watching
   */
  start(): this {
    if (this.watcher) {
      return this;
    }

    const chokidarOpts: ChokidarOptions = {
      ignored: this.options.ignored,
      persistent: this.options.persistent,
      followSymlinks: this.options.followSymlinks,
      depth: this.options.depth,
      usePolling: this.options.usePolling,
      interval: this.options.interval,
      ignoreInitial: !this.options.emitInitial,
    };

    this.watcher = chokidar.watch(this.paths, chokidarOpts);

    this.watcher.on('add', (path, stats) => this.handleEvent('add', path, stats));
    this.watcher.on('change', (path, stats) => this.handleEvent('change', path, stats));
    this.watcher.on('unlink', (path) => this.handleEvent('unlink', path));
    this.watcher.on('addDir', (path, stats) => this.handleEvent('addDir', path, stats));
    this.watcher.on('unlinkDir', (path) => this.handleEvent('unlinkDir', path));
    this.watcher.on('error', (error) => this.emit('error', error));
    this.watcher.on('ready', () => this.emit('ready'));

    return this;
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Add paths to watch
   */
  add(paths: string | string[]): this {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    this.paths.push(...pathsArray);
    this.watcher?.add(pathsArray);
    return this;
  }

  /**
   * Remove paths from watch
   */
  unwatch(paths: string | string[]): this {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    this.paths = this.paths.filter((p) => !pathsArray.includes(p));
    this.watcher?.unwatch(pathsArray);
    return this;
  }

  /**
   * Get watched paths
   */
  getWatched(): Record<string, string[]> {
    return this.watcher?.getWatched() || {};
  }

  /**
   * Check if watcher is ready
   */
  get isReady(): boolean {
    return this.watcher !== null;
  }

  /**
   * Register event handler
   */
  on(
    event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'all',
    listener: (event: WatchEvent) => void
  ): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'ready', listener: () => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  private handleEvent(
    type: WatchEventType,
    path: string,
    stats?: { size: number; mtime: Date }
  ): void {
    const event: WatchEvent = {
      type,
      path,
      stats: stats
        ? {
            size: stats.size,
            mtime: stats.mtime,
          }
        : undefined,
    };

    if (this.options.debounce && this.options.debounce > 0) {
      // Debounce the event
      if (this.debounceTimers.has(path)) {
        clearTimeout(this.debounceTimers.get(path));
      }

      this.debounceTimers.set(
        path,
        setTimeout(() => {
          this.debounceTimers.delete(path);
          this.emitEvent(event);
        }, this.options.debounce)
      );
    } else {
      this.emitEvent(event);
    }
  }

  private emitEvent(event: WatchEvent): void {
    this.emit(event.type, event);
    this.emit('all', event);
  }
}

/**
 * Watch files/directories
 */
export function watch(paths: string | string[], options?: WatchOptions): FileWatcher {
  return new FileWatcher(paths, options).start();
}

/**
 * Watch and run callback on changes
 */
export function watchCallback(
  paths: string | string[],
  callback: WatchCallback,
  options?: WatchOptions
): FileWatcher {
  const watcher = watch(paths, options);

  watcher.on('all', async (event) => {
    try {
      await callback(event);
    } catch (error) {
      watcher.emit('error', error);
    }
  });

  return watcher;
}

/**
 * Watch for specific file types
 */
export function watchFileTypes(
  dir: string,
  extensions: string[],
  callback: WatchCallback,
  options?: WatchOptions
): FileWatcher {
  const patterns = extensions.map((ext) => {
    const e = ext.startsWith('.') ? ext : `.${ext}`;
    return `${dir}/**/*${e}`;
  });

  return watchCallback(patterns, callback, options);
}

/**
 * Watch a single file
 */
export function watchFile(
  path: string,
  callback: WatchCallback,
  options?: WatchOptions
): FileWatcher {
  return watchCallback(path, callback, { ...options, depth: 0 });
}

/**
 * Watch and debounce - only emit after changes have stopped for a duration
 */
export function watchDebounced(
  paths: string | string[],
  callback: WatchCallback,
  debounceMs = 300,
  options?: WatchOptions
): FileWatcher {
  return watchCallback(paths, callback, { ...options, debounce: debounceMs });
}

/**
 * One-shot watch - stop after first event
 */
export async function watchOnce(
  paths: string | string[],
  options?: WatchOptions
): Promise<WatchEvent> {
  return new Promise((resolve, reject) => {
    const watcher = watch(paths, { ...options, emitInitial: false });

    const cleanup = async () => {
      await watcher.stop();
    };

    watcher.on('all', async (event) => {
      await cleanup();
      resolve(event);
    });

    watcher.on('error', async (error) => {
      await cleanup();
      reject(error);
    });
  });
}

/**
 * Watch with batching - collect events and emit in batches
 */
export function watchBatched(
  paths: string | string[],
  callback: (events: WatchEvent[]) => void | Promise<void>,
  batchMs = 100,
  options?: WatchOptions
): FileWatcher {
  const watcher = watch(paths, options);
  let batch: WatchEvent[] = [];
  let timer: NodeJS.Timeout | null = null;

  const flush = async () => {
    if (batch.length > 0) {
      const events = [...batch];
      batch = [];
      try {
        await callback(events);
      } catch (error) {
        watcher.emit('error', error);
      }
    }
  };

  watcher.on('all', (event) => {
    batch.push(event);

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(flush, batchMs);
  });

  // Extend stop to flush remaining
  const originalStop = watcher.stop.bind(watcher);
  watcher.stop = async () => {
    if (timer) {
      clearTimeout(timer);
    }
    await flush();
    await originalStop();
  };

  return watcher;
}

/**
 * Watch with filtering
 */
export function watchFiltered(
  paths: string | string[],
  filter: (event: WatchEvent) => boolean,
  callback: WatchCallback,
  options?: WatchOptions
): FileWatcher {
  return watchCallback(
    paths,
    async (event) => {
      if (filter(event)) {
        await callback(event);
      }
    },
    options
  );
}

/**
 * Watch only for specific event types
 */
export function watchEvents(
  paths: string | string[],
  eventTypes: WatchEventType[],
  callback: WatchCallback,
  options?: WatchOptions
): FileWatcher {
  return watchFiltered(paths, (event) => eventTypes.includes(event.type), callback, options);
}

/**
 * Watch only for file changes (add, change, unlink)
 */
export function watchFiles(
  paths: string | string[],
  callback: WatchCallback,
  options?: WatchOptions
): FileWatcher {
  return watchEvents(paths, ['add', 'change', 'unlink'], callback, options);
}

/**
 * Watch only for directory changes
 */
export function watchDirs(
  paths: string | string[],
  callback: WatchCallback,
  options?: WatchOptions
): FileWatcher {
  return watchEvents(paths, ['addDir', 'unlinkDir'], callback, options);
}
