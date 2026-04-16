import { describe, expect, test } from 'vitest';
import { UAALVirtualMachine } from '../vm';
import { UAALOpCode } from '../opcodes';

describe('uAAL Native Economic Operations', () => {
  test('OP_EXECUTE_PAYMENT natively routes x402 transaction without LLM', async () => {
    const vm = new UAALVirtualMachine();
    let txDispatched = false;
    
    // Register host injection (0x62 corresponds to OP_EXECUTE_PAYMENT)
    vm.registerHandler(0x62, async (proxy, operands) => {
        txDispatched = true;
        const recipient = operands[0];
        const amount = operands[1];
        proxy.push({ status: 'settled', hash: '0xabc123', recipient, amount });
    });

    const program = {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.PUSH, operands: ['wallet_0x123', 500] },
        { opCode: 0x62 /* OP_EXECUTE_PAYMENT */, operands: [] },
        { opCode: UAALOpCode.HALT, operands: [] }
      ]
    };

    vm.load(program);
    await vm.run();
    expect(txDispatched).toBe(true);
    
    const result = vm.peek();
    expect(result).toHaveProperty('status', 'settled');
    expect(result).toHaveProperty('hash', '0xabc123');
  });
});
