/**
 * ZkPrivateTrait.test.ts -- v4.3
 *
 * Comprehensive test suite covering:
 *  - v4.0 backward-compatible circuit API (attach, builtin circuits, proof gen/verify, register)
 *  - v4.3 spatial predicate circuits (isInsideZone, ownsAsset, hasPermission)
 *  - v4.3 selective disclosure mechanism
 *  - v4.3 WalletTrait integration for on-chain proof submission
 *  - v4.3 batch compilation operations
 */

import { describe, it, expect } from 'vitest';
import {
  zkPrivateHandler,
  BUILTIN_CIRCUITS,
  SPATIAL_PREDICATE_CIRCUITS,
  ALL_CIRCUITS,
  BarretenbergBackend,
  createSelectiveDisclosure,
  getPredicateCircuitId,
} from '../ZKPrivateTrait';
import type { ZkPrivateConfig, ZkDisclosurePolicy } from '../ZKPrivateTrait';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter((e) => e.type === type),
  };
}

const BASE_CONFIG: ZkPrivateConfig = {
  backend: 'mock',
  wasm_path: '',
  timeout_ms: 5000,
  cache_circuits: true,
  circuits: [],
  predicate: 'proximity',
  radius: 5.0,
  bounds: [1, 1, 1],
  fallback: 'transparent',
  circuit_url: '',
};

async function attach(extra: Partial<ZkPrivateConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  await zkPrivateHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

// =============================================================================
// v4.0 BACKWARD COMPATIBILITY: onAttach
// =============================================================================

describe('ZkPrivateTrait -- onAttach (v4.0 compat)', () => {
  it('emits zk_ready with mock backend', async () => {
    const { ctx } = await attach();
    expect((ctx.of('zk_ready')[0].payload as any).backend).toBe('mock');
  });

  it('loads 4 built-in circuits plus 3 spatial predicate circuits', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.size).toBe(7);
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
      circuits: [
        {
          id: 'custom',
          name: 'Custom',
          description: '',
          source: 'fn main() {}',
          publicInputs: [],
          privateInputs: [],
        },
      ],
    });
    expect(node.__zkPrivateState.circuits.size).toBe(8);
  });
});

// =============================================================================
// v4.0 BACKWARD COMPATIBILITY: proof_generate
// =============================================================================

describe('ZkPrivateTrait -- proof_generate (v4.0 compat)', () => {
  it('emits proof_generation_started', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: { circuitId: 'ownership_proof', publicInputs: { public_hash: 'X' } },
    });
    expect(ctx.of('proof_generation_started').length).toBe(1);
  });

  it('emits proof_generated with 64-byte proof', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: {
        circuitId: 'ownership_proof',
        publicInputs: { public_hash: '0xABC' },
        requestId: 'r1',
      },
    });
    await new Promise((r) => setTimeout(r, 50));
    const p = ctx.of('proof_generated')[0].payload as any;
    expect(p.requestId).toBe('r1');
    expect(p.proof.length).toBe(64);
    expect(p.backend).toBe('mock');
  });

  it('different inputs produce different proofs', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: {
        circuitId: 'ownership_proof',
        publicInputs: { public_hash: 'A' },
        requestId: 'r1',
      },
    });
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: {
        circuitId: 'ownership_proof',
        publicInputs: { public_hash: 'B' },
        requestId: 'r2',
      },
    });
    await new Promise((r) => setTimeout(r, 100));
    const [p1, p2] = ctx.of('proof_generated').map((e: any) => e.payload.proof as number[]);
    expect(p1.every((b: number, i: number) => b === p2[i])).toBe(false);
  });

  it('emits zk_error for unknown circuit', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: { circuitId: 'ghost' },
    });
    expect(ctx.of('zk_error')[0]).toBeDefined();
    expect((ctx.of('zk_error')[0].payload as any).error).toContain('Unknown circuit');
  });

  it('increments totalProofsGenerated', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: { circuitId: 'price_range_proof', publicInputs: {} },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(node.__zkPrivateState.totalProofsGenerated).toBe(1);
  });
});

