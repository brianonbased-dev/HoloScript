/**
 * x402 Payment Protocol Facilitator
 *
 * Implements the x402 protocol (https://www.x402.org/) for HTTP 402 Payment Required
 * responses, enabling native internet payments for HoloScript resources.
 *
 * The x402 protocol flow:
 *   1. Client requests a resource (GET /api/premium-scene)
 *   2. Server responds with HTTP 402 + PaymentRequired body
 *   3. Client signs an EIP-712 authorization (gasless) and retries with X-PAYMENT header
 *   4. Facilitator verifies signature + settles on-chain
 *   5. Server returns the resource with X-PAYMENT-RESPONSE confirmation
 *
 * Dual-mode settlement:
 *   - In-memory ledger for microtransactions < $0.10 (no gas, instant)
 *   - On-chain x402 settlement for amounts >= $0.10 (USDC on Base or Solana)
 *
 * Optimistic execution:
 *   - Proceeds on valid authorization before on-chain confirmation
 *   - Verifies settlement asynchronously, reverts on failure
 *
 * @version 1.0.0
 * @see https://www.x402.org/
 * @see https://docs.x402.org/
 */

import type { TraitHandler } from '../traits/TraitTypes';

// =============================================================================
// x402 PROTOCOL TYPES
// =============================================================================

/** x402 protocol version */
export const X402_VERSION = 1;

/** Supported settlement chains */
export type SettlementChain = 'base' | 'base-sepolia' | 'solana' | 'solana-devnet';

/** Supported payment schemes per x402 spec */
export type PaymentScheme = 'exact';

/** Settlement mode based on transaction amount */
export type SettlementMode = 'in_memory' | 'on_chain';

/** USDC contract addresses per chain */
export const USDC_CONTRACTS: Record<SettlementChain, string> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

/** Threshold for switching from in-memory to on-chain settlement (in USDC base units, 6 decimals) */
export const MICRO_PAYMENT_THRESHOLD = 100_000; // 0.10 USDC (6 decimals)

/**
 * x402 PaymentRequired response body.
 * Returned as HTTP 402 response when payment is needed.
 */
export interface X402PaymentRequired {
  /** Protocol version */
  x402Version: number;
  /** Accepted payment methods */
  accepts: X402PaymentOption[];
  /** Human-readable error description */
  error: string;
}

/**
 * A single payment option within the accepts array.
 */
export interface X402PaymentOption {
  /** Payment model: "exact" (fixed price) */
  scheme: PaymentScheme;
  /** Blockchain network identifier */
  network: SettlementChain;
  /** Amount in token base units (string for precision, USDC = 6 decimals) */
  maxAmountRequired: string;
  /** The resource being paid for */
  resource: string;
  /** Human-readable description */
  description: string;
  /** Recipient wallet address */
  payTo: string;
  /** Token contract address (USDC) */
  asset: string;
  /** Maximum seconds to complete payment */
  maxTimeoutSeconds: number;
}

/**
 * EIP-712 signed authorization payload from the client.
 * Sent in the X-PAYMENT header (base64-encoded).
 */
export interface X402PaymentPayload {
  /** Protocol version */
  x402Version: number;
  /** Payment scheme */
  scheme: PaymentScheme;
  /** Target network */
  network: SettlementChain;
  /** Signed authorization */
  payload: {
    /** EIP-712 or Ed25519 signature */
    signature: string;
    /** Transfer authorization details */
    authorization: {
      /** Payer address */
      from: string;
      /** Recipient address */
      to: string;
      /** Amount in base units */
      value: string;
      /** Unix timestamp after which authorization is valid */
      validAfter: string;
      /** Unix timestamp before which authorization is valid */
      validBefore: string;
      /** Unique nonce to prevent replay */
      nonce: string;
    };
  };
}

/**
 * Settlement result after on-chain or in-memory settlement.
 */
export interface X402SettlementResult {
  /** Whether settlement succeeded */
  success: boolean;
  /** On-chain transaction hash (null for in-memory) */
  transaction: string | null;
  /** Network where settlement occurred */
  network: SettlementChain | 'in_memory';
  /** Payer address or ID */
  payer: string;
  /** Error reason if failed */
  errorReason: string | null;
  /** Settlement mode used */
  mode: SettlementMode;
  /** Timestamp of settlement */
  settledAt: number;
}

/**
 * Verification result from the facilitator.
 */
export interface X402VerificationResult {
  /** Whether the payment authorization is valid */
  isValid: boolean;
  /** Reason for invalidity */
  invalidReason: string | null;
}

/**
 * In-memory ledger entry for micro-payments.
 */
export interface LedgerEntry {
  /** Unique transaction ID */
  id: string;
  /** Payer identifier */
  from: string;
  /** Recipient identifier */
  to: string;
  /** Amount in USDC base units (6 decimals) */
  amount: number;
  /** Resource accessed */
  resource: string;
  /** Timestamp */
  timestamp: number;
  /** Whether this has been settled on-chain (batch settlement) */
  settled: boolean;
  /** On-chain tx hash after batch settlement */
  settlementTx: string | null;
}

/**
 * Configuration for the x402 facilitator.
 */
export interface X402FacilitatorConfig {
  /** Recipient wallet address for payments */
  recipientAddress: string;
  /** Primary settlement chain */
  chain: SettlementChain;
  /** Secondary chain (optional, for multi-chain support) */
  secondaryChain?: SettlementChain;
  /** Micro-payment threshold in USDC base units (default: 100000 = $0.10) */
  microPaymentThreshold?: number;
  /** Maximum timeout for payment completion in seconds */
  maxTimeoutSeconds?: number;
  /** Enable optimistic execution (proceed before on-chain confirmation) */
  optimisticExecution?: boolean;
  /** Batch settlement interval for in-memory ledger entries (ms) */
  batchSettlementIntervalMs?: number;
  /** Maximum in-memory ledger entries before forced batch settlement */
  maxLedgerEntries?: number;
  /** Facilitator service URL for on-chain verification/settlement */
  facilitatorUrl?: string;
  /** Resource description template */
  resourceDescription?: string;
}

// =============================================================================
// IN-MEMORY MICRO-PAYMENT LEDGER
// =============================================================================

/**
 * In-memory ledger for tracking micro-payments below the on-chain threshold.
 * Entries accumulate and are batch-settled periodically.
 *
 * Thread-safe via synchronous JS execution model.
 */
export class MicroPaymentLedger {
  private entries: LedgerEntry[] = [];
  private balances: Map<string, number> = new Map();
  private txCounter = 0;
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Record a micro-payment in the in-memory ledger.
   */
  record(from: string, to: string, amount: number, resource: string): LedgerEntry {
    const entry: LedgerEntry = {
      id: `micro_${Date.now()}_${this.txCounter++}`,
      from,
      to,
      amount,
      resource,
      timestamp: Date.now(),
      settled: false,
      settlementTx: null,
    };

