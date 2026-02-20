/**
 * CommandBuffer — production test suite
 *
 * Tests: command execution, undo/redo stack management, batch commands,
 * canUndo/canRedo, macro recording/playback, history queries, and clear.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandBuffer } from '../CommandBuffer';
import type { Command } from '../CommandBuffer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _id = 0;
function makeCmd(name: string, executeFn?: () => void, undoFn?: () => void): Command {
  return {
    id: `cmd-${_id++}`,
    name,
    execute: executeFn ?? vi.fn(),
    undo: undoFn ?? vi.fn(),
  };
}

function makeTrackedCmd(name: string) {
  const log: string[] = [];
  const cmd = makeCmd(
    name,
    () => log.push('exec'),
    () => log.push('undo'),
  );
  return { cmd, log };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('CommandBuffer: production', () => {
  let buffer: CommandBuffer;

  beforeEach(() => {
    buffer = new CommandBuffer();
  });

  // ─── Execute ──────────────────────────────────────────────────────────────
  describe('execute', () => {
    it('calls command.execute()', () => {
      const { cmd, log } = makeTrackedCmd('paint');
      buffer.execute(cmd);
      expect(log).toContain('exec');
    });

    it('adds command to undo stack', () => {
      buffer.execute(makeCmd('c1'));
      expect(buffer.getUndoStackSize()).toBe(1);
    });

    it('clears redo stack on new execute', () => {
      buffer.execute(makeCmd('a'));
      buffer.undo();
      buffer.execute(makeCmd('b'));
      expect(buffer.getRedoStackSize()).toBe(0);
      expect(buffer.canRedo()).toBe(false);
    });

    it('respects maxHistory limit', () => {
      buffer.setMaxHistory(3);
      for (let i = 0; i < 5; i++) buffer.execute(makeCmd(`cmd-${i}`));
      expect(buffer.getUndoStackSize()).toBe(3);
    });
  });

  // ─── Undo ─────────────────────────────────────────────────────────────────
  describe('undo', () => {
    it('returns false when undo stack is empty', () => {
      expect(buffer.undo()).toBe(false);
    });

    it('calls command.undo()', () => {
      const { cmd, log } = makeTrackedCmd('paint');
      buffer.execute(cmd);
      buffer.undo();
      expect(log).toContain('undo');
    });

    it('moves command to redo stack', () => {
      buffer.execute(makeCmd('a'));
      buffer.undo();
      expect(buffer.getRedoStackSize()).toBe(1);
      expect(buffer.getUndoStackSize()).toBe(0);
    });

    it('canUndo() is false after undoing all', () => {
      buffer.execute(makeCmd('a'));
      buffer.undo();
      expect(buffer.canUndo()).toBe(false);
    });
  });

  // ─── Redo ─────────────────────────────────────────────────────────────────
  describe('redo', () => {
    it('returns false when redo stack is empty', () => {
      expect(buffer.redo()).toBe(false);
    });

    it('calls command.execute() again', () => {
      const { cmd, log } = makeTrackedCmd('paint');
      buffer.execute(cmd);
      buffer.undo();
      buffer.redo();
      expect(log.filter(l => l === 'exec').length).toBe(2);
    });

    it('moves command back to undo stack', () => {
      buffer.execute(makeCmd('a'));
      buffer.undo();
      buffer.redo();
      expect(buffer.getUndoStackSize()).toBe(1);
      expect(buffer.getRedoStackSize()).toBe(0);
    });

    it('canRedo() is false with empty redo stack', () => {
      expect(buffer.canRedo()).toBe(false);
    });

    it('canRedo() is true after undo', () => {
      buffer.execute(makeCmd('a'));
      buffer.undo();
      expect(buffer.canRedo()).toBe(true);
    });
  });

  // ─── Multiple undo/redo ──────────────────────────────────────────────────
  describe('multi-step undo/redo', () => {
    it('undoes commands in LIFO order', () => {
      const order: string[] = [];
      buffer.execute(makeCmd('first', undefined, () => order.push('undo-first')));
      buffer.execute(makeCmd('second', undefined, () => order.push('undo-second')));
      buffer.undo();
      buffer.undo();
      expect(order).toEqual(['undo-second', 'undo-first']);
    });
  });

  // ─── Batch execution ──────────────────────────────────────────────────────
  describe('executeBatch', () => {
    it('executes all commands in the batch', () => {
      const logs: string[] = [];
      buffer.executeBatch([
        makeCmd('a', () => logs.push('a')),
        makeCmd('b', () => logs.push('b')),
      ]);
      expect(logs).toEqual(['a', 'b']);
    });

    it('batch creates a single undo stack entry', () => {
      buffer.executeBatch([makeCmd('a'), makeCmd('b')]);
      expect(buffer.getUndoStackSize()).toBe(1);
    });

    it('undoing batch undoes all commands in reverse', () => {
      const log: string[] = [];
      buffer.executeBatch([
        makeCmd('a', undefined, () => log.push('undo-a')),
        makeCmd('b', undefined, () => log.push('undo-b')),
      ]);
      buffer.undo();
      expect(log).toEqual(['undo-b', 'undo-a']);
    });
  });

  // ─── Macro recording ─────────────────────────────────────────────────────
  describe('startRecording / stopRecording / playMacro', () => {
    it('records commands executed while recording', () => {
      buffer.startRecording();
      buffer.execute(makeCmd('a'));
      buffer.execute(makeCmd('b'));
      const count = buffer.stopRecording('myMacro');
      expect(count).toBe(2);
      expect(buffer.getMacroNames()).toContain('myMacro');
    });

    it('playMacro executes all recorded commands', () => {
      const log: string[] = [];
      buffer.startRecording();
      buffer.execute(makeCmd('a', () => log.push('a')));
      buffer.execute(makeCmd('b', () => log.push('b')));
      buffer.stopRecording('macro1');
      log.length = 0; // reset
      buffer.playMacro('macro1');
      expect(log).toEqual(['a', 'b']);
    });

    it('playMacro returns false for unknown macro', () => {
      expect(buffer.playMacro('missing')).toBe(false);
    });

    it('getMacroNames returns all saved macros', () => {
      buffer.startRecording();
      buffer.execute(makeCmd('x'));
      buffer.stopRecording('m1');
      buffer.startRecording();
      buffer.execute(makeCmd('y'));
      buffer.stopRecording('m2');
      expect(buffer.getMacroNames()).toContain('m1');
      expect(buffer.getMacroNames()).toContain('m2');
    });
  });

  // ─── Queries ─────────────────────────────────────────────────────────────
  describe('getHistory / getLastCommand', () => {
    it('getHistory returns copy of undo stack', () => {
      buffer.execute(makeCmd('a'));
      const h = buffer.getHistory();
      expect(h).toHaveLength(1);
      expect(h[0].command.name).toBe('a');
    });

    it('getLastCommand returns the most recent command', () => {
      buffer.execute(makeCmd('first'));
      buffer.execute(makeCmd('last'));
      expect(buffer.getLastCommand()?.name).toBe('last');
    });

    it('getLastCommand returns null on empty stack', () => {
      expect(buffer.getLastCommand()).toBeNull();
    });
  });

  // ─── Clear ────────────────────────────────────────────────────────────────
  describe('clear', () => {
    it('empties undo and redo stacks', () => {
      buffer.execute(makeCmd('a'));
      buffer.undo();
      buffer.clear();
      expect(buffer.getUndoStackSize()).toBe(0);
      expect(buffer.getRedoStackSize()).toBe(0);
    });
  });
});
