import { describe, it, expect } from 'vitest';
import { UAALVirtualMachine, registerMeshHandlers, UAALOpCode } from '@holoscript/uaal';
import { HolomeshMeshTransport, MeshNode, type MeshMessaging } from '../uaal-mesh-transport.js';

// A simulated HoloMesh team-feed (what mcp.holoscript.net relays): an append-only list both
// sides read. This is the exact seam the real transport uses — sendTeamMessage/getTeamMessages —
// so the round-trip proven here is the same code path a cloud seat and the Jetson exercise, minus
// the network hop.
function fakeFeed(): MeshMessaging & { messages: Array<{ content: string }> } {
  const messages: Array<{ content: string }> = [];
  return {
    messages,
    async sendTeamMessage(content: string) {
      messages.push({ content });
    },
    async getTeamMessages(limit = 50) {
      return messages.slice(-limit);
    },
  };
}

describe('uAAL ⇄ HoloMesh transport', () => {
  it('CALL_NODE round-trips: agent VM → mesh feed → Brittney op-dispatch → reply on the stack', async () => {
    const feed = fakeFeed();

    // Brittney as a mesh node: her onRequest IS the (stand-in) operator op-catalog dispatch.
    const brittney = new MeshNode({
      mesh: feed,
      selfNode: 'brittney',
      onRequest: (from, payload) => {
        const p = payload as { op?: string };
        if (p.op === 'status') {
          return { ok: true, op: 'status', status: 'online', servedBy: 'brittney', requestedBy: from };
        }
        return { ok: false, error: `unknown op: ${String(p.op)}` };
      },
    });

    // A cloud seat's transport. The deterministic seam: every caller poll-tick, let Brittney drain
    // the feed + reply — this interleaves callee and caller in a single thread (real life: two
    // machines both polling the hub).
    const transport = new HolomeshMeshTransport({
      mesh: feed,
      selfNode: 'codex-cloud-seat',
      pollIntervalMs: 1,
      requestTimeoutMs: 10_000,
      genId: () => 'cid-status-1',
      sleep: async () => {
        await brittney.poll();
      },
    });

    // The agent drives a real uAAL VM: CALL_NODE('brittney', {op:'status'}) then HALT.
    const vm = new UAALVirtualMachine();
    registerMeshHandlers(vm, transport);
    const result = await vm.execute({
      version: 2,
      instructions: [
        { opCode: UAALOpCode.CALL_NODE, operands: ['brittney', { op: 'status' }] },
        { opCode: UAALOpCode.HALT },
      ],
    });

    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toEqual({
      ok: true,
      op: 'status',
      status: 'online',
      servedBy: 'brittney',
      requestedBy: 'codex-cloud-seat',
    });
    // The feed carried exactly one call + one reply (correlated).
    expect(feed.messages).toHaveLength(2);
  });

  it('OP_OFFLOAD delivers fire-and-forget to the node with no reply awaited', async () => {
    const feed = fakeFeed();
    let received: unknown = null;
    const node = new MeshNode({
      mesh: feed,
      selfNode: 'brittney',
      onRequest: () => null,
      onOffload: (from, payload) => {
        received = { from, payload };
      },
    });
    const transport = new HolomeshMeshTransport({ mesh: feed, selfNode: 'agent-1', genId: () => 'cid-off-1' });

    await transport.offload('brittney', { op: 'note', text: 'fyi' });
    await node.poll();

    expect(received).toEqual({ from: 'agent-1', payload: { op: 'note', text: 'fyi' } });
    // No reply was posted — offload is one-way.
    expect(feed.messages).toHaveLength(1);
  });

  it('request() fails CLOSED (throws) when no node replies within the timeout', async () => {
    const feed = fakeFeed();
    let clock = 0;
    const transport = new HolomeshMeshTransport({
      mesh: feed,
      selfNode: 'agent-1',
      pollIntervalMs: 1,
      requestTimeoutMs: 5,
      genId: () => 'cid-timeout-1',
      now: () => clock,
      sleep: async () => {
        clock += 3; // advance past the 5ms deadline in two ticks; nobody polls the node → no reply
      },
    });

    await expect(transport.request('nobody-home', { op: 'status' })).rejects.toThrow(/timed out/);
  });
});
