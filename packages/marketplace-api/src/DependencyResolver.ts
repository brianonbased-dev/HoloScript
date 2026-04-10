/**
 * @fileoverview Dependency resolver for HoloScript traits with semver support
 * @module marketplace-api/DependencyResolver
 */

import semver from 'semver';
import type {
  TraitRef,
  DependencyTree,
  ResolvedDependency,
  DependencyConflict,
  CompatibilityReport,
  CompatibilityIssue,
  TraitPackage,
  Platform,
} from './types.js';
import type { TraitRegistry } from './TraitRegistry.js';

// =============================================================================
// DEPENDENCY RESOLVER
// =============================================================================

/**
 * Resolves trait dependencies using semver version constraints
 */
export class DependencyResolver {
  private registry: TraitRegistry;
  private cache: Map<string, TraitPackage[]> = new Map();
  private maxDepth: number;
  private resolutionStrategy: 'highest' | 'lowest';

  constructor(
    registry: TraitRegistry,
    options: {
      maxDepth?: number;
      resolutionStrategy?: 'highest' | 'lowest';
    } = {}
  ) {
    this.registry = registry;
    this.maxDepth = options.maxDepth ?? 100;
    this.resolutionStrategy = options.resolutionStrategy ?? 'highest';
  }

  /**
   * Resolve dependencies for a list of trait requirements
   */
  async resolve(requirements: TraitRef[]): Promise<DependencyTree> {
    const resolved: Map<string, ResolvedDependency> = new Map();
    const conflicts: DependencyConflict[] = [];
    const warnings: string[] = [];
    const visited: Set<string> = new Set();

    // Track version requests for conflict detection
    const versionRequests: Map<string, { version: string; requestedBy: string }[]> = new Map();

    // Process each root requirement
    for (const req of requirements) {
      await this.resolveRecursive(req, 'root', 0, resolved, versionRequests, visited, warnings);
    }

    // Detect and resolve conflicts
    for (const [name, requests] of versionRequests.entries()) {
      if (requests.length > 1) {
        const uniqueVersions = [...new Set(requests.map((r) => r.version))];
        if (uniqueVersions.length > 1) {
          const conflict = await this.resolveConflict(name, requests);
          if (conflict) {
            conflicts.push(conflict);

            // Update resolved version if conflict was resolved
            if (conflict.resolved) {
              const existing = resolved.get(name);
              if (existing) {
                existing.version = conflict.resolved;
              }
            }
          }
        }
      }
    }

    // Check for deprecated dependencies
    for (const dep of resolved.values()) {
      const trait = await this.registry.getTrait(dep.name, dep.version);
      if (trait?.deprecated) {
        warnings.push(
          `Dependency '${dep.name}@${dep.version}' is deprecated: ${trait.deprecationMessage ?? 'No message provided'}`
        );
      }
    }

    return {
      root: requirements[0] ?? { name: 'root', version: '*' },
      resolved: Array.from(resolved.values()),
      conflicts,
      warnings,
    };
  }

