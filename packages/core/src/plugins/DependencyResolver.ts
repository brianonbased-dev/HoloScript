/**
 * DependencyResolver — Enhanced plugin dependency resolution
 *
 * Builds on PluginLoader's semver utilities with:
 * - Full transitive dependency resolution
 * - Parallel group detection (like SkillWorkflowEngine)
 * - Version conflict detection and reporting
 * - Cycle detection with cycle path reporting
 * - Missing dependency tracking
 *
 * Part of HoloScript v5.7 "Open Ecosystem".
 *
 * @version 1.0.0
 */

import { satisfiesSemver } from './PluginLoader';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A plugin entry for dependency resolution.
 */
export interface PluginEntry {
  /** Plugin identifier */
  id: string;
  /** Plugin version */
  version: string;
  /** Dependencies: { pluginId: semverConstraint } */
  dependencies: Record<string, string>;
  /** Whether this is an optional dependency */
  optional?: boolean;
}

/**
 * Result of dependency resolution.
 */
export interface ResolutionResult {
  /** Whether resolution succeeded */
  success: boolean;
  /** Install order (topologically sorted) */
  installOrder: string[];
  /** Groups that can be installed in parallel */
  parallelGroups: string[][];
  /** Version conflicts detected */
  conflicts: VersionConflict[];
  /** Missing dependencies */
  missing: MissingDependency[];
  /** Detected cycles */
  cycles: string[][];
  /** Transitive dependency map: pluginId -> all transitive deps */
  transitiveDeps: Map<string, Set<string>>;
}

/**
 * A version conflict between two requirements.
 */
export interface VersionConflict {
  /** The dependency that has conflicting requirements */
  dependency: string;
  /** The version installed */
  installedVersion: string;
  /** Who requires what */
  requirements: Array<{
    requiredBy: string;
    constraint: string;
    satisfied: boolean;
  }>;
}

/**
 * A missing dependency.
 */
export interface MissingDependency {
  /** Missing plugin ID */
  pluginId: string;
  /** Who requires it */
  requiredBy: string;
  /** Version constraint */
  constraint: string;
  /** Whether it's an optional dep */
  optional: boolean;
}

// =============================================================================
// DEPENDENCY RESOLVER
// =============================================================================

export class DependencyResolver {
  private plugins: Map<string, PluginEntry> = new Map();

  /**
   * Add a plugin to the resolution set.
   */
  addPlugin(entry: PluginEntry): void {
    this.plugins.set(entry.id, { ...entry });
  }

  /**
   * Add multiple plugins at once.
   */
  addPlugins(entries: PluginEntry[]): void {
    for (const entry of entries) {
      this.addPlugin(entry);
    }
  }

  /**
   * Remove a plugin from the resolution set.
   */
  removePlugin(id: string): boolean {
    return this.plugins.delete(id);
  }

  /**
   * Get all registered plugin IDs.
   */
  getPluginIds(): string[] {
    return [...this.plugins.keys()];
  }

  /**
   * Clear all plugins.
   */
  clear(): void {
    this.plugins.clear();
  }

  // ===========================================================================
  // RESOLUTION
  // ===========================================================================

  /**
   * Resolve all dependencies and produce install order.
   */
  resolve(): ResolutionResult {
    const missing = this.findMissing();
    const conflicts = this.findConflicts();
    const cycles = this.findCycles();
    const transitiveDeps = this.computeTransitiveDeps();

    // If there are cycles, we can't produce a valid install order
    if (cycles.length > 0) {
      return {
        success: false,
        installOrder: [],
        parallelGroups: [],
        conflicts,
        missing: missing.filter((m) => !m.optional),
        cycles,
        transitiveDeps,
      };
    }

    const installOrder = this.topologicalSort();
    const parallelGroups = this.computeParallelGroups(installOrder);

    // Success if no non-optional missing deps and no cycles
    const hasRequiredMissing = missing.some((m) => !m.optional);
    const success = !hasRequiredMissing && cycles.length === 0;

    return {
      success,
      installOrder,
      parallelGroups,
      conflicts,
      missing,
      cycles,
      transitiveDeps,
    };
  }

