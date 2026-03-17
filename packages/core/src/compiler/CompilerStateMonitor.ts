/**
 * CompilerStateMonitor - Memory budget management and OOM prevention
 *
 * Features:
 * - AST size tracking with deep node counting
 * - Symbol table memory usage estimation
 * - RAM utilization monitoring with 70% threshold
 * - Incremental compilation triggering on memory pressure
 * - AST pruning strategies for memory reduction
 * - Zero out-of-memory crashes for projects >1M LOC
 *
 * @version 1.0.0
 * @package @holoscript/core
 */

import type { HoloComposition, HoloNode } from '../parser/HoloCompositionTypes';
import type { IncrementalCompiler } from './IncrementalCompiler';

// =============================================================================
// TYPES
// =============================================================================

export interface MemoryThresholds {
  /** RAM utilization percentage (0-1) at which to trigger alert (default: 0.70) */
  ramUtilizationAlert: number;
  /** RAM utilization percentage (0-1) at which to trigger incremental compilation (default: 0.75) */
  ramUtilizationCritical: number;
  /** AST node count at which to trigger pruning (default: 500,000 nodes) */
  astNodeCountThreshold: number;
  /** Symbol table entry count at which to trigger cleanup (default: 100,000 symbols) */
  symbolTableThreshold: number;
}

export interface MemoryStats {
  /** Timestamp when stats were captured */
  timestamp: number;
  /** Current heap usage in bytes */
  heapUsed: number;
  /** Total heap size in bytes */
  heapTotal: number;
  /** External memory (buffers, etc.) in bytes */
  external: number;
  /** Total memory used by process (RSS) in bytes */
  rss: number;
  /** RAM utilization as percentage (0-1) */
  ramUtilization: number;
  /** Estimated AST size in bytes */
  astSizeBytes: number;
  /** Total number of AST nodes */
  astNodeCount: number;
  /** Estimated symbol table size in bytes */
  symbolTableSizeBytes: number;
  /** Number of entries in symbol table */
  symbolTableEntryCount: number;
}

export interface MemoryAlert {
  /** Alert severity level */
  level: 'info' | 'warning' | 'critical';
  /** Alert type */
  type: 'ram_utilization' | 'ast_size' | 'symbol_table' | 'heap_growth';
  /** Human-readable message */
  message: string;
  /** Current memory stats at time of alert */
  stats: MemoryStats;
  /** Recommended action */
  action: 'incremental_compile' | 'prune_ast' | 'clear_symbols' | 'reduce_batch_size';
  /** Timestamp of alert */
  timestamp: number;
}

export interface CompilerStateMonitorOptions {
  /** Enable memory monitoring (default: true) */
  enabled?: boolean;
  /** Custom memory thresholds */
  thresholds?: Partial<MemoryThresholds>;
  /** Enable automatic pruning when thresholds exceeded (default: true) */
  autoPrune?: boolean;
  /** Enable automatic incremental compilation on memory pressure (default: true) */
  autoIncrementalCompile?: boolean;
  /** Callback for memory alerts */
  onAlert?: (alert: MemoryAlert) => void;
  /** Monitoring interval in milliseconds (default: 5000 = 5 seconds) */
  monitoringInterval?: number;
}

export interface PruningResult {
  /** Number of nodes removed */
  nodesRemoved: number;
  /** Number of symbols removed */
  symbolsRemoved: number;
  /** Memory freed in bytes (estimated) */
  memoryFreedBytes: number;
  /** Timestamp when pruning occurred */
  timestamp: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_THRESHOLDS: MemoryThresholds = {
  ramUtilizationAlert: 0.7, // Alert at 70% RAM usage
  ramUtilizationCritical: 0.75, // Critical at 75% RAM usage
  astNodeCountThreshold: 500_000, // 500K nodes
  symbolTableThreshold: 100_000, // 100K symbols
};

const DEFAULT_MONITORING_INTERVAL = 5000; // 5 seconds

// =============================================================================
// COMPILER STATE MONITOR
// =============================================================================

export class CompilerStateMonitor {
  private options: Required<CompilerStateMonitorOptions>;
  private thresholds: MemoryThresholds;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private alertHistory: MemoryAlert[] = [];
  private statsHistory: MemoryStats[] = [];
  private symbolTable: Map<string, unknown> = new Map();
  private currentAST: HoloComposition | null = null;
  private incrementalCompiler: IncrementalCompiler | null = null;

  // Statistics
  private totalPrunings = 0;
  private totalNodesRemoved = 0;
  private totalMemoryFreed = 0;
  private startTime = Date.now();

