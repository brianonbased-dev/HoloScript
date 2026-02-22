/**
 * ZKPrivateTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { zkPrivateHandler } from '../ZKPrivateTrait';

function makeNode() { return { id: 'zk_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...zkPrivateHandler.defaultConfig!, ...cfg };
  zkPrivateHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('zkPrivateHandler.defaultConfig', () => {
  const d = zkPrivateHandler.defaultConfig!;
  it('predicate=proximity', () => expect(d.predicate).toBe('proximity'));
  it('radius=5.0', () => expect(d.radius).toBe(5.0));
  it('bounds=[1,1,1]', () => expect(d.bounds).toEqual([1, 1, 1]));
  it('fallback=transparent', () => expect(d.fallback).toBe('transparent'));
  it('circuit_url=""', () => expect(d.circuit_url).toBe(''));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('zkPrivateHandler.onAttach', () => {
  it('creates __zkPrivateState', () => expect(attach().node.__zkPrivateState).toBeDefined());
  it('isVerified=false', () => expect(attach().node.__zkPrivateState.isVerified).toBe(false));
  it('lastVerifyTime=0', () => expect(attach().node.__zkPrivateState.lastVerifyTime).toBe(0));
  it('activeProofId=null', () => expect(attach().node.__zkPrivateState.activeProofId).toBeNull());
  it('emits zk_privacy_initialized with predicate', () => {
    const { ctx } = attach({ predicate: 'in_region' });
    expect(ctx.emit).toHaveBeenCalledWith('zk_privacy_initialized', expect.objectContaining({ predicate: 'in_region' }));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('zkPrivateHandler.onDetach', () => {
  it('removes __zkPrivateState', () => {
    const { node, config, ctx } = attach();
    zkPrivateHandler.onDetach!(node, config, ctx);
    expect(node.__zkPrivateState).toBeUndefined();
  });
});

// ─── onEvent — zk_verify_proximity ───────────────────────────────────────────

describe('zkPrivateHandler.onEvent — zk_verify_proximity', () => {
  it('emits zk_proof_request with predicate=proximity and radius param', () => {
    const { node, config, ctx } = attach({ radius: 8 });
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, { type: 'zk_verify_proximity' });
    expect(ctx.emit).toHaveBeenCalledWith('zk_proof_request', expect.objectContaining({
      predicate: 'proximity',
      params: { radius: 8 },
    }));
  });
});

// ─── onEvent — zk_proof_submitted ────────────────────────────────────────────

describe('zkPrivateHandler.onEvent — zk_proof_submitted (valid)', () => {
  it('sets isVerified=true', () => {
    const { node, config, ctx } = attach();
    zkPrivateHandler.onEvent!(node, config, ctx, { type: 'zk_proof_submitted', payload: { proofValid: true } });
    expect(node.__zkPrivateState.isVerified).toBe(true);
  });
  it('updates lastVerifyTime', () => {
    const before = Date.now();
    const { node, config, ctx } = attach();
    zkPrivateHandler.onEvent!(node, config, ctx, { type: 'zk_proof_submitted', payload: { proofValid: true } });
    expect(node.__zkPrivateState.lastVerifyTime).toBeGreaterThanOrEqual(before);
  });
  it('emits zk_privacy_unlocked', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, { type: 'zk_proof_submitted', payload: { proofValid: true } });
    expect(ctx.emit).toHaveBeenCalledWith('zk_privacy_unlocked', { node });
  });
});

describe('zkPrivateHandler.onEvent — zk_proof_submitted (invalid)', () => {
  it('sets isVerified=false', () => {
    const { node, config, ctx } = attach();
    node.__zkPrivateState.isVerified = true; // was previously verified
    zkPrivateHandler.onEvent!(node, config, ctx, { type: 'zk_proof_submitted', payload: { proofValid: false } });
    expect(node.__zkPrivateState.isVerified).toBe(false);
  });
  it('emits zk_privacy_failed with reason=invalid_proof', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, { type: 'zk_proof_submitted', payload: { proofValid: false } });
    expect(ctx.emit).toHaveBeenCalledWith('zk_privacy_failed', { node, reason: 'invalid_proof' });
  });
  it('still updates lastVerifyTime on failure', () => {
    const before = Date.now();
    const { node, config, ctx } = attach();
    zkPrivateHandler.onEvent!(node, config, ctx, { type: 'zk_proof_submitted', payload: { proofValid: false } });
    expect(node.__zkPrivateState.lastVerifyTime).toBeGreaterThanOrEqual(before);
  });
});

describe('zkPrivateHandler.onEvent — unknown', () => {
  it('unknown event does not throw or mutate state', () => {
    const { node, config, ctx } = attach();
    expect(() => zkPrivateHandler.onEvent!(node, config, ctx, { type: 'unrelated_event' })).not.toThrow();
    expect(node.__zkPrivateState.isVerified).toBe(false);
  });
});
