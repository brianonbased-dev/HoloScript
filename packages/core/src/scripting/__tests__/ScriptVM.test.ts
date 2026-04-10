import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptVM, OpCode, type Instruction } from '../ScriptVM';

describe('ScriptVM', () => {
  let vm: ScriptVM;

  beforeEach(() => {
    vm = new ScriptVM();
  });

  // Basic arithmetic
  it('PUSH + ADD + HALT', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 3 },
      { op: OpCode.PUSH, operand: 4 },
      { op: OpCode.ADD },
      { op: OpCode.HALT },
    ]);
    const state = vm.run();
    expect(state.stack[0]).toBe(7);
    expect(state.running).toBe(false);
    expect(state.error).toBeNull();
  });

  it('SUB', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 10 },
      { op: OpCode.PUSH, operand: 3 },
      { op: OpCode.SUB },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(7);
  });

  it('MUL', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 5 },
      { op: OpCode.PUSH, operand: 6 },
      { op: OpCode.MUL },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(30);
  });

  it('DIV', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 20 },
      { op: OpCode.PUSH, operand: 4 },
      { op: OpCode.DIV },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(5);
  });

  it('DIV by zero throws error', () => {
    vm.load([{ op: OpCode.PUSH, operand: 1 }, { op: OpCode.PUSH, operand: 0 }, { op: OpCode.DIV }]);
    const state = vm.run();
    expect(state.error).toContain('Division by zero');
  });

  it('MOD', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 10 },
      { op: OpCode.PUSH, operand: 3 },
      { op: OpCode.MOD },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(1);
  });

  it('NEG', () => {
    vm.load([{ op: OpCode.PUSH, operand: 5 }, { op: OpCode.NEG }, { op: OpCode.HALT }]);
    expect(vm.run().stack[0]).toBe(-5);
  });

  // Comparisons
  it('EQ true', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 3 },
      { op: OpCode.PUSH, operand: 3 },
      { op: OpCode.EQ },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(1);
  });

  it('LT', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 2 },
      { op: OpCode.PUSH, operand: 5 },
      { op: OpCode.LT },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(1);
  });

  // Registers
  it('STORE and LOAD', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 42 },
      { op: OpCode.STORE, operand: 'x' },
      { op: OpCode.LOAD, operand: 'x' },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(42);
  });

  it('setRegister / getRegister', () => {
    vm.setRegister('hp', 100);
    expect(vm.getRegister('hp')).toBe(100);
  });

  // Jump
  it('JMP skips instructions', () => {
    vm.load([
      { op: OpCode.JMP, operand: 2 },
      { op: OpCode.PUSH, operand: 999 }, // skipped
      { op: OpCode.PUSH, operand: 1 },
      { op: OpCode.HALT },
    ]);
    const state = vm.run();
    expect(state.stack).toEqual([1]);
  });

  it('JMP_IF conditional jump', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 1 }, // truthy
      { op: OpCode.JMP_IF, operand: 3 },
      { op: OpCode.PUSH, operand: 999 }, // skipped
      { op: OpCode.PUSH, operand: 42 },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(42);
  });

  // CALL native function
  it('CALL built-in abs', () => {
    vm.load([
      { op: OpCode.PUSH, operand: -7 },
      { op: OpCode.PUSH, operand: 1 }, // argc
      { op: OpCode.CALL, operand: 'abs' },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(7);
  });

  it('CALL unknown function throws error', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 1 },
      { op: OpCode.PUSH, operand: 1 },
      { op: OpCode.CALL, operand: 'foo' },
    ]);
    expect(vm.run().error).toContain('Unknown function');
  });

  // registerFunction
  it('registerFunction custom', () => {
    vm.registerFunction('double', (a) => a * 2);
    vm.load([
      { op: OpCode.PUSH, operand: 5 },
      { op: OpCode.PUSH, operand: 1 },
      { op: OpCode.CALL, operand: 'double' },
      { op: OpCode.HALT },
    ]);
    expect(vm.run().stack[0]).toBe(10);
  });

  // Step execution
  it('step executes one instruction at a time', () => {
    vm.load([
      { op: OpCode.PUSH, operand: 1 },
      { op: OpCode.PUSH, operand: 2 },
      { op: OpCode.ADD },
      { op: OpCode.HALT },
    ]);
    vm.step(); // PUSH 1
    vm.step(); // PUSH 2
    vm.step(); // ADD
    expect(vm.getState().stack).toEqual([3]);
  });

  // Max instructions
  it('max instructions protection', () => {
    const loop: Instruction[] = [{ op: OpCode.NOP }, { op: OpCode.JMP, operand: 0 }];
    vm.load(loop);
    const state = vm.run();
    expect(state.error).toContain('Max instructions');
  });

  // Reset
  it('reset clears state', () => {
    vm.load([{ op: OpCode.PUSH, operand: 1 }, { op: OpCode.HALT }]);
    vm.run();
    vm.reset();
    const state = vm.getState();
    expect(state.stack).toHaveLength(0);
    expect(state.pc).toBe(0);
  });

  // getState
  it('getState returns full state', () => {
    vm.load([{ op: OpCode.PUSH, operand: 42 }, { op: OpCode.HALT }]);
    vm.run();
    const state = vm.getState();
    expect(state.stack).toEqual([42]);
    expect(state.instructionsExecuted).toBe(2);
  });
});