  /**
   * Recursively resolve a dependency and its sub-dependencies
   */
  private async resolveRecursive(
    req: TraitRef,
    requestedBy: string,
    depth: number,
    resolved: Map<string, ResolvedDependency>,
    versionRequests: Map<string, { version: string; requestedBy: string }[]>,
    visited: Set<string>,
    warnings: string[]
  ): Promise<void> {
    if (depth > this.maxDepth) {
      warnings.push(`Maximum dependency depth (${this.maxDepth}) exceeded for '${req.name}'`);
      return;
    }

    const visitKey = `${req.name}@${req.version}`;
    if (visited.has(visitKey)) {
      return; // Already processing this exact requirement
    }
    visited.add(visitKey);

    // Track version request
    if (!versionRequests.has(req.name)) {
      versionRequests.set(req.name, []);
    }
    versionRequests.get(req.name)!.push({ version: req.version, requestedBy });

    // Find best matching version
    const versions = await this.getAvailableVersions(req.name);
    const matchingVersion = this.findBestMatch(req.version, versions);

    if (!matchingVersion) {
      warnings.push(`No version of '${req.name}' satisfies '${req.version}'`);
      return;
    }

    // Get full trait package for this version
    const trait = await this.registry.getTrait(req.name, matchingVersion);
    if (!trait) {
      warnings.push(`Failed to load trait '${req.name}@${matchingVersion}'`);
      return;
    }

    // Add to resolved
    if (!resolved.has(req.name)) {
      resolved.set(req.name, {
        name: req.name,
        version: matchingVersion,
        requestedBy: [requestedBy],
        depth,
        platform: trait.platforms[0],
      });
    } else {
      resolved.get(req.name)!.requestedBy.push(requestedBy);
    }

    // Recursively resolve dependencies
    const dependencies = Object.entries(trait.dependencies);
    for (const [depName, depVersion] of dependencies) {
      await this.resolveRecursive(
        { name: depName, version: depVersion },
        req.name,
        depth + 1,
        resolved,
        versionRequests,
        visited,
        warnings
      );
    }
  }

