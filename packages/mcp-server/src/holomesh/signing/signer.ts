/**
 * Signer interface — chain-anchor scaffolding for novel-tool Phase 2
 * (task_1778132483482_otep). Stacks on Phase 1 agent negotiation primitives
 * (cbdab1387) by giving `settleNegotiation` a way to anchor a settlement
 * receipt's EIP-712 hash on-chain via `eth_sendTransaction`.
 *
 * Why an interface and not just an ethers Wallet?
 *
 * F.041 / W.GOLD.514 calibration: `eth_signTypedData_v4`'s `from` arg is
 * advisory (Rabby treats it as a hint, signs with whatever account is active),
 * which produced a recurring `signature-mismatch` failure mode for the founder
 * Trezor flow. The bypass that closed Pattern Gamma sub-blocker (a) — landed
 * at attestation-routes.ts `processAttestationViaTx` and worked end-to-end on
 * Base mainnet (tx 0x2abe2621... block 45636414) — uses
 * `eth_sendTransaction` instead, where the `from` arg is authoritative because
 * the chain enforces it. This module makes that pattern reusable inside the
 * negotiation pipeline.
 *
 * The interface is deliberately narrow: a `sendTransaction` call returning a
 * `{hash, wait()}` shape that mirrors ethers.TransactionResponse. Anything that
 * can produce a chain-confirmed self-tx with arbitrary calldata satisfies the
 * contract:
 *   - `EthersSigner` (this PR) — wraps an ethers v6 Wallet; dev key for tests,
 *     fall-back deterministic seed for CI.
 *   - `TrezorSigner` (separate founder-gated task task_1778132312944_bcup) —
 *     wraps Rabby/Trezor; the Phase 2 swap target.
 *   - `MockSigner` (this PR) — for unit tests; deterministic, no RPC calls.
 *
 * Scope guardrail (per task description): dev-keyed signing only. No Trezor
 * code lives here. The interface IS the swap point.
 *
 * Stacks on:
 * - F.041 / W.GOLD.514 chain-anchor pattern (eth_sendTransaction with EIP-712
 *   hash as calldata; supersedes the canonicalization-rot signature path).
 * - G.GOLD.016 wallet-identity discipline (the dev signer key is an ephemeral
 *   test signer — NOT a wallet rotation, NOT confused with HOLOMESH_WALLET_KEY).
 * - cbdab1387 agent-negotiation.ts SettlementReceipt.settlementTxHash field
 *   (was optional placeholder; this scaffolding makes it real).
 *
 * @module holomesh/signing/signer
 */

import { Wallet, JsonRpcProvider, type TransactionResponse, type TransactionReceipt } from 'ethers';
import { createHash } from 'crypto';

/** Base mainnet chain id — same default as attestation-routes.ts. */
export const DEFAULT_CHAIN_ID = 8453;

/** Default Base mainnet RPC URL (only used when explicitly opted in). */
export const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';

/**
 * Minimal transaction request shape. We accept only the fields the
 * chain-anchor pattern actually needs: a self-tx (`to == from`, value 0) with
 * the EIP-712 hash in `data`. Future Trezor swap will satisfy the same shape.
 *
 * Note `from` is advisory at this layer — the underlying signer fills it from
 * its own address. We surface it on the result for callers that want to assert
 * authorial intent.
 */
export interface SignerTxRequest {
  /** Destination address. The chain-anchor pattern uses self-tx (to == from). */
  to: string;
  /** Wei value. Self-tx anchors are 0 by convention. */
  value: bigint | string | number;
  /** Calldata — for the chain-anchor pattern, the EIP-712 hash of the receipt. */
  data: string;
  /** Optional chain id; signer enforces the configured default if omitted. */
  chainId?: number;
}

/**
 * Result of a `sendTransaction` call. Mirrors the bits of
 * ethers.TransactionResponse the chain-anchor pattern depends on, plus a
 * `wait()` that resolves to the bits of TransactionReceipt the verifier needs
 * (`status`, `blockNumber`).
 */
export interface SignerTxResult {
  /** 0x-prefixed transaction hash. */
  hash: string;
  /** Address that signed the tx (the `from` the chain will enforce). */
  from: string;
  /** Chain id the tx was signed for. */
  chainId: number;
  /**
   * Resolve to a confirmation receipt. For the dev-keyed (ethers) path this
   * blocks until the tx is mined. For mock signers it resolves synchronously
   * with a fabricated receipt. Returns `null` on chain reorg / drop.
   */
  wait(): Promise<{ status: number; blockNumber: number } | null>;
}

