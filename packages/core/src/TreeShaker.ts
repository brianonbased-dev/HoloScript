/**
 * HoloScript Tree Shaking
 *
 * Removes unused code from the output by analyzing the dependency graph
 * and keeping only reachable code from entry points.
 */

import type { ASTNode } from './types';

/**
 * Reference information for an identifier
 */
interface Reference {
  name: string;
  type: 'definition' | 'usage';
  node: ASTNode;
}

/**
 * Dependency graph node
 */
interface GraphNode {
  name: string;
  node: ASTNode;
  dependencies: Set<string>;
  dependents: Set<string>;
  isEntryPoint: boolean;
  isUsed: boolean;
}

/**
 * Tree shaking options
 */
export interface TreeShakeOptions {
  /** Entry point names (if not specified, exports are entry points) */
  entryPoints?: string[];
  /** Keep all trait-decorated nodes */
  keepTraits?: boolean;
  /** Keep all exported nodes */
  keepExports?: boolean;
  /** Names to always keep */
  keepNames?: string[];
  /** Side effect free modules (can be safely removed if unused) */
  sideEffectFree?: boolean;
}

/**
 * Tree shaking result
 */
export interface TreeShakeResult {
  /** Nodes to keep */
  kept: ASTNode[];
  /** Nodes that were removed */
  removed: ASTNode[];
  /** Statistics */
  stats: {
    totalNodes: number;
    keptNodes: number;
    removedNodes: number;
    reductionPercent: number;
  };
}

/**
 * Tree Shaker for HoloScript AST
 */
export class TreeShaker {
  private graph: Map<string, GraphNode> = new Map();
  private options: Required<TreeShakeOptions>;

  constructor(options: TreeShakeOptions = {}) {
    this.options = {
      entryPoints: options.entryPoints ?? [],
      keepTraits: options.keepTraits ?? true,
      keepExports: options.keepExports ?? true,
      keepNames: options.keepNames ?? [],
      sideEffectFree: options.sideEffectFree ?? false,
    };
  }

  /**
   * Perform tree shaking on an AST
   */
  shake(ast: ASTNode[]): TreeShakeResult {
    this.graph.clear();

    // Build dependency graph
    this.buildGraph(ast);

    // Mark entry points
    this.markEntryPoints();

    // Mark reachable nodes
    this.markReachable();

    // Collect results
    const kept: ASTNode[] = [];
    const removed: ASTNode[] = [];

    for (const node of ast) {
      const name = this.getNodeName(node);
      if (name) {
        const graphNode = this.graph.get(name);
        if (graphNode?.isUsed) {
          kept.push(node);
        } else {
          removed.push(node);
        }
      } else {
        // Keep anonymous nodes (like raw expressions) if side effects possible
        if (!this.options.sideEffectFree || this.hasSideEffects(node)) {
          kept.push(node);
        } else {
          removed.push(node);
        }
      }
    }

    return {
      kept,
      removed,
      stats: {
        totalNodes: ast.length,
        keptNodes: kept.length,
        removedNodes: removed.length,
        reductionPercent: ast.length > 0 ? Math.round((removed.length / ast.length) * 100) : 0,
      },
    };
  }

  /**
   * Build the dependency graph from AST
   */
  private buildGraph(ast: ASTNode[]): void {
    // First pass: collect all definitions
    for (const node of ast) {
      const name = this.getNodeName(node);
      if (name) {
        this.graph.set(name, {
          name,
          node,
          dependencies: new Set(),
          dependents: new Set(),
          isEntryPoint: false,
          isUsed: false,
        });
      }
    }

    // Second pass: resolve dependencies
    for (const node of ast) {
      const name = this.getNodeName(node);
      if (!name) continue;

      const graphNode = this.graph.get(name);
      if (!graphNode) continue;

      const refs = this.collectReferences(node);
      for (const ref of refs) {
        if (ref.type === 'usage') {
          graphNode.dependencies.add(ref.name);

          // Add reverse edge
          const depNode = this.graph.get(ref.name);
          if (depNode) {
            depNode.dependents.add(name);
          }
        }
      }
    }
  }

  /**
   * Mark entry points in the graph
   */
  private markEntryPoints(): void {
    for (const [name, node] of this.graph) {
      // Explicit entry points
      if (this.options.entryPoints.includes(name)) {
        node.isEntryPoint = true;
        continue;
      }

      // Keep names
      if (this.options.keepNames.includes(name)) {
        node.isEntryPoint = true;
        continue;
      }

      // Check if exported
      if (this.options.keepExports && this.isExported(node.node)) {
        node.isEntryPoint = true;
        continue;
      }

      // Check if has traits
      if (this.options.keepTraits && this.hasTraits(node.node)) {
        node.isEntryPoint = true;
        continue;
      }

      // Special nodes are always entry points
      if (this.isSpecialNode(node.node)) {
        node.isEntryPoint = true;
      }
    }
  }