// =============================================================================
// v4.0 BACKWARD COMPATIBILITY: proof_verify
// =============================================================================

describe('ZkPrivateTrait -- proof_verify (v4.0 compat)', () => {
  it('verifies a non-zero proof as valid', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_generate',
      payload: {
        circuitId: 'ownership_proof',
        publicInputs: { public_hash: 'x' },
        requestId: 'g1',
      },
    });
    await new Promise((r) => setTimeout(r, 50));
    const proofBytes = (ctx.of('proof_generated')[0].payload as any).proof;
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_verify',
      payload: {
        proof: proofBytes,
        publicInputs: { public_hash: 'x' },
        circuitId: 'ownership_proof',
      },
    });
    expect((ctx.of('proof_verified')[0].payload as any).valid).toBe(true);
  });

  it('rejects all-zero proof', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_verify',
      payload: { proof: new Array(64).fill(0), publicInputs: {} },
    });
    expect((ctx.of('proof_verified')[0].payload as any).valid).toBe(false);
  });

  it('increments totalProofsVerified', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'proof_verify',
      payload: { proof: [1], publicInputs: {} },
    });
    expect(node.__zkPrivateState.totalProofsVerified).toBe(1);
  });
});

// =============================================================================
// v4.0 BACKWARD COMPATIBILITY: circuit_register & compile
// =============================================================================

describe('ZkPrivateTrait -- circuit_register & compile (v4.0 compat)', () => {
  it('registers new circuit', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'circuit_register',
      payload: {
        id: 'age',
        name: 'Age',
        description: '',
        source: 'fn main() {}',
        publicInputs: [],
        privateInputs: [],
      },
    });
    expect(node.__zkPrivateState.circuits.has('age')).toBe(true);
    expect(ctx.of('circuit_registered').length).toBe(1);
  });

  it('compiles a circuit', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'circuit_compile',
      payload: { circuitId: 'ownership_proof' },
    });
    // Wait for async compilation
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.of('circuit_compiled').length).toBe(1);
  });

  it('lists all 7 circuits (4 legacy + 3 spatial)', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'circuits_list' });
    expect((ctx.of('circuits_listed')[0].payload as any).circuits.length).toBe(7);
  });
});

// =============================================================================
// v4.0 BACKWARD COMPATIBILITY: stats & detach
// =============================================================================

describe('ZkPrivateTrait -- stats & detach (v4.0 compat)', () => {
  it('returns zk_stats', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'zk_stats' });
    const s = ctx.of('zk_stats')[0].payload as any;
    expect(s.circuits).toBe(7);
    expect(s.backend).toBe('mock');
  });

  it('detaches cleanly', async () => {
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onDetach(node, config, ctx);
    expect(ctx.of('zk_stopped').length).toBe(1);
    expect(node.__zkPrivateState).toBeUndefined();
  });
});

// =============================================================================
// v4.3 SPATIAL PREDICATE CIRCUITS
// =============================================================================

