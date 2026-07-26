/**
 * Local Collection Trait
 *
 * Declares a bounded, application-local collection as portable HoloScript data.
 * Platform compilers decide how `device_private` storage is implemented; the
 * handler owns the deterministic ordering, deduplication, and capacity rules.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export type LocalCollectionOrdering = 'most_recent' | 'oldest_first';
export type LocalCollectionStorage = 'memory' | 'device_private';

export interface LocalCollectionConfig {
  item_type: string;
  capacity: number;
  ordering: LocalCollectionOrdering;
  deduplicate: boolean;
  storage: LocalCollectionStorage;
  backup: boolean;
}

export interface LocalCollectionState {
  items: unknown[];
}

function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`)
    .join(',')}}`;
}

function boundedCapacity(config: LocalCollectionConfig): number {
  return Math.max(0, Math.floor(config.capacity));
}

function eventValue(event: unknown): unknown {
  const record = event as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : undefined;
  return payload && 'value' in payload ? payload.value : record.value;
}

function matchesItemType(value: unknown, itemType: string): boolean {
  if (itemType === 'url') {
    if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
      return false;
    }
    try {
      const parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host.length > 0;
    } catch {
      return false;
    }
  }
  if (itemType === 'json') return value !== undefined;
  return typeof value === itemType;
}

export const localCollectionHandler: TraitHandler<LocalCollectionConfig> = {
  name: 'local_collection',

  defaultConfig: {
    item_type: 'string',
    capacity: 100,
    ordering: 'most_recent',
    deduplicate: true,
    storage: 'device_private',
    backup: false,
  },

  onAttach(node) {
    node.__localCollectionState = { items: [] } satisfies LocalCollectionState;
  },

  onDetach(node) {
    delete node.__localCollectionState;
  },

  onEvent(node, config, context, event) {
    const state = node.__localCollectionState as LocalCollectionState | undefined;
    if (!state) return;

    if (event.type === 'local_collection:add') {
      const value = eventValue(event);
      if (!matchesItemType(value, config.item_type)) {
        context.emit?.('local_collection:rejected', {
          node: node.id,
          itemType: config.item_type,
          reason: 'item_type',
        });
        return;
      }
      let next = state.items;
      if (config.deduplicate) {
        const key = stableKey(value);
        next = next.filter((item) => stableKey(item) !== key);
      }
      next = config.ordering === 'most_recent' ? [value, ...next] : [...next, value];
      state.items = next.slice(0, boundedCapacity(config));
      context.emit?.('local_collection:changed', {
        node: node.id,
        items: [...state.items],
        operation: 'add',
      });
    } else if (event.type === 'local_collection:remove') {
      const key = stableKey(eventValue(event));
      state.items = state.items.filter((item) => stableKey(item) !== key);
      context.emit?.('local_collection:changed', {
        node: node.id,
        items: [...state.items],
        operation: 'remove',
      });
    } else if (event.type === 'local_collection:clear') {
      state.items = [];
      context.emit?.('local_collection:changed', {
        node: node.id,
        items: [],
        operation: 'clear',
      });
    } else if (event.type === 'local_collection:query') {
      context.emit?.('local_collection:result', {
        node: node.id,
        queryId: (event as Record<string, unknown>).queryId,
        items: [...state.items],
        itemType: config.item_type,
        storage: config.storage,
      });
    }
  },
};

export default localCollectionHandler;
