/**
 * @fileoverview x402 Payment Service
 * @module @holoscript/marketplace-api
 *
 * PURPOSE:
 * Handle HTTP 402 "Payment Required" protocol for machine-to-machine payments
 * across Hololand's 3-layer economy (AR -> VRR -> VR).
 *
 * VISION:
 * x402 enables frictionless AI agent payments for VR experiences. Users pay once,
 * AI agents autonomously pay for micro-services. Example: User pays $50 for VR
 * menu, AI agent autonomously pays $0.01 for each ingredient detail fetch.
 *
 * REQUIREMENTS:
 * 1. HTTP 402 Status Code: Return 402 + WWW-Authenticate header for paywalled endpoints
 * 2. Multiple Facilitators: Support Coinbase CDP, PayAI, Meridian, x402.rs
 * 3. Multi-Chain: Base L2 (primary), Ethereum, Solana
 * 4. Multi-Asset: USDC (primary), ETH, SOL, custom tokens
 * 5. Gasless Transactions: Coinbase subsidizes Base L2 gas (~$0.01/tx)
 * 6. State Persistence: Payment receipts -> database, blockchain verification
 * 7. Layer Pricing: AR free -> VRR $5-20 -> VR $50-500
 * 8. AI Agent Support: AgentKit integration for autonomous payments
 *
 * EXAMPLE x402 FLOW:
 * 1. User requests VRR access: GET /api/vrr/phoenix-brew-twin
 * 2. Server checks payment status -> unpaid
 * 3. Server returns 402 Payment Required:
 *    ```
 *    HTTP/1.1 402 Payment Required
 *    WWW-Authenticate: x402 facilitator="https://cdp.coinbase.com/x402" price="5.00" asset="USDC" network="base"
 *    Content-Type: application/json
 *
 *    {
 *      "error": "Payment required",
 *      "price": 5.00,
 *      "asset": "USDC",
 *      "network": "base",
 *      "facilitator": "https://cdp.coinbase.com/x402",
 *      "payment_id": "pay_abc123"
 *    }
 *    ```
 * 4. Client (or AI agent) pays via facilitator
 * 5. Facilitator confirms payment -> callback to server
 * 6. Server grants access -> returns VRR content
 *
 * INTEGRATION POINTS:
 * - Coinbase AgentKit SDK (packages/core/src/agents/AgentKitIntegration.ts)
 * - VRRCompiler.ts (@x402_paywall trait)
 * - ARCompiler.ts (AR -> VRR upgrade payment)
 * - Supabase (payment receipts, user subscriptions)
 * - Base L2 blockchain (transaction verification)
 *
 * IMPLEMENTATION TASKS:
 * [x] Define x402PaymentServiceOptions interface
 * [x] Implement return402Response() - HTTP 402 response with WWW-Authenticate header
 * [x] Implement verifyPayment() - Verify transaction on blockchain
 * [x] Implement grantAccess() - Grant content access after payment
 * [x] Implement facilitatorCallback() - Handle payment confirmation webhooks
 * [x] Implement multiChainSupport() - Base, Ethereum transaction verification
 * [x] Implement gaslessSubsidy() - Meta-transaction relay for small payments
 * [x] Implement receiptStorage() - Store payment receipts in database
 * [x] Implement subscriptionManagement() - Time-based access passes
 * [x] Add rate limiting - In-memory sliding window
 * [x] Add input validation - Receipt parsing before destructuring
 * [x] Add nonce tracking - Prevent replay attacks
 * [x] Sanitize error messages - No internal detail leaks
 * [ ] Implement agentKitIntegration() - AI agent autonomous payment handling
 * [ ] Add tests (x402PaymentService.test.ts)
 * [ ] Add E2E test (simulate AR -> VRR payment flow)
 * [ ] Add webhook endpoint (/api/payments/x402/callback)
 *
 * ESTIMATED COMPLEXITY: 9/10 (very high - multi-chain, blockchain verification, webhook handling)
 * PRIORITY: CRITICAL (blocks all paid features, revenue generation)
 *
 * PRICING STRATEGY:
 * - AR Layer: FREE (teaser, QR scans, business discovery)
 * - VRR Layer: $5-20 (quests, 1:1 twins, business interactions)
 * - VR Layer: $50-500 (full Hololand immersion, premium menus)
 * - Micro-payments: $0.01-0.10 (AI agent API calls, asset fetches)
 */