describe('ZkPrivateTrait -- spatial predicate circuits (v4.3)', () => {
  it('has is_inside_zone circuit', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.has('is_inside_zone')).toBe(true);
  });

  it('has owns_asset circuit', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.has('owns_asset')).toBe(true);
  });

  it('has has_permission circuit', async () => {
    const { node } = await attach();
    expect(node.__zkPrivateState.circuits.has('has_permission')).toBe(true);
  });

  it('is_inside_zone circuit has correct inputs', async () => {
    const { node } = await attach();
    const circuit = node.__zkPrivateState.circuits.get('is_inside_zone');
    expect(circuit.publicInputs.length).toBe(7);
    expect(circuit.privateInputs.length).toBe(4);
    expect(circuit.publicInputs.some((i: any) => i.name === 'zone_id_hash')).toBe(true);
    expect(circuit.privateInputs.some((i: any) => i.name === 'secret_pos_x')).toBe(true);
  });

  it('owns_asset circuit has correct inputs', async () => {
    const { node } = await attach();
    const circuit = node.__zkPrivateState.circuits.get('owns_asset');
    expect(circuit.publicInputs.length).toBe(2);
    expect(circuit.privateInputs.length).toBe(5);
    expect(circuit.publicInputs.some((i: any) => i.name === 'asset_hash')).toBe(true);
    expect(circuit.privateInputs.some((i: any) => i.name === 'secret_wallet_address')).toBe(true);
  });

  it('has_permission circuit has correct inputs', async () => {
    const { node } = await attach();
    const circuit = node.__zkPrivateState.circuits.get('has_permission');
    expect(circuit.publicInputs.length).toBe(3);
    expect(circuit.privateInputs.length).toBe(5);
    expect(circuit.publicInputs.some((i: any) => i.name === 'required_level')).toBe(true);
    expect(circuit.privateInputs.some((i: any) => i.name === 'secret_permission_level')).toBe(true);
  });

  it('SPATIAL_PREDICATE_CIRCUITS has 3 circuits', () => {
    expect(SPATIAL_PREDICATE_CIRCUITS.length).toBe(3);
  });

  it('ALL_CIRCUITS has 7 circuits', () => {
    expect(ALL_CIRCUITS.length).toBe(7);
  });
});

// =============================================================================
// v4.3 SPATIAL PREDICATE EVENTS
// =============================================================================

describe('ZkPrivateTrait -- spatial predicate events (v4.3)', () => {
  it('emits zk_privacy_initialized on attach', async () => {
    const { ctx } = await attach({ predicate: 'is_inside_zone' });
    const init = ctx.of('zk_privacy_initialized')[0].payload as any;
    expect(init.predicate).toBe('is_inside_zone');
    expect(init.spatialCircuits).toContain('is_inside_zone');
    expect(init.spatialCircuits).toContain('owns_asset');
    expect(init.spatialCircuits).toContain('has_permission');
  });

  it('zk_verify_proximity emits zk_proof_request', async () => {
    const { node, ctx, config } = await attach({ predicate: 'proximity', radius: 10 });
    ctx.events.length = 0;
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'zk_verify_proximity' });
    const req = ctx.of('zk_proof_request')[0].payload as any;
    expect(req.predicate).toBe('proximity');
    expect(req.params.radius).toBe(10);
    expect(req.circuitId).toBe('is_inside_zone');
  });

  it('zk_verify_zone emits zk_proof_request with zone data', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_verify_zone',
      payload: { zoneId: 'zone_1', zoneBounds: [0, 0, 0, 10, 10, 10] },
    });
    const req = ctx.of('zk_proof_request')[0].payload as any;
    expect(req.predicate).toBe('is_inside_zone');
    expect(req.circuitId).toBe('is_inside_zone');
    expect(req.params.zoneId).toBe('zone_1');
  });

  it('zk_verify_ownership emits zk_proof_request', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_verify_ownership',
      payload: { assetHash: '0xABC', ownershipRoot: '0xDEF' },
    });
    const req = ctx.of('zk_proof_request')[0].payload as any;
    expect(req.predicate).toBe('owns_asset');
    expect(req.circuitId).toBe('owns_asset');
  });

  it('zk_verify_permission emits zk_proof_request', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_verify_permission',
      payload: { requiredLevel: 5, permissionRoot: '0x123', contextHash: '0x456' },
    });
    const req = ctx.of('zk_proof_request')[0].payload as any;
    expect(req.predicate).toBe('has_permission');
    expect(req.params.requiredLevel).toBe(5);
  });

  it('zk_proof_submitted (valid) unlocks privacy', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: true },
    });
    expect(node.__zkPrivateState.isVerified).toBe(true);
    expect(ctx.of('zk_privacy_unlocked').length).toBe(1);
  });

  it('zk_proof_submitted (invalid) emits privacy failed', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: false },
    });
    expect(node.__zkPrivateState.isVerified).toBe(false);
    const fail = ctx.of('zk_privacy_failed')[0].payload as any;
    expect(fail.reason).toBe('invalid_proof');
  });

  it('zk_proof_submitted updates lastVerifyTime', async () => {
    const before = Date.now();
    const { node, ctx, config } = await attach();
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: true },
    });
    expect(node.__zkPrivateState.lastVerifyTime).toBeGreaterThanOrEqual(before);
  });
});

