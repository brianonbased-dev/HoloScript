/**
 * Chain-anchor helpers for SettlementReceipt — Phase 2 scaffolding for
 * task_1778132483482_otep. Bundles:
 *
 *   - The canonical EIP-712 typed-data shape for a SettlementReceipt.
 *   - `hashSettlementReceipt` — compute the EIP-712 hash for a partial
 *     receipt (everything but the chain-anchor itself).
 *   - `anchorSettlement` — given a Signer, send a self-tx whose calldata is
 *     the EIP-712 hash, return the tx hash + receipt + recovered signer.
 *   - `verifyChainAnchor` — given a tx hash + expected hash + an RPC fetcher,
 *     confirm the on-chain tx matches.
 *
 * Same pattern as attestation-routes.ts processAttestationViaTx, scoped
 * to negotiation receipts. The shape is stable enough that the founder
 * Trezor swap (task_1778132312944_bcup) only needs to substitute the
 * Signer implementation — none of the call sites change.
 *
 * Stacks on:
 * - F.041 / W.GOLD.514 chain-anchor pattern.
 * - signer.ts (this PR) — the Signer interface that lets dev / Trezor /
 *   Mock signers be swapped without changing anchor logic.
 *
 * @module holomesh/signing/chain-anchor
 */

import { hashTypedData } from 'viem';
import type { SettlementReceipt, NegotiationQuote } from '../agent-negotiation';
import type { Signer, SignerTxRequest } from './signer';
import { DEFAULT_CHAIN_ID } from './signer';

/** EIP-712 domain — pinned to Base mainnet per attestation-routes.ts conventions. */
export interface SettlementDomain {
  name: string;
  version: string;
  chainId: number;
}

/** Build the EIP-712 domain. */
export function settlementDomain(
  env: NodeJS.ProcessEnv = process.env
): SettlementDomain {
  const chainId = Number.parseInt(
    env.HOLOMESH_NEGOTIATION_CHAIN_ID ?? String(DEFAULT_CHAIN_ID),
    10
  );
  return { name: 'HoloMeshNegotiation', version: '1', chainId };
}

/**
 * EIP-712 typed-data spec for a SettlementReceipt. Fields chosen so any agent
 * holding a copy of the receipt can recompute the same hash deterministically.
 *
 * `finalQuote` is flattened into scalar fields rather than nested — viem's
 * EIP-712 encoder accepts nested structs, but flat fields keep the shape
 * obvious to reviewers and avoid the recursive-canonicalization edge cases
 * that bit the F.041 sign-path.
 */
export const SETTLEMENT_RECEIPT_TYPES = {
  SettlementReceipt: [
    { name: 'protocol', type: 'string' },
    { name: 'negotiationId', type: 'string' },
    { name: 'initiatorAddress', type: 'address' },
    { name: 'responderAddress', type: 'address' },
    { name: 'initiatorSignature', type: 'string' },
    { name: 'responderSignature', type: 'string' },
    { name: 'resultHash', type: 'string' },
    { name: 'toolName', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'price', type: 'uint256' },
    { name: 'currency', type: 'string' },
    { name: 'slaSeconds', type: 'uint256' },
    { name: 'expiresAt', type: 'string' },
    { name: 'settledAt', type: 'string' },
  ],
} as const;

/**
 * The subset of a SettlementReceipt that gets included in the EIP-712 hash.
 * Excludes `settlementTxHash` (the hash anchors itself, which would create a
 * cycle) and `protocol` is taken from the type spec.
 *
 * `price` and `slaSeconds` are coerced to bigint for uint256 encoding.
 */
export interface HashableReceipt {
  protocol: string;
  negotiationId: string;
  initiatorAddress: string;
  responderAddress: string;
  initiatorSignature: string;
  responderSignature: string;
  resultHash: string;
  finalQuote: NegotiationQuote;
  settledAt: string;
}

/** Build the hashable subset from a full SettlementReceipt. */
export function toHashable(receipt: SettlementReceipt): HashableReceipt {
  return {
    protocol: receipt.protocol,
    negotiationId: receipt.negotiationId,
    initiatorAddress: receipt.initiatorAddress,
    responderAddress: receipt.responderAddress,
    initiatorSignature: receipt.initiatorSignature,
    responderSignature: receipt.responderSignature,
    resultHash: receipt.resultHash,
    finalQuote: receipt.finalQuote,
    settledAt: receipt.settledAt,
  };
}

/**
 * Compute the EIP-712 hash of a SettlementReceipt. Uses viem's
 * `hashTypedData` (the same encoder attestation-routes.ts uses) so the
 * canonicalization is bit-identical to the founder-side path.
 *
 * Throws on malformed input (e.g. missing finalQuote).
 */
