/**
 * ModRegistry — Mod discovery, conflict detection, and load order
 *
 * Manages user-installed mods with version validation,
 * conflict detection, and priority-based load ordering.
 *
 * @version 1.0.0
 */

import { satisfiesSemver, type PluginManifest } from './PluginLoader';

// =============================================================================
// TYPES
// =============================================================================

export interface ModEntry {
  manifest: PluginManifest;
  enabled: boolean;
  priority: number;
  installedAt: number;
  source: 'local' | 'registry' | 'url';
  path?: string;
}

export interface ModConflict {
  modA: string;
  modB: string;
  reason: string;
  severity: 'warning' | 'error';
}

export interface ModValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  conflicts: ModConflict[];
}

// =============================================================================
// MOD REGISTRY
// =============================================================================

export class ModRegistry {
  private mods: Map<string, ModEntry> = new Map();
  private conflictRules: Array<{
    pattern: [string, string];
    reason: string;
    severity: 'warning' | 'error';
  }> = [];

  /**
   * Register a mod
   */
  register(manifest: PluginManifest, options: Partial<Omit<ModEntry, 'manifest'>> = {}): void {
    if (this.mods.has(manifest.id)) {
      throw new Error(`Mod "${manifest.id}" is already registered`);
    }

    this.mods.set(manifest.id, {
      manifest,
      enabled: options.enabled ?? true,
      priority: options.priority ?? 0,
      installedAt: options.installedAt ?? Date.now(),
      source: options.source ?? 'local',
      path: options.path,
    });
  }

  /**
   * Unregister a mod
   */
  unregister(modId: string): boolean {
    return this.mods.delete(modId);
  }

  /**
   * Enable a mod
   */
  enable(modId: string): void {
    const mod = this.mods.get(modId);
    if (!mod) throw new Error(`Mod "${modId}" not found`);
    mod.enabled = true;
  }

  /**
   * Disable a mod
   */
  disable(modId: string): void {
    const mod = this.mods.get(modId);
    if (!mod) throw new Error(`Mod "${modId}" not found`);
    mod.enabled = false;
  }

  /**
   * Set mod priority (higher = loads later/overrides)
   */
  setPriority(modId: string, priority: number): void {
    const mod = this.mods.get(modId);
    if (!mod) throw new Error(`Mod "${modId}" not found`);
    mod.priority = priority;
  }

  /**
   * Add a conflict rule between two mod patterns
   */
  addConflictRule(
    patternA: string,
    patternB: string,
    reason: string,
    severity: 'warning' | 'error' = 'error'
  ): void {
    this.conflictRules.push({ pattern: [patternA, patternB], reason, severity });
  }

  /**
   * Get all enabled mods in load order (by priority ascending, then install time)
   */
  getLoadOrder(): ModEntry[] {
    return [...this.mods.values()]
      .filter((m) => m.enabled)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.installedAt - b.installedAt;
      });
  }

  /**
   * Validate all registered mods for dependency and conflict issues
   */
  validate(): ModValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: ModConflict[] = [];

    const enabledMods = [...this.mods.values()].filter((m) => m.enabled);

    // Check dependencies
    for (const mod of enabledMods) {
      const deps = mod.manifest.dependencies || {};
      for (const [depId, constraint] of Object.entries(deps)) {
        const dep = this.mods.get(depId);
        if (!dep) {
          errors.push(`Mod "${mod.manifest.id}" requires "${depId}" which is not installed`);
          continue;
        }
        if (!dep.enabled) {
          errors.push(`Mod "${mod.manifest.id}" requires "${depId}" which is disabled`);
          continue;
        }
        if (!satisfiesSemver(dep.manifest.version, constraint)) {
          errors.push(
            `Mod "${mod.manifest.id}" requires "${depId}" ${constraint} but found ${dep.manifest.version}`
          );
        }
      }
    }

    // Check conflict rules
    for (const rule of this.conflictRules) {
      const modsA = enabledMods.filter((m) => this.matchesPattern(m.manifest.id, rule.pattern[0]));
      const modsB = enabledMods.filter((m) => this.matchesPattern(m.manifest.id, rule.pattern[1]));

      for (const a of modsA) {
        for (const b of modsB) {
          if (a.manifest.id !== b.manifest.id) {
            const conflict: ModConflict = {
              modA: a.manifest.id,
              modB: b.manifest.id,
              reason: rule.reason,
              severity: rule.severity,
            };
            conflicts.push(conflict);
            if (rule.severity === 'error') {
              errors.push(`Conflict: "${a.manifest.id}" ↔ "${b.manifest.id}": ${rule.reason}`);
            } else {
              warnings.push(`Warning: "${a.manifest.id}" ↔ "${b.manifest.id}": ${rule.reason}`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      conflicts,
    };
  }

  /**
   * Discover mods from a list of manifests
   */
  discoverFromManifests(
    manifests: PluginManifest[],
    source: 'local' | 'registry' | 'url' = 'local'
  ): number {
    let count = 0;
    for (const manifest of manifests) {
      if (!this.mods.has(manifest.id)) {
        this.register(manifest, { source });
        count++;
      }
    }
    return count;
  }

  /**
   * Get a mod entry by ID
   */
  getMod(modId: string): ModEntry | undefined {
    return this.mods.get(modId);
  }

  /**
   * Get all registered mod IDs
   */
  getModIds(): string[] {
    return [...this.mods.keys()];
  }

  /**
   * Get mods that depend on a specific mod
   */
  getDependents(modId: string): string[] {
    const dependents: string[] = [];
    for (const mod of this.mods.values()) {
      const deps = mod.manifest.dependencies || {};
      if (depId in deps) {
        // Check if this mod lists modId as a dependency
      }
      if (Object.keys(deps).includes(modId)) {
        dependents.push(mod.manifest.id);
      }
    }
    return dependents;
  }

  /**
   * Get total count
   */
  getCount(): number {
    return this.mods.size;
  }

  /**
   * Get count of enabled mods
   */
  getEnabledCount(): number {
    return [...this.mods.values()].filter((m) => m.enabled).length;
  }

  private matchesPattern(id: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return id.startsWith(pattern.slice(0, -1));
    }
    return id === pattern;
  }
}