// =============================================================================
// v4.3 SELECTIVE DISCLOSURE
// =============================================================================

describe('ZkPrivateTrait -- selective disclosure (v4.3)', () => {
  it('createSelectiveDisclosure respects alwaysDisclose', () => {
    const policy: ZkDisclosurePolicy = {
      alwaysDisclose: ['name'],
      requireConsent: ['email'],
      neverDisclose: ['secret_key'],
    };
    const fields = { name: 'Alice', email: 'alice@test.com', secret_key: '0xDEAD' };
    const disclosure = createSelectiveDisclosure(
      fields,
      policy,
      new Uint8Array(64),
      'test_circuit'
    );

    expect(disclosure.disclosedFields.name).toBe('Alice');
    expect(disclosure.disclosedFields.email).toBeUndefined();
    expect(disclosure.disclosedFields.secret_key).toBeUndefined();
    expect(disclosure.fieldStatus.name).toBe('disclosed');
    expect(disclosure.fieldStatus.email).toBe('proven');
    expect(disclosure.fieldStatus.secret_key).toBe('hidden');
  });

  it('createSelectiveDisclosure respects consent', () => {
    const policy: ZkDisclosurePolicy = {
      alwaysDisclose: [],
      requireConsent: ['email', 'location'],
      neverDisclose: [],
    };
    const fields = { email: 'alice@test.com', location: 'NYC' };
    const disclosure = createSelectiveDisclosure(fields, policy, new Uint8Array(64), 'test', [
      'email',
    ]);

    expect(disclosure.disclosedFields.email).toBe('alice@test.com');
    expect(disclosure.disclosedFields.location).toBeUndefined();
    expect(disclosure.fieldStatus.email).toBe('disclosed');
    expect(disclosure.fieldStatus.location).toBe('proven');
  });

  it('zk_selective_disclose event works end-to-end', async () => {
    const { node, ctx, config } = await attach({
      disclosure_policy: {
        alwaysDisclose: ['zone_id'],
        requireConsent: ['position'],
        neverDisclose: ['wallet_address'],
      },
    });
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_selective_disclose',
      payload: {
        fields: { zone_id: 'zone_1', position: [1, 2, 3], wallet_address: '0xABC' },
        consentedFields: ['position'],
        circuitId: 'is_inside_zone',
      },
    });

    const disclosure = ctx.of('zk_selective_disclosure')[0].payload as any;
    expect(disclosure.disclosedFields.zone_id).toBe('zone_1');
    expect(disclosure.disclosedFields.position).toEqual([1, 2, 3]);
    expect(disclosure.disclosedFields.wallet_address).toBeUndefined();
    expect(disclosure.fieldStatus.zone_id).toBe('disclosed');
    expect(disclosure.fieldStatus.position).toBe('disclosed');
    expect(disclosure.fieldStatus.wallet_address).toBe('hidden');
  });

  it('disclosure history is maintained', async () => {
    const { node, ctx, config } = await attach({
      disclosure_policy: {
        alwaysDisclose: ['id'],
        requireConsent: [],
        neverDisclose: [],
      },
    });

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_selective_disclose',
      payload: { fields: { id: 'A' }, circuitId: 'is_inside_zone' },
    });
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_selective_disclose',
      payload: { fields: { id: 'B' }, circuitId: 'owns_asset' },
    });

    expect(node.__zkPrivateState.disclosureHistory.length).toBe(2);

    ctx.events.length = 0;
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'zk_disclosure_history' });
    const history = ctx.of('zk_disclosure_history_result')[0].payload as any;
    expect(history.total).toBe(2);
  });
});

// =============================================================================
// v4.3 WALLET INTEGRATION
// =============================================================================

