import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandBuffer, type Command } from '../CommandBuffer';

let counter = 0;
function makeCmd(name = 'cmd', mergeable = false): Command {
  const id = `c${counter++}`;
  let state = 0;
  return {
    id,
    name,
    mergeable,
    execute: () => {
      state++;
    },
    undo: () => {
      state--;
    },
  };
}

describe('CommandBuffer', () => {
  let buf: CommandBuffer;

  beforeEach(() => {
    buf = new CommandBuffer();
    counter = 0;
  });

  it('execute adds to undo stack', () => {
    buf.execute(makeCmd());
    expect(buf.getUndoStackSize()).toBe(1);
    expect(buf.canUndo()).toBe(true);
  });

  it('undo moves to redo stack', () => {
    buf.execute(makeCmd());
    expect(buf.undo()).toBe(true);
    expect(buf.getUndoStackSize()).toBe(0);
    expect(buf.canRedo()).toBe(true);
  });

  it('redo re-executes', () => {
    buf.execute(makeCmd());
    buf.undo();
    expect(buf.redo()).toBe(true);
    expect(buf.getUndoStackSize()).toBe(1);
  });

  it('undo returns false on empty', () => {
    expect(buf.undo()).toBe(false);
  });

  it('redo returns false on empty', () => {
    expect(buf.redo()).toBe(false);
  });

  it('execute clears redo stack', () => {
    buf.execute(makeCmd());
    buf.undo();
    buf.execute(makeCmd());
    expect(buf.canRedo()).toBe(false);
  });

  it('getLastCommand returns most recent', () => {
    const cmd = makeCmd('latest');
    buf.execute(cmd);
    expect(buf.getLastCommand()!.name).toBe('latest');
  });

  it('getLastCommand returns null when empty', () => {
    expect(buf.getLastCommand()).toBeNull();
  });

  it('getHistory returns copy of undo stack', () => {
    buf.execute(makeCmd());
    buf.execute(makeCmd());
    expect(buf.getHistory()).toHaveLength(2);
  });

  // Batch
  it('executeBatch creates compound command', () => {
    buf.executeBatch([makeCmd(), makeCmd(), makeCmd()]);
    expect(buf.getUndoStackSize()).toBe(1); // single compound
  });

  it('undo batch undoes all commands', () => {
    let val = 0;
    const cmds: Command[] = Array.from({ length: 3 }, (_, i) => ({
      id: `b${i}`,
      name: 'inc',
      execute: () => {
        val++;
      },
      undo: () => {
        val--;
      },
    }));
    buf.executeBatch(cmds);
    expect(val).toBe(3);
    buf.undo();
    expect(val).toBe(0);
  });

  // Macros
  it('record and play macro', () => {
    buf.startRecording();
    buf.execute(makeCmd());
    buf.execute(makeCmd());
    const count = buf.stopRecording('myMacro');
    expect(count).toBe(2);
    expect(buf.getMacroNames()).toContain('myMacro');

    expect(buf.playMacro('myMacro')).toBe(true);
  });

  it('playMacro returns false for unknown', () => {
    expect(buf.playMacro('nope')).toBe(false);
  });

  // Mergeable
  it('mergeable commands merge into one undo entry', () => {
    buf.execute(makeCmd('move', true));
    buf.execute(makeCmd('move', true));
    expect(buf.getUndoStackSize()).toBe(1); // merged
  });

  // Clear
  it('clear resets stacks', () => {
    buf.execute(makeCmd());
    buf.clear();
    expect(buf.getUndoStackSize()).toBe(0);
    expect(buf.getRedoStackSize()).toBe(0);
  });

  // Max history
  it('setMaxHistory enforces limit', () => {
    buf.setMaxHistory(3);
    for (let i = 0; i < 10; i++) buf.execute(makeCmd());
    expect(buf.getUndoStackSize()).toBe(3);
  });
});
