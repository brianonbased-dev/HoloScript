/**
 * Undo Manager for HoloScript+
 *
 * Tracks operation history with a temporal buffer (5s+).
 */

// Generic operation type
export interface UndoStep<OpType> {
  redo: OpType;
  undo: OpType;
  timestamp: number;
}

export class UndoManager<OpType = any> {
  private undoStack: UndoStep<OpType>[] = [];
  private redoStack: UndoStep<OpType>[] = [];
  private maxDurationMs: number = 5000; // 5 seconds buffer

  /**
   * Record a new step in the history.
   * Automatically prunes steps older than maxDurationMs.
   */
  public push(undoOp: OpType, redoOp: OpType): void {
    const now = Date.now();
    this.undoStack.push({ undo: undoOp, redo: redoOp, timestamp: now });
    this.redoStack = [];

    this.prune(now);
  }

  /**
   * Remove steps older than 5 seconds.
   */
  private prune(now: number): void {
    while (this.undoStack.length > 0 && now - this.undoStack[0].timestamp > this.maxDurationMs) {
      this.undoStack.shift();
    }
  }

  public undo(): UndoStep<OpType> | null {
    const step = this.undoStack.pop();
    if (step) {
      this.redoStack.push(step);
      return step;
    }
    return null;
  }

  public redo(): UndoStep<OpType> | null {
    const step = this.redoStack.pop();
    if (step) {
      this.undoStack.push(step);
      return step;
    }
    return null;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public getStackDepth(): number {
    return this.undoStack.length;
  }
}
