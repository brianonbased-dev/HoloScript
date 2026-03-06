import { describe, it, expect, beforeEach } from 'vitest';
import {
  UAALVirtualMachine,
  UAALCompiler,
  UAALOpCode,
  getUAALOpcodeName,
  isCognitiveOp,
  isControlFlowOp,
} from '../index';
import type { UAALBytecode, VMProxy } from '../index';

// =============================================================================
// OPCODE TESTS
// =============================================================================

describe('UAALOpCode', () => {
  it('should have stack opcodes in 0x01-0x03 range', () => {
    expect(UAALOpCode.PUSH).toBe(0x01);
    expect(UAALOpCode.POP).toBe(0x02);
    expect(UAALOpCode.PEEK).toBe(0x03);
  });

  it('should have cognitive opcodes in 0x10-0x17 range', () => {
    expect(UAALOpCode.INTAKE).toBe(0x10);
    expect(UAALOpCode.REFLECT).toBe(0x11);
    expect(UAALOpCode.COMPRESS).toBe(0x12);
    expect(UAALOpCode.EXECUTE).toBe(0x14);
    expect(UAALOpCode.REINTAKE).toBe(0x15);
    expect(UAALOpCode.GROW).toBe(0x16);
    expect(UAALOpCode.EVOLVE).toBe(0x17);
  });

  it('should have HALT at 0xFF', () => {
    expect(UAALOpCode.HALT).toBe(0xFF);
  });

  it('should identify cognitive opcodes', () => {
    expect(isCognitiveOp(UAALOpCode.INTAKE)).toBe(true);
    expect(isCognitiveOp(UAALOpCode.REFLECT)).toBe(true);
    expect(isCognitiveOp(UAALOpCode.EVOLVE)).toBe(true);
    expect(isCognitiveOp(UAALOpCode.PUSH)).toBe(false);
    expect(isCognitiveOp(UAALOpCode.HALT)).toBe(false);
  });

  it('should identify control flow opcodes', () => {
    expect(isControlFlowOp(UAALOpCode.JUMP)).toBe(true);
    expect(isControlFlowOp(UAALOpCode.JUMP_IF)).toBe(true);
    expect(isControlFlowOp(UAALOpCode.HALT)).toBe(true);
    expect(isControlFlowOp(UAALOpCode.PUSH)).toBe(false);
  });

  it('should return opcode names', () => {
    expect(getUAALOpcodeName(UAALOpCode.INTAKE)).toBe('INTAKE');
    expect(getUAALOpcodeName(UAALOpCode.HALT)).toBe('HALT');
    expect(getUAALOpcodeName(UAALOpCode.OP_INVOKE_LLM)).toBe('OP_INVOKE_LLM');
  });
});

// =============================================================================
// COMPILER TESTS
// =============================================================================

