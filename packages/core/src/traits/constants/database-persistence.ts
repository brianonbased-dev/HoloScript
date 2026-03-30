/**
 * Database / Persistence Traits
 * @version 1.0.0
 */
export const DATABASE_PERSISTENCE_TRAITS = [
  'sql_query', // Native SQL query execution
  'orm_entity', // ORM entity mapping
  'offline_sync', // Offline-first data synchronization
  'reactive_store', // Reactive state store with subscriptions
] as const;

export type DatabasePersistenceTraitName = (typeof DATABASE_PERSISTENCE_TRAITS)[number];
