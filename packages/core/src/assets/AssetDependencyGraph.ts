/**
 * @holoscript/core Asset Dependency Graph
 *
 * Tracks and resolves asset dependencies for optimal loading order.
 * Detects circular dependencies and provides topological sorting.
 */

import { AssetMetadata } from './AssetMetadata';

// ============================================================================
// Dependency Node
// ============================================================================

export interface DependencyNode {
  /** Asset ID */
  assetId: string;

  /** Direct dependencies (assets this asset depends on) */
  dependencies: Set<string>;

  /** Dependents (assets that depend on this asset) */
  dependents: Set<string>;

  /** Is this a required dependency in any chain? */
  isRequired: boolean;

  /** Depth in dependency tree (0 = leaf) */
  depth: number;

  /** Has been visited in current traversal? */
  visited: boolean;

  /** Is currently being processed? (for cycle detection) */
  processing: boolean;
}

// ============================================================================
// Resolution Result
// ============================================================================

export interface ResolutionResult {
  /** Assets in optimal load order */
  loadOrder: string[];

  /** Detected circular dependencies */
  cycles: string[][];

  /** Missing dependencies */
  missing: Array<{
    assetId: string;
    dependencyId: string;
    required: boolean;
  }>;

  /** Dependency statistics */
  stats: {
    totalAssets: number;
    totalDependencies: number;
    maxDepth: number;
    hasCycles: boolean;
  };
}

// ============================================================================
// Asset Dependency Graph
// ============================================================================

