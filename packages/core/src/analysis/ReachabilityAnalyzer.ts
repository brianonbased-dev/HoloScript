/**
 * Reachability Analyzer - Find unreachable (dead) code
 *
 * Sprint 5 Priority 1: Dead Code Detection
 *
 * Features:
 * - Walk graph from entry points
 * - Mark reachable nodes
 * - Report unreachable nodes as dead code
 * - Categorize dead code by type
 * - Provide removal suggestions
 *
 * @version 1.0.0
 */

import { ReferenceGraph, GraphNode, SymbolDefinition, SymbolType } from './ReferenceGraph';

/**
 * Dead code item
 */
export interface DeadCodeItem {
  type: DeadCodeType;
  symbol: SymbolDefinition;
  reason: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
  canAutoFix: boolean;
}

/**
 * Dead code types
 */
export type DeadCodeType =
  | 'unused-orb'
  | 'unused-template'
  | 'unused-function'
  | 'unused-property'
  | 'unused-variable'
  | 'unreachable-code';

/**
 * Analysis result
 */
export interface ReachabilityResult {
  reachable: SymbolDefinition[];
  unreachable: SymbolDefinition[];
  deadCode: DeadCodeItem[];
  stats: ReachabilityStats;
}

/**
 * Analysis statistics
 */
export interface ReachabilityStats {
  totalSymbols: number;
  reachableCount: number;
  unreachableCount: number;
  deadCodeByType: Record<DeadCodeType, number>;
  coveragePercent: number;
}

/**
 * Analyzer options
 */
export interface ReachabilityOptions {
  /** Ignore specific symbol names */
  ignorePatterns?: RegExp[];
  /** Ignore specific types */
  ignoreTypes?: SymbolType[];
  /** Include properties in analysis */
  includeProperties?: boolean;
  /** Include internal/private symbols (starting with _) */
  includePrivate?: boolean;
  /** Custom entry point names */
  additionalEntryPoints?: string[];
  /** Debug mode */
  debug?: boolean;
}

/**
 * Reachability Analyzer
 */
export class ReachabilityAnalyzer {
  private graph: ReferenceGraph;
  private options: Required<ReachabilityOptions>;
  private visited: Set<string> = new Set();

  constructor(graph: ReferenceGraph, options: ReachabilityOptions = {}) {
    this.graph = graph;
    this.options = {
      ignorePatterns: options.ignorePatterns ?? [],
      ignoreTypes: options.ignoreTypes ?? [],
      includeProperties: options.includeProperties ?? false,
      includePrivate: options.includePrivate ?? false,
      additionalEntryPoints: options.additionalEntryPoints ?? [],
      debug: options.debug ?? false,
    };
  }

  /**
   * Analyze reachability
   */
  analyze(): ReachabilityResult {
    this.visited.clear();

    // Mark entry points and their transitive dependencies as reachable
    const entryPoints = this.graph.getEntryPoints();
    const nodes = this.graph.getNodes();

    // Add additional entry points (supports both node IDs and symbol names)
    for (const entry of this.options.additionalEntryPoints) {
      if (nodes.has(entry)) {
        entryPoints.add(entry);
      } else {
        for (const [id, node] of nodes) {
          if (node.definition.name === entry) {
            entryPoints.add(id);
          }
        }
      }
    }

    // Walk from entry points
    for (const entryId of entryPoints) {
      this.markReachable(entryId, nodes);
    }

    // Collect results
    const reachable: SymbolDefinition[] = [];
    const unreachable: SymbolDefinition[] = [];
    const deadCode: DeadCodeItem[] = [];

    for (const [_id, node] of nodes) {
      // Skip ignored types
      if (this.options.ignoreTypes.includes(node.definition.type)) {
        continue;
      }

      // Skip ignored patterns
      if (this.isIgnored(node.definition.name)) {
        continue;
      }

      // Skip properties if not included
      if (node.definition.type === 'property' && !this.options.includeProperties) {
        continue;
      }

      // Skip private symbols if not included
      if (!this.options.includePrivate && node.definition.name.startsWith('_')) {
        continue;
      }

      if (node.isReachable) {
        reachable.push(node.definition);
      } else {
        unreachable.push(node.definition);
        deadCode.push(this.createDeadCodeItem(node));
      }
    }

    // Calculate stats
    const stats = this.calculateStats(reachable, unreachable, deadCode);

    return {
      reachable,
      unreachable,
      deadCode,
      stats,
    };
  }

