/**
 * CommandSystem.ts
 *
 * Command pattern: undo/redo stack, command batching,
 * macro recording, and execution history.
 *
 * @module events
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Command {
  id: string;
  name: string;
  execute: () => void;
  undo: () => void;
  mergeable?: boolean; // Can merge with previous command of same type
}

// =============================================================================
// COMMAND SYSTEM
// =============================================================================

export class CommandSystem {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number;
  private recording = false;
  private macro: Command[] = [];
  private macros: Map<string, Command[]> = new Map();
  private batchStack: Command[][] = [];
  private batching = false;

  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
  }

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------

  execute(command: Command): void {
    command.execute();
    this.redoStack = []; // Clear redo on new action

    // Merge with previous if possible
    if (command.mergeable && this.undoStack.length > 0) {
      const prev = this.undoStack[this.undoStack.length - 1];
      if (prev.name === command.name && prev.mergeable) {
        // Replace top with merged command
        this.undoStack[this.undoStack.length - 1] = command;
        if (this.recording) this.macro.push(command);
        return;
      }
    }

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();

    if (this.recording) this.macro.push(command);
    if (this.batching) this.batchStack[this.batchStack.length - 1].push(command);
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Batching
  // ---------------------------------------------------------------------------

  beginBatch(): void {
    this.batching = true;
    this.batchStack.push([]);
  }

  endBatch(batchName: string): Command | null {
    if (!this.batching || this.batchStack.length === 0) return null;
    const commands = this.batchStack.pop()!;
    this.batching = this.batchStack.length > 0;

    if (commands.length === 0) return null;

    // Remove individual commands from undo stack
    for (const cmd of commands) {
      const idx = this.undoStack.indexOf(cmd);
      if (idx !== -1) this.undoStack.splice(idx, 1);
    }

    // Replace with single batch command
    const batchCmd: Command = {
      id: `batch_${Date.now()}`,
      name: batchName,
      execute: () => commands.forEach((c) => c.execute()),
      undo: () => [...commands].reverse().forEach((c) => c.undo()),
    };

    this.undoStack.push(batchCmd);
    return batchCmd;
  }

  // ---------------------------------------------------------------------------
  // Macros
  // ---------------------------------------------------------------------------

  startRecording(): void {
    this.recording = true;
    this.macro = [];
  }

  stopRecording(name: string): void {
    this.recording = false;
    this.macros.set(name, [...this.macro]);
    this.macro = [];
  }

  playMacro(name: string): boolean {
    const commands = this.macros.get(name);
    if (!commands) return false;
    for (const cmd of commands) this.execute(cmd);
    return true;
  }

  getMacroNames(): string[] {
    return [...this.macros.keys()];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getUndoStackSize(): number {
    return this.undoStack.length;
  }
  getRedoStackSize(): number {
    return this.redoStack.length;
  }
  getHistory(): Command[] {
    return [...this.undoStack];
  }
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