  /**
   * Mark all reachable nodes from entry points
   */
  private markReachable(): void {
    const visited = new Set<string>();
    const queue: string[] = [];

    // Start from entry points
    for (const [name, node] of this.graph) {
      if (node.isEntryPoint) {
        queue.push(name);
      }
    }

    // BFS to mark reachable nodes
    while (queue.length > 0) {
      const name = queue.shift()!;
      if (visited.has(name)) continue;
      visited.add(name);

      const node = this.graph.get(name);
      if (!node) continue;

      node.isUsed = true;

      // Add dependencies to queue
      for (const dep of node.dependencies) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  /**
   * Get the name of a node (if named)
   */
  private getNodeName(node: ASTNode): string | undefined {
    const n = node as ASTNode & { name?: string };
    return n.name;
  }

  /**
   * Collect all references in a node
   */
  private collectReferences(node: ASTNode): Reference[] {
    const refs: Reference[] = [];
    this.walkNode(node, (n) => {
      const name = this.getNodeName(n);
      if (name) {
        refs.push({ name, type: 'definition', node: n });
      }

      // Check for identifiers in expressions
      const identifiers = this.extractIdentifiers(n);
      for (const id of identifiers) {
        refs.push({ name: id, type: 'usage', node: n });
      }
    });
    return refs;
  }

  /**
   * Walk a node and its children
   */
  private walkNode(node: ASTNode, callback: (node: ASTNode) => void): void {
    callback(node);

    // Walk children
    for (const key of Object.keys(node)) {
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (this.isASTNode(item)) {
            this.walkNode(item, callback);
          }
        }
      } else if (this.isASTNode(value)) {
        this.walkNode(value, callback);
      }
    }
  }

  /**
   * Check if value is an AST node
   */
  private isASTNode(value: unknown): value is ASTNode {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  /**
   * Extract identifier names from a node
   */
  private extractIdentifiers(node: ASTNode): string[] {
    const identifiers: string[] = [];

    // Check common fields that might contain identifiers
    const n = node as unknown as Record<string, unknown>;

    if (typeof n.expression === 'string') {
      // Extract identifiers from expression string
      const matches = n.expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
      if (matches) {
        identifiers.push(...matches);
      }
    }

    if (typeof n.condition === 'string') {
      const matches = n.condition.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
      if (matches) {
        identifiers.push(...matches);
      }
    }

    if (typeof n.value === 'string') {
      const matches = n.value.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
      if (matches) {
        identifiers.push(...matches);
      }
    }

    // Check connections
    if (n.from && typeof n.from === 'string') {
      identifiers.push(n.from);
    }
    if (n.to && typeof n.to === 'string') {
      identifiers.push(n.to);
    }

    return identifiers;
  }

  /**
   * Check if a node is exported
   */
  private isExported(node: ASTNode): boolean {
    return node.type === 'export';
  }

  /**
   * Check if a node has traits
   */
  private hasTraits(node: ASTNode): boolean {
    const n = node as unknown as Record<string, unknown>;
    return Array.isArray(n.traits) && n.traits.length > 0;
  }

  /**
   * Check if node is a special type that should always be kept
   */
  private isSpecialNode(node: ASTNode): boolean {
    const specialTypes = ['composition', 'environment', 'settings', 'import', 'export'];
    return specialTypes.includes(node.type);
  }

  /**
   * Check if a node might have side effects
   */
  private hasSideEffects(node: ASTNode): boolean {
    const sideEffectTypes = [
      'expression-statement',
      'if-statement',
      'for-loop',
      'while-loop',
      'connection',
    ];

    if (sideEffectTypes.includes(node.type)) {
      return true;
    }

    // Check for function calls in expression
    const n = node as unknown as Record<string, unknown>;
    if (typeof n.expression === 'string') {
      // Contains function call
      if (/\w+\s*\(/.test(n.expression)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get statistics about the dependency graph
   */
  getGraphStats(): {
    nodeCount: number;
    edgeCount: number;
    entryPoints: number;
    isolatedNodes: number;
  } {
    let edgeCount = 0;
    let entryPoints = 0;
    let isolatedNodes = 0;

    for (const [, node] of this.graph) {
      edgeCount += node.dependencies.size;
      if (node.isEntryPoint) entryPoints++;
      if (node.dependencies.size === 0 && node.dependents.size === 0) {
        isolatedNodes++;
      }
    }

    return {
      nodeCount: this.graph.size,
      edgeCount,
      entryPoints,
      isolatedNodes,
    };
  }
}

/**
 * Convenience function to tree shake an AST
 */
export function treeShake(ast: ASTNode[], options?: TreeShakeOptions): TreeShakeResult {
  const shaker = new TreeShaker(options);
  return shaker.shake(ast);
}

/**
 * Dead code elimination - removes unreachable code within functions
 */
export function eliminateDeadCode(ast: ASTNode[]): ASTNode[] {
  return ast.map((node) => eliminateDeadCodeInNode(node));
}

function eliminateDeadCodeInNode(node: ASTNode): ASTNode {
  const n = node as unknown as Record<string, unknown>;

  // Check for unreachable code after return
  if (Array.isArray(n.body)) {
    const body = n.body as ASTNode[];
    const returnIndex = body.findIndex((stmt) => stmt.type === 'return-statement');
    if (returnIndex !== -1 && returnIndex < body.length - 1) {
      // Remove code after return
      return {
        ...node,
        body: body.slice(0, returnIndex + 1).map(eliminateDeadCodeInNode),
      } as unknown as ASTNode;
    }
  }

  // Recursively process children
  const processed: Record<string, unknown> = { ...node };
  for (const key of Object.keys(node)) {
    const value = n[key];
    if (Array.isArray(value)) {
      processed[key] = value.map((item: unknown) =>
        typeof item === 'object' && item !== null && 'type' in item
          ? eliminateDeadCodeInNode(item as ASTNode)
          : item
      );
    } else if (typeof value === 'object' && value !== null && 'type' in value) {
      processed[key] = eliminateDeadCodeInNode(value as ASTNode);
    }
  }

  return processed as unknown as ASTNode;
}
