/**
 * WatcherTrait — v5.1
 *
 * File, state, and event watchers for HoloScript compositions.
 * Supports debouncing to prevent event flooding. File watching
 * uses Node.js fs.watch when available (headless/server contexts).
 *
 * Events:
 *  watcher:ready    { watchType, patterns }
 *  watcher:change   { type, path, timestamp }
 *  watcher:error    { error, watchType }
 *  watcher:start    (command)
 *  watcher:stop     (command)
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface WatcherConfig {
  /** Type of watch */
  watch_type: 'file' | 'state' | 'event';
  /** Patterns to watch (file globs, state keys, or event names) */
  patterns: string[];
  /** Debounce interval in ms */
  debounce_ms: number;
  /** Recursive file watching */
  recursive: boolean;
  /** Auto-start on attach */
  auto_start: boolean;
}

export interface WatcherState {
  active: boolean;
  lastChange: number;
  changeCount: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  watchers: any[]; // fs.FSWatcher references
  stateUnsubscribers: Array<() => void>;
}

// =============================================================================
// HANDLER
// =============================================================================

export const watcherHandler: TraitHandler<WatcherConfig> = {
  name: 'watcher',

  defaultConfig: {
    watch_type: 'event',
    patterns: [],
    debounce_ms: 200,
    recursive: false,
    auto_start: true,
  },

  onAttach(node: any, config: WatcherConfig, context: any): void {
    const state: WatcherState = {
      active: false,
      lastChange: 0,
      changeCount: 0,
      debounceTimer: null,
      watchers: [],
      stateUnsubscribers: [],
    };
    node.__watcherState = state;

    if (config.auto_start) {
      startWatching(node, config, context);
    }
  },

  onDetach(node: any, _config: WatcherConfig, _context: any): void {
    const state: WatcherState | undefined = node.__watcherState;
    if (state) {
      stopWatching(state);
    }
    delete node.__watcherState;
  },

  onUpdate(_node: any, _config: WatcherConfig, _context: any, _delta: number): void {
    // Watchers are event-driven
  },

  onEvent(node: any, config: WatcherConfig, context: any, event: any): void {
    const state: WatcherState | undefined = node.__watcherState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'watcher:start': {
        if (!state.active) {
          startWatching(node, config, context);
        }
        break;
      }
      case 'watcher:stop': {
        if (state.active) {
          stopWatching(state);
        }
        break;
      }
      default: {
        // For event-type watchers, check if this event matches a watched pattern
        if (config.watch_type === 'event' && state.active) {
          const matches = config.patterns.some((p) => {
            if (p.endsWith('*')) return eventType.startsWith(p.slice(0, -1));
            return eventType === p;
          });
          if (matches) {
            emitDebouncedChange(state, config, context, {
              type: 'event',
              path: eventType,
              timestamp: Date.now(),
            });
          }
        }
        break;
      }
    }
  },
};

function startWatching(node: any, config: WatcherConfig, context: any): void {
  const state: WatcherState = node.__watcherState;
  state.active = true;

  if (config.watch_type === 'file') {
    // File watching — Node.js only
    try {
      const fs = require('fs');
      for (const pattern of config.patterns) {
        try {
          const watcher = fs.watch(
            pattern,
            { recursive: config.recursive },
            (eventType: string, filename: string) => {
              emitDebouncedChange(state, config, context, {
                type: eventType,
                path: filename ?? pattern,
                timestamp: Date.now(),
              });
            }
          );
          state.watchers.push(watcher);
        } catch (err: any) {
          context.emit?.('watcher:error', { error: err.message, watchType: 'file' });
        }
      }
    } catch {
      context.emit?.('watcher:error', { error: 'fs.watch not available', watchType: 'file' });
    }
  }

  context.emit?.('watcher:ready', {
    watchType: config.watch_type,
    patterns: config.patterns,
  });
}

function stopWatching(state: WatcherState): void {
  state.active = false;
  for (const w of state.watchers) {
    try {
      w.close();
    } catch {
      /* best effort */
    }
  }
  state.watchers = [];
  for (const unsub of state.stateUnsubscribers) {
    try {
      unsub();
    } catch {
      /* best effort */
    }
  }
  state.stateUnsubscribers = [];
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
}

function emitDebouncedChange(
  state: WatcherState,
  config: WatcherConfig,
  context: any,
  changeData: { type: string; path: string; timestamp: number }
): void {
  if (config.debounce_ms <= 0) {
    state.changeCount++;
    state.lastChange = Date.now();
    context.emit?.('watcher:change', changeData);
    return;
  }

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }
  state.debounceTimer = setTimeout(() => {
    state.changeCount++;
    state.lastChange = Date.now();
    state.debounceTimer = null;
    context.emit?.('watcher:change', changeData);
  }, config.debounce_ms);
}

export default watcherHandler;