describe('ZkPrivateTrait -- wallet integration (v4.3)', () => {
  it('auto-submits proof to chain when wallet integration enabled', async () => {
    const { node, ctx, config } = await attach({
      wallet_integration: {
        enabled: true,
        chain: 'base',
        verifier_contract: '0xVERIFIER',
        auto_submit: true,
      },
    });
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_proof_submitted',
      payload: {
        proofValid: true,
        proofBytes: new Uint8Array([1, 2, 3]),
        publicInputs: { hash: '0x123' },
        circuitId: 'is_inside_zone',
      },
    });

    expect(ctx.of('zk_privacy_unlocked').length).toBe(1);
    expect(ctx.of('zk_wallet_submit_proof').length).toBe(1);
    const submit = ctx.of('zk_wallet_submit_proof')[0].payload as any;
    expect(submit.chain).toBe('base');
    expect(submit.verifierContract).toBe('0xVERIFIER');
    expect(submit.circuitId).toBe('is_inside_zone');
  });

  it('does not auto-submit when wallet integration disabled', async () => {
    const { node, ctx, config } = await attach({
      wallet_integration: {
        enabled: false,
        chain: 'ethereum',
        verifier_contract: '',
        auto_submit: false,
      },
    });
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: true },
    });

    expect(ctx.of('zk_wallet_submit_proof').length).toBe(0);
  });

  it('manual proof submission triggers wallet sign message', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_wallet_submit_proof',
      payload: {
        proof: [1, 2, 3],
        publicInputs: { hash: '0x123' },
        circuitId: 'ownership_proof',
        chain: 'polygon',
        verifierContract: '0xABC',
      },
    });

    expect(ctx.of('wallet_sign_message').length).toBe(1);
    expect(ctx.of('zk_wallet_proof_pending').length).toBe(1);
    const pending = ctx.of('zk_wallet_proof_pending')[0].payload as any;
    expect(pending.circuitId).toBe('ownership_proof');
    expect(pending.chain).toBe('polygon');
  });

  it('handles on-chain verification result (valid)', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;

    // First submit
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_wallet_submit_proof',
      payload: {
        proof: [1, 2, 3],
        publicInputs: {},
        circuitId: 'ownership_proof',
        chain: 'ethereum',
        verifierContract: '0xABC',
      },
    });

    const txId = (ctx.of('zk_wallet_proof_pending')[0].payload as any).txId;
    ctx.events.length = 0;

    // Then receive result
    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_wallet_proof_result',
      payload: {
        txId,
        txHash: '0xTXHASH',
        valid: true,
        blockNumber: 12345,
        gasUsed: 150000,
      },
    });

    expect(ctx.of('zk_wallet_proof_verified').length).toBe(1);
    const result = ctx.of('zk_wallet_proof_verified')[0].payload as any;
    expect(result.txHash).toBe('0xTXHASH');
    expect(result.valid).toBe(true);
    expect(result.blockNumber).toBe(12345);
    expect(node.__zkPrivateState.onChainVerifications.length).toBe(1);
  });

  it('handles on-chain verification result (invalid)', async () => {
    const { node, ctx, config } = await attach();

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_wallet_submit_proof',
      payload: {
        proof: [1],
        publicInputs: {},
        circuitId: 'test',
        chain: 'ethereum',
        verifierContract: '0x',
      },
    });

    const txId = (ctx.of('zk_wallet_proof_pending')[0].payload as any).txId;
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_wallet_proof_result',
      payload: { txId, txHash: '0xFAIL', valid: false },
    });

    expect(ctx.of('zk_wallet_proof_failed').length).toBe(1);
    const fail = ctx.of('zk_wallet_proof_failed')[0].payload as any;
    expect(fail.reason).toBe('on_chain_verification_failed');
  });

  it('wallet query returns integration status', async () => {
    const { node, ctx, config } = await attach({
      wallet_integration: {
        enabled: true,
        chain: 'base',
        verifier_contract: '0xVERIFIER',
        auto_submit: false,
      },
    });
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_wallet_query',
      payload: { queryId: 'q1' },
    });

    const info = ctx.of('zk_wallet_info')[0].payload as any;
    expect(info.walletIntegrationEnabled).toBe(true);
    expect(info.chain).toBe('base');
    expect(info.verifierContract).toBe('0xVERIFIER');
  });
});