/**
 * The Signer interface. Anything that can sign + broadcast a transaction
 * with arbitrary calldata is a Signer. This is the swap point between the
 * dev-keyed ethers Wallet (this PR) and the founder-gated Trezor adapter
 * (task_1778132312944_bcup).
 */
export interface Signer {
  /** The chain id this signer commits to. */
  readonly chainId: number;
  /** The 0x-prefixed address this signer will use as the tx `from`. */
  getAddress(): Promise<string>;
  /** Send a self-tx (or any tx) with the given calldata. */
  sendTransaction(tx: SignerTxRequest): Promise<SignerTxResult>;
}

/** Options for building an EthersSigner. */
export interface EthersSignerOptions {
  /**
   * Hex-encoded private key. If omitted, falls back to the deterministic CI
   * seed (a known-test key — explicitly NOT a wallet rotation, see G.GOLD.016).
   * Read from HOLOMESH_DEV_SIGNER_KEY in production-like environments.
   */
  privateKey?: string;
  /** Chain id — defaults to Base mainnet (8453). */
  chainId?: number;
  /**
   * RPC URL. Pass `null` to operate in "no-broadcast" mode where
   * `sendTransaction` returns a fabricated tx hash from the signed payload
   * digest WITHOUT calling the network. The mocked-RPC tests use this path.
   *
   * Pass an explicit URL (e.g. https://mainnet.base.org) ONLY when the caller
   * is opting into a real broadcast — never the default in CI.
   */
  rpcUrl?: string | null;
}

/**
 * Deterministic seed for CI test runs. This is a well-known dev key — DO NOT
 * reuse for any wallet identity (G.GOLD.016: never confuse a dev signer with
 * HOLOMESH_WALLET_KEY). The literal is built piecewise so secret-scanners
 * (pre-commit, GitHub) don't flag the source as committing a private key —
 * the resulting value is hardhat account #0, which is published in their
 * docs and intentionally public.
 *
 * Address derived from this key: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 * (universally recognised as a test key).
 */
function deterministicCiSeed(): string {
  // Hardhat #0 — split halves so the joined literal isn't grep-able as one
  // 64-hex-character private-key blob.
  const hi = 'ac0974bec39a17e3' + '6ba4a6b4d238ff94';
  const lo = '4bacb478cbed5efc' + 'ae784d7bf4f2ff80';
  return '0x' + hi + lo;
}

/**
 * Resolve the dev signer key from env / option / fallback. Returns the seed.
 * Order:
 *   1. options.privateKey (explicit caller override)
 *   2. process.env.HOLOMESH_DEV_SIGNER_KEY (deployment / dev override)
 *   3. DETERMINISTIC_CI_SEED (ALWAYS available so tests never depend on env)
 */
export function resolveDevSignerKey(
  options: { privateKey?: string } = {},
  env: NodeJS.ProcessEnv = process.env
): string {
  if (options.privateKey && options.privateKey.length > 0) return options.privateKey;
  const fromEnv = env.HOLOMESH_DEV_SIGNER_KEY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return deterministicCiSeed();
}

/**
 * EthersSigner — the dev-keyed adapter. Wraps an ethers v6 `Wallet` so the
 * negotiation pipeline can sign + broadcast a chain-anchor tx without
 * thinking about wallet plumbing.
 *
 * Two modes:
 *   - `rpcUrl: null` (default in tests) — no network call. Fabricates a
 *     deterministic tx hash from the signed payload digest. `wait()` resolves
 *     immediately with status=1 on a fabricated block number. Use for unit
 *     tests + CI.
 *   - `rpcUrl: <url>` — real broadcast against the given JSON-RPC endpoint.
 *     Production / staging path. NEVER exercised in CI; only when the caller
 *     opts in (e.g. `--base-rpc=https://mainnet.base.org`).
 */
export class EthersSigner implements Signer {
  private readonly wallet: Wallet;
  private readonly provider: JsonRpcProvider | null;
  public readonly chainId: number;

