import { describe, expect, it } from 'vitest';
import {
  UAAL_BYTECODE_HASH_ALGORITHM,
  UAAL_VM_EXECUTION_PROFILE_SCHEMA,
  UAAL_VM_IMPLEMENTATION_ID,
  UAALOpCode,
  UAALVirtualMachine,
  computeUAALBytecodeSha256,
} from '../index';

describe('UAALVirtualMachine execution profile', () => {
  it('reports effective limits and an observed empty handler set', () => {
    const vm = new UAALVirtualMachine({
      maxStackSize: 4,
      maxInstructions: 16,
      maxCallDepth: 2,
    });

    const profile = vm.getExecutionProfile();

    expect(profile).toEqual({
      schema: UAAL_VM_EXECUTION_PROFILE_SCHEMA,
      implementation: UAAL_VM_IMPLEMENTATION_ID,
      limits: {
        maxStackSize: 4,
        maxInstructions: 16,
        maxCallDepth: 2,
      },
      registeredHandlerOpcodes: [],
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.limits)).toBe(true);
    expect(Object.isFrozen(profile.registeredHandlerOpcodes)).toBe(true);
  });

  it('pins the canonical bytecode hash algorithm with a golden kernel vector', () => {
    expect(UAAL_BYTECODE_HASH_ALGORITHM).toBe('sha256-uaal-bytecode-canonical-v1');
    expect(
      computeUAALBytecodeSha256({
        version: 1,
        instructions: [
          { opCode: UAALOpCode.CALL, operands: [2] },
          { opCode: UAALOpCode.HALT },
          { opCode: UAALOpCode.PUSH, operands: ['[]'] },
          { opCode: UAALOpCode.RET },
          { opCode: UAALOpCode.RET },
        ],
      })
    ).toBe('2103ab8ad15b208f1888caee6d3549dbe7d3de9e3c71f806074d5e3e9f2b8634');
  });

  it('returns sorted snapshots that do not change after later registration', () => {
    const vm = new UAALVirtualMachine();
    const before = vm.getExecutionProfile();

    vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, () => undefined);
    vm.registerHandler(UAALOpCode.EXECUTE, () => undefined);

    expect(before.registeredHandlerOpcodes).toEqual([]);
    expect(vm.getExecutionProfile().registeredHandlerOpcodes).toEqual(
      [UAALOpCode.OP_INVOKE_LLM, UAALOpCode.EXECUTE].sort((left, right) => left - right)
    );
  });
});