// =============================================================================
// v4.3 BATCH OPERATIONS
// =============================================================================

describe('ZkPrivateTrait -- batch operations (v4.3)', () => {
  it('compiles all spatial predicate circuits', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, { type: 'zk_compile_all_spatial' });
    await new Promise((r) => setTimeout(r, 50));

    const result = ctx.of('zk_spatial_circuits_compiled')[0].payload as any;
    expect(result.compiled).toBe(3);
    expect(result.total).toBe(3);
    expect(result.circuitIds).toContain('is_inside_zone');
    expect(result.circuitIds).toContain('owns_asset');
    expect(result.circuitIds).toContain('has_permission');
  });

  it('does not recompile already compiled circuits', async () => {
    const { node, ctx, config } = await attach();

    // Compile once
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'zk_compile_all_spatial' });
    await new Promise((r) => setTimeout(r, 50));
    ctx.events.length = 0;

    // Compile again
    zkPrivateHandler.onEvent(node, config, ctx, { type: 'zk_compile_all_spatial' });
    const result = ctx.of('zk_spatial_circuits_compiled')[0].payload as any;
    expect(result.compiled).toBe(0); // Already compiled
  });

  it('zk_get_circuit returns circuit info', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_get_circuit',
      payload: { circuitId: 'is_inside_zone' },
    });

    const info = ctx.of('zk_circuit_info')[0].payload as any;
    expect(info.circuit.id).toBe('is_inside_zone');
    expect(info.circuit.name).toBe('Spatial Zone Inclusion Proof');
    expect(info.circuit.isSpatialPredicate).toBe(true);
    expect(info.circuit.publicInputs.length).toBe(7);
  });

  it('zk_get_circuit returns error for unknown circuit', async () => {
    const { node, ctx, config } = await attach();
    ctx.events.length = 0;

    zkPrivateHandler.onEvent(node, config, ctx, {
      type: 'zk_get_circuit',
      payload: { circuitId: 'nonexistent' },
    });

    expect(ctx.of('zk_error').length).toBe(1);
  });
});

// =============================================================================
// v4.3 PREDICATE HELPERS
// =============================================================================

describe('ZkPrivateTrait -- predicate helpers (v4.3)', () => {
  it('getPredicateCircuitId maps proximity to is_inside_zone', () => {
    expect(getPredicateCircuitId('proximity')).toBe('is_inside_zone');
  });

  it('getPredicateCircuitId maps in_region to is_inside_zone', () => {
    expect(getPredicateCircuitId('in_region')).toBe('is_inside_zone');
  });

  it('getPredicateCircuitId maps owns_asset to owns_asset', () => {
    expect(getPredicateCircuitId('owns_asset')).toBe('owns_asset');
  });

  it('getPredicateCircuitId maps has_permission to has_permission', () => {
    expect(getPredicateCircuitId('has_permission')).toBe('has_permission');
  });

  it('getPredicateCircuitId maps has_attribute to has_permission', () => {
    expect(getPredicateCircuitId('has_attribute')).toBe('has_permission');
  });
});

// =============================================================================
// v4.3 BARRETENBERG BACKEND
// =============================================================================

