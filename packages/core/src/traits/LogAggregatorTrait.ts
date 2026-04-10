/**
 * LogAggregatorTrait — v5.1
 *
 * Multi-source log collection, filtering, and routing.
 *
 * Events:
 *  log:write      { level, message, source, meta }
 *  log:query      { level, source, since, limit }
 *  log:result     { entries[], count }
 *  log:flush      (command)
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface LogAggregatorConfig {
  max_entries: number;
  min_level: 'debug' | 'info' | 'warn' | 'error';
}

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 } as const;

interface LogEntry {
  level: string;
  message: string;
  source: string;
  timestamp: number;
  meta: Record<string, unknown>;
}

export const logAggregatorHandler: TraitHandler<LogAggregatorConfig> = {
  name: 'log_aggregator',
  defaultConfig: { max_entries: 5000, min_level: 'info' },

  onAttach(node: HSPlusNode): void {
    node.__logAggregatorState = { entries: [] as LogEntry[] };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__logAggregatorState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: LogAggregatorConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__logAggregatorState as { entries: LogEntry[] } | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'log:write': {
        const level = (event.level as string) ?? 'info';
        const levelNum = LEVEL_ORDER[level as keyof typeof LEVEL_ORDER] ?? 1;
        const minNum = LEVEL_ORDER[config.min_level] ?? 1;
        if (levelNum < minNum) break;
        state.entries.push({
          level,
          message: (event.message as string) ?? '',
          source: (event.source as string) ?? 'unknown',
          timestamp: Date.now(),
          meta: (event.meta as Record<string, unknown>) ?? {},
        });
        if (state.entries.length > config.max_entries) {
          state.entries = state.entries.slice(-config.max_entries);
        }
        break;
      }
      case 'log:query': {
        let results = [...state.entries];
        if (event.level) results = results.filter((e) => e.level === event.level);
        if (event.source) results = results.filter((e) => e.source === event.source);
        if (event.since) results = results.filter((e) => e.timestamp >= (event.since as number));
        const limit = (event.limit as number) ?? 100;
        results = results.slice(-limit);
        context.emit?.('log:result', { entries: results, count: results.length });
        break;
      }
      case 'log:flush': {
        const count = state.entries.length;
        state.entries = [];
        context.emit?.('log:flushed', { entriesCleared: count });
        break;
      }
    }
  },
};

export default logAggregatorHandler;
