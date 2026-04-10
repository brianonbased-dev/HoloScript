/**
 * Minimal undo manager used by engine ECS internals.
 */

export interface UndoStep<OpType> {
  redo: OpType;
  undo: OpType;
  timestamp: number;
}

export class UndoManager<OpType = unknown> {
  private undoStack: UndoStep<OpType>[] = [];
  private redoStack: UndoStep<OpType>[] = [];
  private maxDurationMs = 5000;

  push(undoOp: OpType, redoOp: OpType): void {
    const now = Date.now();
    this.undoStack.push({ undo: undoOp, redo: redoOp, timestamp: now });
    this.redoStack = [];
    this.prune(now);
  }

  private prune(now: number): void {
    while (this.undoStack.length > 0 && now - this.undoStack[0].timestamp > this.maxDurationMs) {
      this.undoStack.shift();
    }
  }

  undo(): UndoStep<OpType> | null {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push(step);
    return step;
  }

  redo(): UndoStep<OpType> | null {
    const step = this.redoStack.pop();
    if (!step) return null;
    this.undoStack.push(step);
    return step;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
