/**
 * @holoscript/studio-bridge - Bidirectional Sync Engine
 *
 * Manages live synchronization between the visual graph editor and the HoloScript
 * AST/code representation. Supports three sync modes:
 *
 * - visual-to-ast: Changes in the visual editor propagate to AST/code
 * - ast-to-visual: Changes in AST/code propagate to the visual editor
 * - bidirectional: Both directions, with conflict resolution
 *
 * The sync engine:
 * 1. Tracks changes from both sides using an event queue
 * 2. Debounces rapid changes to avoid thrashing
 * 3. Applies changes incrementally (diff-based) when possible
 * 4. Falls back to full re-translation when incremental sync is not feasible
 * 5. Emits change events for external subscribers (e.g., UI updates, undo/redo)
 */

import type {
  ASTNode,
  VisualGraph,
  BridgeChangeEvent,
  SyncState,
  SyncOptions,
  BridgeMapping,
  BridgeDiagnostic,
  VisualToASTResult,
  ASTToVisualResult,
} from './types';
import { VisualToAST } from './VisualToAST';
import { ASTToVisual } from './ASTToVisual';

// ============================================================================
// Default Sync Options
// ============================================================================

const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  direction: 'bidirectional',
  debounceMs: 300,
  generateSourceMaps: true,
  codeFormat: 'hsplus',
  preserveComments: true,
};

// ============================================================================
// Event Listener Types
// ============================================================================

export type SyncEventType =
  | 'sync-start'
  | 'sync-complete'
  | 'sync-error'
  | 'change'
  | 'mapping-updated'
  | 'diagnostics';

export type SyncEventListener = (event: SyncEvent) => void;

export interface SyncEvent {
  type: SyncEventType;
  timestamp: number;
  data?: unknown;
}

// ============================================================================
// Sync Engine
// ============================================================================

export class SyncEngine {
  private options: SyncOptions;
  private state: SyncState;
  private visualToAST: VisualToAST;
  private astToVisual: ASTToVisual;
  private mappings: BridgeMapping[] = [];
  private diagnostics: BridgeDiagnostic[] = [];
  private changeQueue: BridgeChangeEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<SyncEventType, Set<SyncEventListener>> = new Map();
  private lastVisualGraph: VisualGraph | null = null;
  private lastASTNodes: ASTNode[] | null = null;
  private lastGeneratedCode: string = '';
  private syncing = false;

  constructor(options: Partial<SyncOptions> = {}) {
    this.options = { ...DEFAULT_SYNC_OPTIONS, ...options };
    this.state = {
      active: false,
      direction: this.options.direction,
      lastSyncTimestamp: 0,
      pendingChanges: 0,
    };

    this.visualToAST = new VisualToAST({
      format: this.options.codeFormat,
      includeComments: this.options.preserveComments,
      generateSourceMap: this.options.generateSourceMaps,
    });

    this.astToVisual = new ASTToVisual({
      layout: 'auto',
      autoConnect: true,
    });
  }

  // ==========================================================================
  // Public: Lifecycle
  // ==========================================================================

  /**
   * Start the sync engine
   */
  public start(): void {
    this.state.active = true;
    this.emit('sync-start', { direction: this.options.direction });
  }

  /**
   * Stop the sync engine
   */
  public stop(): void {
    this.state.active = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.changeQueue = [];
  }

  /**
   * Get current sync state
   */
  public getState(): Readonly<SyncState> {
    return { ...this.state };
  }

  /**
   * Get current mappings
   */
  public getMappings(): readonly BridgeMapping[] {
    return this.mappings;
  }

  /**
   * Get current diagnostics
   */
  public getDiagnostics(): readonly BridgeDiagnostic[] {
    return this.diagnostics;
  }

  /**
   * Get the last generated code
   */
  public getGeneratedCode(): string {
    return this.lastGeneratedCode;
  }

  // ==========================================================================
  // Public: Event System
  // ==========================================================================

