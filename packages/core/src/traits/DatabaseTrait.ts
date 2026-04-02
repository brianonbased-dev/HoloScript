/**
 * DatabaseTrait — v5.1
 *
 * Key-value / document store with CRUD lifecycle events.
 * Provides an in-memory store with optional persistence hooks.
 *
 * Events:
 *  database:put       { collection, key, value }
 *  database:get       { collection, key }
 *  database:delete    { collection, key }
 *  database:result    { collection, key, value, found }
 *  database:cleared   { collection }
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface DatabaseConfig {
  default_collection: string;
  max_entries: number;
  persist_on_detach: boolean;
}

export interface DatabaseState {
  collections: Map<string, Map<string, unknown>>;
  totalOps: number;
}

export const databaseHandler: TraitHandler<DatabaseConfig> = {
  name: 'database',

  defaultConfig: {
    default_collection: 'default',
    max_entries: 10000,
    persist_on_detach: false,
  },

  onAttach(node: HSPlusNode, _config: DatabaseConfig, _context: TraitContext): void {
    const state: DatabaseState = {
      collections: new Map(),
      totalOps: 0,
    };
    node.__databaseState = state;
  },

  onDetach(node: HSPlusNode, config: DatabaseConfig, context: TraitContext): void {
    if (config.persist_on_detach) {
      const state: DatabaseState | undefined = node.__databaseState;
      if (state) {
        const snapshot: Record<string, Record<string, unknown>> = {};
        for (const [name, coll] of state.collections) {
          snapshot[name] = Object.fromEntries(coll);
        }
        context.emit?.('database:snapshot', { data: snapshot, totalOps: state.totalOps });
      }
    }
    delete node.__databaseState;
  },

  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: DatabaseConfig, context: TraitContext, event: TraitEvent): void {
    const state: DatabaseState | undefined = node.__databaseState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const collection = (event.collection as string) ?? config.default_collection;

    if (!state.collections.has(collection)) {
      state.collections.set(collection, new Map());
    }
    const coll = state.collections.get(collection)!;

    switch (eventType) {
      case 'database:put': {
        const key = event.key as string;
        if (!key) break;
        if (coll.size >= config.max_entries && !coll.has(key)) {
          context.emit?.('database:error', { error: 'max_entries exceeded', collection, key });
          break;
        }
        coll.set(key, event.value);
        state.totalOps++;
        context.emit?.('database:result', {
          collection,
          key,
          value: event.value,
          found: true,
          op: 'put',
        });
        break;
      }
      case 'database:get': {
        const key = event.key as string;
        if (!key) break;
        const value = coll.get(key);
        state.totalOps++;
        context.emit?.('database:result', {
          collection,
          key,
          value,
          found: coll.has(key),
          op: 'get',
        });
        break;
      }
      case 'database:delete': {
        const key = event.key as string;
        if (!key) break;
        const existed = coll.delete(key);
        state.totalOps++;
        context.emit?.('database:result', {
          collection,
          key,
          value: undefined,
          found: existed,
          op: 'delete',
        });
        break;
      }
      case 'database:clear': {
        coll.clear();
        state.totalOps++;
        context.emit?.('database:cleared', { collection });
        break;
      }
      case 'database:list': {
        const keys = [...coll.keys()];
        context.emit?.('database:result', { collection, keys, count: keys.length, op: 'list' });
        break;
      }
    }
  },
};

export default databaseHandler;