describe('ZkPrivateTrait -- BarretenbergBackend (v4.3)', () => {
  it('initializes in mock mode when @aztec/bb.js unavailable', async () => {
    const backend = new BarretenbergBackend();
    const result = await backend.initialize();
    // In test environment, @aztec/bb.js is not available
    expect(result).toBe(false);
    expect(backend.isInitialized()).toBe(false);
  });

  it('compileCircuit produces mock ACIR in mock mode', async () => {
    const backend = new BarretenbergBackend();
    await backend.initialize();
    const result = await backend.compileCircuit({
      id: 'test',
      name: 'Test',
      description: '',
      source: 'fn main() {}',
      publicInputs: [],
      privateInputs: [],
    });
    expect(result.acir.length).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);
  });

  it('generateProof produces non-zero proof in mock mode', async () => {
    const backend = new BarretenbergBackend();
    await backend.initialize();
    await backend.compileCircuit({
      id: 'test',
      name: 'Test',
      description: '',
      source: 'fn main(x: pub u32) {}',
      publicInputs: [{ name: 'x', type: 'u32', visibility: 'public' }],
      privateInputs: [],
    });
    const result = await backend.generateProof('test', { x: 42 }, {});
    expect(result.proof.length).toBe(64);
    expect(result.proof.some((b) => b !== 0)).toBe(true);
  });

  it('verifyProof validates non-zero proofs in mock mode', async () => {
    const backend = new BarretenbergBackend();
    await backend.initialize();
    const valid = await backend.verifyProof('test', new Uint8Array([1, 2, 3]), {});
    expect(valid).toBe(true);
  });

  it('verifyProof rejects all-zero proofs in mock mode', async () => {
    const backend = new BarretenbergBackend();
    await backend.initialize();
    const valid = await backend.verifyProof('test', new Uint8Array(64).fill(0), {});
    expect(valid).toBe(false);
  });

  it('destroy cleans up state', async () => {
    const backend = new BarretenbergBackend();
    await backend.initialize();
    backend.destroy();
    expect(backend.isInitialized()).toBe(false);
  });
});

// =============================================================================
// v4.3 EXPORTED CONSTANTS
// =============================================================================

describe('ZkPrivateTrait -- exported constants (v4.3)', () => {
  it('BUILTIN_CIRCUITS has 4 circuits', () => {
    expect(BUILTIN_CIRCUITS.length).toBe(4);
  });

  it('SPATIAL_PREDICATE_CIRCUITS has 3 circuits', () => {
    expect(SPATIAL_PREDICATE_CIRCUITS.length).toBe(3);
  });

  it('ALL_CIRCUITS has 7 circuits', () => {
    expect(ALL_CIRCUITS.length).toBe(7);
  });

  it('all circuits have valid Noir source code', () => {
    for (const circuit of ALL_CIRCUITS) {
      expect(circuit.source).toContain('fn main');
      expect(circuit.id).toBeTruthy();
      expect(circuit.name).toBeTruthy();
    }
  });

  it('all circuits have matching input definitions', () => {
    for (const circuit of ALL_CIRCUITS) {
      const pubNames = circuit.publicInputs.map((i) => i.name);
      const privNames = circuit.privateInputs.map((i) => i.name);
      // Verify no overlap between public and private
      for (const name of pubNames) {
        expect(privNames).not.toContain(name);
      }
    }
  });
});

// =============================================================================
// v4.3 DEFAULT CONFIG
// =============================================================================

describe('ZkPrivateTrait -- defaultConfig (v4.3)', () => {
  const d = zkPrivateHandler.defaultConfig;

  it('has v4.0 defaults', () => {
    expect(d.backend).toBe('mock');
    expect(d.wasm_path).toBe('');
    expect(d.timeout_ms).toBe(60_000);
    expect(d.cache_circuits).toBe(true);
    expect(d.circuits).toEqual([]);
  });

  it('has v4.3 spatial predicate defaults', () => {
    expect(d.predicate).toBe('proximity');
    expect(d.radius).toBe(5.0);
    expect(d.bounds).toEqual([1, 1, 1]);
    expect(d.fallback).toBe('transparent');
    expect(d.circuit_url).toBe('');
  });

  it('has v4.3 disclosure policy defaults', () => {
    expect(d.disclosure_policy).toBeDefined();
    expect(d.disclosure_policy!.alwaysDisclose).toEqual([]);
    expect(d.disclosure_policy!.requireConsent).toEqual([]);
    expect(d.disclosure_policy!.neverDisclose).toEqual([]);
  });

  it('has v4.3 wallet integration defaults', () => {
    expect(d.wallet_integration).toBeDefined();
    expect(d.wallet_integration!.enabled).toBe(false);
    expect(d.wallet_integration!.chain).toBe('ethereum');
    expect(d.wallet_integration!.auto_submit).toBe(false);
  });
});
