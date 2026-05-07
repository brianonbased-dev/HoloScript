/**
 * Tests for the Signer interface + EthersSigner adapter + chain-anchor
 * helpers — Phase 2 scaffolding for task_1778132483482_otep.
 *
 * Coverage:
 *  - Signer interface contract (sendTransaction returns {hash, wait()})
 *  - EthersSigner deterministic CI seed derivation
 *  - EthersSigner sendTransaction in no-broadcast mode produces real-shaped
 *    tx hash + consistent from address
 *  - HOLOMESH_DEV_SIGNER_KEY env override
 *  - hashSettlementReceipt produces a stable EIP-712 hash matching the
 *    F.041 shape (chain-id pinned, viem.hashTypedData)
 *  - anchorSettlement round-trips against a MockSigner
 *  - verifyChainAnchor accepts a matching tx and rejects malformed ones
 *  - settleNegotiationWithAnchor populates settlementTxHash from the signer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isAddress, getAddress } from 'ethers';
import {
  EthersSigner,
  MockSigner,
  resolveDevSignerKey,
  DEFAULT_CHAIN_ID,
  type SignerTxRequest,
  type SignerTxResult,
} from '../signing/signer';
import {
  hashSettlementReceipt,
  anchorSettlement,
  verifyChainAnchor,
  toHashable,
  settlementDomain,
  type ChainAnchorFetcher,
  type HashableReceipt,
} from '../signing/chain-anchor';
import {
  createNegotiation,
  advanceNegotiation,
  settleNegotiationWithAnchor,
  _resetNegotiations,
  type NegotiationQuote,
  type SettlementReceipt,
} from '../agent-negotiation';

const FIXED_QUOTE: NegotiationQuote = {
  toolName: 'compile_to_unity',
  description: 'compile the holo to a unity package',
  price: 100,
  currency: 'USDC',
  slaSeconds: 30,
  expiresAt: '2026-12-31T23:59:59.000Z',
};

const FIXED_HASHABLE: HashableReceipt = {
  protocol: 'holomesh.negotiation.v1',
  negotiationId: 'nego_test_001',
  initiatorAddress: '0xeb6ff8261678ea06a88b0a63ceaa74901d545681',
  responderAddress: '0x0c574397150ad8d9f7fef83fe86a2cbdf4a660e3',
  initiatorSignature: '0x' + 'aa'.repeat(65),
  responderSignature: '0x' + 'bb'.repeat(65),
  resultHash: '0x' + '11'.repeat(32),
  finalQuote: FIXED_QUOTE,
  settledAt: '2026-05-06T12:00:00.000Z',
};

class CountingSigner extends MockSigner {
  public calls = 0;

  override async sendTransaction(tx: SignerTxRequest): Promise<SignerTxResult> {
    this.calls += 1;
    return super.sendTransaction(tx);
  }
}

describe('signer interface contract', () => {
  it('MockSigner satisfies Signer: sendTransaction -> {hash, from, chainId, wait()}', async () => {
    const m = new MockSigner({ address: '0x000000000000000000000000000000000000dEaD' });
    expect(m.chainId).toBe(DEFAULT_CHAIN_ID);
    const addr = await m.getAddress();
    expect(addr.toLowerCase()).toBe('0x000000000000000000000000000000000000dead');
    const result = await m.sendTransaction({
      to: addr,
      value: 0n,
      data: '0x' + 'aa'.repeat(32),
    });
    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.from.toLowerCase()).toBe(addr.toLowerCase());
    expect(result.chainId).toBe(DEFAULT_CHAIN_ID);
    const receipt = await result.wait();
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe(1);
    expect(receipt!.blockNumber).toBeGreaterThan(0);
  });

  it('EthersSigner derives the canonical hardhat-account-0 address from the deterministic CI seed', async () => {
    const s = new EthersSigner();
    const addr = await s.getAddress();
    // Deterministic seed = hardhat account #0; address is universally known.
    expect(addr.toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
    expect(isAddress(addr)).toBe(true);
    expect(s.chainId).toBe(DEFAULT_CHAIN_ID);
  });

  it('EthersSigner sendTransaction (no-broadcast) returns a real-shaped tx hash + consistent from', async () => {
    const s = new EthersSigner();
    const addr = await s.getAddress();
    const result = await s.sendTransaction({
      to: addr, // self-tx (chain-anchor convention)
      value: 0n,
      data: '0x' + 'cc'.repeat(32),
    });
    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.from).toBe(addr);
    expect(result.chainId).toBe(DEFAULT_CHAIN_ID);
    const receipt = await result.wait();
    expect(receipt).not.toBeNull();
    expect(receipt!.status).toBe(1);
    expect(receipt!.blockNumber).toBeGreaterThan(0);
  });

  it('EthersSigner respects HOLOMESH_DEV_SIGNER_KEY env override', () => {
    const customKey = '0x' + '42'.repeat(32);
    const env = { HOLOMESH_DEV_SIGNER_KEY: customKey };
    const resolved = resolveDevSignerKey({}, env as NodeJS.ProcessEnv);
    expect(resolved).toBe(customKey);
    const s = new EthersSigner({ privateKey: customKey });
    expect(s).toBeDefined(); // construction must not throw
  });
});

describe('chain-anchor: hashSettlementReceipt', () => {
  it('produces a stable EIP-712 hash matching the F.041 shape (chain-id pinned, deterministic)', () => {
    const domain = settlementDomain({ HOLOMESH_NEGOTIATION_CHAIN_ID: '8453' } as NodeJS.ProcessEnv);
    expect(domain.chainId).toBe(8453);

    const h1 = hashSettlementReceipt(FIXED_HASHABLE, domain);
    const h2 = hashSettlementReceipt(FIXED_HASHABLE, domain);
    expect(h1).toBe(h2); // determinism
    expect(h1).toMatch(/^0x[0-9a-fA-F]{64}$/); // F.041 shape: 32-byte hash

    // Sensitivity: changing any field must change the hash. (canonicalization is real)
    const tweaked = { ...FIXED_HASHABLE, resultHash: '0x' + '22'.repeat(32) };
    const h3 = hashSettlementReceipt(tweaked, domain);
    expect(h3).not.toBe(h1);

    // Sensitivity: changing the chain id must change the hash.
    const otherDomain = { name: 'HoloMeshNegotiation', version: '1', chainId: 1 };
    const h4 = hashSettlementReceipt(FIXED_HASHABLE, otherDomain);
    expect(h4).not.toBe(h1);
  });

  it('toHashable strips settlementTxHash from a SettlementReceipt (avoids self-cycle)', () => {
    const fullReceipt: SettlementReceipt = {
      protocol: 'holomesh.negotiation.v1',
      negotiationId: FIXED_HASHABLE.negotiationId,
      initiatorSignature: FIXED_HASHABLE.initiatorSignature,
      initiatorAddress: FIXED_HASHABLE.initiatorAddress,
      responderSignature: FIXED_HASHABLE.responderSignature,
      responderAddress: FIXED_HASHABLE.responderAddress,
      finalQuote: FIXED_QUOTE,
      resultHash: FIXED_HASHABLE.resultHash,
      settlementTxHash: '0x' + 'ff'.repeat(32),
      settledAt: FIXED_HASHABLE.settledAt,
    };
    const hashable = toHashable(fullReceipt);
    expect((hashable as Record<string, unknown>).settlementTxHash).toBeUndefined();
    expect(hashable.protocol).toBe(fullReceipt.protocol);
    expect(hashable.resultHash).toBe(fullReceipt.resultHash);
  });
});

describe('chain-anchor: anchorSettlement + verifyChainAnchor round-trip', () => {
  it('anchorSettlement uses a Signer to broadcast a self-tx whose calldata equals the EIP-712 hash', async () => {
    const fixedTx = '0x' + 'ab'.repeat(32);
    const signer = new MockSigner({
      address: '0x000000000000000000000000000000000000dEaD',
      fixedTxHash: fixedTx,
    });
    const result = await anchorSettlement(signer, FIXED_HASHABLE);
    expect(result.eip712Hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.txHash).toBe(fixedTx);
    expect(result.signerAddress.toLowerCase()).toBe('0x000000000000000000000000000000000000dead');
    expect(result.chainId).toBe(DEFAULT_CHAIN_ID);
    expect(result.status).toBe(1);
    expect(result.blockNumber).not.toBeNull();
  });

  it('verifyChainAnchor accepts a matching tx + rejects mismatched calldata or signer', async () => {
    const fixedTx = '0x' + 'ab'.repeat(32);
    const signer = new MockSigner({
      address: '0x000000000000000000000000000000000000dEaD',
      fixedTxHash: fixedTx,
    });
    const anchor = await anchorSettlement(signer, FIXED_HASHABLE);

    // Mocked Base RPC fetcher returns a tx that exactly matches what the
    // dev signer "broadcast". This is the production-shape verification
    // path — same as attestation-routes.ts processAttestationViaTx.
    const goodFetcher: ChainAnchorFetcher = async (txHash) => {
      expect(txHash).toBe(fixedTx);
      return {
        tx: {
          from: anchor.signerAddress,
          to: anchor.signerAddress,
          input: anchor.eip712Hash,
          blockNumber: '0x10',
        },
        receipt: { status: '0x1', blockNumber: '0x10' },
      };
    };
    const okResult = await verifyChainAnchor(
      anchor.txHash,
      anchor.eip712Hash,
      anchor.signerAddress,
      goodFetcher
    );
    expect(okResult.ok).toBe(true);
    expect(okResult.blockNumber).toBe('0x10');

    // Tampered calldata -> mismatch
    const tamperedFetcher: ChainAnchorFetcher = async () => ({
      tx: {
        from: anchor.signerAddress,
        to: anchor.signerAddress,
        input: '0x' + 'de'.repeat(32),
        blockNumber: '0x10',
      },
      receipt: { status: '0x1', blockNumber: '0x10' },
    });
    const badResult = await verifyChainAnchor(
      anchor.txHash,
      anchor.eip712Hash,
      anchor.signerAddress,
      tamperedFetcher
    );
    expect(badResult.ok).toBe(false);
    expect(badResult.reason).toBe('tx-input-mismatch');

    // Wrong from
    const wrongFromFetcher: ChainAnchorFetcher = async () => ({
      tx: {
        from: '0x' + '11'.repeat(20),
        to: anchor.signerAddress,
        input: anchor.eip712Hash,
        blockNumber: '0x10',
      },
      receipt: { status: '0x1', blockNumber: '0x10' },
    });
    const wrongFrom = await verifyChainAnchor(
      anchor.txHash,
      anchor.eip712Hash,
      anchor.signerAddress,
      wrongFromFetcher
    );
    expect(wrongFrom.ok).toBe(false);
    expect(wrongFrom.reason).toBe('tx-from-mismatch');

    // Tx not found
    const missingFetcher: ChainAnchorFetcher = async () => ({ tx: null, receipt: null });
    const missing = await verifyChainAnchor(
      anchor.txHash,
      anchor.eip712Hash,
      anchor.signerAddress,
      missingFetcher
    );
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe('tx-not-found');

    // Failed receipt
    const failedFetcher: ChainAnchorFetcher = async () => ({
      tx: {
        from: anchor.signerAddress,
        to: anchor.signerAddress,
        input: anchor.eip712Hash,
        blockNumber: '0x10',
      },
      receipt: { status: '0x0', blockNumber: '0x10' },
    });
    const failed = await verifyChainAnchor(
      anchor.txHash,
      anchor.eip712Hash,
      anchor.signerAddress,
      failedFetcher
    );
    expect(failed.ok).toBe(false);
    expect(failed.reason).toBe('tx-receipt-failed');
  });
});

describe('settleNegotiationWithAnchor: end-to-end', () => {
  beforeEach(() => {
    _resetNegotiations();
  });

  it('populates settlementTxHash from the signer + writes a chain-anchored receipt', async () => {
    // Set up a negotiation in the EXECUTED state (the only state from which
    // settle is legal).
    const n = createNegotiation({
      teamId: 'team_test',
      initiatorAgentId: 'agent_initiator',
      initiatorAgentName: 'Alice',
      responderAgentId: 'agent_responder',
      responderAgentName: 'Bob',
      request: { toolName: 'compile_to_unity', capabilityQuery: 'compile-unity' },
    });

    // responder quotes
    advanceNegotiation({
      negotiationId: n.id,
      action: 'quote',
      authorAgentId: 'agent_responder',
      payload: { quote: FIXED_QUOTE },
    });
    // initiator accepts
    advanceNegotiation({
      negotiationId: n.id,
      action: 'accept',
      authorAgentId: 'agent_initiator',
    });
    // responder executes
    advanceNegotiation({
      negotiationId: n.id,
      action: 'execute',
      authorAgentId: 'agent_responder',
      payload: { result: { unity_package_url: 'ipfs://demo' } },
    });

    // Now settle via chain-anchor.
    const fixedTx = '0x' + 'cd'.repeat(32);
    const signer = new MockSigner({
      address: '0x000000000000000000000000000000000000dEaD',
      fixedTxHash: fixedTx,
    });
    const result = await settleNegotiationWithAnchor({
      negotiationId: n.id,
      authorAgentId: 'agent_initiator',
      initiatorSignature: FIXED_HASHABLE.initiatorSignature,
      initiatorAddress: FIXED_HASHABLE.initiatorAddress,
      responderSignature: FIXED_HASHABLE.responderSignature,
      responderAddress: FIXED_HASHABLE.responderAddress,
      signer,
    });
    expect(result.ok).toBe(true);
    expect(result.negotiation?.state).toBe('settled');
    expect(result.negotiation?.receipt?.settlementTxHash).toBe(fixedTx);
    expect(result.anchor).toBeDefined();
    expect(result.anchor!.eip712Hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.anchor!.signerAddress.toLowerCase()).toBe(
      '0x000000000000000000000000000000000000dead'
    );
    expect(result.anchor!.chainId).toBe(DEFAULT_CHAIN_ID);
    expect(result.anchor!.status).toBe(1);
  });

  it('chain-anchored receipt verifies round-trip against a mocked Base RPC', async () => {
    const n = createNegotiation({
      teamId: 'team_test',
      initiatorAgentId: 'agent_initiator',
      initiatorAgentName: 'Alice',
      responderAgentId: 'agent_responder',
      responderAgentName: 'Bob',
      request: { toolName: 'compile_to_unity', capabilityQuery: 'compile-unity' },
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'quote',
      authorAgentId: 'agent_responder',
      payload: { quote: FIXED_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'accept',
      authorAgentId: 'agent_initiator',
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'execute',
      authorAgentId: 'agent_responder',
      payload: { result: { unity_package_url: 'ipfs://demo' } },
    });

    const signer = new EthersSigner(); // real ethers wallet, no broadcast
    const result = await settleNegotiationWithAnchor({
      negotiationId: n.id,
      authorAgentId: 'agent_initiator',
      initiatorSignature: FIXED_HASHABLE.initiatorSignature,
      initiatorAddress: FIXED_HASHABLE.initiatorAddress,
      responderSignature: FIXED_HASHABLE.responderSignature,
      responderAddress: FIXED_HASHABLE.responderAddress,
      signer,
    });
    expect(result.ok).toBe(true);
    const anchor = result.anchor!;

    // Mocked Base RPC returns the same tx the dev signer fabricated.
    const fetcher: ChainAnchorFetcher = async (txHash) => {
      if (txHash !== anchor.txHash) return { tx: null, receipt: null };
      return {
        tx: {
          from: anchor.signerAddress,
          to: anchor.signerAddress,
          input: anchor.eip712Hash,
          blockNumber: '0x' + (anchor.blockNumber ?? 0).toString(16),
        },
        receipt: {
          status: '0x1',
          blockNumber: '0x' + (anchor.blockNumber ?? 0).toString(16),
        },
      };
    };
    const verified = await verifyChainAnchor(
      anchor.txHash,
      anchor.eip712Hash,
      anchor.signerAddress,
      fetcher
    );
    expect(verified.ok).toBe(true);
    expect(verified.blockNumber).toBe('0x' + (anchor.blockNumber ?? 0).toString(16));
  });

  it('rejects settle-from-non-executed state without consuming a tx', async () => {
    const n = createNegotiation({
      teamId: 'team_test',
      initiatorAgentId: 'agent_initiator',
      initiatorAgentName: 'Alice',
      responderAgentId: 'agent_responder',
      responderAgentName: 'Bob',
      request: { toolName: 'compile_to_unity', capabilityQuery: 'compile-unity' },
    });
    // No quote, no accept, no execute — settle is illegal.
    const signer = new CountingSigner({});
    const result = await settleNegotiationWithAnchor({
      negotiationId: n.id,
      authorAgentId: 'agent_initiator',
      initiatorSignature: FIXED_HASHABLE.initiatorSignature,
      initiatorAddress: FIXED_HASHABLE.initiatorAddress,
      responderSignature: FIXED_HASHABLE.responderSignature,
      responderAddress: FIXED_HASHABLE.responderAddress,
      signer,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('illegal-transition');
    expect(signer.calls).toBe(0);
  });

  it('rejects duplicate or non-party anchored settlement before consuming a tx', async () => {
    const n = createNegotiation({
      teamId: 'team_test',
      initiatorAgentId: 'agent_initiator',
      initiatorAgentName: 'Alice',
      responderAgentId: 'agent_responder',
      responderAgentName: 'Bob',
      request: { toolName: 'compile_to_unity', capabilityQuery: 'compile-unity' },
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'quote',
      authorAgentId: 'agent_responder',
      payload: { quote: FIXED_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'accept',
      authorAgentId: 'agent_initiator',
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'execute',
      authorAgentId: 'agent_responder',
      payload: { result: { unity_package_url: 'ipfs://demo' } },
    });

    const outsiderSigner = new CountingSigner({});
    const outsider = await settleNegotiationWithAnchor({
      negotiationId: n.id,
      authorAgentId: 'agent_outsider',
      initiatorSignature: FIXED_HASHABLE.initiatorSignature,
      initiatorAddress: FIXED_HASHABLE.initiatorAddress,
      responderSignature: FIXED_HASHABLE.responderSignature,
      responderAddress: FIXED_HASHABLE.responderAddress,
      signer: outsiderSigner,
    });
    expect(outsider.ok).toBe(false);
    expect(outsider.reason).toBe('not-a-party');
    expect(outsiderSigner.calls).toBe(0);

    const firstSigner = new CountingSigner({ fixedTxHash: '0x' + 'ef'.repeat(32) });
    const first = await settleNegotiationWithAnchor({
      negotiationId: n.id,
      authorAgentId: 'agent_initiator',
      initiatorSignature: FIXED_HASHABLE.initiatorSignature,
      initiatorAddress: FIXED_HASHABLE.initiatorAddress,
      responderSignature: FIXED_HASHABLE.responderSignature,
      responderAddress: FIXED_HASHABLE.responderAddress,
      signer: firstSigner,
    });
    expect(first.ok).toBe(true);
    expect(firstSigner.calls).toBe(1);

    const duplicateSigner = new CountingSigner({});
    const duplicate = await settleNegotiationWithAnchor({
      negotiationId: n.id,
      authorAgentId: 'agent_initiator',
      initiatorSignature: FIXED_HASHABLE.initiatorSignature,
      initiatorAddress: FIXED_HASHABLE.initiatorAddress,
      responderSignature: FIXED_HASHABLE.responderSignature,
      responderAddress: FIXED_HASHABLE.responderAddress,
      signer: duplicateSigner,
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toBe('terminal-state');
    expect(duplicateSigner.calls).toBe(0);
  });

  it('chain-anchored hash uses a checksummed-or-lowercase address pair safely', async () => {
    // EIP-712 address encoding lowercases internally in viem; test we don't
    // produce divergent hashes for the same address typed two ways.
    const lower = FIXED_HASHABLE;
    const checksummed: HashableReceipt = {
      ...FIXED_HASHABLE,
      initiatorAddress: getAddress(FIXED_HASHABLE.initiatorAddress),
      responderAddress: getAddress(FIXED_HASHABLE.responderAddress),
    };
    expect(hashSettlementReceipt(lower)).toBe(hashSettlementReceipt(checksummed));
  });
});
