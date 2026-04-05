/**
 * VersionMigration.ts
 *
 * Schema versioning and backward-compatible migration.
 * Automatically upgrades old scene data to the current version.
 *
 * @module scene
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MigrationStep {
  fromVersion: number;
  toVersion: number;
  name: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

export interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  stepsApplied: string[];
  warnings: string[];
  data: Record<string, unknown>;
}

export interface MigrationLog {
  timestamp: number;
  fromVersion: number;
  toVersion: number;
  stepsApplied: string[];
  dataHash: string;
}

// =============================================================================
// VERSION MIGRATION SYSTEM
// =============================================================================

export const CURRENT_SCHEMA_VERSION = 5;

export class VersionMigration {
  private migrations: MigrationStep[] = [];
  private logs: MigrationLog[] = [];

  constructor() {
    // Register built-in migrations
    this.registerBuiltIns();
  }

  // ---------------------------------------------------------------------------
  // Migration Registration
  // ---------------------------------------------------------------------------

  register(step: MigrationStep): void {
    this.migrations.push(step);
    // Keep sorted by fromVersion
    this.migrations.sort((a, b) => a.fromVersion - b.fromVersion);
  }

  getMigrations(): MigrationStep[] {
    return [...this.migrations];
  }

  getMigrationCount(): number {
    return this.migrations.length;
  }

  // ---------------------------------------------------------------------------
  // Migration Execution
  // ---------------------------------------------------------------------------

  /**
   * Migrate data from its current version to the target version.
   */
  migrate(
    data: Record<string, unknown>,
    targetVersion: number = CURRENT_SCHEMA_VERSION
  ): MigrationResult {
    const currentVersion = (data.version as number) ?? 0;
    const stepsApplied: string[] = [];
    const warnings: string[] = [];

    if (currentVersion >= targetVersion) {
      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: currentVersion,
        stepsApplied,
        warnings,
        data,
      };
    }

    let workingData = { ...data };
    let version = currentVersion;

    while (version < targetVersion) {
      const step = this.migrations.find((m) => m.fromVersion === version);
      if (!step) {
        // No migration step found — try jumping
        warnings.push(`No migration step from v${version}, attempting skip to v${version + 1}`);
        version++;
        continue;
      }

      try {
        workingData = step.migrate(workingData);
        stepsApplied.push(step.name);
        version = step.toVersion;
        workingData.version = version;
      } catch (err) {
        return {
          success: false,
          fromVersion: currentVersion,
          toVersion: version,
          stepsApplied,
          warnings: [
            ...warnings,
            `Migration failed at step "${step.name}": ${(err as Error).message}`,
          ],
          data: workingData,
        };
      }
    }

    this.logs.push({
      timestamp: Date.now(),
      fromVersion: currentVersion,
      toVersion: targetVersion,
      stepsApplied,
      dataHash: this.simpleHash(JSON.stringify(workingData)),
    });

    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: targetVersion,
      stepsApplied,
      warnings,
      data: workingData,
    };
  }

  /**
   * Check if data needs migration.
   */
  needsMigration(data: Record<string, unknown>): boolean {
    const version = (data.version as number) ?? 0;
    return version < CURRENT_SCHEMA_VERSION;
  }

  /**
   * Get the version of the given data.
   */
  getDataVersion(data: Record<string, unknown>): number {
    return (data.version as number) ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------

  getLogs(): MigrationLog[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  // ---------------------------------------------------------------------------
  // Built-in migrations
  // ---------------------------------------------------------------------------

  private registerBuiltIns(): void {
    // V0 → V1: Add metadata field
    this.register({
      fromVersion: 0,
      toVersion: 1,
      name: 'add_metadata',
      migrate: (data) => ({
        ...data,
        metadata: data.metadata ?? {},
      }),
    });

    // V1 → V2: Normalize entity IDs to strings
    this.register({
      fromVersion: 1,
      toVersion: 2,
      name: 'normalize_entity_ids',
      migrate: (data) => {
        const entities = (data.entities as Array<Record<string, unknown>>) ?? [];
        for (const e of entities) {
          e.id = String(e.id);
        }
        return { ...data, entities };
      },
    });

    // V2 → V3: Add 'active' flag to entities
    this.register({
      fromVersion: 2,
      toVersion: 3,
      name: 'add_entity_active_flag',
      migrate: (data) => {
        const entities = (data.entities as Array<Record<string, unknown>>) ?? [];
        for (const e of entities) {
          if (e.active === undefined) e.active = true;
        }
        return { ...data, entities };
      },
    });

    // V3 → V4: Add globals
    this.register({
      fromVersion: 3,
      toVersion: 4,
      name: 'add_globals',
      migrate: (data) => ({
        ...data,
        globals: data.globals ?? {},
      }),
    });

    // V4 → V5: Add tags to entities
    this.register({
      fromVersion: 4,
      toVersion: 5,
      name: 'add_entity_tags',
      migrate: (data) => {
        const entities = (data.entities as Array<Record<string, unknown>>) ?? [];
        for (const e of entities) {
          if (!Array.isArray(e.tags)) e.tags = [];
        }
        return { ...data, entities };
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private simpleHash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(16);
  }
}