describe('UAALCompiler', () => {
  let compiler: UAALCompiler;

  beforeEach(() => {
    compiler = new UAALCompiler();
  });

  it('should compile INTAKE intent', () => {
    const bytecode = compiler.compileIntent('INTAKE new data from sensors');
    expect(bytecode.version).toBe(1);
    const opcodes = bytecode.instructions.map(i => i.opCode);
    expect(opcodes).toContain(UAALOpCode.INTAKE);
    expect(opcodes[opcodes.length - 1]).toBe(UAALOpCode.HALT);
  });

  it('should compile REFLECT intent', () => {
    const bytecode = compiler.compileIntent('THINK about this problem');
    const opcodes = bytecode.instructions.map(i => i.opCode);
    expect(opcodes).toContain(UAALOpCode.REFLECT);
  });

  it('should compile COMPRESS intent', () => {
    const bytecode = compiler.compileIntent('STORE the results');
    const opcodes = bytecode.instructions.map(i => i.opCode);
    expect(opcodes).toContain(UAALOpCode.COMPRESS);
  });

  it('should compile multi-phase intent', () => {
    const bytecode = compiler.compileIntent('INTAKE context THINK deeply STORE insights');
    const opcodes = bytecode.instructions.map(i => i.opCode);
    expect(opcodes).toContain(UAALOpCode.INTAKE);
    expect(opcodes).toContain(UAALOpCode.REFLECT);
    expect(opcodes).toContain(UAALOpCode.COMPRESS);
  });

  it('should build a complete 7-phase cycle', () => {
    const bytecode = compiler.buildFullCycle('Analyze market data');
    expect(bytecode.instructions).toHaveLength(9); // PUSH + 7 phases + HALT

    const opcodes = bytecode.instructions.map(i => i.opCode);
    expect(opcodes[0]).toBe(UAALOpCode.PUSH);
    expect(opcodes[1]).toBe(UAALOpCode.INTAKE);
    expect(opcodes[2]).toBe(UAALOpCode.REFLECT);
    expect(opcodes[3]).toBe(UAALOpCode.EXECUTE);
    expect(opcodes[4]).toBe(UAALOpCode.COMPRESS);
    expect(opcodes[5]).toBe(UAALOpCode.REINTAKE);
    expect(opcodes[6]).toBe(UAALOpCode.GROW);
    expect(opcodes[7]).toBe(UAALOpCode.EVOLVE);
    expect(opcodes[8]).toBe(UAALOpCode.HALT);
  });

  it('should build raw bytecode from instructions', () => {
    const bytecode = compiler.buildBytecode([
      { opCode: UAALOpCode.PUSH, operands: [42] },
      { opCode: UAALOpCode.HALT },
    ]);
    expect(bytecode.version).toBe(1);
    expect(bytecode.instructions).toHaveLength(2);
  });
});

// =============================================================================
// VM EXECUTION TESTS
// =============================================================================

