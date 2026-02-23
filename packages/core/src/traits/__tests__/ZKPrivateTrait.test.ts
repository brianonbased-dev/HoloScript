/**
 * ZkPrivateTrait.test.ts — v4.0
 * Tests: attach, builtin circuits, proof generation, proof verification, circuit register
 */

import { describe, it, expect } from 'vitest';
import { zkPrivateHandler } from '../ZkPrivateTrait';
import type { ZkPrivateConfig } from '../ZkPrivateTrait';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter(e => e.type === type),
  };
}

const BASE_CONFIG: ZkPrivateConfig = {
  backend: 'mock', wasm_path: '', timeout_ms: 5000, cache_circuits: true, circuits: [],
};

async function attach(extra: Partial<ZkPrivateConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  await zkPrivateHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

describe('ZkPrivateTrait — onAttach', () => {
  it('emits zk_ready with mock backend', async () => {
    const { ctx } = await attach();
    expect((ctx.of('zk_ready')[0].payload as any).backend).toBe('mock');
  });

  it('loads 4 built-in circuits', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.size).toBe(4);
  });

  it('has ownership_proof circuit', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.has('ownership_proof')).toBe(true);
  });

  it('has price_range_proof circuit', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.has('price_range_proof')).toBe(true);
  });

  it('has membership_proof circuit', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.has('membership_proof')).toBe(true);
  });

  it('has royalty_split_proof circuit', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.has('royalty_split_proof')).toBe(true);
  });

  it('loads user-provided circuits', async () => {
    const { node } = await attach({
      circuits: [{ id: 'custom', name: 'Custom', description: '', source: 'fn main() {}', publicInputs: [], privateInputs: [] }],
    });
    expect(node.__zkPrivateState.circuits.size).toBe(5);
  });
});

describe('ZkPrivateTrait — proof_generate', () => {
  it('emits proof_generation_started', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_generate', payload: { circuitId: 'ownership_proof', publicInputs: { public_hash: 'X' } } });
    expect(ctx.of('proof_generation_started').length).toBe(1);
  });

  it('emits proof_generated with 64-byte proof', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: { circuitId: 'ownership_proof', publicInputs: { public_hash: '0xABC' }, requestId: 'r1' },
    });
    await new Promise(r => setTimeout(r, 50));
    const p = ctx.of('proof_generated')[0].payload as any;
    expect(p.requestId).toBe('r1');
    expect(p.proof.length).toBe(64);
    expect(p.backend).toBe('mock');
  });

  it('different inputs produce different proofs', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_generate', payload: { circuitId: 'ownership_proof', publicInputs: { public_hash: 'A' }, requestId: 'r1' } });
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_generate', payload: { circuitId: 'ownership_proof', publicInputs: { public_hash: 'B' }, requestId: 'r2' } });
    await new Promise(r => setTimeout(r, 100));
    const [p1, p2] = ctx.of('proof_generated').map((e: any) => e.payload.proof as number[]);
    expect(p1.every((b: number, i: number) => b === p2[i])).toBe(false);
  });

  it('emits zk_error for unknown circuit', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_generate', payload: { circuitId: 'ghost' } });
    expect(ctx.of('zk_error')[0]).toBeDefined();
    expect((ctx.of('zk_error')[0].payload as any).error).toContain('Unknown circuit');
  });

  it('increments totalProofsGenerated', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_generate', payload: { circuitId: 'price_range_proof', publicInputs: {} } });
    await new Promise(r => setTimeout(r, 50));
    expect(node.__zkPrivateState.totalProofsGenerated).toBe(1);
  });
});

describe('ZkPrivateTrait — proof_verify', () => {
  it('verifies a non-zero proof as valid', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_generate', payload: { circuitId: 'ownership_proof', publicInputs: { public_hash: 'x' }, requestId: 'g1' } });
    await new Promise(r => setTimeout(r, 50));
    const proofBytes = (ctx.of('proof_generated')[0].payload as any).proof;
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_verify', payload: { proof: proofBytes, publicInputs: { public_hash: 'x' }, circuitId: 'ownership_proof' } });
    expect((ctx.of('proof_verified')[0].payload as any).valid).toBe(true);
  });

  it('rejects all-zero proof', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_verify', payload: { proof: new Array(64).fill(0), publicInputs: {} } });
    expect((ctx.of('proof_verified')[0].payload as any).valid).toBe(false);
  });

  it('increments totalProofsVerified', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'proof_verify', payload: { proof: [1], publicInputs: {} } });
    expect(node.__zkPrivateState.totalProofsVerified).toBe(1);
  });
});

describe('ZkPrivateTrait — circuit_register & compile', () => {
  it('registers new circuit', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'circuit_register', payload: { id: 'age', name: 'Age', description: '', source: 'fn main() {}', publicInputs: [], privateInputs: [] } });
    expect(node.__zkPrivateState.circuits.has('age')).toBe(true);
    expect(ctx.of('circuit_registered').length).toBe(1);
  });

  it('compiles a circuit', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'circuit_compile', payload: { circuitId: 'ownership_proof' } });
    expect(ctx.of('circuit_compiled').length).toBe(1);
  });

  it('lists 4 circuits', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'circuits_list' });
    expect((ctx.of('circuits_listed')[0].payload as any).circuits.length).toBe(4);
  });
});

describe('ZkPrivateTrait — stats & detach', () => {
  it('returns zk_stats', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'zk_stats' });
    const s = ctx.of('zk_stats')[0].payload as any;
    expect(s.circuits).toBe(4);
    expect(s.backend).toBe('mock');
  });

  it('detaches cleanly', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onDetach(node, config, ctx);
    expect(ctx.of('zk_stopped').length).toBe(1);
    expect(node.__zkPrivateState).toBeUndefined();
  });
});
