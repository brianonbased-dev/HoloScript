/**
 * DependencyTracker
 *
 * Tracks which files depend on which other files so that a change to one
 * file can efficiently invalidate all downstream build artifacts.
 */

export interface DependencyInfo {
  /** Files that this file directly imports / references */
  dependencies: string[];
  /** Files that import this file */
  dependents: string[];
}

export class DependencyTracker {
  private graph = new Map<string, DependencyInfo>();

  private ensure(file: string): DependencyInfo {
    if (!this.graph.has(file)) {
      this.graph.set(file, { dependencies: [], dependents: [] });
    }
    return this.graph.get(file)!;
  }

  /** Record that `file` depends on `dependsOn`. */
  addDependency(file: string, dependsOn: string): void {
    const info = this.ensure(file);
    if (!info.dependencies.includes(dependsOn)) {
      info.dependencies.push(dependsOn);
    }
    const depInfo = this.ensure(dependsOn);
    if (!depInfo.dependents.includes(file)) {
      depInfo.dependents.push(file);
    }
  }

  /** Remove all dependency edges originating from `file`. */
  removeDependencies(file: string): void {
    const info = this.graph.get(file);
    if (!info) return;
    for (const dep of info.dependencies) {
      const depInfo = this.graph.get(dep);
      if (depInfo) {
        depInfo.dependents = depInfo.dependents.filter((d) => d !== file);
      }
    }
    info.dependencies = [];
  }

  getDependencies(file: string): string[] {
    return this.graph.get(file)?.dependencies ?? [];
  }

  getDependents(file: string): string[] {
    return this.graph.get(file)?.dependents ?? [];
  }

  /** All files that `file` transitively depends on. */
  getTransitiveDependencies(file: string, visited = new Set<string>()): string[] {
    if (visited.has(file)) return [];
    visited.add(file);
    const direct = this.getDependencies(file);
    const result: string[] = [...direct];
    for (const dep of direct) {
      result.push(...this.getTransitiveDependencies(dep, visited));
    }
    return [...new Set(result)];
  }

  /** All files that transitively depend on `changedFile`. */
  getAffectedFiles(changedFile: string, visited = new Set<string>()): string[] {
    if (visited.has(changedFile)) return [];
    visited.add(changedFile);
    const direct = this.getDependents(changedFile);
    const result: string[] = [...direct];
    for (const dep of direct) {
      result.push(...this.getAffectedFiles(dep, visited));
    }
    return [...new Set(result)];
  }

  toJSON(): Record<string, DependencyInfo> {
    const out: Record<string, DependencyInfo> = {};
    for (const [k, v] of this.graph) {
      out[k] = { dependencies: [...v.dependencies], dependents: [...v.dependents] };
    }
    return out;
  }

  fromJSON(data: Record<string, DependencyInfo>): void {
    this.graph.clear();
    for (const [k, v] of Object.entries(data)) {
      this.graph.set(k, { dependencies: [...v.dependencies], dependents: [...v.dependents] });
    }
  }

  clear(): void {
    this.graph.clear();
  }
}
