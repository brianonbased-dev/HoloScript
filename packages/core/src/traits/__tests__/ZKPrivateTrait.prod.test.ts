/**
 * ZKPrivateTrait -- Production Test Suite (v4.3)
 *
 * Tests backward-compatible spatial predicate API + new v4.3 features.
 * Uses vi.fn() context pattern for production-style testing.
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

// ---- defaultConfig ----------------------------------------------------------

describe('zkPrivateHandler.defaultConfig', () => {
  const d = zkPrivateHandler.defaultConfig!;
  it('predicate=proximity', () => expect(d.predicate).toBe('proximity'));
  it('radius=5.0', () => expect(d.radius).toBe(5.0));
  it('bounds=[1,1,1]', () => expect(d.bounds).toEqual([1, 1, 1]));
  it('fallback=transparent', () => expect(d.fallback).toBe('transparent'));
  it('circuit_url=""', () => expect(d.circuit_url).toBe(''));
});

// ---- onAttach ---------------------------------------------------------------

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

// ---- onDetach ---------------------------------------------------------------

describe('zkPrivateHandler.onDetach', () => {
  it('removes __zkPrivateState', () => {
    const { node, config, ctx } = attach();
    zkPrivateHandler.onDetach!(node, config, ctx);
    expect(node.__zkPrivateState).toBeUndefined();
  });
});

// ---- onEvent - zk_verify_proximity -----------------------------------------

describe('zkPrivateHandler.onEvent -- zk_verify_proximity', () => {
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

// ---- onEvent - zk_proof_submitted (valid) -----------------------------------

describe('zkPrivateHandler.onEvent -- zk_proof_submitted (valid)', () => {
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

// ---- onEvent - zk_proof_submitted (invalid) ---------------------------------

describe('zkPrivateHandler.onEvent -- zk_proof_submitted (invalid)', () => {
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

// ---- onEvent - unknown event ------------------------------------------------

describe('zkPrivateHandler.onEvent -- unknown', () => {
  it('unknown event does not throw or mutate state', () => {
    const { node, config, ctx } = attach();
    expect(() => zkPrivateHandler.onEvent!(node, config, ctx, { type: 'unrelated_event' })).not.toThrow();
    expect(node.__zkPrivateState.isVerified).toBe(false);
  });
});

// ---- v4.3 spatial predicate circuits ----------------------------------------

describe('zkPrivateHandler v4.3 -- spatial predicate circuits', () => {
  it('has is_inside_zone circuit loaded', () => {
    const { node } = attach();
    expect(node.__zkPrivateState.circuits.has('is_inside_zone')).toBe(true);
  });

  it('has owns_asset circuit loaded', () => {
    const { node } = attach();
    expect(node.__zkPrivateState.circuits.has('owns_asset')).toBe(true);
  });

  it('has has_permission circuit loaded', () => {
    const { node } = attach();
    expect(node.__zkPrivateState.circuits.has('has_permission')).toBe(true);
  });

  it('loads 7 total circuits (4 legacy + 3 spatial)', () => {
    const { node } = attach();
    expect(node.__zkPrivateState.circuits.size).toBe(7);
  });
});

// ---- v4.3 zone verification -------------------------------------------------

describe('zkPrivateHandler v4.3 -- zk_verify_zone', () => {
  it('emits zk_proof_request with is_inside_zone predicate', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, {
      type: 'zk_verify_zone',
      payload: { zoneId: 'zone_1', zoneBounds: [0, 0, 0, 10, 10, 10] },
    });
    expect(ctx.emit).toHaveBeenCalledWith('zk_proof_request', expect.objectContaining({
      predicate: 'is_inside_zone',
      circuitId: 'is_inside_zone',
    }));
  });
});

// ---- v4.3 ownership verification --------------------------------------------

describe('zkPrivateHandler v4.3 -- zk_verify_ownership', () => {
  it('emits zk_proof_request with owns_asset predicate', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, {
      type: 'zk_verify_ownership',
      payload: { assetHash: '0xABC', ownershipRoot: '0xDEF' },
    });
    expect(ctx.emit).toHaveBeenCalledWith('zk_proof_request', expect.objectContaining({
      predicate: 'owns_asset',
      circuitId: 'owns_asset',
    }));
  });
});

// ---- v4.3 permission verification -------------------------------------------

describe('zkPrivateHandler v4.3 -- zk_verify_permission', () => {
  it('emits zk_proof_request with has_permission predicate', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, {
      type: 'zk_verify_permission',
      payload: { requiredLevel: 5, permissionRoot: '0x123', contextHash: '0x456' },
    });
    expect(ctx.emit).toHaveBeenCalledWith('zk_proof_request', expect.objectContaining({
      predicate: 'has_permission',
      circuitId: 'has_permission',
    }));
  });
});

// ---- v4.3 selective disclosure -----------------------------------------------

describe('zkPrivateHandler v4.3 -- selective disclosure', () => {
  it('emits zk_selective_disclosure with correct field status', () => {
    const { node, config, ctx } = attach({
      disclosure_policy: {
        alwaysDisclose: ['zone_id'],
        requireConsent: ['position'],
        neverDisclose: ['wallet_address'],
      },
    });
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, {
      type: 'zk_selective_disclose',
      payload: {
        fields: { zone_id: 'z1', position: [1, 2, 3], wallet_address: '0xABC' },
        consentedFields: ['position'],
        circuitId: 'is_inside_zone',
      },
    });
    expect(ctx.emit).toHaveBeenCalledWith('zk_selective_disclosure', expect.objectContaining({
      fieldStatus: {
        zone_id: 'disclosed',
        position: 'disclosed',
        wallet_address: 'hidden',
      },
    }));
  });

  it('tracks disclosure history', () => {
    const { node, config, ctx } = attach({
      disclosure_policy: { alwaysDisclose: ['id'], requireConsent: [], neverDisclose: [] },
    });
    zkPrivateHandler.onEvent!(node, config, ctx, {
      type: 'zk_selective_disclose',
      payload: { fields: { id: 'A' }, circuitId: 'is_inside_zone' },
    });
    expect(node.__zkPrivateState.disclosureHistory.length).toBe(1);
  });
});

// ---- v4.3 wallet integration ------------------------------------------------

describe('zkPrivateHandler v4.3 -- wallet integration', () => {
  it('auto-submits on valid proof when enabled', () => {
    const { node, config, ctx } = attach({
      wallet_integration: {
        enabled: true,
        chain: 'base',
        verifier_contract: '0xVER',
        auto_submit: true,
      },
    });
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: true, proofBytes: new Uint8Array([1, 2, 3]), circuitId: 'is_inside_zone' },
    });
    expect(ctx.emit).toHaveBeenCalledWith('zk_privacy_unlocked', { node });
    expect(ctx.emit).toHaveBeenCalledWith('zk_wallet_submit_proof', expect.objectContaining({
      chain: 'base',
      verifierContract: '0xVER',
    }));
  });

  it('does not auto-submit when disabled', () => {
    const { node, config, ctx } = attach({
      wallet_integration: { enabled: false, chain: 'ethereum', verifier_contract: '', auto_submit: false },
    });
    ctx.emit.mockClear();
    zkPrivateHandler.onEvent!(node, config, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: true },
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('zk_wallet_submit_proof', expect.anything());
  });
});
