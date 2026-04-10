/**
 * Migration Module
 *
 * Sprint 5 Priority 3: Migration Assistant
 * Hot-Reload: Schema Diff Engine
 *
 * Exports for migration assistant and hot-reload schema diffing.
 */

export {
  MigrationAssistant,
  createMigrationAssistant,
  analyzeMigrations,
  autoFixMigrations,
  type MigrationRule,
  type MigrationSuggestion,
  type MigrationResult,
  type ApplyResult,
} from './MigrationAssistant';

export {
  diffState,
  buildMigrationChain,
  snapshotState,
  applyAutoMigration,
  type FieldChange,
  type FieldChangeKind,
  type SchemaDiffResult,
  type MigrationChain,
  type MigrationStep,
} from './SchemaDiff';