  // ===========================================================================
  // TOPOLOGICAL SORT
  // ===========================================================================

  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const sorted: string[] = [];
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) return; // cycle — skip (already reported)

      const plugin = this.plugins.get(id);
      if (!plugin) return;

      visiting.add(id);

      for (const depId of Object.keys(plugin.dependencies)) {
        if (this.plugins.has(depId)) {
          visit(depId);
        }
      }

      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of this.plugins.keys()) {
      visit(id);
    }

    return sorted;
  }

  // ===========================================================================
  // PARALLEL GROUPS
  // ===========================================================================

  /**
   * Group plugins that can be installed in parallel.
   * Plugins in the same group have no inter-dependencies.
   */
  private computeParallelGroups(installOrder: string[]): string[][] {
    if (installOrder.length === 0) return [];

    const groups: string[][] = [];
    const installed = new Set<string>();

    // BFS-like layering: each group = all plugins whose deps are already installed
    const remaining = new Set(installOrder);

    while (remaining.size > 0) {
      const group: string[] = [];

      for (const id of remaining) {
        const plugin = this.plugins.get(id);
        if (!plugin) continue;

        const allDepsInstalled = Object.keys(plugin.dependencies).every(
          (depId) => installed.has(depId) || !this.plugins.has(depId)
        );

        if (allDepsInstalled) {
          group.push(id);
        }
      }

      if (group.length === 0) {
        // Remaining plugins have unresolvable deps — add them as final group
        groups.push([...remaining]);
        break;
      }

      for (const id of group) {
        remaining.delete(id);
        installed.add(id);
      }
      groups.push(group);
    }

    return groups;
  }

  // ===========================================================================
  // CYCLE DETECTION
  // ===========================================================================

  private findCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];
    const pathSet = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (pathSet.has(id)) {
        // Found a cycle — extract it
        const cycleStart = path.indexOf(id);
        const cycle = path.slice(cycleStart).concat(id);
        cycles.push(cycle);
        return;
      }

      const plugin = this.plugins.get(id);
      if (!plugin) return;

      path.push(id);
      pathSet.add(id);

      for (const depId of Object.keys(plugin.dependencies)) {
        if (this.plugins.has(depId)) {
          visit(depId);
        }
      }

      path.pop();
      pathSet.delete(id);
      visited.add(id);
    };

    for (const id of this.plugins.keys()) {
      visit(id);
    }

    return cycles;
  }

  // ===========================================================================
  // MISSING DEPENDENCIES
  // ===========================================================================

  private findMissing(): MissingDependency[] {
    const missing: MissingDependency[] = [];

    for (const [id, plugin] of this.plugins.entries()) {
      for (const [depId, constraint] of Object.entries(plugin.dependencies)) {
        if (!this.plugins.has(depId)) {
          missing.push({
            pluginId: depId,
            requiredBy: id,
            constraint,
            optional: plugin.optional === true,
          });
        }
      }
    }

    return missing;
  }

  // ===========================================================================
  // VERSION CONFLICTS
  // ===========================================================================

  private findConflicts(): VersionConflict[] {
    // Build a map: depId -> [{ requiredBy, constraint }]
    const requirements = new Map<string, Array<{ requiredBy: string; constraint: string }>>();

    for (const [id, plugin] of this.plugins.entries()) {
      for (const [depId, constraint] of Object.entries(plugin.dependencies)) {
        const reqs = requirements.get(depId) || [];
        reqs.push({ requiredBy: id, constraint });
        requirements.set(depId, reqs);
      }
    }

    const conflicts: VersionConflict[] = [];

    for (const [depId, reqs] of requirements.entries()) {
      if (reqs.length < 2) continue;

      const dep = this.plugins.get(depId);
      if (!dep) continue;

      const enriched = reqs.map((r) => ({
        ...r,
        satisfied: satisfiesSemver(dep.version, r.constraint),
      }));

      const hasConflict = enriched.some((r) => !r.satisfied);
      if (hasConflict) {
        conflicts.push({
          dependency: depId,
          installedVersion: dep.version,
          requirements: enriched,
        });
      }
    }

    return conflicts;
  }

  // ===========================================================================
  // TRANSITIVE DEPENDENCIES
  // ===========================================================================

  private computeTransitiveDeps(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();

    const collect = (id: string, visited: Set<string>): Set<string> => {
      if (result.has(id)) return result.get(id)!;
      if (visited.has(id)) return new Set(); // cycle

      visited.add(id);
      const plugin = this.plugins.get(id);
      if (!plugin) return new Set();

      const transitive = new Set<string>();
      for (const depId of Object.keys(plugin.dependencies)) {
        if (this.plugins.has(depId)) {
          transitive.add(depId);
          for (const tdep of collect(depId, visited)) {
            transitive.add(tdep);
          }
        }
      }

      result.set(id, transitive);
      return transitive;
    };

    for (const id of this.plugins.keys()) {
      collect(id, new Set());
    }

    return result;
  }

  // ===========================================================================
  // QUERY
  // ===========================================================================

  /**
   * Check if adding a plugin would create a cycle.
   */
  wouldCreateCycle(entry: PluginEntry): boolean {
    const original = this.plugins.get(entry.id);
    this.plugins.set(entry.id, entry);
    const cycles = this.findCycles();
    if (original) {
      this.plugins.set(entry.id, original);
    } else {
      this.plugins.delete(entry.id);
    }
    return cycles.length > 0;
  }

  /**
   * Get direct dependents of a plugin (who depends on it).
   */
  getDependents(pluginId: string): string[] {
    const dependents: string[] = [];
    for (const [id, plugin] of this.plugins.entries()) {
      if (id !== pluginId && pluginId in plugin.dependencies) {
        dependents.push(id);
      }
    }
    return dependents;
  }
}