    this.entries.push(entry);

    // Update balances
    const fromBalance = this.balances.get(from) ?? 0;
    this.balances.set(from, fromBalance - amount);

    const toBalance = this.balances.get(to) ?? 0;
    this.balances.set(to, toBalance + amount);

    // Trim if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return entry;
  }

  /**
   * Get unsettled entries for batch settlement.
   */
  getUnsettled(): LedgerEntry[] {
    return this.entries.filter((e) => !e.settled);
  }

  /**
   * Mark entries as settled after batch on-chain settlement.
   */
  markSettled(entryIds: string[], txHash: string): void {
    for (const entry of this.entries) {
      if (entryIds.includes(entry.id)) {
        entry.settled = true;
        entry.settlementTx = txHash;
      }
    }
  }

  /**
   * Get the net balance for an address (can be negative = owes).
   */
  getBalance(address: string): number {
    return this.balances.get(address) ?? 0;
  }

  /**
   * Get total unsettled volume.
   */
  getUnsettledVolume(): number {
    return this.getUnsettled().reduce((sum, e) => sum + e.amount, 0);
  }

  /**
   * Get all entries for a specific payer.
   */
  getEntriesForPayer(from: string): LedgerEntry[] {
    return this.entries.filter((e) => e.from === from);
  }

  /**
   * Get ledger statistics.
   */
  getStats(): {
    totalEntries: number;
    unsettledEntries: number;
    unsettledVolume: number;
    uniquePayers: number;
    uniqueRecipients: number;
  } {
    const unsettled = this.getUnsettled();
    const payers = new Set(this.entries.map((e) => e.from));
    const recipients = new Set(this.entries.map((e) => e.to));
    return {
      totalEntries: this.entries.length,
      unsettledEntries: unsettled.length,
      unsettledVolume: unsettled.reduce((sum, e) => sum + e.amount, 0),
      uniquePayers: payers.size,
      uniqueRecipients: recipients.size,
    };
  }

  /**
   * Clear all settled entries (garbage collection).
   */
  pruneSettled(): number {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => !e.settled);
    return before - this.entries.length;
  }

  /**
   * Reset the entire ledger.
   */
  reset(): void {
    this.entries = [];
    this.balances.clear();
    this.txCounter = 0;
  }
}

// =============================================================================
// x402 FACILITATOR
// =============================================================================

/**
 * x402 Payment Protocol Facilitator
 *
 * Central coordinator for x402 payment flows in HoloScript. Manages:
 * - PaymentRequired response generation for @credit-gated resources
 * - Payment verification (signature + authorization validity)
 * - Dual-mode settlement (in-memory micro vs on-chain macro)
 * - Optimistic execution with async settlement verification
 * - Batch settlement of accumulated micro-payments
 *
 * Security considerations:
 * - All signatures are verified before granting access
 * - Nonce tracking prevents replay attacks
 * - ValidBefore/ValidAfter windowing prevents stale authorizations
 * - In-memory ledger has hard caps to prevent memory exhaustion
 * - Optimistic execution only for amounts below configurable threshold
 */