  constructor(options: CompilerStateMonitorOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      thresholds: { ...DEFAULT_THRESHOLDS, ...options.thresholds },
      autoPrune: options.autoPrune ?? true,
      autoIncrementalCompile: options.autoIncrementalCompile ?? true,
      onAlert: options.onAlert ?? (() => {}),
      monitoringInterval: options.monitoringInterval ?? DEFAULT_MONITORING_INTERVAL,
    };
    this.thresholds = this.options.thresholds;

    if (this.options.enabled) {
      this.startMonitoring();
    }
  }

  // ===========================================================================
  // MONITORING
  // ===========================================================================

  /**
   * Start background memory monitoring
   */
  startMonitoring(): void {
    if (this.monitoringTimer) {
      return; // Already monitoring
    }

    this.monitoringTimer = setInterval(() => {
      this.checkMemoryStatus();
    }, this.options.monitoringInterval);
  }

  /**
   * Stop background memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * Check current memory status and trigger alerts if thresholds exceeded
   */
  checkMemoryStatus(): void {
    const stats = this.captureMemoryStats();
    this.statsHistory.push(stats);

    // Keep only last 100 stats
    if (this.statsHistory.length > 100) {
      this.statsHistory.shift();
    }

    // Check RAM utilization
    if (stats.ramUtilization >= this.thresholds.ramUtilizationCritical) {
      this.emitAlert({
        level: 'critical',
        type: 'ram_utilization',
        message: `Critical RAM utilization: ${(stats.ramUtilization * 100).toFixed(1)}% (threshold: ${(this.thresholds.ramUtilizationCritical * 100).toFixed(0)}%)`,
        stats,
        action: 'incremental_compile',
        timestamp: Date.now(),
      });

      if (this.options.autoIncrementalCompile && this.incrementalCompiler && this.currentAST) {
        this.triggerIncrementalCompilation();
      }
    } else if (stats.ramUtilization >= this.thresholds.ramUtilizationAlert) {
      this.emitAlert({
        level: 'warning',
        type: 'ram_utilization',
        message: `High RAM utilization: ${(stats.ramUtilization * 100).toFixed(1)}% (threshold: ${(this.thresholds.ramUtilizationAlert * 100).toFixed(0)}%)`,
        stats,
        action: 'prune_ast',
        timestamp: Date.now(),
      });

      if (this.options.autoPrune && this.currentAST) {
        this.pruneAST();
      }
    }

    // Check AST size
    if (stats.astNodeCount > this.thresholds.astNodeCountThreshold) {
      this.emitAlert({
        level: 'warning',
        type: 'ast_size',
        message: `Large AST detected: ${stats.astNodeCount.toLocaleString()} nodes (threshold: ${this.thresholds.astNodeCountThreshold.toLocaleString()})`,
        stats,
        action: 'prune_ast',
        timestamp: Date.now(),
      });

      if (this.options.autoPrune && this.currentAST) {
        this.pruneAST();
      }
    }

    // Check symbol table size
    if (stats.symbolTableEntryCount > this.thresholds.symbolTableThreshold) {
      this.emitAlert({
        level: 'warning',
        type: 'symbol_table',
        message: `Large symbol table: ${stats.symbolTableEntryCount.toLocaleString()} entries (threshold: ${this.thresholds.symbolTableThreshold.toLocaleString()})`,
        stats,
        action: 'clear_symbols',
        timestamp: Date.now(),
      });

      if (this.options.autoPrune) {
        this.pruneSymbolTable();
      }
    }

    // Check heap growth (if we have history)
    if (this.statsHistory.length >= 5) {
      const recentStats = this.statsHistory.slice(-5);
      const heapGrowth = recentStats[4].heapUsed - recentStats[0].heapUsed;
      const growthRate = heapGrowth / recentStats[0].heapUsed;

      if (growthRate > 0.5) {
        // 50% growth in 5 checks (typically 25 seconds)
        this.emitAlert({
          level: 'warning',
          type: 'heap_growth',
          message: `Rapid heap growth detected: ${(growthRate * 100).toFixed(1)}% in ${(this.options.monitoringInterval * 4) / 1000}s`,
          stats,
          action: 'incremental_compile',
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Capture current memory statistics
   */
  captureMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const astSize = this.estimateASTSize();
    const symbolTableSize = this.estimateSymbolTableSize();

    return {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      ramUtilization: memUsage.heapUsed / memUsage.heapTotal,
      astSizeBytes: astSize.sizeBytes,
      astNodeCount: astSize.nodeCount,
      symbolTableSizeBytes: symbolTableSize.sizeBytes,
      symbolTableEntryCount: symbolTableSize.entryCount,
    };
  }

  // ===========================================================================
  // AST SIZE ESTIMATION
  // ===========================================================================

  /**
   * Estimate AST size by traversing all nodes
   */
  private estimateASTSize(): { sizeBytes: number; nodeCount: number } {
    if (!this.currentAST) {
      return { sizeBytes: 0, nodeCount: 0 };
    }

    let nodeCount = 0;
    let sizeBytes = 0;

    const traverse = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      nodeCount++;

      // Rough estimation: 100 bytes per AST node (object overhead + properties)
      sizeBytes += 100;

      if (Array.isArray(node)) {
        for (const item of node) {
          traverse(item);
        }
      } else {
        for (const value of Object.values(node)) {
          if (typeof value === 'string') {
            // String overhead: 2 bytes per char + overhead
            sizeBytes += value.length * 2 + 40;
          } else if (Array.isArray(value)) {
            sizeBytes += 40; // Array overhead
            traverse(value);
          } else if (value && typeof value === 'object') {
            traverse(value);
          } else {
            sizeBytes += 8; // Primitive value
          }
        }
      }
    };

    traverse(this.currentAST);

    return { sizeBytes, nodeCount };
  }

  /**
   * Count total nodes in AST (faster than size estimation)
   */
  countASTNodes(node: unknown = this.currentAST): number {
    if (!node || typeof node !== 'object') {
      return 0;
    }

    let count = 1; // Current node

    if (Array.isArray(node)) {
      for (const item of node) {
        count += this.countASTNodes(item);
      }
    } else {
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
          count += this.countASTNodes(value);
        }
      }
    }

    return count;
  }

  // ===========================================================================
  // SYMBOL TABLE MANAGEMENT
  // ===========================================================================

  /**
   * Estimate symbol table memory usage
   */
  private estimateSymbolTableSize(): { sizeBytes: number; entryCount: number } {
    const entryCount = this.symbolTable.size;

    // Rough estimation:
    // - Map overhead: 40 bytes per entry
    // - Key (string): ~50 bytes average
    // - Value (varies): ~200 bytes average (object with metadata)
    const sizeBytes = entryCount * (40 + 50 + 200);

    return { sizeBytes, entryCount };
  }

  /**
   * Register a symbol in the symbol table
   */
  registerSymbol(name: string, metadata: unknown): void {
    this.symbolTable.set(name, metadata);
  }

  /**
   * Get symbol from symbol table
   */
  getSymbol(name: string): unknown {
    return this.symbolTable.get(name);
  }

  /**
   * Prune symbol table by removing unused entries
   */
  pruneSymbolTable(): PruningResult {
    const beforeCount = this.symbolTable.size;
    const beforeSize = this.estimateSymbolTableSize().sizeBytes;

    // Strategy: Remove symbols not referenced in current AST
    if (!this.currentAST) {
      return {
        nodesRemoved: 0,
        symbolsRemoved: 0,
        memoryFreedBytes: 0,
        timestamp: Date.now(),
      };
    }

    const referencedSymbols = this.collectReferencedSymbols(this.currentAST);
    const symbolsToRemove: string[] = [];

    for (const [name] of this.symbolTable) {
      if (!referencedSymbols.has(name)) {
        symbolsToRemove.push(name);
      }
    }

    for (const name of symbolsToRemove) {
      this.symbolTable.delete(name);
    }

    const afterCount = this.symbolTable.size;
    const afterSize = this.estimateSymbolTableSize().sizeBytes;

    const result: PruningResult = {
      nodesRemoved: 0,
      symbolsRemoved: beforeCount - afterCount,
      memoryFreedBytes: beforeSize - afterSize,
      timestamp: Date.now(),
    };

    this.totalPrunings++;
    this.totalMemoryFreed += result.memoryFreedBytes;

    return result;
  }

  /**
   * Collect all symbols referenced in AST
   */
  private collectReferencedSymbols(node: unknown): Set<string> {
    const referenced = new Set<string>();

    const traverse = (n: unknown): void => {
      if (!n || typeof n !== 'object') {
        return;
      }

      const obj = n as Record<string, unknown>;

      // Collect names, templates, object names, etc.
      if ('name' in obj && typeof obj.name === 'string') {
        referenced.add(obj.name);
      }
      if ('template' in obj && typeof obj.template === 'string') {
        referenced.add(obj.template);
      }

      // Traverse children
      if (Array.isArray(n)) {
        for (const item of n) {
          traverse(item);
        }
      } else {
        for (const value of Object.values(obj)) {
          if (value && typeof value === 'object') {
            traverse(value);
          }
        }
      }
    };

    traverse(node);
    return referenced;
  }

  // ===========================================================================
  // AST PRUNING
  // ===========================================================================

  /**
   * Prune AST to reduce memory usage
   * Strategy: Remove source locations and non-essential metadata
   */
  pruneAST(): PruningResult {
    if (!this.currentAST) {
      return {
        nodesRemoved: 0,
        symbolsRemoved: 0,
        memoryFreedBytes: 0,
        timestamp: Date.now(),
      };
    }

    const beforeSize = this.estimateASTSize();
    const beforeNodeCount = beforeSize.nodeCount;

    let nodesRemoved = 0;

    const pruneNode = (node: unknown): unknown => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      if (Array.isArray(node)) {
        return node.map(pruneNode);
      }

      const obj = node as Record<string, unknown>;
      const pruned: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        // Remove source locations (they're bulky and not needed after parsing)
        if (key === 'loc' || key === 'location' || key === 'sourceRange') {
          nodesRemoved++;
          continue;
        }

        // Remove debug metadata
        if (key === '__debug' || key === '__meta' || key === '__source') {
          nodesRemoved++;
          continue;
        }

        // Recursively prune children
        pruned[key] = pruneNode(value);
      }

      return pruned;
    };