  /**
   * Mark a node and its references as reachable
   */
  private markReachable(nodeId: string, nodes: Map<string, GraphNode>): void {
    if (this.visited.has(nodeId)) {
      return;
    }

    this.visited.add(nodeId);

    const node = nodes.get(nodeId);
    if (!node) {
      return;
    }

    node.isReachable = true;

    // Recursively mark all referenced nodes
    for (const refId of node.references) {
      this.markReachable(refId, nodes);
    }
  }

  /**
   * Check if a name matches ignore patterns
   */
  private isIgnored(name: string): boolean {
    for (const pattern of this.options.ignorePatterns) {
      if (pattern.test(name)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create a dead code item from a node
   */
  private createDeadCodeItem(node: GraphNode): DeadCodeItem {
    const { definition } = node;
    const type = this.getDeadCodeType(definition.type);

    return {
      type,
      symbol: definition,
      reason: this.getDeadCodeReason(node),
      severity: this.getDeadCodeSeverity(type),
      suggestion: this.getDeadCodeSuggestion(node),
      canAutoFix: this.canAutoFix(node),
    };
  }

  /**
   * Map symbol type to dead code type
   */
  private getDeadCodeType(symbolType: SymbolType): DeadCodeType {
    switch (symbolType) {
      case 'orb':
        return 'unused-orb';
      case 'template':
        return 'unused-template';
      case 'function':
        return 'unused-function';
      case 'property':
        return 'unused-property';
      case 'variable':
      case 'parameter':
        return 'unused-variable';
      default:
        return 'unreachable-code';
    }
  }

  /**
   * Get reason for dead code
   */
  private getDeadCodeReason(node: GraphNode): string {
    const { definition } = node;

    if (node.referencedBy.size === 0) {
      return `"${definition.name}" is never referenced`;
    }

    // Check if only referenced by other dead code
    const nodes = this.graph.getNodes();
    const liveReferences = Array.from(node.referencedBy).filter((refId) => {
      const refNode = nodes.get(refId);
      return refNode?.isReachable;
    });

    if (liveReferences.length === 0) {
      return `"${definition.name}" is only referenced by other dead code`;
    }

    return `"${definition.name}" is not reachable from any entry point`;
  }

  /**
   * Get severity for dead code type
   */
  private getDeadCodeSeverity(type: DeadCodeType): 'error' | 'warning' | 'info' {
    switch (type) {
      case 'unused-template':
        return 'warning';
      case 'unused-orb':
        return 'warning';
      case 'unused-function':
        return 'warning';
      case 'unused-property':
        return 'info';
      case 'unused-variable':
        return 'info';
      default:
        return 'warning';
    }
  }

  /**
   * Get suggestion for fixing dead code
   */
  private getDeadCodeSuggestion(node: GraphNode): string {
    const { definition } = node;

    switch (definition.type) {
      case 'orb':
        return `Remove unused orb "${definition.name}" or add it to a scene`;
      case 'template':
        return `Remove unused template "${definition.name}" or use it with "using" keyword`;
      case 'function':
        return `Remove unused function "${definition.name}" or call it from an event handler`;
      case 'property':
        return `Remove unused property "${definition.name}" or reference it in logic`;
      case 'variable':
        return `Remove unused variable "${definition.name}" or use it in an expression`;
      default:
        return `Review and remove "${definition.name}" if no longer needed`;
    }
  }

  /**
   * Check if dead code can be auto-fixed
   */
  private canAutoFix(node: GraphNode): boolean {
    // Properties and variables can usually be safely removed
    // Orbs and templates need more careful review
    switch (node.definition.type) {
      case 'property':
      case 'variable':
      case 'parameter':
        return true;
      case 'function':
        return node.referencedBy.size === 0;
      default:
        return false;
    }
  }

  /**
   * Calculate statistics
   */
  private calculateStats(
    reachable: SymbolDefinition[],
    unreachable: SymbolDefinition[],
    deadCode: DeadCodeItem[]
  ): ReachabilityStats {
    const deadCodeByType: Record<DeadCodeType, number> = {
      'unused-orb': 0,
      'unused-template': 0,
      'unused-function': 0,
      'unused-property': 0,
      'unused-variable': 0,
      'unreachable-code': 0,
    };

    for (const item of deadCode) {
      deadCodeByType[item.type]++;
    }

    const total = reachable.length + unreachable.length;

    return {
      totalSymbols: total,
      reachableCount: reachable.length,
      unreachableCount: unreachable.length,
      deadCodeByType,
      coveragePercent: total > 0 ? (reachable.length / total) * 100 : 100,
    };
  }

  /**
   * Get dead code items filtered by type
   */
  getDeadCodeByType(result: ReachabilityResult, type: DeadCodeType): DeadCodeItem[] {
    return result.deadCode.filter((item) => item.type === type);
  }

  /**
   * Get unused orbs
   */
  getUnusedOrbs(result: ReachabilityResult): DeadCodeItem[] {
    return this.getDeadCodeByType(result, 'unused-orb');
  }

  /**
   * Get unused templates
   */
  getUnusedTemplates(result: ReachabilityResult): DeadCodeItem[] {
    return this.getDeadCodeByType(result, 'unused-template');
  }

  /**
   * Get unused functions
   */
  getUnusedFunctions(result: ReachabilityResult): DeadCodeItem[] {
    return this.getDeadCodeByType(result, 'unused-function');
  }

  /**
   * Get unused properties
   */
  getUnusedProperties(result: ReachabilityResult): DeadCodeItem[] {
    return this.getDeadCodeByType(result, 'unused-property');
  }

  /**
   * Generate report
   */
  generateReport(result: ReachabilityResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('Dead Code Analysis Report');
    lines.push('='.repeat(60));
    lines.push('');

    // Summary
    lines.push(`Total symbols: ${result.stats.totalSymbols}`);
    lines.push(
      `Reachable: ${result.stats.reachableCount} (${result.stats.coveragePercent.toFixed(1)}%)`
    );
    lines.push(`Unreachable: ${result.stats.unreachableCount}`);
    lines.push('');

    // By type
    lines.push('Dead code by type:');
    for (const [type, count] of Object.entries(result.stats.deadCodeByType)) {
      if (count > 0) {
        lines.push(`  ${type}: ${count}`);
      }
    }
    lines.push('');

    // Details
    if (result.deadCode.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('Details:');
      lines.push('');

      for (const item of result.deadCode) {
        const { symbol } = item;
        lines.push(`${symbol.filePath}:${symbol.line}:${symbol.column}`);
        lines.push(`  ${item.severity.toUpperCase()}: ${item.reason}`);
        lines.push(`  Suggestion: ${item.suggestion}`);
        lines.push('');
      }
    } else {
      lines.push('No dead code detected! 🎉');
    }

    return lines.join('\n');
  }
}

/**
 * Create a reachability analyzer
 */
export function createReachabilityAnalyzer(
  graph: ReferenceGraph,
  options?: ReachabilityOptions
): ReachabilityAnalyzer {
  return new ReachabilityAnalyzer(graph, options);
}

/**
 * Analyze dead code in an AST
 */
export function analyzeDeadCode(
  ast: unknown,
  filePath: string = 'input.holo',
  options?: ReachabilityOptions
): ReachabilityResult {
  const graph = new ReferenceGraph();
  graph.buildFromAST(ast as any, filePath);

  const analyzer = new ReachabilityAnalyzer(graph, options);
  return analyzer.analyze();
}