describe('UAALVirtualMachine', () => {
  let vm: UAALVirtualMachine;

  beforeEach(() => {
    vm = new UAALVirtualMachine();
  });

  describe('Stack operations', () => {
    it('should execute PUSH and HALT', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [42] },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.taskStatus).toBe('HALTED');
      expect(result.stackTop).toBe(42);
    });

    it('should execute PUSH and POP', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [10] },
          { opCode: UAALOpCode.PUSH, operands: [20] },
          { opCode: UAALOpCode.POP },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe(10); // 20 was popped
    });

    it('should push null for empty operands', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBeNull();
    });
  });

  describe('Cognitive operations', () => {
    it('should execute INTAKE and produce phase data', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.INTAKE },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toHaveProperty('phase', 'INTAKE');
      expect(result.stackTop).toHaveProperty('timestamp');
    });

    it('should execute REFLECT with stack data', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: ['context data'] },
          { opCode: UAALOpCode.REFLECT },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toHaveProperty('phase', 'REFLECT');
      expect(result.stackTop).toHaveProperty('reflected', true);
      expect(result.stackTop).toHaveProperty('data', 'context data');
    });

    it('should execute COMPRESS', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: ['raw knowledge'] },
          { opCode: UAALOpCode.COMPRESS },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toHaveProperty('phase', 'COMPRESS');
      expect(result.stackTop).toHaveProperty('compressed', true);
    });

    it('should execute full 7-phase cycle', async () => {
      const compiler = new UAALCompiler();
      const bytecode = compiler.buildFullCycle('Test task');
      const result = await vm.execute(bytecode);

      expect(result.taskStatus).toBe('HALTED');
      // Stack should contain final EVOLVE result
      expect(result.stackTop).toHaveProperty('phase', 'EVOLVE');
    });
  });

  describe('Control flow', () => {
    it('should execute JUMP', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [1] },   // 0
          { opCode: UAALOpCode.JUMP, operands: [3] },    // 1 → jump to 3
          { opCode: UAALOpCode.PUSH, operands: [999] },  // 2 → skipped
          { opCode: UAALOpCode.PUSH, operands: [2] },    // 3 → lands here
          { opCode: UAALOpCode.HALT },                    // 4
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe(2);
    });

    it('should execute JUMP_IF on truthy condition', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [1] },    // truthy
          { opCode: UAALOpCode.JUMP_IF, operands: [3] },  // should jump
          { opCode: UAALOpCode.PUSH, operands: [100] },   // skipped
          { opCode: UAALOpCode.PUSH, operands: [42] },    // lands here
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe(42);
    });

    it('should NOT jump on falsy condition', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [0] },     // falsy
          { opCode: UAALOpCode.JUMP_IF, operands: [4] },   // should not jump
          { opCode: UAALOpCode.PUSH, operands: [100] },    // should execute
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe(100);
    });
  });

  describe('State management', () => {
    it('should set and get state', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_STATE_SET, operands: ['key1', 'value1'] },
          { opCode: UAALOpCode.OP_STATE_GET, operands: ['key1'] },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe('value1');
    });

    it('should return null for missing state key', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_STATE_GET, operands: ['nonexistent'] },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBeNull();
    });

    it('should accept initial context', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_STATE_GET, operands: ['preset'] },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode, { preset: 'hello' });
      expect(result.stackTop).toBe('hello');
    });
  });

  describe('Temporal operations', () => {
    it('should push timestamp', async () => {
      const before = Date.now();
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_TIMESTAMP },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      const after = Date.now();
      expect(result.stackTop).toBeGreaterThanOrEqual(before);
      expect(result.stackTop).toBeLessThanOrEqual(after);
    });

    it('should compute time delta', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [1000] },
          { opCode: UAALOpCode.PUSH, operands: [3000] },
          { opCode: UAALOpCode.OP_TIME_DELTA },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe(2000);
    });
  });

  describe('Error handling', () => {
    it('should throw on OP_ERROR', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_ERROR, operands: ['test error'] },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.taskStatus).toBe('ERROR');
    });

    it('should throw on failed OP_ASSERT', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [0] }, // falsy
          { opCode: UAALOpCode.OP_ASSERT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.taskStatus).toBe('ERROR');
    });

    it('should pass on truthy OP_ASSERT', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [1] }, // truthy
          { opCode: UAALOpCode.OP_ASSERT },
          { opCode: UAALOpCode.PUSH, operands: ['passed'] },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.taskStatus).toBe('HALTED');
      expect(result.stackTop).toBe('passed');
    });
  });

  describe('Custom handlers (registerHandler API)', () => {
    it('should execute custom handler for opcode', async () => {
      vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, async (proxy, operands) => {
        const prompt = operands[0] as string;
        proxy.push(`LLM says: ${prompt}`);
      });

      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.OP_INVOKE_LLM, operands: ['hello world'] },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe('LLM says: hello world');
    });

    it('should override default cognitive handler', async () => {
      vm.registerHandler(UAALOpCode.INTAKE, async (proxy, operands) => {
        proxy.push({ custom: true, source: 'overridden' });
      });

      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.INTAKE },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toHaveProperty('custom', true);
      expect(result.stackTop).toHaveProperty('source', 'overridden');
    });

    it('should support handler that uses stack operations', async () => {
      vm.registerHandler(UAALOpCode.EXEC, async (proxy) => {
        const a = proxy.pop() as number;
        const b = proxy.pop() as number;
        proxy.push((a ?? 0) + (b ?? 0));
      });

      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [10] },
          { opCode: UAALOpCode.PUSH, operands: [32] },
          { opCode: UAALOpCode.EXEC },
          { opCode: UAALOpCode.HALT },
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe(42);
    });
  });

  describe('VM lifecycle', () => {
    it('should reset VM state', async () => {
      // First execution
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [42] },
          { opCode: UAALOpCode.HALT },
        ],
      };
      await vm.execute(bytecode);

      // Reset
      vm.reset();
      const state = vm.getState();
      expect(state.stack).toHaveLength(0);
      expect(state.pc).toBe(0);
      expect(state.isHalted).toBe(false);
    });

    it('should accept initial context on reset', () => {
      vm.reset({ key: 'value' });
      const state = vm.getState();
      expect(state.context).toHaveProperty('key', 'value');
    });
  });
});
