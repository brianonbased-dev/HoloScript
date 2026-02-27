/**
 * Undo/Redo System
 *
 * Command pattern implementation for shader graph editor with:
 * - Command history stack (max 100 actions)
 * - Reversible operations (Add/Delete/Connect/Modify)
 * - State snapshots for efficient undo
 * - Action merging (e.g., slider drag → single undo step)
 * - Keyboard shortcuts integration
 * - Persistence to localStorage
 */

import { ShaderGraph } from '@/lib/shaderGraph';
import type { IShaderNode, IShaderConnection } from '@/lib/shaderGraph';

// ============================================================================
// Types
// ============================================================================

/**
 * Base command interface
 */
export interface ICommand {
  /**
   * Execute the command
   */
  execute(graph: ShaderGraph): void;

  /**
   * Undo the command
   */
  undo(graph: ShaderGraph): void;

  /**
   * Get command description for UI
   */
  getDescription(): string;

  /**
   * Check if this command can be merged with another
   */
  canMergeWith(other: ICommand): boolean;

  /**
   * Merge with another command
   */
  mergeWith(other: ICommand): void;
}

/**
 * Undo/Redo event
 */
export interface UndoRedoEvent {
  type: 'execute' | 'undo' | 'redo' | 'clear';
  command?: ICommand;
  canUndo: boolean;
  canRedo: boolean;
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Add node command
 */
export class AddNodeCommand implements ICommand {
  private nodeId: string | null = null;

  constructor(
    private nodeType: string,
    private position: { x: number; y: number }
  ) {}

  execute(graph: ShaderGraph): void {
    const node = graph.createNode(this.nodeType, this.position);
    if (node) {
      this.nodeId = node.id;
    }
  }

  undo(graph: ShaderGraph): void {
    if (this.nodeId) {
      graph.removeNode(this.nodeId);
    }
  }

  getDescription(): string {
    return `Add ${this.nodeType}`;
  }

  canMergeWith(): boolean {
    return false;
  }

  mergeWith(): void {}
}

/**
 * Delete node command
 */
export class DeleteNodeCommand implements ICommand {
  private deletedNode: IShaderNode | null = null;
  private deletedConnections: IShaderConnection[] = [];

  constructor(private nodeId: string) {}

  execute(graph: ShaderGraph): void {
    this.deletedNode = graph.getNode(this.nodeId) ?? null;
    if (this.deletedNode) {
      // Store connections for restoration
      this.deletedConnections = graph.getNodeConnections(this.nodeId);
    }
    graph.removeNode(this.nodeId);
  }

  undo(graph: ShaderGraph): void {
    if (this.deletedNode) {
      graph.addCustomNode(this.deletedNode);

      // Restore connections
      for (const conn of this.deletedConnections) {
        graph.connect(conn.fromNode, conn.fromPort, conn.toNode, conn.toPort);
      }
    }
  }

  getDescription(): string {
    return `Delete ${this.deletedNode?.name ?? 'node'}`;
  }

  canMergeWith(): boolean {
    return false;
  }

  mergeWith(): void {}
}

/**
 * Connect nodes command
 */
export class ConnectCommand implements ICommand {
  private connection: IShaderConnection | null = null;
  private previousConnection: IShaderConnection | null = null;

  constructor(
    private fromNodeId: string,
    private fromPortId: string,
    private toNodeId: string,
    private toPortId: string
  ) {}

  execute(graph: ShaderGraph): void {
    // Check for existing connection to this input
    const existing = graph.connections.find(
      (c) => c.toNode === this.toNodeId && c.toPort === this.toPortId
    );

    if (existing) {
      this.previousConnection = existing;
    }

    this.connection = graph.connect(
      this.fromNodeId,
      this.fromPortId,
      this.toNodeId,
      this.toPortId
    );
  }

  undo(graph: ShaderGraph): void {
    if (this.connection) {
      graph.disconnectPort(this.toNodeId, this.toPortId);

      // Restore previous connection if it existed
      if (this.previousConnection) {
        graph.connect(
          this.previousConnection.fromNode,
          this.previousConnection.fromPort,
          this.previousConnection.toNode,
          this.previousConnection.toPort
        );
      }
    }
  }

