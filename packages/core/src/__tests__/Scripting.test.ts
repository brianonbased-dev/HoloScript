import { describe, it, expect } from 'vitest';
import { ScriptVM, OpCode } from '../scripting/ScriptVM';
import { EventDispatcher } from '../scripting/EventDispatcher';
import { CommandBuffer, Command } from '../scripting/CommandBuffer';

describe('Cycle 119: Scripting & Events', () => {
  // -------------------------------------------------------------------------
  // ScriptVM
  // -------------------------------------------------------------------------

  it('should execute arithmetic bytecode', () => {
    const vm = new ScriptVM();
    vm.load([
      { op: OpCode.PUSH, operand: 10 },
      { op: OpCode.PUSH, operand: 20 },
      { op: OpCode.ADD },
      { op: OpCode.HALT },
    ]);

    const state = vm.run();
    expect(state.error).toBeNull();
    expect(vm.peek()).toBe(30);
  });

  it('should use registers and comparisons', () => {
    const vm = new ScriptVM();
    vm.load([
      { op: OpCode.PUSH, operand: 42 },
      { op: OpCode.STORE, operand: 'x' },
      { op: OpCode.LOAD, operand: 'x' },
      { op: OpCode.PUSH, operand: 42 },
      { op: OpCode.EQ },
      { op: OpCode.HALT },
    ]);

    vm.run();
    expect(vm.peek()).toBe(1); // true
    expect(vm.getRegister('x')).toBe(42);
  });

  it('should call native functions', () => {
    const vm = new ScriptVM();
    vm.load([
      { op: OpCode.PUSH, operand: -7 }, // arg
      { op: OpCode.PUSH, operand: 1 }, // argc
      { op: OpCode.CALL, operand: 'abs' },
      { op: OpCode.HALT },
    ]);

    vm.run();
    expect(vm.peek()).toBe(7);
  });

  it('should detect division by zero', () => {
    const vm = new ScriptVM();
    vm.load([
      { op: OpCode.PUSH, operand: 10 },
      { op: OpCode.PUSH, operand: 0 },
      { op: OpCode.DIV },
      { op: OpCode.HALT },
    ]);

    const state = vm.run();
    expect(state.error).toBe('Division by zero');
  });

  // -------------------------------------------------------------------------
  // EventDispatcher
  // -------------------------------------------------------------------------

  it('should dispatch events with priority ordering', () => {
    const dispatcher = new EventDispatcher();
    const order: number[] = [];

    dispatcher.on('test', () => order.push(1), 1);
    dispatcher.on('test', () => order.push(2), 10); // Higher priority
    dispatcher.on('test', () => order.push(3), 5);

    dispatcher.emit('test');
    expect(order).toEqual([2, 3, 1]); // Descending priority
  });

  it('should handle once listeners and deferred events', () => {
    const dispatcher = new EventDispatcher();
    let count = 0;

    dispatcher.once('ping', () => count++);
    dispatcher.emit('ping');
    dispatcher.emit('ping');
    expect(count).toBe(1); // Only fired once

    // Deferred
    dispatcher.emitDeferred('pong', { val: 1 });
    expect(dispatcher.getQueuedCount()).toBe(1);
    dispatcher.flushDeferred();
    expect(dispatcher.getQueuedCount()).toBe(0);
  });

  it('should stop propagation', () => {
    const dispatcher = new EventDispatcher();
    const results: string[] = [];

    dispatcher.on(
      'click',
      (e) => {
        results.push('first');
        e.propagate = false;
      },
      10
    );
    dispatcher.on('click', () => results.push('second'), 1);

    dispatcher.emit('click');
    expect(results).toEqual(['first']); // Second never called
  });

  // -------------------------------------------------------------------------
  // CommandBuffer
  // -------------------------------------------------------------------------

  it('should undo and redo commands', () => {
    const buffer = new CommandBuffer();
    let value = 0;

    const cmd: Command = {
      id: 'inc',
      name: 'increment',
      execute: () => {
        value += 10;
      },
      undo: () => {
        value -= 10;
      },
    };

    buffer.execute(cmd);
    expect(value).toBe(10);

    buffer.undo();
    expect(value).toBe(0);

    buffer.redo();
    expect(value).toBe(10);
  });

  it('should execute and undo batches', () => {
    const buffer = new CommandBuffer();
    let a = 0,
      b = 0;

    buffer.executeBatch([
      {
        id: 'a',
        name: 'incA',
        execute: () => {
          a += 5;
        },
        undo: () => {
          a -= 5;
        },
      },
      {
        id: 'b',
        name: 'incB',
        execute: () => {
          b += 3;
        },
        undo: () => {
          b -= 3;
        },
      },
    ]);

    expect(a).toBe(5);
    expect(b).toBe(3);
    expect(buffer.getUndoStackSize()).toBe(1); // Single batch entry

    buffer.undo();
    expect(a).toBe(0);
    expect(b).toBe(0);
  });

  it('should record and play macros', () => {
    const buffer = new CommandBuffer();
    let value = 0;

    buffer.startRecording();
    buffer.execute({
      id: 'a',
      name: 'add',
      execute: () => {
        value += 1;
      },
      undo: () => {
        value -= 1;
      },
    });
    buffer.execute({
      id: 'b',
      name: 'add',
      execute: () => {
        value += 2;
      },
      undo: () => {
        value -= 2;
      },
    });
    buffer.stopRecording('myMacro');

    expect(buffer.getMacroNames()).toContain('myMacro');

    value = 0;
    buffer.playMacro('myMacro');
    expect(value).toBe(3); // 1 + 2
  });
});
