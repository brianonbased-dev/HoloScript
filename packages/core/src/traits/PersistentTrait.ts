/**
 * Persistent Trait (starter for State & Persistence category, p3 board task)
 *
 * High-value missing from 2026-03 audit (0% coverage for state/persistence traits).
 * Provides basic declarative persistence attachment for nodes (keyed store + TTL demo).
 * Pairs with constants/state-persistence.ts declarations.
 *
 * Simple in-memory backing for starter; real impl would bridge to Loro CRDT / host FS.
 *
 * @version 1.0.0-starter
 */

import type { TraitEvent, TraitHandler } from './TraitTypes';

interface PersistentState {
  key: string;
  value: unknown;
  expiresAt: number | null;
}

export interface PersistentConfig {
  key?: string;
  defaultValue?: unknown;
  ttlMs?: number;
}

const memoryStore = new Map<string, { value: unknown; expiresAt: number | null }>();

function getPersistentSetPayload(
  event: TraitEvent
): { key: string; value: unknown; ttlMs?: number } | null {
  if (event.type !== 'persistent_set' || typeof event.key !== 'string' || event.key.length === 0) {
    return null;
  }

  return {
    key: event.key,
    value: event.value,
    ttlMs: typeof event.ttlMs === 'number' ? event.ttlMs : undefined,
  };
}

export const persistentHandler: TraitHandler<PersistentConfig> = {
  name: 'persistent' as const,

  defaultConfig: {
    key: 'default',
    defaultValue: null,
    ttlMs: 0,
  },

  onAttach(node, config, context) {
    const key = config.key || 'default';
    const ttl = config.ttlMs || 0;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    let entry = memoryStore.get(key);
    if (!entry || (entry.expiresAt && entry.expiresAt < Date.now())) {
      entry = { value: config.defaultValue ?? null, expiresAt };
      memoryStore.set(key, entry);
    }

    const state: PersistentState = {
      key,
      value: entry.value,
      expiresAt: entry.expiresAt,
    };
    node.__persistentState = state;

    context.emit?.('persistent_attached', { node, key, value: state.value });
  },

  onDetach(node, _config, context) {
    context.emit?.('persistent_detached', { node });
    delete node.__persistentState;
  },

  onUpdate(node, _config, context, _delta) {
    const state = node.__persistentState as PersistentState | undefined;
    if (!state) return;

    const entry = memoryStore.get(state.key);
    if (entry && entry.expiresAt && entry.expiresAt < Date.now()) {
      state.value = null;
      entry.value = null;
      context.emit?.('persistent_expired', { node, key: state.key });
    }
  },

  onEvent(node, _config, context, event) {
    const payload = getPersistentSetPayload(event);
    if (!payload) return;

    const entry = {
      value: payload.value,
      expiresAt: payload.ttlMs && payload.ttlMs > 0 ? Date.now() + payload.ttlMs : null,
    };
    memoryStore.set(payload.key, entry);
    const state = node.__persistentState as PersistentState | undefined;
    if (state && state.key === payload.key) {
      state.value = entry.value;
      state.expiresAt = entry.expiresAt;
    }
    context.emit?.('persistent_updated', { node, key: payload.key, value: entry.value });
  },
};

export default persistentHandler;