export class AssetDependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private assets: Map<string, AssetMetadata> = new Map();

  /**
   * Add an asset to the graph
   */
  addAsset(asset: AssetMetadata): void {
    this.assets.set(asset.id, asset);

    // Create or update node
    this.getOrCreateNode(asset.id);

    // Add dependencies
    for (const dep of asset.dependencies) {
      this.addDependency(asset.id, dep.assetId, dep.required);
    }

    // Add texture dependencies
    for (const texId of asset.textureDependencies) {
      this.addDependency(asset.id, texId, true);
    }

    // Add shader dependencies
    for (const shaderId of asset.shaderDependencies) {
      this.addDependency(asset.id, shaderId, true);
    }
  }

  /**
   * Add multiple assets
   */
  addAssets(assets: AssetMetadata[]): void {
    for (const asset of assets) {
      this.addAsset(asset);
    }
  }

  /**
   * Remove an asset from the graph
   */
  removeAsset(assetId: string): void {
    const node = this.nodes.get(assetId);
    if (!node) return;

    // Remove from dependents of dependencies
    for (const depId of node.dependencies) {
      const depNode = this.nodes.get(depId);
      if (depNode) {
        depNode.dependents.delete(assetId);
      }
    }

    // Remove from dependencies of dependents
    for (const depId of node.dependents) {
      const depNode = this.nodes.get(depId);
      if (depNode) {
        depNode.dependencies.delete(assetId);
      }
    }

    this.nodes.delete(assetId);
    this.assets.delete(assetId);
  }

  /**
   * Add a dependency relationship
   */
  addDependency(assetId: string, dependencyId: string, required: boolean): void {
    const assetNode = this.getOrCreateNode(assetId);
    const depNode = this.getOrCreateNode(dependencyId);

    assetNode.dependencies.add(dependencyId);
    depNode.dependents.add(assetId);

    if (required) {
      depNode.isRequired = true;
    }
  }

  /**
   * Remove a dependency relationship
   */
  removeDependency(assetId: string, dependencyId: string): void {
    const assetNode = this.nodes.get(assetId);
    const depNode = this.nodes.get(dependencyId);

    if (assetNode) {
      assetNode.dependencies.delete(dependencyId);
    }

    if (depNode) {
      depNode.dependents.delete(assetId);
    }
  }

  /**
   * Get or create a node
   */
  private getOrCreateNode(assetId: string): DependencyNode {
    let node = this.nodes.get(assetId);
    if (!node) {
      node = {
        assetId,
        dependencies: new Set(),
        dependents: new Set(),
        isRequired: false,
        depth: 0,
        visited: false,
        processing: false,
      };
      this.nodes.set(assetId, node);
    }
    return node;
  }

  /**
   * Get direct dependencies of an asset
   */
  getDependencies(assetId: string): string[] {
    const node = this.nodes.get(assetId);
    return node ? Array.from(node.dependencies) : [];
  }

  /**
   * Get direct dependents of an asset
   */
  getDependents(assetId: string): string[] {
    const node = this.nodes.get(assetId);
    return node ? Array.from(node.dependents) : [];
  }

  /**
   * Get all transitive dependencies (deep)
   */
  getTransitiveDependencies(assetId: string): string[] {
    const result = new Set<string>();
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) return;

      for (const depId of node.dependencies) {
        if (depId !== assetId) {
          result.add(depId);
          traverse(depId);
        }
      }
    };

    traverse(assetId);
    return Array.from(result);
  }

  /**
   * Get all transitive dependents (deep)
   */
  getTransitiveDependents(assetId: string): string[] {
    const result = new Set<string>();
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) return;

      for (const depId of node.dependents) {
        if (depId !== assetId) {
          result.add(depId);
          traverse(depId);
        }
      }
    };

    traverse(assetId);
    return Array.from(result);
  }

  /**
   * Check if asset has dependency on another
   */
  hasDependency(assetId: string, dependencyId: string, transitive = false): boolean {
    if (transitive) {
      return this.getTransitiveDependencies(assetId).includes(dependencyId);
    }
    return this.getDependencies(assetId).includes(dependencyId);
  }

  /**
   * Detect circular dependencies
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (assetId: string): boolean => {
      visited.add(assetId);
      recursionStack.add(assetId);
      path.push(assetId);

      const node = this.nodes.get(assetId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) {
              return true;
            }
          } else if (recursionStack.has(depId)) {
            // Found cycle
            const cycleStart = path.indexOf(depId);
            cycles.push([...path.slice(cycleStart), depId]);
          }
        }
      }

      path.pop();
      recursionStack.delete(assetId);
      return false;
    };

    for (const assetId of this.nodes.keys()) {
      if (!visited.has(assetId)) {
        dfs(assetId);
      }
    }

    return cycles;
  }

  /**
   * Compute depth for all nodes
   */
  private computeDepths(): void {
    // Reset all depths
    for (const node of this.nodes.values()) {
      node.depth = 0;
      node.visited = false;
    }

    // Find leaf nodes (no dependencies)
    const leafNodes: string[] = [];
    for (const [id, node] of this.nodes) {
      if (node.dependencies.size === 0) {
        leafNodes.push(id);
      }
    }

    // BFS from leaves to compute depths
    const queue: string[] = [...leafNodes];

    while (queue.length > 0) {
      const assetId = queue.shift()!;
      const node = this.nodes.get(assetId)!;

      for (const depId of node.dependents) {
        const depNode = this.nodes.get(depId);
        if (depNode) {
          const newDepth = node.depth + 1;
          if (newDepth > depNode.depth) {
            depNode.depth = newDepth;
          }
          if (!depNode.visited) {
            depNode.visited = true;
            queue.push(depId);
          }
        }
      }
    }
  }

  /**
   * Get topological sort (optimal load order)
   */
  topologicalSort(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const cycles = this.detectCycles();

    if (cycles.length > 0) {
      console.warn('Circular dependencies detected, load order may not be optimal');
    }

    const visit = (assetId: string) => {
      if (visited.has(assetId)) return;
      visited.add(assetId);

      const node = this.nodes.get(assetId);
      if (node) {
        // Visit dependencies first
        for (const depId of node.dependencies) {
          visit(depId);
        }
      }

      result.push(assetId);
    };

    // Visit all nodes
    for (const assetId of this.nodes.keys()) {
      visit(assetId);
    }

    return result;
  }

  /**
   * Resolve dependencies and get optimal load order
   */
  resolve(rootAssetIds?: string[]): ResolutionResult {
    const cycles = this.detectCycles();
    const missing: ResolutionResult['missing'] = [];

    // Check for missing dependencies
    for (const [assetId, node] of this.nodes) {
      for (const depId of node.dependencies) {
        if (!this.assets.has(depId)) {
          const asset = this.assets.get(assetId);
          const dep = asset?.dependencies.find((d) => d.assetId === depId);
          missing.push({
            assetId,
            dependencyId: depId,
            required: dep?.required ?? false,
          });
        }
      }
    }

    // Get load order
    let loadOrder: string[];

    if (rootAssetIds && rootAssetIds.length > 0) {
      // Only include dependencies of root assets
      const needed = new Set<string>();
      for (const rootId of rootAssetIds) {
        needed.add(rootId);
        for (const depId of this.getTransitiveDependencies(rootId)) {
          needed.add(depId);
        }
      }

      loadOrder = this.topologicalSort().filter((id) => needed.has(id));
    } else {
      loadOrder = this.topologicalSort();
    }

    // Compute stats
    this.computeDepths();
    let maxDepth = 0;
    let totalDependencies = 0;

    for (const node of this.nodes.values()) {
      maxDepth = Math.max(maxDepth, node.depth);
      totalDependencies += node.dependencies.size;
    }

    return {
      loadOrder,
      cycles,
      missing,
      stats: {
        totalAssets: this.nodes.size,
        totalDependencies,
        maxDepth,
        hasCycles: cycles.length > 0,
      },
    };
  }

  /**
   * Get load order for a single asset and its dependencies
   */
  getLoadOrderFor(assetId: string): string[] {
    const result = this.resolve([assetId]);
    return result.loadOrder;
  }

  /**
   * Get assets that can be loaded in parallel (same depth level)
   */
  getParallelLoadGroups(): string[][] {
    this.computeDepths();

    const groups = new Map<number, string[]>();

    for (const [assetId, node] of this.nodes) {
      const depth = node.depth;
      if (!groups.has(depth)) {
        groups.set(depth, []);
      }
      groups.get(depth)!.push(assetId);
    }

    // Sort by depth and return
    const sortedDepths = Array.from(groups.keys()).sort((a, b) => a - b);
    return sortedDepths.map((depth) => groups.get(depth)!);
  }

  /**
   * Check if graph is acyclic
   */
  isAcyclic(): boolean {
    return this.detectCycles().length === 0;
  }

  /**
   * Get leaf nodes (no dependencies)
   */
  getLeafNodes(): string[] {
    const leaves: string[] = [];
    for (const [assetId, node] of this.nodes) {
      if (node.dependencies.size === 0) {
        leaves.push(assetId);
      }
    }
    return leaves;
  }

  /**
   * Get root nodes (no dependents)
   */
  getRootNodes(): string[] {
    const roots: string[] = [];
    for (const [assetId, node] of this.nodes) {
      if (node.dependents.size === 0) {
        roots.push(assetId);
      }
    }
    return roots;
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.assets.clear();
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    leafCount: number;
    rootCount: number;
    maxDepth: number;
    hasCycles: boolean;
  } {
    this.computeDepths();

    let edgeCount = 0;
    let maxDepth = 0;

    for (const node of this.nodes.values()) {
      edgeCount += node.dependencies.size;
      maxDepth = Math.max(maxDepth, node.depth);
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount,
      leafCount: this.getLeafNodes().length,
      rootCount: this.getRootNodes().length,
      maxDepth,
      hasCycles: !this.isAcyclic(),
    };
  }

  /**
   * Export graph to DOT format (for visualization)
   */
  toDOT(): string {
    const lines: string[] = ['digraph AssetDependencies {'];
    lines.push('  rankdir=BT;');
    lines.push('  node [shape=box];');

    for (const [assetId, node] of this.nodes) {
      const label = assetId.replace(/"/g, '\\"');
      const color = node.isRequired ? 'red' : 'black';
      lines.push(`  "${label}" [color=${color}];`);

      for (const depId of node.dependencies) {
        const depLabel = depId.replace(/"/g, '\\"');
        lines.push(`  "${label}" -> "${depLabel}";`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new dependency graph
 */
export function createDependencyGraph(): AssetDependencyGraph {
  return new AssetDependencyGraph();
}

/**
 * Build dependency graph from assets
 */
export function buildDependencyGraph(assets: AssetMetadata[]): AssetDependencyGraph {
  const graph = new AssetDependencyGraph();
  graph.addAssets(assets);
  return graph;
}

/**
 * Get optimal load order for assets
 */
export function getOptimalLoadOrder(assets: AssetMetadata[]): string[] {
  const graph = buildDependencyGraph(assets);
  return graph.resolve().loadOrder;
}
