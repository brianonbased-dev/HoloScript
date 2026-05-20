/**
 * Persistent Trait (State & Persistence category)
 *
 * Provides declarative persistence for nodes with pluggable backends.
 * Pairs with STATE_PERSISTENCE_TRAITS in constants/state-persistence.ts.
 *
 * Backends:
 * - 'memory' (default): fast in-process Map (good for tests / ephemeral agents)
 * - 'file': simple JSON file store under .holo-persist/ (durable across restarts)
 *
 * Future: Loro CRDT backend for distributed / conflict-free agent state (see @holoscript/crdt).
 *
 * Addresses the state/persistence gap identified in 2026-03 audit.
 */

import type { TraitEvent, TraitHandler } from './TraitTypes';
import * as fs from 'fs';
import * as path from 'path';

interface PersistentState {
  key: string;
  value: unknown;
  expiresAt: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pluggable backing stores
// ─────────────────────────────────────────────────────────────────────────────

interface IPersistentStore {
  get(key: string): { value: unknown; expiresAt: number | null } | undefined;
  set(key: string, value: unknown, expiresAt: number | null): void;
}

class MemoryPersistentStore implements IPersistentStore {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  get(key: string) {
    return this.store.get(key);
  }

  set(key: string, value: unknown, expiresAt: number | null) {
    this.store.set(key, { value, expiresAt });
  }
}

class FilePersistentStore implements IPersistentStore {
  private baseDir: string;

  constructor(baseDir = path.join(process.cwd(), '.holo-persist')) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private filePath(key: string): string {
    // Safe key for filesystem
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, `${safe}.json`);
  }

  get(key: string) {
    const fp = this.filePath(key);
    if (!fs.existsSync(fp)) return undefined;
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      return { value: raw.value, expiresAt: raw.expiresAt ?? null };
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown, expiresAt: number | null) {
    const fp = this.filePath(key);
    const payload = { value, expiresAt, updatedAt: new Date().toISOString() };
    fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  }
}

// Default shared stores (can be replaced per-trait instance if needed)
const memoryStore: IPersistentStore = new MemoryPersistentStore();
const fileStore: IPersistentStore = new FilePersistentStore();

export interface PersistentConfig {
  key?: string;
  defaultValue?: unknown;
  ttlMs?: number;
  /** Persistence backend. 'memory' (default) or 'file' for durable restart. */
  backend?: 'memory' | 'file';
}

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
    const backend = config.backend || 'memory';
    const store = backend === 'file' ? fileStore : memoryStore;

    let entry = store.get(key);
    if (!entry || (entry.expiresAt && entry.expiresAt < Date.now())) {
      entry = { value: config.defaultValue ?? null, expiresAt };
      store.set(key, entry);
    }

    const state: PersistentState = {
      key,
      value: entry.value,
      expiresAt: entry.expiresAt,
    };
    node.__persistentState = state;

    context.emit?.('persistent_attached', { node, key, value: state.value, backend });
  },

  onDetach(node, _config, context) {
    context.emit?.('persistent_detached', { node });
    delete node.__persistentState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__persistentState as PersistentState | undefined;
    if (!state) return;

    const backend = config.backend || 'memory';
    const store = backend === 'file' ? fileStore : memoryStore;

    const entry = store.get(state.key);
    if (entry && entry.expiresAt && entry.expiresAt < Date.now()) {
      state.value = null;
      // Also persist the cleared value for file backend
      store.set(state.key, null, null);
      context.emit?.('persistent_expired', { node, key: state.key });
    }
  },

  onEvent(node, config, context, event) {
    const payload = getPersistentSetPayload(event);
    if (!payload) return;

    const backend = config.backend || 'memory';
    const store = backend === 'file' ? fileStore : memoryStore;

    const entry = {
      value: payload.value,
      expiresAt: payload.ttlMs && payload.ttlMs > 0 ? Date.now() + payload.ttlMs : null,
    };
    store.set(payload.key, entry.value, entry.expiresAt);

    const state = node.__persistentState as PersistentState | undefined;
    if (state && state.key === payload.key) {
      state.value = entry.value;
      state.expiresAt = entry.expiresAt;
    }
    context.emit?.('persistent_updated', { node, key: payload.key, value: entry.value, backend });
  },
};

export default persistentHandler;