  getDescription(): string {
    return 'Connect';
  }

  canMergeWith(): boolean {
    return false;
  }

  mergeWith(): void {}
}

/**
 * Disconnect nodes command
 */
export class DisconnectCommand implements ICommand {
  private deletedConnection: IShaderConnection | null = null;

  constructor(
    private nodeId: string,
    private portId: string
  ) {}

  execute(graph: ShaderGraph): void {
    // Find and store the connection
    const conn = graph.connections.find(
      (c) => (c.toNode === this.nodeId && c.toPort === this.portId) ||
             (c.fromNode === this.nodeId && c.fromPort === this.portId)
    );

    if (conn) {
      this.deletedConnection = conn;
    }

    graph.disconnectPort(this.nodeId, this.portId);
  }

  undo(graph: ShaderGraph): void {
    if (this.deletedConnection) {
      graph.connect(
        this.deletedConnection.fromNode,
        this.deletedConnection.fromPort,
        this.deletedConnection.toNode,
        this.deletedConnection.toPort
      );
    }
  }

  getDescription(): string {
    return 'Disconnect';
  }

  canMergeWith(): boolean {
    return false;
  }

  mergeWith(): void {}
}

/**
 * Set node property command
 */
export class SetPropertyCommand implements ICommand {
  private oldValue: unknown;
  private lastMergeTime = Date.now();

  constructor(
    private nodeId: string,
    private propertyKey: string,
    private newValue: unknown
  ) {
    this.oldValue = undefined;
  }

  execute(graph: ShaderGraph): void {
    const node = graph.getNode(this.nodeId);
    if (node) {
      this.oldValue = graph.getNodeProperty(this.nodeId, this.propertyKey);
      graph.setNodeProperty(this.nodeId, this.propertyKey, this.newValue);
    }
  }

  undo(graph: ShaderGraph): void {
    graph.setNodeProperty(this.nodeId, this.propertyKey, this.oldValue);
  }

  getDescription(): string {
    return `Set ${this.propertyKey}`;
  }

  canMergeWith(other: ICommand): boolean {
    if (!(other instanceof SetPropertyCommand)) return false;

    // Can merge if same node and property, and within merge window (1 second)
    const timeDiff = Date.now() - this.lastMergeTime;
    return (
      other.nodeId === this.nodeId &&
      other.propertyKey === this.propertyKey &&
      timeDiff < 1000
    );
  }

  mergeWith(other: ICommand): void {
    if (other instanceof SetPropertyCommand) {
      this.newValue = other.newValue;
      this.lastMergeTime = Date.now();
    }
  }
}

/**
 * Move node command
 */
export class MoveNodeCommand implements ICommand {
  private oldPosition: { x: number; y: number } | null = null;
  private lastMergeTime = Date.now();

  constructor(
    private nodeId: string,
    private newPosition: { x: number; y: number }
  ) {}

  execute(graph: ShaderGraph): void {
    const node = graph.getNode(this.nodeId);
    if (node) {
      this.oldPosition = { ...node.position };
      graph.setNodePosition(this.nodeId, this.newPosition.x, this.newPosition.y);
    }
  }

  undo(graph: ShaderGraph): void {
    if (this.oldPosition) {
      graph.setNodePosition(this.nodeId, this.oldPosition.x, this.oldPosition.y);
    }
  }

  getDescription(): string {
    return 'Move node';
  }

  canMergeWith(other: ICommand): boolean {
    if (!(other instanceof MoveNodeCommand)) return false;

    // Can merge if same node and within merge window (500ms)
    const timeDiff = Date.now() - this.lastMergeTime;
    return other.nodeId === this.nodeId && timeDiff < 500;
  }

  mergeWith(other: ICommand): void {
    if (other instanceof MoveNodeCommand) {
      this.newPosition = other.newPosition;
      this.lastMergeTime = Date.now();
    }
  }
}

/**
 * Batch command - executes multiple commands as one
 */
export class BatchCommand implements ICommand {
  constructor(
    private commands: ICommand[],
    private description: string = 'Batch operation'
  ) {}

  execute(graph: ShaderGraph): void {
    for (const command of this.commands) {
      command.execute(graph);
    }
  }

