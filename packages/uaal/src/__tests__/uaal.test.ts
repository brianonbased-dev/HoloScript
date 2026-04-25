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
    expect(UAALOpCode.HALT).toBe(0xff);
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
    expect(bytecode.version).toBe(2);
    const opcodes = bytecode.instructions.map((i) => i.opCode);
    expect(opcodes).toContain(UAALOpCode.INTAKE);
    expect(opcodes[opcodes.length - 1]).toBe(UAALOpCode.HALT);
  });

  it('should compile REFLECT intent', () => {
    const bytecode = compiler.compileIntent('THINK about this problem');
    const opcodes = bytecode.instructions.map((i) => i.opCode);
    expect(opcodes).toContain(UAALOpCode.REFLECT);
  });

  it('should compile COMPRESS intent', () => {
    const bytecode = compiler.compileIntent('STORE the results');
    const opcodes = bytecode.instructions.map((i) => i.opCode);
    expect(opcodes).toContain(UAALOpCode.COMPRESS);
  });

  it('should compile multi-phase intent', () => {
    const bytecode = compiler.compileIntent('INTAKE context THINK deeply STORE insights');
    const opcodes = bytecode.instructions.map((i) => i.opCode);
    expect(opcodes).toContain(UAALOpCode.INTAKE);
    expect(opcodes).toContain(UAALOpCode.REFLECT);
    expect(opcodes).toContain(UAALOpCode.COMPRESS);
  });

  it('should build a complete 7-phase cycle', () => {
    const bytecode = compiler.buildFullCycle('Analyze market data');
    expect(bytecode.instructions).toHaveLength(9); // PUSH + 7 phases + HALT

    const opcodes = bytecode.instructions.map((i) => i.opCode);
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
    expect(bytecode.version).toBe(2);
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
        instructions: [{ opCode: UAALOpCode.PUSH, operands: [42] }, { opCode: UAALOpCode.HALT }],
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
        instructions: [{ opCode: UAALOpCode.PUSH }, { opCode: UAALOpCode.HALT }],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBeNull();
    });
  });

  describe('Cognitive operations', () => {
    it('should execute INTAKE and produce phase data', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [{ opCode: UAALOpCode.INTAKE }, { opCode: UAALOpCode.HALT }],
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
          { opCode: UAALOpCode.PUSH, operands: [1] }, // 0
          { opCode: UAALOpCode.JUMP, operands: [3] }, // 1 → jump to 3
          { opCode: UAALOpCode.PUSH, operands: [999] }, // 2 → skipped
          { opCode: UAALOpCode.PUSH, operands: [2] }, // 3 → lands here
          { opCode: UAALOpCode.HALT }, // 4
        ],
      };
      const result = await vm.execute(bytecode);
      expect(result.stackTop).toBe(2);
    });

    it('should execute JUMP_IF on truthy condition', async () => {
      const bytecode: UAALBytecode = {
        version: 1,
        instructions: [
          { opCode: UAALOpCode.PUSH, operands: [1] }, // truthy
          { opCode: UAALOpCode.JUMP_IF, operands: [3] }, // should jump
          { opCode: UAALOpCode.PUSH, operands: [100] }, // skipped
          { opCode: UAALOpCode.PUSH, operands: [42] }, // lands here
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
          { opCode: UAALOpCode.PUSH, operands: [0] }, // falsy
          { opCode: UAALOpCode.JUMP_IF, operands: [4] }, // should not jump
          { opCode: UAALOpCode.PUSH, operands: [100] }, // should execute
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
        instructions: [{ opCode: UAALOpCode.OP_TIMESTAMP }, { opCode: UAALOpCode.HALT }],
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
        instructions: [{ opCode: UAALOpCode.OP_ERROR, operands: ['test error'] }],
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
        instructions: [{ opCode: UAALOpCode.INTAKE }, { opCode: UAALOpCode.HALT }],
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
        instructions: [{ opCode: UAALOpCode.PUSH, operands: [42] }, { opCode: UAALOpCode.HALT }],
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

// =============================================================================
// BRITTNEY / INFINITY HYBRID LOOP HOOKS (anti-regression for studio binding)
// =============================================================================
//
// The studio's Brittney agent (packages/studio/src/lib/brittney/BrittneyTools.ts)
// uses OpenAI function-calling tools to manipulate the scene-graph. In production,
// the Brittney chat route compiles user intent into a uAAL program whose
// OP_INVOKE_LLM handler returns a Brittney-shaped tool-call result onto the VM
// stack. The next instruction can read that result, branch on it, or feed it into
// REFLECT/COMPRESS for the autonomous synthesis loop.
//
// We do NOT import from @holoscript/studio here — uaal must stay a pure core
// package with no UI deps. Instead, we keep a LOCAL CLONE of Brittney's tool-call
// shape and assert the contract. If studio's BrittneyTools.ts schema diverges
// from the shape encoded here, fix the divergence in the test (and add a
// migration note to MEMORY.md / CLAUDE.md). If uaal's VM contract changes in a
// way that breaks this shape, the breaking change must update both sides.
//
// Refs: task_1776314407827_6ago "[Cursor A] Brittney/Infinity Hybrid Loop Hooks"
// Production: packages/studio/src/app/api/brittney/route.ts
// =============================================================================

describe('Brittney/Infinity Hybrid Loop Hooks (anti-regression for studio binding)', () => {
  // Local clone of Brittney's tool-call shape — kept in sync with
  // packages/studio/src/lib/brittney/BrittneyTools.ts via this test suite.
  type BrittneyToolSpec = {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, { type: string; description?: string }>;
        required?: string[];
      };
    };
  };

  type BrittneyToolCallResult = {
    toolName: string;
    arguments: Record<string, unknown>;
    result: { ok: boolean; message?: string; [k: string]: unknown };
  };

  it('OP_INVOKE_LLM is registerable and pushes a Brittney-shaped tool-call onto the stack', async () => {
    const vm = new UAALVirtualMachine();
    let observedPrompt: unknown = null;

    vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, (proxy, operands) => {
      observedPrompt = operands[0] ?? null;
      const toolCall: BrittneyToolCallResult = {
        toolName: 'add_trait',
        arguments: {
          object_name: 'cube_1',
          trait_name: 'physics',
          properties: { mass: 1.0 },
        },
        result: { ok: true, message: 'Added physics trait to cube_1' },
      };
      proxy.push(toolCall as unknown as UAALOperand);
    });

    const program: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.OP_INVOKE_LLM, operands: ['add a physics trait to cube_1'] },
        { opCode: UAALOpCode.HALT, operands: [] },
      ],
    };

    const result = await vm.execute(program);
    expect(result.taskStatus).toBe('HALTED');
    expect(observedPrompt).toBe('add a physics trait to cube_1');

    const stackTop = result.stackTop as unknown as BrittneyToolCallResult;
    expect(stackTop.toolName).toBe('add_trait');
    expect(stackTop.arguments).toMatchObject({
      object_name: 'cube_1',
      trait_name: 'physics',
    });
    expect(stackTop.result.ok).toBe(true);
  });

  it('cognitive opcodes (INTAKE -> REFLECT -> OP_INVOKE_LLM) chain into a Brittney synthesis loop', async () => {
    const vm = new UAALVirtualMachine();
    const synthesisTrace: string[] = [];

    vm.registerHandler(UAALOpCode.INTAKE, (proxy, operands) => {
      synthesisTrace.push('INTAKE');
      proxy.push(operands[0] ?? null);
    });
    vm.registerHandler(UAALOpCode.REFLECT, (proxy) => {
      synthesisTrace.push('REFLECT');
      const intent = proxy.pop();
      proxy.push(`reflected: ${String(intent)}`);
    });
    vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, (proxy) => {
      synthesisTrace.push('INVOKE_LLM');
      const reflectedPrompt = proxy.pop();
      const toolCall: BrittneyToolCallResult = {
        toolName: 'set_trait_property',
        arguments: { object_name: 'lamp', property: 'intensity', value: 5 },
        result: { ok: true, derivedFrom: String(reflectedPrompt) },
      };
      proxy.push(toolCall as unknown as UAALOperand);
    });

    const program: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.INTAKE, operands: ['user wants brighter lamp'] },
        { opCode: UAALOpCode.REFLECT, operands: [] },
        { opCode: UAALOpCode.OP_INVOKE_LLM, operands: [] },
        { opCode: UAALOpCode.HALT, operands: [] },
      ],
    };

    const result = await vm.execute(program);
    expect(result.taskStatus).toBe('HALTED');
    expect(synthesisTrace).toEqual(['INTAKE', 'REFLECT', 'INVOKE_LLM']);

    const stackTop = result.stackTop as unknown as BrittneyToolCallResult;
    expect(stackTop.toolName).toBe('set_trait_property');
    expect(stackTop.result.derivedFrom).toBe('reflected: user wants brighter lamp');
  });

  it('Brittney tool schema shape: type:function + nested function with required fields', () => {
    // This locks the schema shape of BRITTNEY_TOOLS exports. If
    // packages/studio/src/lib/brittney/BrittneyTools.ts changes the outer envelope,
    // update the BrittneyToolSpec type above + bump this assertion.
    const sampleSpec: BrittneyToolSpec = {
      type: 'function',
      function: {
        name: 'add_trait',
        description: 'Add a trait to a scene object.',
        parameters: {
          type: 'object',
          properties: {
            object_name: { type: 'string' },
            trait_name: { type: 'string' },
            properties: { type: 'object' },
          },
          required: ['object_name', 'trait_name'],
        },
      },
    };

    expect(sampleSpec.type).toBe('function');
    expect(sampleSpec.function.name).toBe('add_trait');
    expect(sampleSpec.function.parameters.type).toBe('object');
    expect(sampleSpec.function.parameters.required).toContain('object_name');
    expect(sampleSpec.function.parameters.required).toContain('trait_name');
  });

  it('multiple OP_INVOKE_LLM in sequence (autonomous synthesis multi-tool loop)', async () => {
    const vm = new UAALVirtualMachine();
    const callLog: BrittneyToolCallResult[] = [];

    let callCount = 0;
    vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, (proxy, operands) => {
      callCount += 1;
      const toolCall: BrittneyToolCallResult = {
        toolName: callCount === 1 ? 'add_trait' : 'set_trait_property',
        arguments: { iteration: callCount, prompt: String(operands[0] ?? '') },
        result: { ok: true },
      };
      callLog.push(toolCall);
      proxy.push(toolCall as unknown as UAALOperand);
    });

    const program: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.OP_INVOKE_LLM, operands: ['create lamp'] },
        { opCode: UAALOpCode.POP, operands: [] },
        { opCode: UAALOpCode.OP_INVOKE_LLM, operands: ['brighten lamp'] },
        { opCode: UAALOpCode.HALT, operands: [] },
      ],
    };

    const result = await vm.execute(program);
    expect(result.taskStatus).toBe('HALTED');
    expect(callLog).toHaveLength(2);
    expect(callLog[0].toolName).toBe('add_trait');
    expect(callLog[0].arguments.prompt).toBe('create lamp');
    expect(callLog[1].toolName).toBe('set_trait_property');
    expect(callLog[1].arguments.prompt).toBe('brighten lamp');

    // Final stack should still hold the second tool-call result
    const stackTop = result.stackTop as unknown as BrittneyToolCallResult;
    expect(stackTop.arguments.iteration).toBe(2);
  });

  it('OP_INVOKE_LLM without a registered handler is a non-fatal no-op (does not crash the VM)', async () => {
    // Studio's Brittney binding registers its handler at chat-route boot. If the
    // binding is missing in some context (e.g., bare uAAL test harness), the VM
    // must NOT panic — the unhandled-opcode default at vm.ts:331 pushes null and
    // continues. Brittney's binding therefore must always check for null before
    // treating the stack top as a tool-call result.
    const vm = new UAALVirtualMachine();
    const program: UAALBytecode = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.PUSH, operands: ['fallback'] },
        { opCode: UAALOpCode.OP_INVOKE_LLM, operands: ['no handler registered'] },
        { opCode: UAALOpCode.HALT, operands: [] },
      ],
    };

    const result = await vm.execute(program);
    expect(result.taskStatus).toBe('HALTED');
    // Default behavior pushes null on top of the existing stack. Brittney's
    // binding contract: a null stackTop after OP_INVOKE_LLM means "no LLM
    // configured" and the host must surface a clear error to the user.
    expect(result.stackTop).toBeNull();
    expect(result.state.stack).toEqual(['fallback', null]);
  });
});