export function hashSettlementReceipt(
  hashable: HashableReceipt,
  domain: SettlementDomain = settlementDomain()
): string {
  if (!hashable.finalQuote) {
    throw new Error('hashSettlementReceipt: hashable.finalQuote is required');
  }
  const message = {
    protocol: hashable.protocol,
    negotiationId: hashable.negotiationId,
    initiatorAddress: hashable.initiatorAddress as `0x${string}`,
    responderAddress: hashable.responderAddress as `0x${string}`,
    initiatorSignature: hashable.initiatorSignature,
    responderSignature: hashable.responderSignature,
    resultHash: hashable.resultHash,
    toolName: hashable.finalQuote.toolName,
    description: hashable.finalQuote.description,
    price: BigInt(Math.trunc(hashable.finalQuote.price)),
    currency: hashable.finalQuote.currency,
    slaSeconds: BigInt(Math.trunc(hashable.finalQuote.slaSeconds)),
    expiresAt: hashable.finalQuote.expiresAt,
    settledAt: hashable.settledAt,
  };
  return hashTypedData({
    domain,
    types: SETTLEMENT_RECEIPT_TYPES,
    primaryType: 'SettlementReceipt',
    message,
  });
}

/** Result of an `anchorSettlement` call. */
export interface AnchorResult {
  /** EIP-712 hash that was sent as calldata. */
  eip712Hash: string;
  /** On-chain (or mocked) tx hash. Goes into receipt.settlementTxHash. */
  txHash: string;
  /** Address that sent the tx (the chain-enforced `from`). */
  signerAddress: string;
  /** Chain id the tx was signed for. */
  chainId: number;
  /** Block number once mined / fabricated. */
  blockNumber: number | null;
  /** Receipt status (1 success, 0 fail, null if reorg-dropped). */
  status: number | null;
}

/**
 * Anchor a SettlementReceipt on-chain via the F.041 pattern: compute the
 * EIP-712 hash, send a self-tx with the hash as calldata, return the tx
 * hash for population into receipt.settlementTxHash.
 *
 * Per W.GOLD.514: the chain enforces the `from` arg, so the recovered
 * signer cannot drift the way `eth_signTypedData_v4` did. The Signer
 * implementation owns the broadcast — dev (ethers Wallet) for tests,
 * Trezor for the founder swap. This function is the same either way.
 */
export async function anchorSettlement(
  signer: Signer,
  hashable: HashableReceipt,
  domain: SettlementDomain = settlementDomain()
): Promise<AnchorResult> {
  const eip712Hash = hashSettlementReceipt(hashable, domain);
  const fromAddress = await signer.getAddress();
  const tx: SignerTxRequest = {
    to: fromAddress, // self-tx (chain-anchor convention)
    value: 0n,
    data: eip712Hash,
    chainId: signer.chainId,
  };
  const result = await signer.sendTransaction(tx);
  const receipt = await result.wait();
  return {
    eip712Hash,
    txHash: result.hash,
    signerAddress: result.from,
    chainId: result.chainId,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status ?? null,
  };
}

/** Shape of a tx fetched from a Base RPC for verification. */
export interface ChainAnchorTx {
  from: string;
  to: string | null;
  input: string;
  blockNumber: string | null;
}

/** Shape of a tx receipt fetched from a Base RPC. */
export interface ChainAnchorReceipt {
  status: string;
  blockNumber: string;
}

/** Fetcher injection point for tests — same pattern as attestation-routes.ts. */
export type ChainAnchorFetcher = (txHash: string) => Promise<{
  tx: ChainAnchorTx | null;
  receipt: ChainAnchorReceipt | null;
}>;

/** Result of `verifyChainAnchor`. */
export interface VerifyChainAnchorResult {
  ok: boolean;
  reason?:
    | 'tx-not-found'
    | 'receipt-not-found'
    | 'tx-receipt-failed'
    | 'tx-input-mismatch'
    | 'tx-from-mismatch';
  blockNumber?: string;
}

/**
 * Verify a chain anchor round-trips: tx exists, status is success, calldata
 * equals the expected EIP-712 hash, `from` equals the expected signer.
 *
 * Caller supplies the RPC fetcher so tests can mock without network. Same
 * shape as attestation-routes.ts processAttestationViaTx for symmetry.
 */
export async function verifyChainAnchor(
  txHash: string,
  expectedHash: string,
  expectedSigner: string,
  fetcher: ChainAnchorFetcher
): Promise<VerifyChainAnchorResult> {
  const { tx, receipt } = await fetcher(txHash);
  if (!tx) return { ok: false, reason: 'tx-not-found' };
  if (!receipt) return { ok: false, reason: 'receipt-not-found' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'tx-receipt-failed' };
  if (tx.input.toLowerCase() !== expectedHash.toLowerCase()) {
    return { ok: false, reason: 'tx-input-mismatch' };
  }
  if (tx.from.toLowerCase() !== expectedSigner.toLowerCase()) {
    return { ok: false, reason: 'tx-from-mismatch' };
  }
  return { ok: true, blockNumber: receipt.blockNumber };
}