  /**
   * Subscribe to sync events
   */
  public on(event: SyncEventType, listener: SyncEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  /**
   * Remove an event listener
   */
  public off(event: SyncEventType, listener: SyncEventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  // ==========================================================================
  // Public: Sync Operations
  // ==========================================================================

  /**
   * Notify the engine that the visual graph has changed.
   * Debounces and batches changes before translating to AST.
   */
  public onVisualChanged(graph: VisualGraph): void {
    if (!this.state.active) return;
    if (this.options.direction === 'ast-to-visual') return;

    this.lastVisualGraph = graph;
    this.state.pendingChanges++;

    this.scheduleSync('visual');
  }

  /**
   * Notify the engine that the AST has changed.
   * Debounces and batches changes before translating to visual.
   */
  public onASTChanged(astNodes: ASTNode[]): void {
    if (!this.state.active) return;
    if (this.options.direction === 'visual-to-ast') return;

    this.lastASTNodes = astNodes;
    this.state.pendingChanges++;

    this.scheduleSync('ast');
  }

  /**
   * Notify the engine that HoloScript code has changed.
   * Parses the code and updates the visual graph.
   */
  public onCodeChanged(code: string): void {
    if (!this.state.active) return;
    if (this.options.direction === 'visual-to-ast') return;

    // Parse code to get AST, then propagate
    const result = this.astToVisual.translateFromCode(code);
    if (result.diagnostics.some((d) => d.severity === 'error')) {
      this.diagnostics = result.diagnostics;
      this.emit('diagnostics', { diagnostics: this.diagnostics });
      return;
    }

    this.lastVisualGraph = result.graph;
    this.mappings = result.mappings;
    this.diagnostics = result.diagnostics;

    this.emit('sync-complete', {
      direction: 'code-to-visual',
      graph: result.graph,
    });
    this.emit('mapping-updated', { mappings: this.mappings });
    if (this.diagnostics.length > 0) {
      this.emit('diagnostics', { diagnostics: this.diagnostics });
    }
  }

  /**
   * Force an immediate sync in a specific direction
   */
  public syncNow(direction: 'visual-to-ast' | 'ast-to-visual'): VisualToASTResult | ASTToVisualResult | null {
    if (this.syncing) return null;

    if (direction === 'visual-to-ast' && this.lastVisualGraph) {
      return this.executeVisualToASTSync(this.lastVisualGraph);
    }

    if (direction === 'ast-to-visual' && this.lastASTNodes) {
      return this.executeASTToVisualSync(this.lastASTNodes);
    }

    return null;
  }

  /**
   * Perform a full round-trip: Visual -> AST -> Code -> AST -> Visual
   * Returns true if the graph is equivalent after the round-trip.
   */
  public validateRoundTrip(graph: VisualGraph): {
    equivalent: boolean;
    originalNodes: number;
    roundTripNodes: number;
    lostNodes: string[];
    diagnostics: BridgeDiagnostic[];
  } {
    // Step 1: Visual -> AST + Code
    const forwardResult = this.visualToAST.translate(graph);

    // Step 2: AST -> Visual
    const reverseResult = this.astToVisual.translate(forwardResult.ast);

    // Step 3: Compare
    const originalNodeTypes = new Set(graph.nodes.map((n) => n.data.type));
    const roundTripNodeTypes = new Set(reverseResult.graph.nodes.map((n) => n.data.type));

    const lostNodes: string[] = [];
    for (const nodeType of originalNodeTypes) {
      if (!roundTripNodeTypes.has(nodeType)) {
        lostNodes.push(nodeType);
      }
    }

    return {
      equivalent: lostNodes.length === 0 && originalNodeTypes.size === roundTripNodeTypes.size,
      originalNodes: graph.nodes.length,
      roundTripNodes: reverseResult.graph.nodes.length,
      lostNodes,
      diagnostics: [
        ...forwardResult.diagnostics,
        ...reverseResult.diagnostics,
      ],
    };
  }

  // ==========================================================================
  // Public: Change Tracking
  // ==========================================================================

  /**
   * Record a specific change event
   */
  public recordChange(event: Omit<BridgeChangeEvent, 'timestamp'>): void {
    const changeEvent: BridgeChangeEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.changeQueue.push(changeEvent);
    this.emit('change', changeEvent);
  }

  /**
   * Get all pending changes
   */
  public getPendingChanges(): readonly BridgeChangeEvent[] {
    return this.changeQueue;
  }

  /**
   * Clear the change queue
   */
  public clearChanges(): void {
    this.changeQueue = [];
    this.state.pendingChanges = 0;
  }

  // ==========================================================================
  // Public: Mapping Queries
  // ==========================================================================

  /**
   * Find the AST path for a visual node
   */
  public findASTPath(visualNodeId: string): string | undefined {
    return this.mappings.find((m) => m.visualNodeId === visualNodeId)?.astPath;
  }

  /**
   * Find the visual node for an AST path
   */
  public findVisualNode(astPath: string): string | undefined {
    return this.mappings.find((m) => m.astPath === astPath)?.visualNodeId;
  }

  /**
   * Get all mappings for a visual node
   */
  public getMappingsForVisualNode(visualNodeId: string): BridgeMapping[] {
    return this.mappings.filter((m) => m.visualNodeId === visualNodeId);
  }

  /**
   * Get all mappings for an AST path (supports prefix matching)
   */
  public getMappingsForASTPath(astPath: string): BridgeMapping[] {
    return this.mappings.filter(
      (m) => m.astPath === astPath || m.astPath.startsWith(`${astPath}.`)
    );
  }

  // ==========================================================================
  // Private: Sync Scheduling
  // ==========================================================================

  private scheduleSync(origin: 'visual' | 'ast'): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.executePendingSync(origin);
    }, this.options.debounceMs);
  }

  private executePendingSync(origin: 'visual' | 'ast'): void {
    if (this.syncing) return;

    try {
      this.syncing = true;

      if (origin === 'visual' && this.lastVisualGraph) {
        this.executeVisualToASTSync(this.lastVisualGraph);
      } else if (origin === 'ast' && this.lastASTNodes) {
        this.executeASTToVisualSync(this.lastASTNodes);
      }
    } finally {
      this.syncing = false;
      this.state.pendingChanges = 0;
    }
  }

  private executeVisualToASTSync(graph: VisualGraph): VisualToASTResult {
    const result = this.visualToAST.translate(graph);

    this.lastASTNodes = result.ast;
    this.lastGeneratedCode = result.code;
    this.mappings = result.mappings;
    this.diagnostics = result.diagnostics;
    this.state.lastSyncTimestamp = Date.now();

    this.emit('sync-complete', {
      direction: 'visual-to-ast',
      code: result.code,
      ast: result.ast,
    });
    this.emit('mapping-updated', { mappings: this.mappings });
    if (this.diagnostics.length > 0) {
      this.emit('diagnostics', { diagnostics: this.diagnostics });
    }

    return result;
  }

  private executeASTToVisualSync(astNodes: ASTNode[]): ASTToVisualResult {
    const result = this.astToVisual.translate(astNodes);

    this.lastVisualGraph = result.graph;
    this.mappings = result.mappings;
    this.diagnostics = result.diagnostics;
    this.state.lastSyncTimestamp = Date.now();

    this.emit('sync-complete', {
      direction: 'ast-to-visual',
      graph: result.graph,
    });
    this.emit('mapping-updated', { mappings: this.mappings });
    if (this.diagnostics.length > 0) {
      this.emit('diagnostics', { diagnostics: this.diagnostics });
    }

    return result;
  }

  // ==========================================================================
  // Private: Event Emission
  // ==========================================================================

  private emit(type: SyncEventType, data?: unknown): void {
    const event: SyncEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`[studio-bridge] Error in sync event listener for "${type}":`, error);
        }
      }
    }
  }
}

/**
 * Create a pre-configured sync engine
 */
export function createSyncEngine(options?: Partial<SyncOptions>): SyncEngine {
  return new SyncEngine(options);
}
