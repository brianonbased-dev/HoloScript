/**
 * HotReloader — Live code reload for HoloScript templates
 *
 * Pipeline: Snapshot → Parse → Diff → Migrate → Validate → Swap → (Rollback)
 *
 * Handles the 7-step transactional state update process:
 * [1] Snapshot current state (copy-on-write)
 * [2] Parse new template AST
 * [3] Compute schema diff
 * [4] Run migration chain (v_old → v_old+1 → ... → v_new)
 * [5] Validate migrated state against new schema
 * [6] Atomic swap: replace old instances with migrated state
 * [7] On failure at any step: rollback to snapshot
 */
import type { HoloTemplate, HoloValue } from '@holoscript/core';
import {
  diffState,
  buildMigrationChain,
  snapshotState,
  applyAutoMigration,
  type SchemaDiffResult,
  type MigrationChain,
} from '@holoscript/core';

// =============================================================================
// TYPES
// =============================================================================

export interface HotReloadResult {
  success: boolean;
  templateName: string;
  oldVersion: number;
  newVersion: number;
  diff: SchemaDiffResult;
  migrationChain: MigrationChain | null;
  instancesMigrated: number;
  rollback: boolean;
  error?: string;
  warnings: string[];
}

export interface TemplateInstance {
  __holo_id: string;
  templateName: string;
  version: number;
  state: Map<string, HoloValue>;
}

export interface HotReloaderOptions {
  devMode?: boolean;
  onWarning?: (msg: string) => void;
  onReload?: (result: HotReloadResult) => void;
  onRollback?: (result: HotReloadResult) => void;
}

export type MigrationExecutor = (
  instance: TemplateInstance,
  migrationBody: any
) => Promise<void> | void;

// =============================================================================
// HOT RELOADER
// =============================================================================

export class HotReloader {
  private templates = new Map<string, HoloTemplate>();
  private instances = new Map<string, TemplateInstance[]>();
  private devMode: boolean;
  private onWarning: (msg: string) => void;
  private onReload: (result: HotReloadResult) => void;
  private onRollback: (result: HotReloadResult) => void;
  private migrationExecutor: MigrationExecutor | null = null;

  constructor(options: HotReloaderOptions = {}) {
    this.devMode = options.devMode ?? false;
    this.onWarning = options.onWarning ?? (() => {});
    this.onReload = options.onReload ?? (() => {});
    this.onRollback = options.onRollback ?? (() => {});
  }

  /**
   * Set the migration executor — the function that runs migration statement bodies.
   * This decouples the HotReloader from the runtime's statement interpreter.
   */
  setMigrationExecutor(executor: MigrationExecutor): void {
    this.migrationExecutor = executor;
  }

  /**
   * Register a template. Called on initial load.
   */
  registerTemplate(template: HoloTemplate): void {
    this.templates.set(template.name, template);
    if (!this.instances.has(template.name)) {
      this.instances.set(template.name, []);
    }
  }

  /**
   * Register a live instance of a template.
   */
  registerInstance(instance: TemplateInstance): void {
    const list = this.instances.get(instance.templateName);
    if (list) {
      list.push(instance);
    } else {
      this.instances.set(instance.templateName, [instance]);
    }
  }

  /**
   * Unregister an instance (e.g., on destroy).
   */
  unregisterInstance(holoId: string): void {
    for (const [, list] of this.instances) {
      const idx = list.findIndex((i) => i.__holo_id === holoId);
      if (idx !== -1) {
        list.splice(idx, 1);
        return;
      }
    }
  }

