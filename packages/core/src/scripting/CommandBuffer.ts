/**
 * CommandBuffer.ts
 *
 * Command pattern with undo/redo: command execution, batching,
 * history management, and macro recording.
 *
 * @module scripting
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Command {
  id: string;
  name: string;
  execute: () => void;
  undo: () => void;
  mergeable?: boolean; // Can merge with previous same-named command
}

export interface CommandEntry {
  command: Command;
  timestamp: number;
}

// =============================================================================
// COMMAND BUFFER
// =============================================================================

let _cmdId = 0;

export class CommandBuffer {
  private undoStack: CommandEntry[] = [];
  private redoStack: CommandEntry[] = [];
  private maxHistory = 100;
  private recording = false;
  private macroBuffer: CommandEntry[] = [];
  private macros: Map<string, Command[]> = new Map();

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  execute(command: Command): void {
    command.execute();
    const entry: CommandEntry = { command, timestamp: Date.now() };

    // Merge if possible
    if (command.mergeable && this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (last.command.name === command.name && last.command.mergeable) {
        // Replace last with merged (keep new execute, chain undos)
        const originalUndo = last.command.undo;
        const newUndo = command.undo;
        last.command.undo = () => {
          newUndo();
          originalUndo();
        };
        last.command.execute = command.execute;
        this.redoStack = [];
        if (this.recording) this.macroBuffer.push(entry);
        return;
      }
    }

    this.undoStack.push(entry);
    this.redoStack = [];

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    if (this.recording) this.macroBuffer.push(entry);
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    entry.command.undo();
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    entry.command.execute();
    this.undoStack.push(entry);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Batch Execution
  // ---------------------------------------------------------------------------

  executeBatch(commands: Command[]): void {
    const undos: (() => void)[] = [];
    for (const cmd of commands) {
      cmd.execute();
      undos.push(cmd.undo);
    }

    // Create a single compound command
    const batch: Command = {
      id: `batch_${_cmdId++}`,
      name: `Batch(${commands.length})`,
      execute: () => {
        for (const cmd of commands) cmd.execute();
      },
      undo: () => {
        for (let i = undos.length - 1; i >= 0; i--) undos[i]();
      },
    };

    this.undoStack.push({ command: batch, timestamp: Date.now() });
    this.redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // Macro Recording
  // ---------------------------------------------------------------------------

  startRecording(): void {
    this.recording = true;
    this.macroBuffer = [];
  }

  stopRecording(macroName: string): number {
    this.recording = false;
    const commands = this.macroBuffer.map((e) => e.command);
    this.macros.set(macroName, commands);
    const count = this.macroBuffer.length;
    this.macroBuffer = [];
    return count;
  }

  playMacro(macroName: string): boolean {
    const commands = this.macros.get(macroName);
    if (!commands || commands.length === 0) return false;
    this.executeBatch(commands);
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

  getHistory(): CommandEntry[] {
    return [...this.undoStack];
  }
  getLastCommand(): Command | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].command : null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  setMaxHistory(max: number): void {
    this.maxHistory = max;
  }
}
