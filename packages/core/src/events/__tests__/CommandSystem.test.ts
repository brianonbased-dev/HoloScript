/**
 * CommandSystem Unit Tests
 *
 * Tests execute, undo/redo, batching, macro recording/playback,
 * mergeable commands, and history management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandSystem, type Command } from '../CommandSystem';

function makeCmd(name: string, opts: Partial<Command> = {}): Command {
  return {
    id: `cmd_${name}_${Date.now()}`,
    name,
    execute: opts.execute || vi.fn(),
    undo: opts.undo || vi.fn(),
    ...opts,
  };
}

describe('CommandSystem', () => {
  let sys: CommandSystem;

  beforeEach(() => {
    sys = new CommandSystem(50);
  });

  describe('execute', () => {
    it('should call execute on command', () => {
      const cmd = makeCmd('test');
      sys.execute(cmd);
      expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    it('should add to undo stack', () => {
      sys.execute(makeCmd('a'));
      expect(sys.getUndoStackSize()).toBe(1);
      expect(sys.canUndo()).toBe(true);
    });

    it('should clear redo stack', () => {
      sys.execute(makeCmd('a'));
      sys.undo();
      expect(sys.canRedo()).toBe(true);
      sys.execute(makeCmd('b'));
      expect(sys.canRedo()).toBe(false);
    });
  });

  describe('undo / redo', () => {
    it('should call undo on top command', () => {
      const cmd = makeCmd('test');
      sys.execute(cmd);
      sys.undo();
      expect(cmd.undo).toHaveBeenCalledTimes(1);
    });

    it('should redo calls execute again', () => {
      const cmd = makeCmd('test');
      sys.execute(cmd);
      sys.undo();
      sys.redo();
      expect(cmd.execute).toHaveBeenCalledTimes(2);
    });

    it('should return false when nothing to undo', () => {
      expect(sys.undo()).toBe(false);
    });

    it('should return false when nothing to redo', () => {
      expect(sys.redo()).toBe(false);
    });
  });

  describe('mergeable commands', () => {
    it('should merge consecutive same-name mergeable commands', () => {
      sys.execute(makeCmd('move', { mergeable: true }));
      sys.execute(makeCmd('move', { mergeable: true }));
      expect(sys.getUndoStackSize()).toBe(1); // Merged into one
    });

    it('should not merge different-name commands', () => {
      sys.execute(makeCmd('move', { mergeable: true }));
      sys.execute(makeCmd('rotate', { mergeable: true }));
      expect(sys.getUndoStackSize()).toBe(2);
    });
  });

  describe('batching', () => {
    it('should batch multiple commands into one undo step', () => {
      sys.beginBatch();
      sys.execute(makeCmd('a'));
      sys.execute(makeCmd('b'));
      sys.execute(makeCmd('c'));
      sys.endBatch('batch1');

      expect(sys.getUndoStackSize()).toBe(1);
    });

    it('should undo all batch commands in reverse', () => {
      const log: string[] = [];
      sys.beginBatch();
      sys.execute(makeCmd('a', { undo: () => log.push('undo-a') }));
      sys.execute(makeCmd('b', { undo: () => log.push('undo-b') }));
      sys.endBatch('batch1');

      sys.undo();
      expect(log).toEqual(['undo-b', 'undo-a']);
    });

    it('should return null for empty batch', () => {
      sys.beginBatch();
      expect(sys.endBatch('empty')).toBeNull();
    });
  });

  describe('macros', () => {
    it('should record and playback macro', () => {
      const log: string[] = [];

      sys.startRecording();
      sys.execute(makeCmd('step1', { execute: () => log.push('s1') }));
      sys.execute(makeCmd('step2', { execute: () => log.push('s2') }));
      sys.stopRecording('myMacro');

      log.length = 0;
      expect(sys.playMacro('myMacro')).toBe(true);
      expect(log).toEqual(['s1', 's2']);
    });

    it('should list macro names', () => {
      sys.startRecording();
      sys.execute(makeCmd('x'));
      sys.stopRecording('macro1');

      expect(sys.getMacroNames()).toContain('macro1');
    });

    it('should return false for unknown macro', () => {
      expect(sys.playMacro('nonexistent')).toBe(false);
    });
  });

  describe('history management', () => {
    it('should cap history at maxHistory', () => {
      for (let i = 0; i < 60; i++) {
        sys.execute(makeCmd(`cmd${i}`));
      }
      expect(sys.getUndoStackSize()).toBe(50);
    });

    it('should return history copy', () => {
      sys.execute(makeCmd('a'));
      const history = sys.getHistory();
      expect(history).toHaveLength(1);
    });

    it('should clear history', () => {
      sys.execute(makeCmd('a'));
      sys.clearHistory();
      expect(sys.getUndoStackSize()).toBe(0);
      expect(sys.getRedoStackSize()).toBe(0);
    });
  });
});
