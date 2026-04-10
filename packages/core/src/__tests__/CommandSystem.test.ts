import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandSystem } from '../events/CommandSystem';
import type { Command } from '../events/CommandSystem';

// =============================================================================
// C229 — Command System (Undo/Redo)
// =============================================================================

let counter: number;
function makeCmd(name = 'inc', delta = 1): Command {
  return {
    id: `cmd_${Math.random()}`,
    name,
    execute: () => {
      counter += delta;
    },
    undo: () => {
      counter -= delta;
    },
  };
}

describe('CommandSystem', () => {
  let sys: CommandSystem;
  beforeEach(() => {
    sys = new CommandSystem();
    counter = 0;
  });

  it('execute runs command', () => {
    sys.execute(makeCmd());
    expect(counter).toBe(1);
    expect(sys.getUndoStackSize()).toBe(1);
  });

  it('undo reverses command', () => {
    sys.execute(makeCmd());
    expect(sys.undo()).toBe(true);
    expect(counter).toBe(0);
    expect(sys.getRedoStackSize()).toBe(1);
  });

  it('redo replays command', () => {
    sys.execute(makeCmd());
    sys.undo();
    expect(sys.redo()).toBe(true);
    expect(counter).toBe(1);
  });

  it('undo returns false when empty', () => {
    expect(sys.undo()).toBe(false);
  });

  it('redo returns false when empty', () => {
    expect(sys.redo()).toBe(false);
  });

  it('execute clears redo stack', () => {
    sys.execute(makeCmd());
    sys.undo();
    expect(sys.canRedo()).toBe(true);
    sys.execute(makeCmd());
    expect(sys.canRedo()).toBe(false);
  });

  it('maxHistory caps undo stack', () => {
    const small = new CommandSystem(3);
    for (let i = 0; i < 5; i++) small.execute(makeCmd());
    expect(small.getUndoStackSize()).toBe(3);
  });

  it('beginBatch + endBatch groups commands', () => {
    sys.beginBatch();
    sys.execute(makeCmd('a', 1));
    sys.execute(makeCmd('b', 2));
    const batch = sys.endBatch('batch1');
    expect(batch).not.toBeNull();
    expect(counter).toBe(3);
    // Undo batch reverses all
    sys.undo();
    expect(counter).toBe(0);
  });

  it('endBatch returns null when not batching', () => {
    expect(sys.endBatch('nope')).toBeNull();
  });

  it('macro recording replays commands', () => {
    sys.startRecording();
    sys.execute(makeCmd('a', 5));
    sys.execute(makeCmd('b', 10));
    sys.stopRecording('myMacro');
    expect(sys.getMacroNames()).toContain('myMacro');
    counter = 0;
    expect(sys.playMacro('myMacro')).toBe(true);
    expect(counter).toBe(15);
  });

  it('playMacro returns false for unknown macro', () => {
    expect(sys.playMacro('nope')).toBe(false);
  });

  it('clearHistory resets stacks', () => {
    sys.execute(makeCmd());
    sys.clearHistory();
    expect(sys.getUndoStackSize()).toBe(0);
    expect(sys.canUndo()).toBe(false);
  });

  it('getHistory returns copy of undo stack', () => {
    sys.execute(makeCmd());
    sys.execute(makeCmd());
    const history = sys.getHistory();
    expect(history).toHaveLength(2);
  });

  it('mergeable commands merge with same name', () => {
    const cmd1: Command = {
      id: '1',
      name: 'move',
      execute: () => {
        counter++;
      },
      undo: () => {
        counter--;
      },
      mergeable: true,
    };
    const cmd2: Command = {
      id: '2',
      name: 'move',
      execute: () => {
        counter++;
      },
      undo: () => {
        counter--;
      },
      mergeable: true,
    };
    sys.execute(cmd1);
    sys.execute(cmd2);
    // Should merge — only 1 entry on undo stack
    expect(sys.getUndoStackSize()).toBe(1);
  });
});