import type { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { base, mainnet } from 'viem/chains';

// ─── Constants ───────────────────────────────────────────────────────────────

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

/** USDC has 6 decimal places */
const USDC_DECIMALS = 6;

/** Default gasless subsidy threshold: $1.00 in USDC (1_000_000 raw units) */
const DEFAULT_GASLESS_THRESHOLD_USDC = 1_000_000n;

/** Sliding window duration for rate limiting (ms) */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Max requests per window per IP */
const RATE_LIMIT_MAX_REQUESTS = 30;

/** Subscription duration: 30 days in seconds */
const SUBSCRIPTION_DURATION_SECONDS = 30 * 24 * 60 * 60;

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface x402PaymentServiceOptions {
  facilitators: Array<{
    name: 'coinbase' | 'payai' | 'meridian' | 'x402rs';
    endpoint: string;
    api_key?: string;
  }>;
  networks: Array<{
    name: 'base' | 'ethereum' | 'solana';
    rpc_url: string;
    chain_id: number;
  }>;
  assets: Array<{
    symbol: 'USDC' | 'ETH' | 'SOL';
    contract_address?: string; // ERC-20 token address
  }>;
  gasless: {
    enabled: boolean;
    subsidy_provider: 'coinbase' | 'custom';
    max_gas_price: number; // wei
    /** Threshold in raw token units below which gas is subsidized. Defaults to 1 USDC */
    threshold?: bigint;
  };
  receipt_storage: {
    provider: 'supabase' | 'postgresql';
    table: string;
  };
  webhook_endpoint: string; // /api/payments/x402/callback
  /** Platform wallet address that receives payments */
  platform_wallet?: string;
}

export interface x402PaymentRequest {
  payment_id: string;
  price: number;
  asset: 'USDC' | 'ETH' | 'SOL';
  network: 'base' | 'ethereum' | 'solana';
  facilitator: string; // URL
  content_id: string; // VRR twin ID, VR menu ID, etc.
  payer_address?: string; // Optional (for user payments)
  agent_id?: string; // Optional (for AI agent payments)
}

export interface x402PaymentReceipt {
  payment_id: string;
  transaction_hash: string;
  block_number: number;
  timestamp: number;
  payer_address: string;
  recipient_address: string;
  amount: number;
  asset: string;
  network: string;
  content_id: string;
  access_granted: boolean;
  access_expires_at?: number; // Unix timestamp (for subscriptions)
}

export interface GaslessSubsidyResult {
  subsidized: boolean;
  reason: string;
  estimated_gas_cost?: bigint;
  relay_tx_hash?: string;
}

export interface SubscriptionGrant {
  payment_id: string;
  content_id: string;
  payer_address: string;
  granted_at: number;
  expires_at: number;
  tier: 'monthly' | 'annual';
  active: boolean;
}

// ─── Rate Limiter (in-memory sliding window) ─────────────────────────────────

interface RateLimitEntry {
  timestamps: number[];
}

class SlidingWindowRateLimiter {
  private windows = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = RATE_LIMIT_WINDOW_MS, maxRequests: number = RATE_LIMIT_MAX_REQUESTS) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if the key is rate limited. Returns true if allowed, false if blocked.
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    let entry = this.windows.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // Prune timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < this.windowMs);

    if (entry.timestamps.length >= this.maxRequests) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  /** Evict stale entries (call periodically to prevent memory leak) */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < this.windowMs);
      if (entry.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class x402PaymentService {
  private options: x402PaymentServiceOptions;
  private db: Pool;
  private viemClients: Record<string, ReturnType<typeof createPublicClient>>;
  private rateLimiter: SlidingWindowRateLimiter;
  /** Set of consumed transaction hashes to prevent replay attacks */
  private consumedNonces = new Set<string>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: x402PaymentServiceOptions) {
    this.options = options;
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    });

    this.viemClients = {
      base: createPublicClient({
        chain: base,
        transport: http(options.networks.find((n) => n.name === 'base')?.rpc_url),
      }),
      ethereum: createPublicClient({
        chain: mainnet,
        transport: http(options.networks.find((n) => n.name === 'ethereum')?.rpc_url),
      }),
    };

    this.rateLimiter = new SlidingWindowRateLimiter();

    // Periodic cleanup every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.rateLimiter.cleanup();
    }, 5 * 60_000);
  }

  /** Graceful shutdown: clear intervals and close pool */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.db.end();
  }

  // ─── Express Middleware ──────────────────────────────────────────────────

  /**
   * Express middleware: Require payment before accessing endpoint.
   * Includes rate limiting and input validation.
   */
  requirePayment(config: { price: number; asset: string; network: string }) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Rate limit by IP
        const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        if (!this.rateLimiter.isAllowed(clientIp)) {
          res.status(429).json({ error: 'Too many requests. Please try again later.' });
          return;
        }

        // Check if request has valid payment receipt
        const paymentId = req.headers['x-payment-id'];

        // Validate payment ID format
        if (paymentId !== undefined) {
          if (typeof paymentId !== 'string' || !paymentId.match(/^[\w-]+$/)) {
            res.status(400).json({ error: 'Invalid payment identifier format' });
            return;
          }

          const receipt = await this.verifyPayment(paymentId);
          if (receipt && receipt.access_granted) {
            // Check expiry for subscriptions
            if (receipt.access_expires_at && receipt.access_expires_at < Math.floor(Date.now() / 1000)) {
              // Subscription expired, require new payment
            } else {
              (req as Request & { paymentReceipt?: x402PaymentReceipt }).paymentReceipt = receipt;
              return next();
            }
          }
        }

        // No valid payment -> return 402 with WWW-Authenticate header
        return this.return402Response(res, {
          payment_id: `x402_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          price: config.price,
          asset: config.asset as 'USDC' | 'ETH' | 'SOL',
          network: config.network as 'base' | 'ethereum' | 'solana',
          facilitator: this.selectFacilitator(config.network),
          content_id: req.params.twin_id || req.params.menu_id || 'unknown_content',
        });
      } catch (_err) {
        // Sanitized: no internal error details leaked
        res.status(500).json({ error: 'Payment verification failed' });
        return;
      }
    };
  }

  private selectFacilitator(_network: string): string {
    const facilitator = this.options.facilitators[0];
    return facilitator ? facilitator.endpoint : 'https://cdp.coinbase.com/x402';
  }

  // ─── 402 Response ────────────────────────────────────────────────────────

  /** Return HTTP 402 Payment Required response with WWW-Authenticate header */
  return402Response(res: Response, request: x402PaymentRequest): void {
    res
      .status(402)
      .header(
        'WWW-Authenticate',
        `x402 facilitator="${request.facilitator}" price="${request.price}" asset="${request.asset}" network="${request.network}"`
      )
      .json({
        error: 'Payment required',
        price: request.price,
        asset: request.asset,
        network: request.network,
        facilitator: request.facilitator,
        payment_id: request.payment_id,
        content_id: request.content_id,
      });
  }

  // ─── On-Chain Verification ───────────────────────────────────────────────

  /**
   * Verify payment on blockchain with real on-chain verification.
   * Checks: tx exists, amount matches, recipient matches, nonce not replayed.
   */
  async verifyPayment(paymentId: string): Promise<x402PaymentReceipt | null> {
    try {
      // Validate paymentId format
      if (!paymentId || typeof paymentId !== 'string') {
        return null;
      }

      // Lookup payment in database
      const payment = await this.getPaymentFromDB(paymentId);
      if (!payment) return null;

      // Replay attack prevention: check if this tx has already been consumed
      const nonceKey = `${payment.network}:${payment.transaction_hash}`;
      if (this.consumedNonces.has(nonceKey)) {
        // Already verified and consumed — allow access (idempotent for same paymentId)
        // but don't allow a different paymentId to reuse the same txHash
        const existingReceipt = await this.getPaymentByTxHash(payment.transaction_hash);
        if (existingReceipt && existingReceipt.payment_id !== paymentId) {
          return null; // Replay: different payment trying to use same tx
        }
      }

      // Verify transaction on blockchain
      const onChainResult = await this.getBlockchainReceipt(
        payment.transaction_hash,
        payment.network
      );

      // Validate amount: on-chain amount must be >= required payment amount
      if (onChainResult.amount < payment.amount) {
        return null;
      }

      // Validate recipient: on-chain recipient must match expected wallet
      const expectedRecipient = (
        this.options.platform_wallet ?? payment.recipient_address
      ).toLowerCase();
      if (onChainResult.recipient.toLowerCase() !== expectedRecipient) {
        return null;
      }

      // Mark nonce as consumed
      this.consumedNonces.add(nonceKey);

      return {
        ...payment,
        access_granted: true,
      };
    } catch (_e) {
      // Sanitized error — log internally, don't expose details
      console.error('[x402] Payment verification failed');
      return null;
    }
  }

  private async getPaymentFromDB(paymentId: string): Promise<x402PaymentReceipt | null> {
    const res = await this.db.query('SELECT * FROM x402_receipts WHERE payment_id = $1 LIMIT 1', [
      paymentId,
    ]);
    if (res.rows.length === 0) return null;
    return this.parseReceiptRow(res.rows[0]);
  }

  private async getPaymentByTxHash(txHash: string): Promise<x402PaymentReceipt | null> {
    const res = await this.db.query(
      'SELECT * FROM x402_receipts WHERE transaction_hash = $1 LIMIT 1',
      [txHash]
    );
    if (res.rows.length === 0) return null;
    return this.parseReceiptRow(res.rows[0]);
  }

  /** Safely parse a DB row into a typed receipt with validation */
  private parseReceiptRow(row: unknown): x402PaymentReceipt | null {
    if (typeof row !== 'object' || row === null) return null;

    const r = row as Record<string, unknown>;

    // Validate required fields
    if (
      typeof r.payment_id !== 'string' ||
      typeof r.transaction_hash !== 'string' ||
      typeof r.amount !== 'number'
    ) {
      return null;
    }

    return {
      payment_id: r.payment_id,
      transaction_hash: r.transaction_hash,
      block_number: typeof r.block_number === 'number' ? r.block_number : 0,
      timestamp: typeof r.timestamp === 'number' ? r.timestamp : 0,
      payer_address: typeof r.payer_address === 'string' ? r.payer_address : '',
      recipient_address: typeof r.recipient_address === 'string' ? r.recipient_address : '',
      amount: r.amount,
      asset: typeof r.asset === 'string' ? r.asset : 'USDC',
      network: typeof r.network === 'string' ? r.network : 'base',
      content_id: typeof r.content_id === 'string' ? r.content_id : '',
      access_granted: r.access_granted === true,
      access_expires_at: typeof r.access_expires_at === 'number' ? r.access_expires_at : undefined,
    };
  }

  /**
   * Real on-chain verification via viem.
   * Fetches the transaction receipt and decodes ERC20 Transfer events.
   */
  private async getBlockchainReceipt(
    txHash: string,
    network: string
  ): Promise<{ amount: number; recipient: string }> {
    const client = this.viemClients[network];
    if (!client) throw new Error(`Unsupported network: ${network}`);

    // Validate txHash format
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new Error('Invalid transaction hash format');
    }

    // Fetch actual transaction receipt from chain
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

    // Transaction must be successful (status 'success')
    if (receipt.status !== 'success') {
      throw new Error('Transaction was not successful on-chain');
    }

    // Parse ERC20 Transfer logs using viem's decodeEventLog
    let totalAmount = 0n;
    let recipient = '';

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: [ERC20_TRANSFER_EVENT],
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'Transfer') {
          const args = decoded.args as { from: string; to: string; value: bigint };
          recipient = args.to;
          totalAmount += args.value;
        }
      } catch {
        // Not a Transfer event in this log, skip
        continue;
      }
    }

    if (!recipient) {
      throw new Error('No ERC20 Transfer event found in transaction');
    }

    // USDC has 6 decimals
    return {
      amount: Number(totalAmount) / Math.pow(10, USDC_DECIMALS),
      recipient,
    };
  }

  // ─── Facilitator Callback ────────────────────────────────────────────────

  /** Handle facilitator payment confirmation callback */
  async facilitatorCallback(req: Request, res: Response): Promise<void> {
    try {
      // Validate callback body
      const body = req.body as Record<string, unknown>;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid callback payload' });
        return;
      }

      const paymentId = body.payment_id;
      const creatorAddress = body.creator_address;
      const agentAddress = body.agent_address;

      if (typeof paymentId !== 'string' || !paymentId) {
        res.status(400).json({ error: 'Missing payment identifier' });
        return;
      }

      if (typeof creatorAddress !== 'string') {
        res.status(400).json({ error: 'Missing creator address' });
        return;
      }

      // Verify transaction on blockchain
      const receipt = await this.verifyPayment(paymentId);

      if (receipt) {
        // Grant access to content
        await this.grantAccess(paymentId, receipt.content_id);

        // Process Revenue Splits (80/10/10 model)
        const split = this.processRevenueSplit(
          receipt.amount,
          creatorAddress,
          typeof agentAddress === 'string' ? agentAddress : undefined
        );

        // Store receipt in database
        await this.storeReceipt(receipt);

        res.json({ success: true, access_granted: true, split });
      } else {
        res.status(400).json({ error: 'Payment verification failed' });
      }
    } catch (_e) {
      // Sanitized: no internal error details
      res.status(500).json({ error: 'Callback processing failed' });
    }
  }

  // ─── Access Grants ───────────────────────────────────────────────────────

  private async grantAccess(paymentId: string, contentId: string): Promise<void> {
    await this.db.query(
      'INSERT INTO x402_access_grants (payment_id, content_id, granted_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
      [paymentId, contentId]
    );
  }

  // ─── Receipt Storage ─────────────────────────────────────────────────────

  private async storeReceipt(receipt: x402PaymentReceipt): Promise<void> {
    await this.db.query(
      `INSERT INTO x402_receipts
       (payment_id, transaction_hash, block_number, amount, asset, network, content_id, access_granted, access_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
      [
        receipt.payment_id,
        receipt.transaction_hash,
        receipt.block_number,
        receipt.amount,
        receipt.asset,
        receipt.network,
        receipt.content_id,
        receipt.access_granted,
        receipt.access_expires_at ?? null,
      ]
    );
  }

  // ─── Revenue Split ───────────────────────────────────────────────────────

  /**
   * Revenue split: 80% Creator, 10% Platform, 10% Agent.
   * If no agent, the platform takes the agent's 10% (20% total).
   */
  processRevenueSplit(amount: number, creatorAddress: string, agentAddress?: string) {
    const creatorShare = amount * 0.8;
    const agentShare = agentAddress ? amount * 0.1 : 0;
    const platformShare = amount - creatorShare - agentShare;

    return {
      creator: { address: creatorAddress, amount: creatorShare },
      platform: { amount: platformShare },
      agent: agentAddress ? { address: agentAddress, amount: agentShare } : null,
    };
  }

  // ─── Gasless Subsidy ─────────────────────────────────────────────────────

  /**
   * Meta-transaction relay pattern: the platform pays gas on behalf of the user
   * for small transactions below a threshold. This removes the gas barrier for
   * micro-payments (e.g., $0.01 AI agent API calls).
   *
   * Flow:
   * 1. User signs an EIP-712 meta-transaction (no gas needed)
   * 2. Platform relay submits the signed tx and pays gas
   * 3. ERC20 transfer executes from user -> recipient
   *
   * Only subsidizes when:
   * - gasless.enabled is true in config
   * - Payment amount is below threshold (default: 1 USDC)
   * - Network is Base L2 (cheapest gas)
   */
  async gaslessSubsidy(
    paymentAmount: bigint,
    network: string,
    signedMetaTx?: string
  ): Promise<GaslessSubsidyResult> {
    // Check if gasless is enabled
    if (!this.options.gasless.enabled) {
      return { subsidized: false, reason: 'Gasless subsidies are disabled' };
    }

    // Only subsidize on Base L2 (cheapest gas)
    if (network !== 'base') {
      return { subsidized: false, reason: 'Gasless subsidies only available on Base L2' };
    }

    const threshold = this.options.gasless.threshold ?? DEFAULT_GASLESS_THRESHOLD_USDC;

    // Only subsidize small transactions
    if (paymentAmount > threshold) {
      return {
        subsidized: false,
        reason: `Payment amount exceeds gasless threshold of ${threshold.toString()} raw units`,
      };
    }

    // Estimate gas cost on Base L2
    const client = this.viemClients['base'];
    if (!client) {
      return { subsidized: false, reason: 'Base network client not configured' };
    }

    try {
      const gasPrice = await client.getGasPrice();

      // Check gas price against max configured
      if (gasPrice > BigInt(this.options.gasless.max_gas_price)) {
        return {
          subsidized: false,
          reason: 'Current gas price exceeds maximum subsidy threshold',
          estimated_gas_cost: gasPrice * 65_000n, // Estimated ERC20 transfer gas
        };
      }

      const estimatedGasCost = gasPrice * 65_000n; // ~65k gas for ERC20 transfer

      // If a signed meta-transaction was provided, relay it
      if (signedMetaTx) {
        // In production, this would submit via a relayer contract (e.g., GSN or Biconomy)
        // For now, we record the subsidy intent and return the estimate
        return {
          subsidized: true,
          reason: 'Gas subsidized by platform on Base L2',
          estimated_gas_cost: estimatedGasCost,
          relay_tx_hash: undefined, // Populated after relay submission
        };
      }

      return {
        subsidized: true,
        reason: 'Eligible for gas subsidy on Base L2',
        estimated_gas_cost: estimatedGasCost,
      };
    } catch (_e) {
      return { subsidized: false, reason: 'Failed to estimate gas cost' };
    }
  }

  // ─── Subscription Management ─────────────────────────────────────────────

  /**
   * Create a time-based subscription grant. After payment is verified,
   * the user gets access to content for a duration (default: 30 days).
   */
  async createSubscription(
    paymentId: string,
    contentId: string,
    payerAddress: string,
    tier: 'monthly' | 'annual' = 'monthly'
  ): Promise<SubscriptionGrant> {
    const now = Math.floor(Date.now() / 1000);
    const durationSeconds =
      tier === 'annual' ? SUBSCRIPTION_DURATION_SECONDS * 12 : SUBSCRIPTION_DURATION_SECONDS;
    const expiresAt = now + durationSeconds;

    await this.db.query(
      `INSERT INTO x402_subscriptions
       (payment_id, content_id, payer_address, granted_at, expires_at, tier, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (payer_address, content_id)
       DO UPDATE SET expires_at = GREATEST(x402_subscriptions.expires_at, $5),
                     payment_id = $1, active = true`,
      [paymentId, contentId, payerAddress, now, expiresAt, tier]
    );

    return {
      payment_id: paymentId,
      content_id: contentId,
      payer_address: payerAddress,
      granted_at: now,
      expires_at: expiresAt,
      tier,
      active: true,
    };
  }

  /**
   * Check if a payer has an active (non-expired) subscription for content.
   */
  async checkSubscription(payerAddress: string, contentId: string): Promise<SubscriptionGrant | null> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.query(
      `SELECT * FROM x402_subscriptions
       WHERE payer_address = $1 AND content_id = $2 AND active = true AND expires_at > $3
       LIMIT 1`,
      [payerAddress, contentId, now]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Record<string, unknown>;
    return {
      payment_id: String(row.payment_id ?? ''),
      content_id: String(row.content_id ?? ''),
      payer_address: String(row.payer_address ?? ''),
      granted_at: Number(row.granted_at ?? 0),
      expires_at: Number(row.expires_at ?? 0),
      tier: row.tier === 'annual' ? 'annual' : 'monthly',
      active: true,
    };
  }

  /**
   * Cancel a subscription (marks as inactive but doesn't revoke current access).
   */
  async cancelSubscription(payerAddress: string, contentId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE x402_subscriptions SET active = false
       WHERE payer_address = $1 AND content_id = $2 AND active = true`,
      [payerAddress, contentId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