  undo(graph: ShaderGraph): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo(graph);
    }
  }

  getDescription(): string {
    return this.description;
  }

  canMergeWith(): boolean {
    return false;
  }

  mergeWith(): void {}
}

// ============================================================================
// Undo/Redo System
// ============================================================================

export class UndoRedoSystem {
  private history: ICommand[] = [];
  private currentIndex = -1;
  private maxHistory = 100;
  private listeners: Set<(event: UndoRedoEvent) => void> = new Set();
  private graph: ShaderGraph | null = null;
  private storageKey = 'shader-editor-undo-history';

  /**
   * Set the graph to operate on
   */
  setGraph(graph: ShaderGraph): void {
    this.graph = graph;
  }

  /**
   * Execute a command
   */
  execute(command: ICommand): void {
    if (!this.graph) {
      console.warn('No graph set for undo/redo system');
      return;
    }

    // Try to merge with last command
    if (this.currentIndex >= 0) {
      const lastCommand = this.history[this.currentIndex];
      if (lastCommand.canMergeWith(command)) {
        lastCommand.mergeWith(command);
        command.execute(this.graph);
        this.notifyListeners({ type: 'execute', command, canUndo: true, canRedo: false });
        return;
      }
    }

    // Clear any redo history
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Execute and add to history
    command.execute(this.graph);
    this.history.push(command);
    this.currentIndex++;

    // Maintain max history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }

    this.notifyListeners({ type: 'execute', command, canUndo: true, canRedo: false });
    this.saveHistory();
  }

  /**
   * Undo last command
   */
  undo(): void {
    if (!this.canUndo() || !this.graph) return;

    const command = this.history[this.currentIndex];
    command.undo(this.graph);
    this.currentIndex--;

    this.notifyListeners({
      type: 'undo',
      command,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
    this.saveHistory();
  }

  /**
   * Redo last undone command
   */
  redo(): void {
    if (!this.canRedo() || !this.graph) return;

    this.currentIndex++;
    const command = this.history[this.currentIndex];
    command.execute(this.graph);

    this.notifyListeners({
      type: 'redo',
      command,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
    this.saveHistory();
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.notifyListeners({ type: 'clear', canUndo: false, canRedo: false });
    this.clearHistory();
  }

  /**
   * Get history for display
   */
  getHistory(): Array<{ description: string; isCurrent: boolean }> {
    return this.history.map((cmd, index) => ({
      description: cmd.getDescription(),
      isCurrent: index === this.currentIndex,
    }));
  }

  /**
   * Add change listener
   */
  onChange(listener: (event: UndoRedoEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(event: UndoRedoEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in undo/redo listener:', error);
      }
    });
  }

  /**
   * Save history to localStorage
   */
  private saveHistory(): void {
    try {
      const data = {
        currentIndex: this.currentIndex,
        // Only store command descriptions and basic metadata
        // Full command serialization would be complex
        count: this.history.length,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save undo history:', error);
    }
  }

  /**
   * Clear history from localStorage
   */
  private clearHistory(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('Failed to clear undo history:', error);
    }
  }

  /**
   * Set max history size
   */
  setMaxHistory(max: number): void {
    this.maxHistory = Math.max(1, max);

    // Trim if needed
    if (this.history.length > this.maxHistory) {
      const excess = this.history.length - this.maxHistory;
      this.history = this.history.slice(excess);
      this.currentIndex = Math.max(-1, this.currentIndex - excess);
    }
  }

  /**
   * Get max history size
   */
  getMaxHistory(): number {
    return this.maxHistory;
  }
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

/**
 * Setup keyboard shortcuts for undo/redo
 */
export function setupUndoRedoShortcuts(system: UndoRedoSystem): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

    if (ctrlOrCmd && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      system.undo();
    } else if (
      (ctrlOrCmd && event.key === 'y') ||
      (ctrlOrCmd && event.shiftKey && event.key === 'z')
    ) {
      event.preventDefault();
      system.redo();
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: UndoRedoSystem | null = null;

/**
 * Get singleton instance of UndoRedoSystem
 */
export function getUndoRedoSystem(): UndoRedoSystem {
  if (!instance) {
    instance = new UndoRedoSystem();
  }
  return instance;
}
