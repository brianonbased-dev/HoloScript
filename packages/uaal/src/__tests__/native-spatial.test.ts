import { describe, expect, test } from 'vitest';
import { UAALVirtualMachine } from '../vm';
import { UAALOpCode } from '../opcodes';

describe('uAAL Native Spatial Operations', () => {
  test('OP_RENDER_HOLOGRAM executes natively without LLM fallback', async () => {
    const vm = new UAALVirtualMachine();
    let nativeCalled = false;
    
    // Register host injection (0xB1 corresponds to OP_RENDER_HOLOGRAM)
    vm.registerHandler(0xB1, async (proxy, operands) => {
      nativeCalled = true;
      const meshId = operands[0];
      const position = operands[1];
      proxy.push({ rendered: true, meshId, position, timestamp: 123456 });
    });

    // Bytecode that PUSHes args, calls OP_RENDER_HOLOGRAM, then stops safely
    const program = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.PUSH, operands: ['mesh_splat_01', [0, 1, 0]] },
        { opCode: 0xB1, operands: [] },
        { opCode: UAALOpCode.HALT, operands: [] }
      ]
    };

    vm.load(program);
    await vm.run();

    expect(nativeCalled).toBe(true);
    const result = vm.peek();
    expect(result).toHaveProperty('rendered', true);
    expect(result).toHaveProperty('meshId', 'mesh_splat_01');
  });
});