  /**
   * Hot-reload a template. This is the main entry point.
   *
   * Steps:
   * 1. Snapshot all instances of the template
   * 2. Diff old vs new state schema
   * 3. Build migration chain if needed
   * 4. Apply migrations to all instances
   * 5. Validate and swap
   * 6. Rollback on failure
   */
  async reload(newTemplate: HoloTemplate): Promise<HotReloadResult> {
    const warnings: string[] = [];
    const templateName = newTemplate.name;
    const oldTemplate = this.templates.get(templateName);
    const oldVersion = oldTemplate?.version ?? 0;
    const newVersion = newTemplate.version ?? 0;

    // [1] Snapshot
    const instanceList = this.instances.get(templateName) ?? [];
    const snapshots = new Map<string, Map<string, HoloValue>>();
    for (const instance of instanceList) {
      snapshots.set(instance.__holo_id, snapshotState(instance.state));
    }

    // [2] Already parsed — newTemplate is an AST node

    // [3] Compute diff
    const diff = diffState(oldTemplate?.state, newTemplate.state);

    if (!diff.hasChanges && oldVersion === newVersion) {
      // No state changes — just swap the template definition
      this.templates.set(templateName, newTemplate);
      const result: HotReloadResult = {
        success: true,
        templateName,
        oldVersion,
        newVersion,
        diff,
        migrationChain: null,
        instancesMigrated: 0,
        rollback: false,
        warnings,
      };
      this.onReload(result);
      return result;
    }

    // [4] Build migration chain if version increased or diff requires it
    let migrationChain: MigrationChain | null = null;
    if (newVersion > oldVersion || diff.requiresMigration) {
      migrationChain = buildMigrationChain(newTemplate, oldVersion, newVersion);
      if (!migrationChain) {
        if (diff.typeChanged.length > 0) {
          const error =
            `Missing migration chain from v${oldVersion} to v${newVersion} for template "${templateName}". ` +
            `${diff.typeChanged.length} field(s) changed type: ${diff.typeChanged.map((c) => c.key).join(', ')}`;
          // ... (rest of the error handling)

          const result: HotReloadResult = {
            success: false,
            templateName,
            oldVersion,
            newVersion,
            diff,
            migrationChain: null,
            instancesMigrated: 0,
            rollback: true,
            error,
            warnings,
          };
          this.onRollback(result);
          return result;
        }
      }
    }

    // Build old defaults map for smart default propagation
    const oldDefaults = new Map<string, HoloValue>();
    if (oldTemplate?.state?.properties) {
      for (const prop of oldTemplate.state.properties) {
        oldDefaults.set(prop.key, prop.value);
      }
    }

    // [4 cont.] Run migration chain on each instance
    let migrated = 0;
    try {
      for (const instance of instanceList) {
        // Apply auto-migrations (added, removed, default changes)
        applyAutoMigration(instance.state, diff, oldDefaults);

        // Run explicit migration steps if there's a chain
        if (migrationChain && this.migrationExecutor) {
          for (const step of migrationChain.steps) {
            await this.migrationExecutor(instance, step.body);
          }
        }

        // Update instance version
        instance.version = newVersion;
        migrated++;
      }

      // Dev mode warnings
      if (this.devMode) {
        for (const change of diff.removed) {
          warnings.push(`Field "${change.key}" removed from template "${templateName}"`);
        }
        for (const change of diff.reactiveChanged) {
          warnings.push(
            `Reactivity changed for field "${change.key}" in template "${templateName}"`
          );
        }
      }

      // [5] Validate — check all instances have the expected fields
      if (newTemplate.state?.properties) {
        for (const instance of instanceList) {
          for (const prop of newTemplate.state.properties) {
            if (!instance.state.has(prop.key)) {
              warnings.push(
                `Instance ${instance.__holo_id}: missing field "${prop.key}" after migration`
              );
            }
          }
        }
      }

      // [6] Atomic swap — update template registry
      this.templates.set(templateName, newTemplate);

      const result: HotReloadResult = {
        success: true,
        templateName,
        oldVersion,
        newVersion,
        diff,
        migrationChain,
        instancesMigrated: migrated,
        rollback: false,
        warnings,
      };
      this.onReload(result);
      return result;
    } catch (err: unknown) {
      // [7] Rollback
      for (const instance of instanceList) {
        const snapshot = snapshots.get(instance.__holo_id);
        if (snapshot) {
          instance.state = snapshot;
          instance.version = oldVersion;
        }
      }

      const result: HotReloadResult = {
        success: false,
        templateName,
        oldVersion,
        newVersion,
        diff,
        migrationChain,
        instancesMigrated: 0,
        rollback: true,
        error: err instanceof Error ? err.message : String(err),
        warnings,
      };
      this.onRollback(result);
      return result;
    }
  }

  /**
   * Get all registered templates.
   */
  getTemplates(): Map<string, HoloTemplate> {
    return this.templates;
  }

  /**
   * Get all instances of a template.
   */
  getInstances(templateName: string): TemplateInstance[] {
    return this.instances.get(templateName) ?? [];
  }
}