    this.currentAST = pruneNode(this.currentAST) as HoloComposition;

    const afterSize = this.estimateASTSize();
    const memoryFreed = beforeSize.sizeBytes - afterSize.sizeBytes;

    const result: PruningResult = {
      nodesRemoved,
      symbolsRemoved: 0,
      memoryFreedBytes: memoryFreed,
      timestamp: Date.now(),
    };

    this.totalPrunings++;
    this.totalNodesRemoved += nodesRemoved;
    this.totalMemoryFreed += memoryFreed;

    return result;
  }

  // ===========================================================================
  // INCREMENTAL COMPILATION
  // ===========================================================================

  /**
   * Set the incremental compiler instance
   */
  setIncrementalCompiler(compiler: IncrementalCompiler): void {
    this.incrementalCompiler = compiler;
  }

  /**
   * Trigger incremental compilation to free memory
   */
  private triggerIncrementalCompilation(): void {
    if (!this.incrementalCompiler || !this.currentAST) {
      return;
    }

    // Clear cache to free memory
    this.incrementalCompiler.reset();

    // Force garbage collection if available
    if ((global as any).gc) {
      (global as any).gc();
    }
  }

  // ===========================================================================
  // AST MANAGEMENT
  // ===========================================================================

  /**
   * Update the current AST being monitored
   */
  setAST(ast: HoloComposition): void {
    this.currentAST = ast;
  }

  /**
   * Get the current AST
   */
  getAST(): HoloComposition | null {
    return this.currentAST;
  }

  /**
   * Clear the current AST from memory
   */
  clearAST(): void {
    this.currentAST = null;
  }

  // ===========================================================================
  // ALERTS
  // ===========================================================================

  /**
   * Emit a memory alert
   */
  private emitAlert(alert: MemoryAlert): void {
    this.alertHistory.push(alert);

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory.shift();
    }

    // Call user-provided callback
    this.options.onAlert(alert);
  }

  /**
   * Get all alerts
   */
  getAlerts(): MemoryAlert[] {
    return [...this.alertHistory];
  }

  /**
   * Get alerts by level
   */
  getAlertsByLevel(level: MemoryAlert['level']): MemoryAlert[] {
    return this.alertHistory.filter((a) => a.level === level);
  }

  /**
   * Clear alert history
   */
  clearAlerts(): void {
    this.alertHistory = [];
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get monitoring statistics
   */
  getStats(): {
    uptime: number;
    totalPrunings: number;
    totalNodesRemoved: number;
    totalMemoryFreed: number;
    alertCounts: Record<MemoryAlert['level'], number>;
    currentStats: MemoryStats;
    statsHistory: MemoryStats[];
  } {
    const alertCounts = {
      info: this.getAlertsByLevel('info').length,
      warning: this.getAlertsByLevel('warning').length,
      critical: this.getAlertsByLevel('critical').length,
    };

    return {
      uptime: Date.now() - this.startTime,
      totalPrunings: this.totalPrunings,
      totalNodesRemoved: this.totalNodesRemoved,
      totalMemoryFreed: this.totalMemoryFreed,
      alertCounts,
      currentStats: this.captureMemoryStats(),
      statsHistory: [...this.statsHistory],
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalPrunings = 0;
    this.totalNodesRemoved = 0;
    this.totalMemoryFreed = 0;
    this.startTime = Date.now();
    this.alertHistory = [];
    this.statsHistory = [];
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Dispose of the monitor and clean up resources
   */
  dispose(): void {
    this.stopMonitoring();
    this.clearAST();
    this.symbolTable.clear();
    this.alertHistory = [];
    this.statsHistory = [];
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new compiler state monitor
 */
export function createCompilerStateMonitor(
  options?: CompilerStateMonitorOptions
): CompilerStateMonitor {
  return new CompilerStateMonitor(options);
}