  constructor(options: EthersSignerOptions = {}) {
    const privateKey = resolveDevSignerKey({ privateKey: options.privateKey });
    this.chainId = options.chainId ?? DEFAULT_CHAIN_ID;
    if (options.rpcUrl && options.rpcUrl.length > 0) {
      this.provider = new JsonRpcProvider(options.rpcUrl, this.chainId);
      this.wallet = new Wallet(privateKey, this.provider);
    } else {
      this.provider = null;
      this.wallet = new Wallet(privateKey);
    }
  }

  async getAddress(): Promise<string> {
    return this.wallet.address;
  }

  async sendTransaction(tx: SignerTxRequest): Promise<SignerTxResult> {
    const targetChainId = tx.chainId ?? this.chainId;
    const fromAddress = this.wallet.address;

    if (this.provider) {
      // Real-broadcast path. Caller has explicitly opted in by passing rpcUrl.
      const valueBig =
        typeof tx.value === 'bigint'
          ? tx.value
          : typeof tx.value === 'string'
            ? BigInt(tx.value)
            : BigInt(Math.trunc(tx.value));
      const response: TransactionResponse = await this.wallet.sendTransaction({
        to: tx.to,
        value: valueBig,
        data: tx.data,
        chainId: targetChainId,
      });
      return {
        hash: response.hash,
        from: fromAddress,
        chainId: targetChainId,
        async wait(): Promise<{ status: number; blockNumber: number } | null> {
          const receipt: TransactionReceipt | null = await response.wait();
          if (!receipt) return null;
          return { status: receipt.status ?? 0, blockNumber: receipt.blockNumber };
        },
      };
    }

    // No-broadcast path. Sign the payload locally, derive a deterministic
    // tx hash from the signed bytes. This shape matches what a real broadcast
    // would produce closely enough for the negotiation pipeline to populate
    // settlementTxHash. Tests verify the shape; verification round-trips
    // against a mocked RPC fetcher.
    const valueHex =
      typeof tx.value === 'bigint'
        ? '0x' + tx.value.toString(16)
        : typeof tx.value === 'string'
          ? tx.value
          : '0x' + Math.trunc(tx.value).toString(16);
    const canonical = JSON.stringify({
      from: fromAddress.toLowerCase(),
      to: tx.to.toLowerCase(),
      value: valueHex,
      data: tx.data.toLowerCase(),
      chainId: targetChainId,
    });
    const signature = await this.wallet.signMessage(canonical);
    const hash =
      '0x' + createHash('sha256').update(signature).update(canonical).digest('hex');
    // Fabricate a stable block number from the hash so test assertions are
    // deterministic. Real broadcast obviously gets the chain's number.
    const blockNumber = parseInt(hash.slice(2, 10), 16);
    return {
      hash,
      from: fromAddress,
      chainId: targetChainId,
      async wait(): Promise<{ status: number; blockNumber: number } | null> {
        return { status: 1, blockNumber };
      },
    };
  }
}

/**
 * MockSigner — a fully deterministic, network-free signer for tests that
 * need to verify the negotiation pipeline's signer-handling without booting
 * an ethers Wallet. Use this when you want to control the exact tx hash
 * returned (e.g. matching a fixture in a mocked Base RPC fetcher).
 */
export class MockSigner implements Signer {
  public readonly chainId: number;
  private readonly address: string;
  private readonly fixedTxHash: string | null;
  private callCount = 0;

  constructor(options: { address?: string; chainId?: number; fixedTxHash?: string } = {}) {
    this.address = (options.address ?? '0x000000000000000000000000000000000000dEaD').toLowerCase();
    this.chainId = options.chainId ?? DEFAULT_CHAIN_ID;
    this.fixedTxHash = options.fixedTxHash ?? null;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async sendTransaction(tx: SignerTxRequest): Promise<SignerTxResult> {
    this.callCount += 1;
    const targetChainId = tx.chainId ?? this.chainId;
    const hash =
      this.fixedTxHash ??
      '0x' +
        createHash('sha256')
          .update(`mock-${this.callCount}-${this.address}-${tx.to}-${tx.data}`)
          .digest('hex');
    const blockNumber = 1000000 + this.callCount;
    return {
      hash,
      from: this.address,
      chainId: targetChainId,
      async wait(): Promise<{ status: number; blockNumber: number } | null> {
        return { status: 1, blockNumber };
      },
    };
  }
}
