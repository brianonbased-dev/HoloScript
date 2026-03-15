/**
 * @hot_reload Trait — Live-Reload .hs Files on Disk Change
 *
 * Watches .hs, .hsplus, and .holo files for changes and triggers
 * re-parsing + runtime re-initialization without stopping the runtime.
 *
 * Usage in .hs:
 * ```hs
 * @hot_reload {
 *   watch: ["./agents/*.hs", "./scenes/*.holo"]
 *   debounce_ms: 300
 *   on_reload: "soft"   // "soft" = re-parse only, "hard" = full restart
 * }
 * ```
 *
 * CLI usage:
 *   holoscript run agent.hs --watch
 *
 * Trait name: hot_reload
 * Category: devtools
 * Compile targets: node, headless
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface HotReloadConfig {
  watchPaths: string[];
  debounceMs: number;
  mode: 'soft' | 'hard';
  extensions: string[];
}

export interface HotReloadEvent {
  type: 'change' | 'add' | 'unlink';
  filePath: string;
  timestamp: number;
}

export type HotReloadCallback = (event: HotReloadEvent) => void;

/**
 * HotReloadWatcher — File system watcher for HoloScript files
 */
export class HotReloadWatcher extends EventEmitter {
  private config: HotReloadConfig;
  private watchers: fs.FSWatcher[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private running = false;
  private reloadCount = 0;

  constructor(config: Partial<HotReloadConfig> = {}) {
    super();
    this.config = {
      watchPaths: config.watchPaths ?? ['.'],
      debounceMs: config.debounceMs ?? 300,
      mode: config.mode ?? 'soft',
      extensions: config.extensions ?? ['.hs', '.hsplus', '.holo'],
    };
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const watchPath of this.config.watchPaths) {
      const resolved = path.resolve(watchPath);
      
      if (!fs.existsSync(resolved)) {
        this.emit('warning', `Watch path does not exist: ${resolved}`);
        continue;
      }

      try {
        const watcher = fs.watch(resolved, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          
          const ext = path.extname(filename).toLowerCase();
          if (!this.config.extensions.includes(ext)) return;

          const fullPath = path.join(resolved, filename);
          this.handleChange(fullPath, eventType as 'change' | 'rename');
        });

        this.watchers.push(watcher);
      } catch (err) {
        this.emit('error', err);
      }
    }

    this.emit('started', { paths: this.config.watchPaths });
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.emit('stopped', { reloadCount: this.reloadCount });
  }

  /**
   * Handle a file change event (with debouncing)
   */
  private handleChange(filePath: string, eventType: 'change' | 'rename'): void {
    // Debounce rapid changes to same file
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath)!);
    }

    this.debounceTimers.set(
      filePath,
      setTimeout(() => {
        this.debounceTimers.delete(filePath);
        this.reloadCount++;

        const event: HotReloadEvent = {
          type: eventType === 'rename' ? 'add' : 'change',
          filePath,
          timestamp: Date.now(),
        };

        this.emit('reload', event);
      }, this.config.debounceMs)
    );
  }

  /**
   * Get current stats
   */
  getStats(): { running: boolean; reloadCount: number; watchedPaths: number } {
    return {
      running: this.running,
      reloadCount: this.reloadCount,
      watchedPaths: this.watchers.length,
    };
  }

  /**
   * Check if currently watching
   */
  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Trait definition for the standard traits registry
 */
export const HOT_RELOAD_TRAIT = {
  name: 'hot_reload',
  category: 'devtools',
  description: 'Live-reload .hs, .hsplus, and .holo files when they change on disk',
  compileTargets: ['node', 'headless'],
  requiresRenderer: false,
  parameters: [
    { name: 'watch', type: 'string[]', required: false, description: 'Glob patterns to watch' },
    { name: 'debounce_ms', type: 'number', required: false, default: 300, description: 'Debounce interval' },
    { name: 'on_reload', type: 'string', required: false, default: 'soft', description: '"soft" (re-parse) or "hard" (full restart)' },
  ],
};

// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const hotReloadHandler = {
  name: 'hot_reload',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__hot_reloadState = { active: true, config };
    ctx.emit('hot_reload_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('hot_reload_detached', { node });
    delete node.__hot_reloadState;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === 'hot_reload_configure') {
      Object.assign(node.__hot_reloadState?.config ?? {}, event.payload ?? {});
      ctx.emit('hot_reload_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
