/**
 * Fleet mesh e2e: uAAL programs on separate VM instances (= separate fleet
 * nodes) communicate through the mesh opcodes. Proves CALL_NODE / OP_OFFLOAD /
 * OP_SYNC are real (routed through MeshTransport), not inert. See
 * MEMORY direction fleet-is-uaal-mesh-of-peers, docs/spec/spec-vs-reality-gap.md.
 */
import { describe, it, expect } from 'vitest';
import { UAALVirtualMachine } from '../vm';
import { UAALOpCode } from '../opcodes';
import type { UAALBytecode } from '../opcodes';
import { InMemoryMeshRouter, registerMeshHandlers } from '../mesh-transport';

describe('uAAL mesh transport — fleet agents communicating', () => {
  it('CALL_NODE: jetson calls laptop and receives a computed reply on its stack', async () => {
    const router = new InMemoryMeshRouter();
    // laptop node serves a compute request
    router.connect('laptop', (_from, payload) => {
      const p = payload as { op: string; a: number; b: number };
      return p.op === 'add' ? p.a + p.b : null;
    });
    // jetson node runs a uAAL program that calls laptop
    const vm = new UAALVirtualMachine();
    registerMeshHandlers(vm, router.connect('jetson'));
    const bytecode: UAALBytecode = {
      version: 2,
      instructions: [
        { opCode: UAALOpCode.CALL_NODE, operands: ['laptop', { op: 'add', a: 2, b: 3 }] },
        { opCode: UAALOpCode.HALT },
      ],
    };

    const result = await vm.execute(bytecode);

    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe(5); // laptop's reply travelled back to jetson's VM
  });

  it('three-tier fleet: jetson aggregates replies from BOTH laptop and Vast', async () => {
    const router = new InMemoryMeshRouter();
    router.connect('laptop', () => 10);
    router.connect('vast', () => 32);
    const vm = new UAALVirtualMachine();
    registerMeshHandlers(vm, router.connect('jetson'));

    const result = await vm.execute({
      version: 2,
      instructions: [
        { opCode: UAALOpCode.CALL_NODE, operands: ['laptop', { op: 'ping' }] },
        { opCode: UAALOpCode.CALL_NODE, operands: ['vast', { op: 'ping' }] },
        { opCode: UAALOpCode.HALT },
      ],
    });

    // both peers replied through the mesh, in order
    expect(result.state.stack).toEqual([10, 32]);
  });

  it('OP_OFFLOAD: fire-and-forget work lands in the peer inbox (no reply)', async () => {
    const router = new InMemoryMeshRouter();
    router.connect('vast');
    const vm = new UAALVirtualMachine();
    registerMeshHandlers(vm, router.connect('jetson'));

    await vm.execute({
      version: 2,
      instructions: [
        { opCode: UAALOpCode.OP_OFFLOAD, operands: ['vast', { job: 'render', frames: 120 }] },
        { opCode: UAALOpCode.HALT },
      ],
    });

    expect(router.drain('vast')).toEqual([{ from: 'jetson', payload: { job: 'render', frames: 120 } }]);
  });

  it('OP_SYNC: a broadcast reaches every peer except the sender', async () => {
    const router = new InMemoryMeshRouter();
    router.connect('laptop');
    router.connect('vast');
    const vm = new UAALVirtualMachine();
    registerMeshHandlers(vm, router.connect('jetson'));

    await vm.execute({
      version: 2,
      instructions: [
        { opCode: UAALOpCode.OP_SYNC, operands: [{ wisdom: 'threshold=0.2' }] },
        { opCode: UAALOpCode.HALT },
      ],
    });

    expect(router.drain('laptop')).toEqual([{ from: 'jetson', payload: { wisdom: 'threshold=0.2' } }]);
    expect(router.drain('vast')).toEqual([{ from: 'jetson', payload: { wisdom: 'threshold=0.2' } }]);
    expect(router.drain('jetson')).toEqual([]); // sender does not receive its own broadcast
  });

  it('bidirectional: laptop can call back into jetson (peers, not client/server)', async () => {
    const router = new InMemoryMeshRouter();
    // jetson also serves: it answers a "status" request
    const jetson = router.connect('jetson', (_from, _payload) => ({ node: 'jetson', healthy: true }));
    const laptopVm = new UAALVirtualMachine();
    registerMeshHandlers(laptopVm, router.connect('laptop'));
    void jetson;

    const result = await laptopVm.execute({
      version: 2,
      instructions: [
        { opCode: UAALOpCode.CALL_NODE, operands: ['jetson', { op: 'status' }] },
        { opCode: UAALOpCode.HALT },
      ],
    });

    expect(result.stackTop).toEqual({ node: 'jetson', healthy: true });
  });

  it('calling an unknown node fails loudly rather than silently', async () => {
    const router = new InMemoryMeshRouter();
    const vm = new UAALVirtualMachine();
    registerMeshHandlers(vm, router.connect('jetson'));
    const result = await vm.execute({
      version: 2,
      instructions: [
        { opCode: UAALOpCode.CALL_NODE, operands: ['ghost', { op: 'ping' }] },
        { opCode: UAALOpCode.HALT },
      ],
    });
    // the VM catches handler throws and reports ERROR (vm.ts execute() try/catch)
    expect(result.taskStatus).toBe('ERROR');
  });
});