  /**
   * Get all available versions for a trait
   */
  private async getAvailableVersions(name: string): Promise<string[]> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!.map((t) => t.version);
    }

    // Search for all versions of this trait
    const result = await this.registry.search({
      q: name,
      limit: 100,
      deprecated: false,
    });

    const versions = result.results.filter((t) => t.name === name).map((t) => t.version);

    return versions;
  }

  /**
   * Find the best matching version for a semver range
   */
  private findBestMatch(range: string, versions: string[]): string | null {
    const validVersions = versions.filter((v) => semver.valid(v));

    if (range === '*' || range === 'latest') {
      return semver.maxSatisfying(validVersions, '*');
    }

    const matching = validVersions.filter((v) => semver.satisfies(v, range));
    if (matching.length === 0) {
      return null;
    }

    if (this.resolutionStrategy === 'highest') {
      return semver.maxSatisfying(matching, '*');
    } else {
      return semver.minSatisfying(matching, '*');
    }
  }

  /**
   * Attempt to resolve a version conflict
   */
  private async resolveConflict(
    name: string,
    requests: { version: string; requestedBy: string }[]
  ): Promise<DependencyConflict | null> {
    const versions = await this.getAvailableVersions(name);

    // Find a version that satisfies all constraints
    const constraints = requests.map((r) => r.version);
    const compatible = versions.filter((v) => constraints.every((c) => semver.satisfies(v, c)));

    if (compatible.length > 0) {
      // Found compatible version
      const resolved =
        this.resolutionStrategy === 'highest'
          ? semver.maxSatisfying(compatible, '*')
          : semver.minSatisfying(compatible, '*');

      return {
        name,
        requestedVersions: requests,
        resolved: resolved ?? undefined,
        resolution: this.resolutionStrategy,
      };
    }

    // No compatible version - unresolved conflict
    return {
      name,
      requestedVersions: requests,
      resolution: 'unresolved',
    };
  }

  /**
   * Check compatibility between a set of traits
   */
  async checkCompatibility(traits: TraitRef[]): Promise<CompatibilityReport> {
    const issues: CompatibilityIssue[] = [];
    const suggestions: string[] = [];

    // Resolve dependencies first
    const tree = await this.resolve(traits);

    // Check for unresolved conflicts
    for (const conflict of tree.conflicts) {
      if (conflict.resolution === 'unresolved') {
        issues.push({
          type: 'version',
          trait: conflict.name,
          message: `Version conflict: ${conflict.requestedVersions.map((r) => `${r.version} (from ${r.requestedBy})`).join(', ')}`,
          severity: 'error',
        });
      }
    }

    // Check platform compatibility
    const platforms = new Set<Platform>();
    for (const dep of tree.resolved) {
      const trait = await this.registry.getTrait(dep.name, dep.version);
      if (trait) {
        for (const p of trait.platforms) {
          if (p !== 'all') {
            platforms.add(p);
          }
        }
      }
    }

    if (platforms.size > 1) {
      issues.push({
        type: 'platform',
        trait: 'multiple',
        message: `Multiple platforms detected: ${Array.from(platforms).join(', ')}. Ensure runtime compatibility.`,
        severity: 'warning',
      });
    }

    // Check for peer dependency issues
    for (const dep of tree.resolved) {
      const trait = await this.registry.getTrait(dep.name, dep.version);
      if (trait && Object.keys(trait.peerDependencies).length > 0) {
        for (const [peerName, peerVersion] of Object.entries(trait.peerDependencies)) {
          const resolved = tree.resolved.find((r) => r.name === peerName);
          if (!resolved) {
            issues.push({
              type: 'peer',
              trait: dep.name,
              message: `Missing peer dependency: ${peerName}@${peerVersion}`,
              severity: 'warning',
            });
            suggestions.push(`Add '${peerName}' version '${peerVersion}' to your dependencies`);
          } else if (!semver.satisfies(resolved.version, peerVersion)) {
            issues.push({
              type: 'peer',
              trait: dep.name,
              message: `Peer dependency version mismatch: ${peerName} requires ${peerVersion}, got ${resolved.version}`,
              severity: 'warning',
            });
          }
        }
      }
    }

    // Check for deprecated traits
    for (const dep of tree.resolved) {
      const trait = await this.registry.getTrait(dep.name, dep.version);
      if (trait?.deprecated) {
        issues.push({
          type: 'deprecated',
          trait: dep.name,
          message: `Deprecated: ${trait.deprecationMessage ?? 'This trait is deprecated'}`,
          severity: 'info',
        });
      }
    }

    const hasErrors = issues.some((i) => i.severity === 'error');

    return {
      compatible: !hasErrors,
      issues,
      suggestions,
    };
  }

  /**
   * Get a flat list of all dependencies in installation order
   */
  async getInstallOrder(traits: TraitRef[]): Promise<ResolvedDependency[]> {
    const tree = await this.resolve(traits);

    // Sort by depth (deepest first so dependencies are installed before dependents)
    return tree.resolved.sort((a, b) => b.depth - a.depth);
  }

  /**
   * Generate a lockfile-style output
   */
  async generateLockfile(
    traits: TraitRef[]
  ): Promise<
    Record<string, { version: string; resolved: string; dependencies: Record<string, string> }>
  > {
    const tree = await this.resolve(traits);
    const lockfile: Record<
      string,
      { version: string; resolved: string; dependencies: Record<string, string> }
    > = {};

    for (const dep of tree.resolved) {
      const trait = await this.registry.getTrait(dep.name, dep.version);
      if (trait) {
        lockfile[dep.name] = {
          version: dep.version,
          resolved: `/traits/${dep.name}/versions/${dep.version}/download`,
          dependencies: trait.dependencies,
        };
      }
    }

    return lockfile;
  }

  /**
   * Clear the version cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Parse a version requirement string
 */
export function parseVersionRequirement(requirement: string): {
  type: 'range' | 'exact' | 'tag';
  value: string;
} {
  if (requirement === 'latest' || requirement === 'next' || requirement === 'beta') {
    return { type: 'tag', value: requirement };
  }

  if (semver.valid(requirement)) {
    return { type: 'exact', value: requirement };
  }

  return { type: 'range', value: requirement };
}

/**
 * Check if a version satisfies a requirement
 */
export function satisfies(version: string, requirement: string): boolean {
  if (requirement === '*' || requirement === 'latest') {
    return true;
  }
  return semver.satisfies(version, requirement);
}

/**
 * Compare two versions
 */
export function compareVersions(a: string, b: string): number {
  return semver.compare(a, b);
}

/**
 * Get the latest version from a list
 */
export function getLatestVersion(versions: string[]): string | null {
  const valid = versions.filter((v) => semver.valid(v));
  if (valid.length === 0) return null;
  return valid.reduce((latest, current) => (semver.gt(current, latest) ? current : latest));
}
