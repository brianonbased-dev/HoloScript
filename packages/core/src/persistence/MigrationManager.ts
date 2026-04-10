/**
 * MigrationManager.ts
 *
 * Schema migration: version upgrade chains,
 * backward compatibility transforms, and validation.
 *
 * @module persistence
 */

// =============================================================================
// TYPES
// =============================================================================

export type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

export interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate: MigrationFn;
  description: string;
}

// =============================================================================
// MIGRATION MANAGER
// =============================================================================

export class MigrationManager {
  private migrations: Migration[] = [];
  private currentVersion: number;

  constructor(currentVersion: number) {
    this.currentVersion = currentVersion;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  registerMigration(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.fromVersion - b.fromVersion);
  }

  // ---------------------------------------------------------------------------
  // Migration
  // ---------------------------------------------------------------------------

  migrate(
    data: Record<string, unknown>,
    fromVersion: number
  ): { data: Record<string, unknown>; version: number; steps: string[] } {
    let current = { ...data };
    let version = fromVersion;
    const steps: string[] = [];

    while (version < this.currentVersion) {
      const migration = this.migrations.find((m) => m.fromVersion === version);
      if (!migration) break;

      current = migration.migrate(current);
      steps.push(`v${migration.fromVersion} → v${migration.toVersion}: ${migration.description}`);
      version = migration.toVersion;
    }

    return { data: current, version, steps };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  needsMigration(fromVersion: number): boolean {
    return fromVersion < this.currentVersion;
  }
  getCurrentVersion(): number {
    return this.currentVersion;
  }

  getPath(fromVersion: number): number[] {
    const path: number[] = [fromVersion];
    let v = fromVersion;
    while (v < this.currentVersion) {
      const m = this.migrations.find((m) => m.fromVersion === v);
      if (!m) break;
      path.push(m.toVersion);
      v = m.toVersion;
    }
    return path;
  }

  getMigrationCount(): number {
    return this.migrations.length;
  }
}