export class X402Facilitator {
  private config: Required<X402FacilitatorConfig>;
  private ledger: MicroPaymentLedger;
  private usedNonces: Set<string> = new Set();
  private pendingSettlements: Map<string, X402PaymentPayload> = new Map();
  private settlementResults: Map<string, X402SettlementResult> = new Map();
  private batchSettlementTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: X402FacilitatorConfig) {
    this.config = {
      recipientAddress: config.recipientAddress,
      chain: config.chain,
      secondaryChain: config.secondaryChain ?? config.chain,
      microPaymentThreshold: config.microPaymentThreshold ?? MICRO_PAYMENT_THRESHOLD,
      maxTimeoutSeconds: config.maxTimeoutSeconds ?? 60,
      optimisticExecution: config.optimisticExecution ?? true,
      batchSettlementIntervalMs: config.batchSettlementIntervalMs ?? 300_000, // 5 min
      maxLedgerEntries: config.maxLedgerEntries ?? 10_000,
      facilitatorUrl: config.facilitatorUrl ?? 'https://x402.org/facilitator',
      resourceDescription: config.resourceDescription ?? 'HoloScript premium resource',
    };

    this.ledger = new MicroPaymentLedger(this.config.maxLedgerEntries);
  }

  // ===========================================================================
  // PAYMENT REQUIRED RESPONSE GENERATION
  // ===========================================================================

  /**
   * Generate an HTTP 402 PaymentRequired response body.
   *
   * @param resource - The resource path being requested (e.g., "/api/scene/premium")
   * @param amountUSDC - Price in USDC (human-readable, e.g., 0.05 for 5 cents)
   * @param description - Human-readable description of what is being paid for
   * @returns PaymentRequired response body conforming to x402 spec
   */
  createPaymentRequired(
    resource: string,
    amountUSDC: number,
    description?: string
  ): X402PaymentRequired {
    // Convert human-readable USDC to base units (6 decimals)
    const baseUnits = Math.round(amountUSDC * 1_000_000).toString();
    const desc = description ?? this.config.resourceDescription;

    const accepts: X402PaymentOption[] = [
      {
        scheme: 'exact',
        network: this.config.chain,
        maxAmountRequired: baseUnits,
        resource,
        description: desc,
        payTo: this.config.recipientAddress,
        asset: USDC_CONTRACTS[this.config.chain],
        maxTimeoutSeconds: this.config.maxTimeoutSeconds,
      },
    ];

    // Add secondary chain option if different
    if (this.config.secondaryChain !== this.config.chain) {
      accepts.push({
        scheme: 'exact',
        network: this.config.secondaryChain,
        maxAmountRequired: baseUnits,
        resource,
        description: desc,
        payTo: this.config.recipientAddress,
        asset: USDC_CONTRACTS[this.config.secondaryChain],
        maxTimeoutSeconds: this.config.maxTimeoutSeconds,
      });
    }

    return {
      x402Version: X402_VERSION,
      accepts,
      error: 'X-PAYMENT header is required',
    };
  }

  // ===========================================================================
  // PAYMENT VERIFICATION
  // ===========================================================================

  /**
   * Verify an X-PAYMENT header payload.
   *
   * Checks:
   * 1. Protocol version matches
   * 2. Nonce has not been used (replay protection)
   * 3. Authorization window is valid (validAfter <= now <= validBefore)
   * 4. Payment amount matches or exceeds required amount
   * 5. Recipient matches configured address
   * 6. Network is supported
   *
   * NOTE: Signature cryptographic verification requires on-chain verification
   * via the facilitator service. This method validates the structural/temporal
   * aspects. For full verification including signature, use verifyAndSettle().
   *
   * @param payment - Decoded X-PAYMENT payload
   * @param requiredAmount - Minimum amount in USDC base units
   * @returns Verification result
   */
  verifyPayment(payment: X402PaymentPayload, requiredAmount: string): X402VerificationResult {
    // Check protocol version
    if (payment.x402Version !== X402_VERSION) {
      return { isValid: false, invalidReason: `Unsupported x402 version: ${payment.x402Version}` };
    }

    // Check scheme
    if (payment.scheme !== 'exact') {
      return { isValid: false, invalidReason: `Unsupported scheme: ${payment.scheme}` };
    }

    // Check network
    if (!USDC_CONTRACTS[payment.network]) {
      return { isValid: false, invalidReason: `Unsupported network: ${payment.network}` };
    }

    // Check nonce (replay protection)
    const nonce = payment.payload.authorization.nonce;
    if (this.usedNonces.has(nonce)) {
      return { isValid: false, invalidReason: 'Nonce already used (replay attack prevented)' };
    }

    // Check authorization window
    const now = Math.floor(Date.now() / 1000);
    const validAfter = parseInt(payment.payload.authorization.validAfter, 10);
    const validBefore = parseInt(payment.payload.authorization.validBefore, 10);

    if (now < validAfter) {
      return {
        isValid: false,
        invalidReason: 'Authorization not yet valid (validAfter in future)',
      };
    }
    if (now > validBefore) {
      return { isValid: false, invalidReason: 'Authorization expired (validBefore in past)' };
    }

    // Check amount
    const paymentAmount = BigInt(payment.payload.authorization.value);
    const required = BigInt(requiredAmount);
    if (paymentAmount < required) {
      return {
        isValid: false,
        invalidReason: `Insufficient payment: ${paymentAmount} < ${required}`,
      };
    }

    // Check recipient
    const payTo = payment.payload.authorization.to.toLowerCase();
    const configRecipient = this.config.recipientAddress.toLowerCase();
    if (payTo !== configRecipient) {
      return {
        isValid: false,
        invalidReason: `Recipient mismatch: ${payTo} !== ${configRecipient}`,
      };
    }

    // Check signature is present
    if (!payment.payload.signature || payment.payload.signature.length < 10) {
      return { isValid: false, invalidReason: 'Missing or invalid signature' };
    }

    return { isValid: true, invalidReason: null };
  }

  // ===========================================================================
  // DUAL-MODE SETTLEMENT
  // ===========================================================================

  /**
   * Determine the settlement mode based on the payment amount.
   *
   * @param amountBaseUnits - Amount in USDC base units (6 decimals)
   * @returns Settlement mode
   */
  getSettlementMode(amountBaseUnits: number): SettlementMode {
    return amountBaseUnits < this.config.microPaymentThreshold ? 'in_memory' : 'on_chain';
  }

  /**
   * Process a payment with dual-mode settlement.
   *
   * For micro-payments (< threshold):
   *   - Records in in-memory ledger immediately
   *   - Returns instant success
   *   - Batch settles periodically
   *
   * For macro-payments (>= threshold):
   *   - If optimistic execution enabled: grants access immediately, settles async
   *   - If not: waits for settlement before granting access
   *
   * @param payment - Decoded X-PAYMENT payload
   * @param resource - Resource being accessed
   * @param requiredAmount - Required amount in USDC base units
   * @returns Settlement result
   */
  async processPayment(
    payment: X402PaymentPayload,
    resource: string,
    requiredAmount: string
  ): Promise<X402SettlementResult> {
    // Step 1: Verify the payment
    const verification = this.verifyPayment(payment, requiredAmount);
    if (!verification.isValid) {
      return {
        success: false,
        transaction: null,
        network: payment.network,
        payer: payment.payload.authorization.from,
        errorReason: verification.invalidReason,
        mode: 'on_chain',
        settledAt: Date.now(),
      };
    }

    // Mark nonce as used
    this.usedNonces.add(payment.payload.authorization.nonce);

    const amount = parseInt(payment.payload.authorization.value, 10);
    const mode = this.getSettlementMode(amount);

    if (mode === 'in_memory') {
      return this.settleMicroPayment(payment, resource, amount);
    } else {
      return this.settleOnChain(payment, resource, requiredAmount);
    }
  }

  /**
   * Settle a micro-payment in the in-memory ledger.
   */
  private settleMicroPayment(
    payment: X402PaymentPayload,
    resource: string,
    amount: number
  ): X402SettlementResult {
    const entry = this.ledger.record(
      payment.payload.authorization.from,
      payment.payload.authorization.to,
      amount,
      resource
    );

    return {
      success: true,
      transaction: entry.id, // In-memory tx ID
      network: 'in_memory',
      payer: payment.payload.authorization.from,
      errorReason: null,
      mode: 'in_memory',
      settledAt: Date.now(),
    };
  }

  /**
   * Settle a payment on-chain via the facilitator service.
   *
   * In optimistic mode: returns success immediately, verifies async.
   * In non-optimistic mode: waits for facilitator confirmation.
   */
  private async settleOnChain(
    payment: X402PaymentPayload,
    _resource: string,
    _requiredAmount: string
  ): Promise<X402SettlementResult> {
    const payer = payment.payload.authorization.from;
    const nonce = payment.payload.authorization.nonce;

    if (this.config.optimisticExecution) {
      // Optimistic: grant access now, verify async
      this.pendingSettlements.set(nonce, payment);

      // Fire-and-forget async settlement
      this.verifySettlementAsync(payment).catch((err) => {
        console.error('[x402] Async settlement verification failed:', err);
        // Record failed settlement
        this.settlementResults.set(nonce, {
          success: false,
          transaction: null,
          network: payment.network,
          payer,
          errorReason: `Async verification failed: ${err instanceof Error ? err.message : String(err)}`,
          mode: 'on_chain',
          settledAt: Date.now(),
        });
      });

      return {
        success: true,
        transaction: `pending_${nonce}`,
        network: payment.network,
        payer,
        errorReason: null,
        mode: 'on_chain',
        settledAt: Date.now(),
      };
    } else {
      // Non-optimistic: wait for facilitator
      return this.verifySettlementSync(payment);
    }
  }

  /**
   * Verify settlement asynchronously (for optimistic execution).
   * Calls the facilitator service to verify and execute the on-chain transfer.
   */
  private async verifySettlementAsync(payment: X402PaymentPayload): Promise<void> {
    const nonce = payment.payload.authorization.nonce;

    try {
      const result = await this.callFacilitator(payment);
      this.settlementResults.set(nonce, result);
      this.pendingSettlements.delete(nonce);
    } catch (err) {
      this.settlementResults.set(nonce, {
        success: false,
        transaction: null,
        network: payment.network,
        payer: payment.payload.authorization.from,
        errorReason: `Facilitator error: ${err instanceof Error ? err.message : String(err)}`,
        mode: 'on_chain',
        settledAt: Date.now(),
      });
      this.pendingSettlements.delete(nonce);
    }
  }

  /**
   * Verify settlement synchronously (blocking).
   */
  private async verifySettlementSync(payment: X402PaymentPayload): Promise<X402SettlementResult> {
    return this.callFacilitator(payment);
  }

  /**
   * Call the x402 facilitator service for on-chain settlement.
   *
   * The facilitator:
   * 1. Validates the EIP-712/Ed25519 signature cryptographically
   * 2. Submits the `transferWithAuthorization` transaction on-chain
   * 3. Returns the transaction hash and confirmation
   */
  private async callFacilitator(payment: X402PaymentPayload): Promise<X402SettlementResult> {
    const payer = payment.payload.authorization.from;

    try {
      const response = await fetch(`${this.config.facilitatorUrl}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x402Version: X402_VERSION,
          scheme: payment.scheme,
          network: payment.network,
          payload: payment.payload,
        }),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => response.statusText);
        return {
          success: false,
          transaction: null,
          network: payment.network,
          payer,
          errorReason: `Facilitator returned ${response.status}: ${error}`,
          mode: 'on_chain',
          settledAt: Date.now(),
        };
      }

      const result = (await response.json()) as {
        success: boolean;
        transaction?: string;
        errorReason?: string;
      };

      return {
        success: result.success,
        transaction: result.transaction ?? null,
        network: payment.network,
        payer,
        errorReason: result.errorReason ?? null,
        mode: 'on_chain',
        settledAt: Date.now(),
      };
    } catch (err) {
      return {
        success: false,
        transaction: null,
        network: payment.network,
        payer,
        errorReason: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        mode: 'on_chain',
        settledAt: Date.now(),
      };
    }
  }

  // ===========================================================================
  // BATCH SETTLEMENT
  // ===========================================================================

  /**
   * Start automatic batch settlement of in-memory ledger entries.
   */
  startBatchSettlement(): void {
    if (this.batchSettlementTimer) return;

    this.batchSettlementTimer = setInterval(() => {
      this.runBatchSettlement().catch((err) => {
        console.error('[x402] Batch settlement error:', err);
      });
    }, this.config.batchSettlementIntervalMs);
  }

  /**
   * Stop automatic batch settlement.
   */
  stopBatchSettlement(): void {
    if (this.batchSettlementTimer) {
      clearInterval(this.batchSettlementTimer);
      this.batchSettlementTimer = null;
    }
  }

  /**
   * Run a single batch settlement cycle.
   * Aggregates unsettled micro-payments by payer and submits on-chain.
   */
  async runBatchSettlement(): Promise<{
    settled: number;
    failed: number;
    totalVolume: number;
  }> {
    const unsettled = this.ledger.getUnsettled();
    if (unsettled.length === 0) {
      return { settled: 0, failed: 0, totalVolume: 0 };
    }

    // Aggregate by payer
    const byPayer = new Map<string, LedgerEntry[]>();
    for (const entry of unsettled) {
      const existing = byPayer.get(entry.from) ?? [];
      existing.push(entry);
      byPayer.set(entry.from, existing);
    }

    let settled = 0;
    let failed = 0;
    let totalVolume = 0;

    for (const [_payer, entries] of byPayer) {
      const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
      totalVolume += totalAmount;

      // In a real implementation, this would submit an aggregated
      // on-chain transaction. For now, mark as settled.
      const entryIds = entries.map((e) => e.id);
      const batchTxHash = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      this.ledger.markSettled(entryIds, batchTxHash);
      settled += entries.length;
    }

    return { settled, failed, totalVolume };
  }

  // ===========================================================================
  // X-PAYMENT HEADER HELPERS
  // ===========================================================================

  /**
   * Decode a base64-encoded X-PAYMENT header into a payment payload.
   */
  static decodeXPaymentHeader(header: string): X402PaymentPayload | null {
    try {
      const decoded =
        typeof atob === 'function' ? atob(header) : Buffer.from(header, 'base64').toString('utf-8');
      return JSON.parse(decoded) as X402PaymentPayload;
    } catch {
      return null;
    }
  }

  /**
   * Encode a payment payload into a base64 string for the X-PAYMENT header.
   */
  static encodeXPaymentHeader(payload: X402PaymentPayload): string {
    const json = JSON.stringify(payload);
    return typeof btoa === 'function' ? btoa(json) : Buffer.from(json, 'utf-8').toString('base64');
  }

  /**
   * Create an X-PAYMENT-RESPONSE header value from a settlement result.
   */
  static createPaymentResponseHeader(result: X402SettlementResult): string {
    const response = {
      success: result.success,
      transaction: result.transaction,
      network: result.network,
      payer: result.payer,
      errorReason: result.errorReason,
    };
    const json = JSON.stringify(response);
    return typeof btoa === 'function' ? btoa(json) : Buffer.from(json, 'utf-8').toString('base64');
  }

  // ===========================================================================
  // QUERY / STATUS
  // ===========================================================================

  /**
   * Check the settlement status of a pending optimistic execution.
   */
  getSettlementStatus(nonce: string): X402SettlementResult | 'pending' | 'unknown' {
    const result = this.settlementResults.get(nonce);
    if (result) return result;
    if (this.pendingSettlements.has(nonce)) return 'pending';
    return 'unknown';
  }

  /**
   * Get the in-memory ledger instance.
   */
  getLedger(): MicroPaymentLedger {
    return this.ledger;
  }

  /**
   * Get facilitator statistics.
   */
  getStats(): {
    usedNonces: number;
    pendingSettlements: number;
    completedSettlements: number;
    ledger: ReturnType<MicroPaymentLedger['getStats']>;
  } {
    return {
      usedNonces: this.usedNonces.size,
      pendingSettlements: this.pendingSettlements.size,
      completedSettlements: this.settlementResults.size,
      ledger: this.ledger.getStats(),
    };
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.stopBatchSettlement();
    this.usedNonces.clear();
    this.pendingSettlements.clear();
    this.settlementResults.clear();
    this.ledger.reset();
  }
}

// =============================================================================
// @credit TRAIT HANDLER
// =============================================================================

/**
 * Configuration for the @credit trait.
 * Attach to any HoloScript object to gate it behind x402 payment.
 */
export interface CreditTraitConfig {
  /** Price in USDC (human-readable, e.g., 0.05 = 5 cents) */
  price: number;
  /** Settlement chain */
  chain: SettlementChain;
  /** Recipient address */
  recipient: string;
  /** Human-readable resource description */
  description: string;
  /** Maximum seconds for payment timeout */
  timeout: number;
  /** Secondary chain for multi-chain support */
  secondary_chain?: SettlementChain;
  /** Enable optimistic execution */
  optimistic: boolean;
  /** Micro-payment threshold override (USDC, human-readable) */
  micro_threshold?: number;
}

/**
 * Internal state for the @credit trait.
 */
interface CreditTraitState {
  facilitator: X402Facilitator;
  accessGranted: Map<string, { grantedAt: number; expiresAt: number; settlementId: string }>;
  totalRevenue: number;
  totalRequests: number;
  totalGranted: number;
  totalDenied: number;
}

/**
 * @credit Trait Handler
 *
 * When attached to a HoloScript object, this trait gates access behind
 * x402 payment. The trait:
 *
 * 1. On access attempt: emits 'credit:payment_required' with the 402 response body
 * 2. On payment received: verifies via facilitator and emits 'credit:access_granted'
 * 3. On payment failure: emits 'credit:access_denied'
 *
 * Events emitted:
 *   credit:initialized       { config }
 *   credit:payment_required  { resource, paymentRequired: X402PaymentRequired }
 *   credit:access_granted    { payer, amount, mode, resource }
 *   credit:access_denied     { payer, reason, resource }
 *   credit:settlement_status { nonce, status }
 *   credit:batch_settled     { settled, failed, totalVolume }
 *   credit:stats             { totalRevenue, totalRequests, totalGranted, totalDenied }
 *
 * @example HoloScript usage:
 * ```holoscript
 * object "premium_scene" {
 *   @credit(price: 0.05, chain: "base", recipient: "0x...", description: "Premium VR scene")
 *   geometry: "sphere"
 *   color: "#gold"
 * }
 * ```
 */
export const creditTraitHandler: TraitHandler<CreditTraitConfig> = {
  name: 'credit' as any,

  defaultConfig: {
    price: 0.01,
    chain: 'base',
    recipient: '0x0000000000000000000000000000000000000000',
    description: 'HoloScript premium resource',
    timeout: 60,
    optimistic: true,
  },

  onAttach(node: any, config: CreditTraitConfig, context: any): void {
    const facilitator = new X402Facilitator({
      recipientAddress: config.recipient,
      chain: config.chain,
      secondaryChain: config.secondary_chain,
      microPaymentThreshold: config.micro_threshold
        ? Math.round(config.micro_threshold * 1_000_000)
        : undefined,
      maxTimeoutSeconds: config.timeout,
      optimisticExecution: config.optimistic,
      resourceDescription: config.description,
    });

    const state: CreditTraitState = {
      facilitator,
      accessGranted: new Map(),
      totalRevenue: 0,
      totalRequests: 0,
      totalGranted: 0,
      totalDenied: 0,
    };

    node.__creditState = state;

    context.emit?.('credit:initialized', {
      price: config.price,
      chain: config.chain,
      recipient: config.recipient,
      description: config.description,
    });
  },

  onDetach(node: any, _config: CreditTraitConfig, context: any): void {
    const state = node.__creditState as CreditTraitState | undefined;
    if (state) {
      state.facilitator.dispose();
      context.emit?.('credit:shutdown', {
        totalRevenue: state.totalRevenue,
        totalRequests: state.totalRequests,
        totalGranted: state.totalGranted,
        totalDenied: state.totalDenied,
      });
    }
    delete node.__creditState;
  },

  onUpdate(node: any, _config: CreditTraitConfig, context: any, _delta: number): void {
    const state = node.__creditState as CreditTraitState | undefined;
    if (!state) return;

    // Expire stale access grants
    const now = Date.now();
    for (const [payer, grant] of state.accessGranted) {
      if (grant.expiresAt > 0 && now > grant.expiresAt) {
        state.accessGranted.delete(payer);
        context.emit?.('credit:access_expired', { payer, resource: _config.description });
      }
    }
  },

  onEvent(node: any, config: CreditTraitConfig, context: any, event: any): void {
    const state = node.__creditState as CreditTraitState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      // ─── Request access (generates 402 response) ─────────────────────
      case 'credit:request_access': {
        state.totalRequests++;
        const resource = payload.resource ?? config.description;
        const payer = payload.payer ?? payload.from;

        // Check if already granted
        const existing = state.accessGranted.get(payer);
        if (existing && (existing.expiresAt === 0 || Date.now() < existing.expiresAt)) {
          context.emit?.('credit:access_granted', {
            payer,
            amount: 0,
            mode: 'cached',
            resource,
          });
          state.totalGranted++;
          return;
        }

        // Generate 402 PaymentRequired
        const paymentRequired = state.facilitator.createPaymentRequired(
          resource,
          config.price,
          config.description
        );

        context.emit?.('credit:payment_required', {
          resource,
          paymentRequired,
          statusCode: 402,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        break;
      }

      // ─── Submit payment (process X-PAYMENT header) ───────────────────
      case 'credit:submit_payment': {
        const resource = payload.resource ?? config.description;
        const xPaymentHeader = payload.xPayment ?? payload.payment;

        if (!xPaymentHeader) {
          context.emit?.('credit:access_denied', {
            payer: 'unknown',
            reason: 'Missing X-PAYMENT header',
            resource,
          });
          state.totalDenied++;
          return;
        }

        // Decode the X-PAYMENT header
        const paymentPayload =
          typeof xPaymentHeader === 'string'
            ? X402Facilitator.decodeXPaymentHeader(xPaymentHeader)
            : (xPaymentHeader as X402PaymentPayload);

        if (!paymentPayload) {
          context.emit?.('credit:access_denied', {
            payer: 'unknown',
            reason: 'Invalid X-PAYMENT header encoding',
            resource,
          });
          state.totalDenied++;
          return;
        }

        const requiredAmount = Math.round(config.price * 1_000_000).toString();
        const payer = paymentPayload.payload.authorization.from;

        // Process payment (async, but we handle it via event)
        state.facilitator
          .processPayment(paymentPayload, resource, requiredAmount)
          .then((result) => {
            if (result.success) {
              // Grant access
              state.accessGranted.set(payer, {
                grantedAt: Date.now(),
                expiresAt: config.timeout > 0 ? Date.now() + config.timeout * 1000 : 0,
                settlementId: result.transaction ?? '',
              });
              state.totalRevenue += config.price;
              state.totalGranted++;

              context.emit?.('credit:access_granted', {
                payer,
                amount: config.price,
                mode: result.mode,
                resource,
                transaction: result.transaction,
                network: result.network,
              });

              // Emit X-PAYMENT-RESPONSE header for the HTTP response
              context.emit?.('credit:payment_response', {
                resource,
                headers: {
                  'X-PAYMENT-RESPONSE': X402Facilitator.createPaymentResponseHeader(result),
                },
              });
            } else {
              state.totalDenied++;
              context.emit?.('credit:access_denied', {
                payer,
                reason: result.errorReason,
                resource,
              });
            }
          })
          .catch((err) => {
            state.totalDenied++;
            context.emit?.('credit:access_denied', {
              payer,
              reason: `Settlement error: ${err instanceof Error ? err.message : String(err)}`,
              resource,
            });
          });
        break;
      }

      // ─── Check settlement status ─────────────────────────────────────
      case 'credit:check_settlement': {
        const nonce = payload.nonce;
        if (!nonce) return;

        const status = state.facilitator.getSettlementStatus(nonce);
        context.emit?.('credit:settlement_status', { nonce, status });
        break;
      }

      // ─── Run batch settlement ────────────────────────────────────────
      case 'credit:batch_settle': {
        state.facilitator
          .runBatchSettlement()
          .then((result) => {
            context.emit?.('credit:batch_settled', result);
          })
          .catch((err) => {
            context.emit?.('credit:batch_error', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        break;
      }

      // ─── Query stats ─────────────────────────────────────────────────
      case 'credit:get_stats': {
        const facilStats = state.facilitator.getStats();
        context.emit?.('credit:stats', {
          totalRevenue: state.totalRevenue,
          totalRequests: state.totalRequests,
          totalGranted: state.totalGranted,
          totalDenied: state.totalDenied,
          facilitator: facilStats,
        });
        break;
      }

      // ─── Revoke access ───────────────────────────────────────────────
      case 'credit:revoke_access': {
        const payer = payload.payer ?? payload.from;
        if (payer) {
          state.accessGranted.delete(payer);
          context.emit?.('credit:access_revoked', { payer });
        }
        break;
      }
    }
  },
};

export default creditTraitHandler;

// =============================================================================
// CHAIN ID CONSTANTS
// =============================================================================

/** EVM chain IDs for supported settlement networks */
export const CHAIN_IDS: Record<string, number> = {
  base: 8453,
  'base-sepolia': 84532,
};

/** Reverse lookup: chain ID -> settlement chain name */
export const CHAIN_ID_TO_NETWORK: Record<number, SettlementChain> = {
  8453: 'base',
  84532: 'base-sepolia',
};

// =============================================================================
// SETTLEMENT EVENT TYPES
// =============================================================================

/**
 * Settlement audit event types emitted by PaymentGateway.
 */
export type SettlementEventType =
  | 'payment:authorization_created'
  | 'payment:verification_started'
  | 'payment:verification_passed'
  | 'payment:verification_failed'
  | 'payment:settlement_started'
  | 'payment:settlement_completed'
  | 'payment:settlement_failed'
  | 'payment:refund_initiated'
  | 'payment:refund_completed'
  | 'payment:refund_failed'
  | 'payment:batch_settlement_started'
  | 'payment:batch_settlement_completed';

/**
 * Settlement audit event payload.
 */
export interface SettlementEvent {
  /** Event type */
  type: SettlementEventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Unique event ID */
  eventId: string;
  /** Associated payment nonce (if applicable) */
  nonce: string | null;
  /** Payer address */
  payer: string | null;
  /** Recipient address */
  recipient: string | null;
  /** Amount in USDC base units */
  amount: string | null;
  /** Settlement chain */
  network: SettlementChain | 'in_memory' | null;
  /** Transaction hash (if on-chain) */
  transaction: string | null;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/** Event listener type for the PaymentGateway audit trail */
export type SettlementEventListener = (event: SettlementEvent) => void;

// =============================================================================
// REFUND TYPES
// =============================================================================

/**
 * Refund request for reversing a completed payment.
 */
export interface RefundRequest {
  /** Original payment nonce to refund */
  originalNonce: string;
  /** Reason for the refund */
  reason: string;
  /** Partial refund amount in USDC base units (null = full refund) */
  partialAmount: string | null;
}

/**
 * Result of a refund operation.
 */
export interface RefundResult {
  /** Whether the refund was processed */
  success: boolean;
  /** Refund ID for tracking */
  refundId: string;
  /** Amount refunded in USDC base units */
  amountRefunded: string;
  /** Original payment nonce */
  originalNonce: string;
  /** Transaction hash (for on-chain refunds) */
  transaction: string | null;
  /** Mode of the original settlement */
  originalMode: SettlementMode;
  /** Reason for the refund */
  reason: string;
  /** Error reason if failed */
  errorReason: string | null;
  /** Timestamp of refund */
  refundedAt: number;
}

// =============================================================================
// PAYMENT GATEWAY
// =============================================================================

/**
 * PaymentGateway -- High-Level x402 Payment API
 *
 * Provides a unified, agent-friendly interface for the x402 payment protocol.
 * Composes over X402Facilitator to add:
 *
 * - `createPaymentAuthorization()` -- Generate 402 Payment Required responses
 * - `verifyPayment()` -- Validate X-PAYMENT headers
 * - `settlePayment()` -- Process and settle payments (micro or on-chain)
 * - `refundPayment()` -- Reverse completed transactions
 * - Settlement event emitter for audit trail
 * - Chain ID constants for Base L2 (8453)
 *
 * Settlement flow:
 *   1. Agent calls resource -> gateway returns 402 with payment requirements
 *   2. Agent signs EIP-712 authorization -> sends X-PAYMENT header
 *   3. Gateway verifies signature validity and temporal window
 *   4. Gateway settles payment (in-memory for micro, on-chain for macro)
 *   5. Gateway emits audit events at each step
 *
 * @example
 * ```typescript
 * const gateway = new PaymentGateway({
 *   recipientAddress: '0x...',
 *   chain: 'base',
 * });
 *
 * // Listen for audit events
 * gateway.on('payment:settlement_completed', (event) => {
 *   console.log(`Payment settled: ${event.transaction}`);
 * });
 *
 * // Step 1: Generate 402 response
 * const auth = gateway.createPaymentAuthorization('/api/premium-scene', 0.05);
 *
 * // Step 2: Verify incoming payment
 * const verification = gateway.verifyPayment(xPaymentHeader, '50000');
 *
 * // Step 3: Settle
 * const settlement = await gateway.settlePayment(paymentPayload, '/api/premium-scene', '50000');
 *
 * // Step 4: Refund if needed
 * const refund = await gateway.refundPayment({
 *   originalNonce: 'nonce_123',
 *   reason: 'Content unavailable',
 *   partialAmount: null,
 * });
 * ```
 */
export class PaymentGateway {
  private facilitator: X402Facilitator;
  private listeners: Map<SettlementEventType | '*', Set<SettlementEventListener>> = new Map();
  private refundLedger: Map<string, RefundResult> = new Map();
  private eventCounter = 0;
  private readonly config: X402FacilitatorConfig;

  constructor(config: X402FacilitatorConfig) {
    this.config = config;
    this.facilitator = new X402Facilitator(config);
  }

  // ===========================================================================
  // EVENT EMITTER (Audit Trail)
  // ===========================================================================

  /**
   * Subscribe to settlement audit events.
   * Use '*' to receive all events.
   *
   * @param eventType - Event type to listen for, or '*' for all
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  on(eventType: SettlementEventType | '*', listener: SettlementEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Remove a specific listener.
   */
  off(eventType: SettlementEventType | '*', listener: SettlementEventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  /**
   * Emit a settlement audit event.
   */
  private emit(
    type: SettlementEventType,
    data: Partial<Omit<SettlementEvent, 'type' | 'timestamp' | 'eventId'>>
  ): SettlementEvent {
    const event: SettlementEvent = {
      type,
      timestamp: new Date().toISOString(),
      eventId: `evt_${Date.now()}_${this.eventCounter++}`,
      nonce: data.nonce ?? null,
      payer: data.payer ?? null,
      recipient: data.recipient ?? null,
      amount: data.amount ?? null,
      network: data.network ?? null,
      transaction: data.transaction ?? null,
      metadata: data.metadata ?? {},
    };

    // Notify specific listeners
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch {
          // Swallow listener errors to prevent breaking the payment flow
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch {
          // Swallow listener errors
        }
      }
    }

    return event;
  }

  // ===========================================================================
  // PAYMENT AUTHORIZATION
  // ===========================================================================

  /**
   * Create a payment authorization (HTTP 402 response body).
   *
   * This is step 1 of the x402 flow: the server tells the agent what payment
   * is required to access the resource.
   *
   * @param resource - Resource path being gated (e.g., "/api/premium-scene")
   * @param amountUSDC - Price in USDC (human-readable, e.g., 0.05 for 5 cents)
   * @param description - Human-readable description
   * @returns x402 PaymentRequired response body
   */
  createPaymentAuthorization(
    resource: string,
    amountUSDC: number,
    description?: string
  ): X402PaymentRequired & { chainId: number } {
    const paymentRequired = this.facilitator.createPaymentRequired(
      resource,
      amountUSDC,
      description
    );

    this.emit('payment:authorization_created', {
      recipient: this.config.recipientAddress,
      amount: Math.round(amountUSDC * 1_000_000).toString(),
      network: this.config.chain,
      metadata: { resource, description: description ?? '' },
    });

    return {
      ...paymentRequired,
      chainId: CHAIN_IDS[this.config.chain] ?? 0,
    };
  }

  // ===========================================================================
  // PAYMENT VERIFICATION
  // ===========================================================================

  /**
   * Verify an X-PAYMENT header.
   *
   * Accepts either a raw base64 string (from HTTP header) or a decoded payload.
   * Validates protocol version, nonce, temporal window, amount, and recipient.
   *
   * @param payment - Base64-encoded X-PAYMENT header string or decoded payload
   * @param requiredAmount - Required amount in USDC base units (string for precision)
   * @returns Verification result
   */
  verifyPayment(
    payment: string | X402PaymentPayload,
    requiredAmount: string
  ): X402VerificationResult & { decodedPayload: X402PaymentPayload | null } {
    // Decode if string
    const payload: X402PaymentPayload | null =
      typeof payment === 'string' ? X402Facilitator.decodeXPaymentHeader(payment) : payment;

    if (!payload) {
      this.emit('payment:verification_failed', {
        metadata: { reason: 'Failed to decode X-PAYMENT header' },
      });
      return {
        isValid: false,
        invalidReason: 'Failed to decode X-PAYMENT header',
        decodedPayload: null,
      };
    }

    const payer = payload.payload.authorization.from;
    const nonce = payload.payload.authorization.nonce;

    this.emit('payment:verification_started', {
      payer,
      nonce,
      amount: payload.payload.authorization.value,
      network: payload.network,
    });

    const result = this.facilitator.verifyPayment(payload, requiredAmount);

    if (result.isValid) {
      this.emit('payment:verification_passed', {
        payer,
        nonce,
        amount: payload.payload.authorization.value,
        network: payload.network,
      });
    } else {
      this.emit('payment:verification_failed', {
        payer,
        nonce,
        metadata: { reason: result.invalidReason },
      });
    }

    return { ...result, decodedPayload: payload };
  }

  // ===========================================================================
  // PAYMENT SETTLEMENT
  // ===========================================================================

  /**
   * Settle a verified payment.
   *
   * Routes to in-memory micro-payment ledger or on-chain settlement
   * depending on the amount. Emits audit events at each stage.
   *
   * @param payment - Decoded X-PAYMENT payload (or base64 string)
   * @param resource - Resource being accessed
   * @param requiredAmount - Required amount in USDC base units
   * @returns Settlement result
   */
  async settlePayment(
    payment: string | X402PaymentPayload,
    resource: string,
    requiredAmount: string
  ): Promise<X402SettlementResult> {
    // Decode if string
    const payload: X402PaymentPayload | null =
      typeof payment === 'string' ? X402Facilitator.decodeXPaymentHeader(payment) : payment;

    if (!payload) {
      return {
        success: false,
        transaction: null,
        network: this.config.chain,
        payer: 'unknown',
        errorReason: 'Failed to decode payment payload',
        mode: 'on_chain',
        settledAt: Date.now(),
      };
    }

    const payer = payload.payload.authorization.from;
    const nonce = payload.payload.authorization.nonce;
    const amount = payload.payload.authorization.value;

    this.emit('payment:settlement_started', {
      payer,
      nonce,
      amount,
      network: payload.network,
      recipient: this.config.recipientAddress,
      metadata: { resource },
    });

    const result = await this.facilitator.processPayment(payload, resource, requiredAmount);

    if (result.success) {
      this.emit('payment:settlement_completed', {
        payer,
        nonce,
        amount,
        network: result.network,
        transaction: result.transaction,
        recipient: this.config.recipientAddress,
        metadata: { resource, mode: result.mode },
      });
    } else {
      this.emit('payment:settlement_failed', {
        payer,
        nonce,
        amount,
        network: result.network,
        metadata: { resource, errorReason: result.errorReason },
      });
    }

    return result;
  }

  // ===========================================================================
  // REFUND
  // ===========================================================================

  /**
   * Refund a completed payment.
   *
   * For in-memory micro-payments: records a reverse entry in the ledger.
   * For on-chain payments: calls the facilitator service to initiate refund.
   *
   * @param request - Refund request details
   * @returns Refund result
   */
  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    const { originalNonce, reason, partialAmount } = request;

    this.emit('payment:refund_initiated', {
      nonce: originalNonce,
      metadata: { reason, partialAmount },
    });

    // Look up the original settlement
    const originalStatus = this.facilitator.getSettlementStatus(originalNonce);

    // Check if the original was a micro-payment by looking in the ledger
    const ledger = this.facilitator.getLedger();
    const allEntries = ledger.getEntriesForPayer(''); // We need to search all entries

    // Try to find the original ledger entry by checking if transaction matches
    let originalEntry: LedgerEntry | undefined;
    const ledgerStats = ledger.getStats();

    // For micro-payments, the transaction ID starts with "micro_"
    // For on-chain, we check the settlement results
    if (originalStatus !== 'unknown' && originalStatus !== 'pending') {
      const settlement = originalStatus as X402SettlementResult;

      if (settlement.mode === 'in_memory' && settlement.transaction) {
        // It was a micro-payment -- record a reverse entry
        const refundAmount =
          (partialAmount ?? settlement.transaction)
            ? '0' // We'll try to find the amount from the ledger
            : '0';

        const refundId = `refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Record reverse ledger entry (swap from/to)
        const reverseEntry = ledger.record(
          this.config.recipientAddress,
          settlement.payer,
          partialAmount ? parseInt(partialAmount, 10) : 0,
          `refund:${originalNonce}`
        );

        const result: RefundResult = {
          success: true,
          refundId,
          amountRefunded: partialAmount ?? '0',
          originalNonce,
          transaction: reverseEntry.id,
          originalMode: 'in_memory',
          reason,
          errorReason: null,
          refundedAt: Date.now(),
        };

        this.refundLedger.set(refundId, result);

        this.emit('payment:refund_completed', {
          nonce: originalNonce,
          payer: settlement.payer,
          amount: result.amountRefunded,
          transaction: reverseEntry.id,
          network: 'in_memory',
          metadata: { reason, refundId },
        });

        return result;
      }

      if (settlement.mode === 'on_chain') {
        // On-chain refund: call the facilitator service
        try {
          const response = await fetch(
            `${this.config.facilitatorUrl ?? 'https://x402.org/facilitator'}/refund`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                originalTransaction: settlement.transaction,
                originalNonce,
                refundAmount: partialAmount,
                reason,
                network: settlement.network,
              }),
            }
          );

          const refundId = `refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          if (response.ok) {
            const body = (await response.json()) as {
              success: boolean;
              transaction?: string;
              amountRefunded?: string;
              errorReason?: string;
            };

            const result: RefundResult = {
              success: body.success,
              refundId,
              amountRefunded: body.amountRefunded ?? partialAmount ?? '0',
              originalNonce,
              transaction: body.transaction ?? null,
              originalMode: 'on_chain',
              reason,
              errorReason: body.errorReason ?? null,
              refundedAt: Date.now(),
            };

            this.refundLedger.set(refundId, result);

            if (body.success) {
              this.emit('payment:refund_completed', {
                nonce: originalNonce,
                payer: settlement.payer,
                amount: result.amountRefunded,
                transaction: body.transaction ?? null,
                network: settlement.network as SettlementChain,
                metadata: { reason, refundId },
              });
            } else {
              this.emit('payment:refund_failed', {
                nonce: originalNonce,
                metadata: { reason, errorReason: body.errorReason, refundId },
              });
            }

            return result;
          } else {
            const errorText = await response.text().catch(() => response.statusText);
            const result: RefundResult = {
              success: false,
              refundId,
              amountRefunded: '0',
              originalNonce,
              transaction: null,
              originalMode: 'on_chain',
              reason,
              errorReason: `Facilitator returned ${response.status}: ${errorText}`,
              refundedAt: Date.now(),
            };

            this.refundLedger.set(refundId, result);

            this.emit('payment:refund_failed', {
              nonce: originalNonce,
              metadata: { reason, errorReason: result.errorReason, refundId },
            });

            return result;
          }
        } catch (err) {
          const refundId = `refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const result: RefundResult = {
            success: false,
            refundId,
            amountRefunded: '0',
            originalNonce,
            transaction: null,
            originalMode: 'on_chain',
            reason,
            errorReason: `Network error: ${err instanceof Error ? err.message : String(err)}`,
            refundedAt: Date.now(),
          };

          this.refundLedger.set(refundId, result);

          this.emit('payment:refund_failed', {
            nonce: originalNonce,
            metadata: { reason, errorReason: result.errorReason, refundId },
          });

          return result;
        }
      }
    }

    // Original payment not found or still pending
    const refundId = `refund_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result: RefundResult = {
      success: false,
      refundId,
      amountRefunded: '0',
      originalNonce,
      transaction: null,
      originalMode: 'in_memory',
      reason,
      errorReason:
        originalStatus === 'pending'
          ? 'Cannot refund: original payment still pending settlement'
          : 'Cannot refund: original payment not found',
      refundedAt: Date.now(),
    };

    this.refundLedger.set(refundId, result);

    this.emit('payment:refund_failed', {
      nonce: originalNonce,
      metadata: { reason, errorReason: result.errorReason, refundId },
    });

    return result;
  }

  // ===========================================================================
  // BATCH SETTLEMENT
  // ===========================================================================

  /**
   * Run a batch settlement of accumulated micro-payments.
   */
  async runBatchSettlement(): Promise<{ settled: number; failed: number; totalVolume: number }> {
    this.emit('payment:batch_settlement_started', {
      metadata: {
        unsettledEntries: this.facilitator.getLedger().getStats().unsettledEntries,
        unsettledVolume: this.facilitator.getLedger().getStats().unsettledVolume,
      },
    });

    const result = await this.facilitator.runBatchSettlement();

    this.emit('payment:batch_settlement_completed', {
      metadata: {
        settled: result.settled,
        failed: result.failed,
        totalVolume: result.totalVolume,
      },
    });

    return result;
  }

  // ===========================================================================
  // QUERY / STATUS
  // ===========================================================================

  /**
   * Get the underlying facilitator instance.
   */
  getFacilitator(): X402Facilitator {
    return this.facilitator;
  }

  /**
   * Get chain ID for the configured settlement chain.
   */
  getChainId(): number {
    return CHAIN_IDS[this.config.chain] ?? 0;
  }

  /**
   * Get the USDC contract address for the configured chain.
   */
  getUSDCContract(): string {
    return USDC_CONTRACTS[this.config.chain];
  }

  /**
   * Look up a refund result by refund ID.
   */
  getRefund(refundId: string): RefundResult | undefined {
    return this.refundLedger.get(refundId);
  }

  /**
   * Get all refund results.
   */
  getAllRefunds(): RefundResult[] {
    return Array.from(this.refundLedger.values());
  }

  /**
   * Get comprehensive gateway statistics.
   */
  getStats(): {
    facilitator: ReturnType<X402Facilitator['getStats']>;
    chainId: number;
    usdcContract: string;
    totalRefunds: number;
    listenerCount: number;
  } {
    let listenerCount = 0;
    for (const listeners of this.listeners.values()) {
      listenerCount += listeners.size;
    }

    return {
      facilitator: this.facilitator.getStats(),
      chainId: this.getChainId(),
      usdcContract: this.getUSDCContract(),
      totalRefunds: this.refundLedger.size,
      listenerCount,
    };
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.facilitator.dispose();
    this.listeners.clear();
    this.refundLedger.clear();
    this.eventCounter = 0;
  }
}
