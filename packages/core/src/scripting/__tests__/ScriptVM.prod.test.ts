/**
 * ScriptVM — production test suite
 *
 * Tests: load/reset, run (HALT/RET), arithmetic opcodes,
 * comparison opcodes, logical opcodes, STORE/LOAD registers,
 * JMP/JMP_IF/JMP_NOT, CALL (native functions), step(),
 * error handling (division by zero, stack overflow/underflow,
 * max instructions), peek/getStackSize, getState.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptVM, OpCode } from '../ScriptVM';
import type { Instruction } from '../ScriptVM';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ins = (op: OpCode, operand?: number | string): Instruction => ({ op, operand });

function runProgram(vm: ScriptVM, instructions: Instruction[]) {
  vm.load(instructions);
  return vm.run();
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ScriptVM: production', () => {
  let vm: ScriptVM;

  beforeEach(() => {
    vm = new ScriptVM();
  });

  // ─── Basic load / reset ──────────────────────────────────────────────────
  describe('load / reset', () => {
    it('starts with empty state', () => {
      const s = vm.getState();
      expect(s.stack).toEqual([]);
      expect(s.error).toBeNull();
      expect(s.pc).toBe(0);
    });

    it('reset clears stack and pc', () => {
      runProgram(vm, [ins(OpCode.PUSH, 5), ins(OpCode.HALT)]);
      vm.reset();
      const s = vm.getState();
      expect(s.stack).toEqual([]);
      expect(s.pc).toBe(0);
      expect(s.instructionsExecuted).toBe(0);
    });
  });

  // ─── PUSH / HALT ─────────────────────────────────────────────────────────
  describe('PUSH / HALT / NOP', () => {
    it('PUSH places value on stack', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 42), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([42]);
    });

    it('NOP does nothing', () => {
      const s = runProgram(vm, [ins(OpCode.NOP), ins(OpCode.PUSH, 1), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });

    it('HALT stops execution', () => {
      const s = runProgram(vm, [ins(OpCode.HALT), ins(OpCode.PUSH, 99)]);
      expect(s.stack).toEqual([]); // PUSH never executed
    });
  });

  // ─── Arithmetic ──────────────────────────────────────────────────────────
  describe('arithmetic opcodes', () => {
    it('ADD computes sum', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 3), ins(OpCode.PUSH, 4), ins(OpCode.ADD), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([7]);
    });

    it('SUB computes difference', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 10), ins(OpCode.PUSH, 3), ins(OpCode.SUB), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([7]);
    });

    it('MUL computes product', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 6), ins(OpCode.PUSH, 7), ins(OpCode.MUL), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([42]);
    });

    it('DIV computes quotient', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 15), ins(OpCode.PUSH, 3), ins(OpCode.DIV), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([5]);
    });

    it('DIV by zero sets error', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 1), ins(OpCode.PUSH, 0), ins(OpCode.DIV)]);
      expect(s.error).toContain('zero');
    });

    it('MOD computes remainder', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 10), ins(OpCode.PUSH, 3), ins(OpCode.MOD), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });

    it('NEG negates value', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 5), ins(OpCode.NEG), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([-5]);
    });
  });

  // ─── Comparison ──────────────────────────────────────────────────────────
  describe('comparison opcodes', () => {
    it('EQ returns 1 when equal', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 5), ins(OpCode.PUSH, 5), ins(OpCode.EQ), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });

    it('EQ returns 0 when not equal', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 5), ins(OpCode.PUSH, 6), ins(OpCode.EQ), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([0]);
    });

    it('LT returns 1 when a < b', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 3), ins(OpCode.PUSH, 5), ins(OpCode.LT), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });

    it('GT returns 1 when a > b', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 9), ins(OpCode.PUSH, 4), ins(OpCode.GT), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });

    it('NEQ returns 1 when not equal', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 1), ins(OpCode.PUSH, 2), ins(OpCode.NEQ), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });
  });

  // ─── Logical ─────────────────────────────────────────────────────────────
  describe('logical opcodes', () => {
    it('AND returns 1 when both true', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 1), ins(OpCode.PUSH, 1), ins(OpCode.AND), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });

    it('AND returns 0 when one is false', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 1), ins(OpCode.PUSH, 0), ins(OpCode.AND), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([0]);
    });

    it('OR returns 1 when one is true', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 0), ins(OpCode.PUSH, 1), ins(OpCode.OR), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });

    it('NOT toggles truthy value', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 1), ins(OpCode.NOT), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([0]);
    });

    it('NOT toggles falsy value', () => {
      const s = runProgram(vm, [ins(OpCode.PUSH, 0), ins(OpCode.NOT), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([1]);
    });
  });

  // ─── STORE / LOAD ────────────────────────────────────────────────────────
  describe('register STORE / LOAD', () => {
    it('STORE saves and LOAD retrieves', () => {
      const s = runProgram(vm, [
        ins(OpCode.PUSH, 99),
        ins(OpCode.STORE, 'x'),
        ins(OpCode.LOAD, 'x'),
        ins(OpCode.HALT),
      ]);
      expect(s.stack).toEqual([99]);
    });

    it('LOAD returns 0 for undefined register', () => {
      const s = runProgram(vm, [ins(OpCode.LOAD, 'undef'), ins(OpCode.HALT)]);
      expect(s.stack).toEqual([0]);
    });

    it('setRegister / getRegister work externally', () => {
      vm.setRegister('hp', 100);
      expect(vm.getRegister('hp')).toBe(100);
    });
  });

  // ─── JMP / JMP_IF / JMP_NOT ──────────────────────────────────────────────
  describe('jump opcodes', () => {
    it('JMP unconditionally jumps to address', () => {
      // Jump over PUSH 0 to PUSH 1, HALT
      const prog = [
        ins(OpCode.JMP, 2),   // 0: jump to 2
        ins(OpCode.PUSH, 0),  // 1: skipped
        ins(OpCode.PUSH, 1),  // 2: executed
        ins(OpCode.HALT),     // 3
      ];
      const s = runProgram(vm, prog);
      expect(s.stack).toEqual([1]);
    });

    it('JMP_IF jumps when top is truthy', () => {
      const prog = [
        ins(OpCode.PUSH, 1),   // 0: condition
        ins(OpCode.JMP_IF, 3), // 1: jump to 3 if truthy
        ins(OpCode.PUSH, 99),  // 2: skipped
        ins(OpCode.PUSH, 42),  // 3
        ins(OpCode.HALT),      // 4
      ];
      const s = runProgram(vm, prog);
      expect(s.stack).toEqual([42]);
    });

    it('JMP_NOT jumps when top is falsy', () => {
      const prog = [
        ins(OpCode.PUSH, 0),    // 0: condition = false
        ins(OpCode.JMP_NOT, 3), // 1: jump to 3
        ins(OpCode.PUSH, 99),   // 2: skipped
        ins(OpCode.PUSH, 7),    // 3
        ins(OpCode.HALT),       // 4
      ];
      const s = runProgram(vm, prog);
      expect(s.stack).toEqual([7]);
    });
  });

  // ─── CALL native functions ────────────────────────────────────────────────
  describe('CALL native functions', () => {
    it('calls built-in abs', () => {
      const prog = [
        ins(OpCode.PUSH, -5),   // arg
        ins(OpCode.PUSH, 1),    // argc
        ins(OpCode.CALL, 'abs'),
        ins(OpCode.HALT),
      ];
      const s = runProgram(vm, prog);
      expect(s.stack).toEqual([5]);
    });

    it('calls built-in min', () => {
      const prog = [
        ins(OpCode.PUSH, 10),
        ins(OpCode.PUSH, 3),
        ins(OpCode.PUSH, 2), // argc=2
        ins(OpCode.CALL, 'min'),
        ins(OpCode.HALT),
      ];
      const s = runProgram(vm, prog);
      expect(s.stack).toEqual([3]);
    });

    it('calls custom registered function', () => {
      vm.registerFunction('double', (n) => n * 2);
      const prog = [
        ins(OpCode.PUSH, 21),
        ins(OpCode.PUSH, 1),
        ins(OpCode.CALL, 'double'),
        ins(OpCode.HALT),
      ];
      const s = runProgram(vm, prog);
      expect(s.stack).toEqual([42]);
    });

    it('sets error for unknown function', () => {
      const prog = [
        ins(OpCode.PUSH, 0), // argc
        ins(OpCode.CALL, 'doesNotExist'),
      ];
      const s = runProgram(vm, prog);
      expect(s.error).toContain('Unknown function');
    });
  });

  // ─── step() ──────────────────────────────────────────────────────────────
  describe('step()', () => {
    it('returns false when program ends', () => {
      vm.load([ins(OpCode.PUSH, 1)]);
      vm.step(); // executes PUSH
      expect(vm.step()).toBe(false); // end of program
    });
  });

  // ─── peek / getStackSize ─────────────────────────────────────────────────
  describe('peek / getStackSize', () => {
    it('peek returns top of stack without popping', () => {
      vm.load([ins(OpCode.PUSH, 7), ins(OpCode.PUSH, 3)]);
      vm.step(); vm.step();
      expect(vm.peek()).toBe(3);
      expect(vm.getStackSize()).toBe(2);
    });
  });

  // ─── Error cases ─────────────────────────────────────────────────────────
  describe('error handling', () => {
    it('stack underflow sets error', () => {
      const s = runProgram(vm, [ins(OpCode.POP)]);
      expect(s.error).toContain('underflow');
    });

    it('max instructions exceeded sets error', () => {
      // Infinite loop: JMP 0
      const s = runProgram(vm, [ins(OpCode.JMP, 0)]);
      expect(s.error).toContain('Max instructions');
    });
  });
});
