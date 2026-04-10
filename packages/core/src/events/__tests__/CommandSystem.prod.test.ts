/**
 * CommandSystem — Production Test Suite
 *
 * Covers: execute, undo, redo, batching, macro recording/playback,
 * mergeable commands, max history, clearHistory.
 */
import { describe, it, expect, vi } from 'vitest';
import { CommandSystem, type Command } from '../CommandSystem';

function cmd(name: string, exec: () => void, undo: () => void, mergeable = false): Command {
  return { id: `${name}_${Date.now()}`, name, execute: exec, undo, mergeable };
}

describe('CommandSystem — Production', () => {
  // ─── Execute / Undo / Redo ────────────────────────────────────────
  it('execute runs the command', () => {
    const cs = new CommandSystem();
    const fn = vi.fn();
    cs.execute(cmd('test', fn, vi.fn()));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('undo reverses last command', () => {
    const cs = new CommandSystem();
    let val = 0;
    cs.execute(
      cmd(
        'inc',
        () => val++,
        () => val--
      )
    );
    expect(val).toBe(1);
    cs.undo();
    expect(val).toBe(0);
  });

  it('redo re-applies undone command', () => {
    const cs = new CommandSystem();
    let val = 0;
    cs.execute(
      cmd(
        'inc',
        () => val++,
        () => val--
      )
    );
    cs.undo();
    cs.redo();
    expect(val).toBe(1);
  });

  it('new execute clears redo stack', () => {
    const cs = new CommandSystem();
    cs.execute(cmd('a', vi.fn(), vi.fn()));
    cs.undo();
    expect(cs.canRedo()).toBe(true);
    cs.execute(cmd('b', vi.fn(), vi.fn()));
    expect(cs.canRedo()).toBe(false);
  });

  // ─── Batching ─────────────────────────────────────────────────────
  it('batch collapses multiple commands into one undo', () => {
    const cs = new CommandSystem();
    let val = 0;
    cs.beginBatch();
    cs.execute(
      cmd(
        'a',
        () => val++,
        () => val--
      )
    );
    cs.execute(
      cmd(
        'b',
        () => val++,
        () => val--
      )
    );
    cs.execute(
      cmd(
        'c',
        () => val++,
        () => val--
      )
    );
    cs.endBatch('batch1');
    expect(val).toBe(3);
    cs.undo(); // undoes entire batch
    expect(val).toBe(0);
  });

  // ─── Macros ───────────────────────────────────────────────────────
  it('record and play macro', () => {
    const cs = new CommandSystem();
    let val = 0;
    cs.startRecording();
    cs.execute(
      cmd(
        'inc',
        () => val++,
        () => val--
      )
    );
    cs.execute(
      cmd(
        'inc',
        () => val++,
        () => val--
      )
    );
    cs.stopRecording('double-inc');
    val = 0;
    cs.playMacro('double-inc');
    expect(val).toBe(2);
  });

  it('getMacroNames lists recorded macros', () => {
    const cs = new CommandSystem();
    cs.startRecording();
    cs.stopRecording('m1');
    cs.startRecording();
    cs.stopRecording('m2');
    expect(cs.getMacroNames()).toEqual(['m1', 'm2']);
  });

  it('playMacro returns false for missing', () => {
    const cs = new CommandSystem();
    expect(cs.playMacro('nonexistent')).toBe(false);
  });

  // ─── Mergeable ────────────────────────────────────────────────────
  it('mergeable commands collapse consecutive same-name', () => {
    const cs = new CommandSystem();
    cs.execute(cmd('move', vi.fn(), vi.fn(), true));
    cs.execute(cmd('move', vi.fn(), vi.fn(), true));
    cs.execute(cmd('move', vi.fn(), vi.fn(), true));
    expect(cs.getUndoStackSize()).toBe(1); // merged into one
  });

  // ─── Max History ──────────────────────────────────────────────────
  it('max history trims oldest commands', () => {
    const cs = new CommandSystem(3);
    for (let i = 0; i < 5; i++) {
      cs.execute(cmd(`c${i}`, vi.fn(), vi.fn()));
    }
    expect(cs.getUndoStackSize()).toBe(3);
  });

  // ─── Clear / Queries ──────────────────────────────────────────────
  it('clearHistory empties stacks', () => {
    const cs = new CommandSystem();
    cs.execute(cmd('a', vi.fn(), vi.fn()));
    cs.undo();
    cs.clearHistory();
    expect(cs.getUndoStackSize()).toBe(0);
    expect(cs.getRedoStackSize()).toBe(0);
  });

  it('getHistory returns undo stack copy', () => {
    const cs = new CommandSystem();
    cs.execute(cmd('a', vi.fn(), vi.fn()));
    cs.execute(cmd('b', vi.fn(), vi.fn()));
    expect(cs.getHistory().length).toBe(2);
  });
});
