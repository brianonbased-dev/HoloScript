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

export const dbHandler: TraitHandler<DatabaseConfig> = {
  name: 'db' as any,
  defaultConfig: {
    engine: 'postgres',
    connection: 'DATABASE_URL',
    pool_size: 10,
    timeout: 5000,
    logging: false,
    ssl: true,
    schema: 'public',
  },
  onAttach(_node: HSPlusNode, _config: DatabaseConfig, _context: TraitContext) {
    // v6 stub: database connection setup
  },
  onDetach(_node: HSPlusNode, _config: DatabaseConfig, _context: TraitContext) {
    // v6 stub: connection pool teardown
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

export const modelHandler: TraitHandler<ModelConfig> = {
  name: 'model' as any,
  defaultConfig: {
    name: '',
    table: '',
    fields: {},
    indexes: {},
    soft_delete: false,
    timestamps: true,
    relations: {},
  },
  onAttach(_node: HSPlusNode, _config: ModelConfig, _context: TraitContext) {
    // v6 stub: model registration
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

export const queryHandler: TraitHandler<QueryConfig> = {
  name: 'query' as any,
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
  onAttach(_node: HSPlusNode, _config: QueryConfig, _context: TraitContext) {
    // v6 stub: prepared query registration
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

export const migrationHandler: TraitHandler<MigrationConfig> = {
  name: 'migration' as any,
  defaultConfig: {
    version: '',
    description: '',
    action: 'create_table',
    table: '',
    columns: {},
    reversible: true,
  },
  onAttach(_node: HSPlusNode, _config: MigrationConfig, _context: TraitContext) {
    // v6 stub: migration registration
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

export const cacheHandler: TraitHandler<CacheConfig> = {
  name: 'cache' as any,
  defaultConfig: {
    strategy: 'lru',
    max_size: 1000,
    ttl: 300,
    key_prefix: '',
    backend: 'memory',
    stats: false,
  },
  onAttach(_node: HSPlusNode, _config: CacheConfig, _context: TraitContext) {
    // v6 stub: cache layer setup
  },
  onDetach(_node: HSPlusNode, _config: CacheConfig, _context: TraitContext) {
    // v6 stub: cache flush and teardown
  },
};
