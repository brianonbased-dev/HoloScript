/**
 * @holoscript/core v6 Universal Data Traits
 *
 * Trait handlers for database models, queries, migrations, and caching.
 * Compiles to ORM-agnostic data access layer code.
 *
 * @example
 * ```hsplus
 * object "UserStore" {
 *   @db {
 *     engine: "postgres"
 *     connection: "DATABASE_URL"
 *   }
 *
 *   @model {
 *     name: "User"
 *     table: "users"
 *     fields: { id: "uuid:pk", name: "string", email: "string:unique" }
 *   }
 *
 *   @cache {
 *     strategy: "lru"
 *     max_size: 1000
 *     ttl: 300
 *   }
 * }
 * ```
 */

import type { TraitHandler, TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ── Cache Adapter ──────────────────────────────────────────────────────────────

class CacheAdapter {
  private store = new Map<string, { value: unknown; expiry: number }>();
  private hits = 0;
  private misses = 0;

  get(key: string): unknown | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiry > 0 && Date.now() > entry.expiry) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: unknown, ttlSeconds = 0) {
    const expiry = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;
    this.store.set(key, { value, expiry });
  }

  invalidate(key: string) {
    this.store.delete(key);
  }

  flush() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    return { size: this.store.size, hits: this.hits, misses: this.misses };
  }
}

// ── Database Trait ─────────────────────────────────────────────────────────────

export type DatabaseEngine =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'mongodb'
  | 'redis'
  | 'dynamodb'
  | 'cockroachdb';

export interface DatabaseConfig {
  /** Database engine */
  engine: DatabaseEngine;
  /** Connection string or env variable name */
  connection: string;
  /** Connection pool size */
  pool_size: number;
  /** Connection timeout (ms) */
  timeout: number;
  /** Enable query logging */
  logging: boolean;
  /** SSL mode */
  ssl: boolean;
  /** Database schema/namespace */
  schema: string;
}

interface DatabaseState {
  config: DatabaseConfig;
  connected: boolean;
}

export const dbHandler: TraitHandler<DatabaseConfig> = {
  name: 'db',
  defaultConfig: {
    engine: 'postgres',
    connection: 'DATABASE_URL',
    pool_size: 10,
    timeout: 5000,
    logging: false,
    ssl: true,
    schema: 'public',
  },
  onAttach(node: HSPlusNode, config: DatabaseConfig, context: TraitContext) {
    node.__dbState = { config, connected: false };
    context.emit?.('db_attached', {
      nodeId: node.id,
      engine: config.engine,
      connection: config.connection,
      schema: config.schema,
    });
  },
  onDetach(node: HSPlusNode, _config: DatabaseConfig, context: TraitContext) {
    const state = node.__dbState as DatabaseState | undefined;
    if (!state) return;
    context.emit?.('db_detached', {
      nodeId: node.id,
      engine: state.config.engine,
      connected: state.connected,
    });
    delete node.__dbState;
  },
};

// ── Model Trait ────────────────────────────────────────────────────────────────

export interface ModelConfig {
  /** Model name */
  name: string;
  /** Database table/collection name */
  table: string;
  /** Field definitions (name -> type:constraints) */
  fields: Record<string, string>;
  /** Indexes (name -> field list or expression) */
  indexes: Record<string, string | string[]>;
  /** Enable soft deletes */
  soft_delete: boolean;
  /** Enable timestamps (created_at, updated_at) */
  timestamps: boolean;
  /** Model relationships */
  relations: Record<string, string>;
}

interface ModelState {
  config: ModelConfig;
}

export const modelHandler: TraitHandler<ModelConfig> = {
  name: 'model',
  defaultConfig: {
    name: '',
    table: '',
    fields: {},
    indexes: {},
    soft_delete: false,
    timestamps: true,
    relations: {},
  },
  onAttach(node: HSPlusNode, config: ModelConfig, context: TraitContext) {
    node.__modelState = { config };
    context.emit?.('model_attached', {
      nodeId: node.id,
      name: config.name,
      table: config.table,
      fields: Object.keys(config.fields),
    });
  },
  onDetach(node: HSPlusNode, _config: ModelConfig, context: TraitContext) {
    const state = node.__modelState as ModelState | undefined;
    if (!state) return;
    context.emit?.('model_detached', { nodeId: node.id, name: state.config.name });
    delete node.__modelState;
  },
};

// ── Query Trait ────────────────────────────────────────────────────────────────

export type QueryType = 'select' | 'insert' | 'update' | 'delete' | 'aggregate' | 'raw';

