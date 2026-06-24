/**
 * Database / Persistence Traits
 * @version 1.1.0
 */
export const DATABASE_PERSISTENCE_TRAITS = [
  'sql_query', // Native SQL query execution
  'orm_entity', // ORM entity mapping
  'offline_sync', // Offline-first data synchronization
  'reactive_store', // Reactive state store with subscriptions
  'database_query', // Multi-engine query executor (postgres/mysql/sqlite/holoscript) with pooling and slow-query detection
] as const;

export type DatabasePersistenceTraitName = (typeof DATABASE_PERSISTENCE_TRAITS)[number];