export interface QueryConfig {
  /** Query name */
  name: string;
  /** Query type */
  type: QueryType;
  /** Target model */
  model: string;
  /** Where conditions */
  where: Record<string, unknown>;
  /** Select fields */
  select: string[];
  /** Order by */
  order_by: string;
  /** Result limit */
  limit: number;
  /** Pagination offset */
  offset: number;
}

interface QueryState {
  config: QueryConfig;
  executions: number;
}

export const queryHandler: TraitHandler<QueryConfig> = {
  name: 'query',
  defaultConfig: {
    name: '',
    type: 'select',
    model: '',
    where: {},
    select: [],
    order_by: '',
    limit: 0,
    offset: 0,
  },
  onAttach(node: HSPlusNode, config: QueryConfig, context: TraitContext) {
    node.__queryState = { config, executions: 0 };
    context.emit?.('query_attached', {
      nodeId: node.id,
      name: config.name,
      type: config.type,
      model: config.model,
    });
  },
  onDetach(node: HSPlusNode, _config: QueryConfig, context: TraitContext) {
    const state = node.__queryState as QueryState | undefined;
    if (!state) return;
    context.emit?.('query_detached', {
      nodeId: node.id,
      name: state.config.name,
      executions: state.executions,
    });
    delete node.__queryState;
  },
};

// ── Migration Trait ───────────────────────────────────────────────────────────

export type MigrationAction =
  | 'create_table'
  | 'alter_table'
  | 'drop_table'
  | 'add_column'
  | 'drop_column'
  | 'add_index'
  | 'drop_index'
  | 'raw_sql';

export interface MigrationConfig {
  /** Migration version/sequence number */
  version: string;
  /** Migration description */
  description: string;
  /** Migration action */
  action: MigrationAction;
  /** Target table */
  table: string;
  /** Column definitions for create/alter */
  columns: Record<string, string>;
  /** Reversible migration */
  reversible: boolean;
}

interface MigrationState {
  config: MigrationConfig;
  applied: boolean;
}

export const migrationHandler: TraitHandler<MigrationConfig> = {
  name: 'migration',
  defaultConfig: {
    version: '',
    description: '',
    action: 'create_table',
    table: '',
    columns: {},
    reversible: true,
  },
  onAttach(node: HSPlusNode, config: MigrationConfig, context: TraitContext) {
    node.__migrationState = { config, applied: false };
    context.emit?.('migration_attached', {
      nodeId: node.id,
      version: config.version,
      action: config.action,
      table: config.table,
    });
  },
  onDetach(node: HSPlusNode, _config: MigrationConfig, context: TraitContext) {
    const state = node.__migrationState as MigrationState | undefined;
    if (!state) return;
    context.emit?.('migration_detached', {
      nodeId: node.id,
      version: state.config.version,
      applied: state.applied,
    });
    delete node.__migrationState;
  },
};

// ── Cache Trait ────────────────────────────────────────────────────────────────

export type CacheStrategy = 'lru' | 'lfu' | 'fifo' | 'ttl' | 'write_through' | 'write_behind';

export interface CacheConfig {
  /** Cache strategy */
  strategy: CacheStrategy;
  /** Maximum cache entries */
  max_size: number;
  /** Default TTL (seconds, 0 = no expiry) */
  ttl: number;
  /** Cache key prefix */
  key_prefix: string;
  /** External cache backend */
  backend: 'memory' | 'redis' | 'memcached';
  /** Enable cache statistics */
  stats: boolean;
}

interface CacheState {
  config: CacheConfig;
  adapter: CacheAdapter;
}

export const cacheHandler: TraitHandler<CacheConfig> = {
  name: 'cache',
  defaultConfig: {
    strategy: 'lru',
    max_size: 1000,
    ttl: 300,
    key_prefix: '',
    backend: 'memory',
    stats: false,
  },
  onAttach(node: HSPlusNode, config: CacheConfig, context: TraitContext) {
    node.__cacheState = { config, adapter: new CacheAdapter() };
    context.emit?.('cache_attached', {
      nodeId: node.id,
      strategy: config.strategy,
      maxSize: config.max_size,
      backend: config.backend,
    });
  },
  onDetach(node: HSPlusNode, _config: CacheConfig, context: TraitContext) {
    const state = node.__cacheState as CacheState | undefined;
    if (!state) return;
    const stats = state.adapter.stats();
    state.adapter.flush();
    context.emit?.('cache_detached', {
      nodeId: node.id,
      strategy: state.config.strategy,
      stats,
    });
    delete node.__cacheState;
  },
};
